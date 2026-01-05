import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { getLLM } from './model';
import { getVectorStore } from './sqliteStore';
import { LLMProvider, RAG_CONFIG } from './config';
import { ChatMessage, formatHistory, formatDocumentsAsString } from './utils';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

// 简单的 embedding 缓存 (LRU 风格)
const CACHE_SIZE = 50;
const embeddingCache = new Map<string, number[]>();

/**
 * 获取查询的 embedding (带缓存)
 */
const getQueryEmbedding = async (query: string): Promise<number[]> => {
  // 检查缓存
  if (embeddingCache.has(query)) {
    console.log('[RAG] 使用缓存的 embedding');
    return embeddingCache.get(query)!;
  }

  // 计算新的 embedding
  const store = await getVectorStore();
  const embedding = await store.embeddings.embedQuery(query);

  // 添加到缓存 (简单 LRU: 超过限制时删除最老的)
  if (embeddingCache.size >= CACHE_SIZE) {
    const firstKey = embeddingCache.keys().next().value;
    if (firstKey) embeddingCache.delete(firstKey);
  }
  embeddingCache.set(query, embedding);

  return embedding;
};

// ============ Function Calling 工具定义 ============

/**
 * 天气卡片工具 - 用于在回答中显示天气信息
 */
const weatherCardTool = new DynamicStructuredTool({
  name: 'show_weather_card',
  description: '当用户询问天气相关问题时，调用此工具显示天气卡片。需要提供城市名称、温度、天气状况和图标代码。',
  schema: z.object({
    city: z.string().describe('城市名称'),
    temp: z.number().describe('温度（摄氏度）'),
    condition: z.string().describe('天气状况描述，如：晴、多云、雨、雪'),
    icon: z.enum(['sunny', 'cloudy', 'rain', 'snow', 'thunder', 'fog', 'wind', 'partlyCloudy'])
      .describe('天气图标代码：sunny(晴), cloudy(多云), rain(雨), snow(雪), thunder(雷), fog(雾), wind(风), partlyCloudy(少云)'),
  }),
  func: async ({ city, temp, condition }) => {
    // 返回格式化的天气信息（供 LLM 知晓工具已调用）
    // 注意：icon 参数会被传递到前端组件，这里不需要使用
    return `已显示${city}的天气卡片：${condition}，温度${temp}°C`;
  },
});

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface RagStreamResult {
  stream: AsyncGenerator<string>;
  sources: Array<{
    source: string;
    content: string;
    score?: number;
  }>;
  toolCalls: ToolCall[];
}

export const askQuestionStream = async (
  question: string,
  history: ChatMessage[],
  provider: LLMProvider,
  signal?: AbortSignal
): Promise<RagStreamResult> => {
  console.log(`正在提问 (流式): "${question}" (Provider: ${provider})`);

  const baseLLM = getLLM(provider);
  // 绑定工具到 LLM (启用 Function Calling)
  // 注意: Gemini 可能不支持 bindTools，此时使用原始 LLM
  const llm = baseLLM.bindTools ? baseLLM.bindTools([weatherCardTool]) : baseLLM;
  const store = await getVectorStore();

  // 1. 检索 (使用缓存的 embedding)
  const embeddings = await getQueryEmbedding(question);
  // 使用配置的检索数量
  const rawResults = await store.similaritySearchVectorWithScore(embeddings, RAG_CONFIG.retrievalK);

  // 2. 过滤低质量结果 (距离越小越相似)
  const filteredResults = rawResults.filter(([_doc, distance]) => {
    // 距离小于阈值才保留
    return distance < RAG_CONFIG.similarityThreshold;
  });

  // 如果过滤后没有结果，使用原始结果的前 N 个 (至少保留一些上下文)
  const results = filteredResults.length > 0 ? filteredResults : rawResults.slice(0, 2);
  
  console.log(`[RAG] 检索到 ${rawResults.length} 条，过滤后 ${results.length} 条`);

  const relevantDocs = results.map((d) => d[0]);
  const sources = results.map((d) => ({
    source: d[0].metadata.source,
    content: d[0].pageContent,
    score: d[1], // 向量距离
  }));

  // 3. 构建 Prompt
  const context = formatDocumentsAsString(relevantDocs);
  // 使用配置的历史记录限制
  const chatHistory = formatHistory(history.slice(-RAG_CONFIG.historyLimit));

  const template = `你是本地知识库助手。你同时拥有通用知识。
请优先根据以下【上下文】和【对话历史】来回答问题。
如果【上下文】中包含答案，请务必引用。
如果【上下文】不相关或为空，请忽略上下文，使用你的**通用知识**进行回答。

【重要】如果用户询问天气相关问题，请务必调用 show_weather_card 工具来显示天气卡片，并在文本中描述天气情况。

上下文:
{context}

对话历史:
{chat_history}

当前问题: {question}

回答:`;

  const prompt = PromptTemplate.fromTemplate(template);

  // 4. 生成流式回答（支持 Function Calling）
  const chain = RunnableSequence.from([prompt, llm]);

  console.log('正在开始流式生成 (支持 Function Calling)...');
  const rawStream = await chain.stream(
    {
      context,
      chat_history: chatHistory,
      question,
    },
    { signal }
  );

  // 包装 stream，收集工具调用信息（最佳实践：返回结构化数据）
  const toolCallsCollected: ToolCall[] = [];
  
  async function* streamWithToolCalls(): AsyncGenerator<string> {
    try {
      for await (const chunk of rawStream) {
        // 检查是否包含 tool_calls
        if (chunk.additional_kwargs?.tool_calls) {
          const toolCalls = chunk.additional_kwargs.tool_calls;
          console.log('[RAG] 检测到 tool_calls:', JSON.stringify(toolCalls, null, 2));
          
          // 收集所有 tool calls（结构化数据）
          for (const toolCall of toolCalls) {
            if (toolCall.function?.name === 'show_weather_card') {
              try {
                const args = JSON.parse(toolCall.function.arguments);
                toolCallsCollected.push({
                  name: 'weather',
                  args,
                });
                console.log('[RAG] 解析到天气卡片参数:', args);
              } catch (e) {
                console.warn('[RAG] 解析 tool_call 参数失败:', e);
              }
            }
          }
        }
        
        // 输出文本内容
        if (chunk.content) {
          // 处理不同类型的 content
          const content = typeof chunk.content === 'string' 
            ? chunk.content 
            : Array.isArray(chunk.content) 
              ? chunk.content.map(c => typeof c === 'string' ? c : (c as { text?: string }).text || '').join('')
              : '';
          if (content) {
            yield content;
          }
        }
      }
    } finally {
      console.log('[RAG] 流式生成完成，工具调用数:', toolCallsCollected.length);
    }
  }

  return {
    stream: streamWithToolCalls(),
    sources,
    toolCalls: toolCallsCollected,
  };
};
