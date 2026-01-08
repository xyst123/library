import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { Document } from '@langchain/core/documents';
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
  if (embeddingCache.has(query)) {
    console.log('[RAG] 使用缓存的 embedding');
    return embeddingCache.get(query)!;
  }

  const store = await getVectorStore();
  const embedding = await store.embeddings.embedQuery(query);

  if (embeddingCache.size >= CACHE_SIZE) {
    embeddingCache.delete(embeddingCache.keys().next().value!);
  }
  embeddingCache.set(query, embedding);
  return embedding;
};

// ============ 混合检索算法 ============

/**
 * Reciprocal Rank Fusion (RRF) 算法
 * 融合多个检索结果列表，常用于混合检索
 * @param lists 多个检索结果列表，每个列表是 [Document, score] 数组
 * @param k RRF 参数，通常设为 60
 * @param topK 最终返回的结果数量
 * @returns 融合后的结果列表
 */
const reciprocalRankFusion = (
  ...listsAndParams: [...Array<[Document, number][]>, number]
): [Document, number][] => {
  const topK = listsAndParams.pop() as number;
  const lists = listsAndParams as Array<[Document, number][]>;
  const scoreMap = new Map<string, { doc: Document; score: number }>();

  lists.forEach((list) => {
    list.forEach(([doc, _], rank) => {
      const key = doc.pageContent;
      const rrfScore = 1 / (60 + rank + 1);
      const existing = scoreMap.get(key);
      
      scoreMap.set(key, existing 
        ? { ...existing, score: existing.score + rrfScore }
        : { doc, score: rrfScore }
      );
    });
  });

  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ doc, score }) => [doc, score]);
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

  // 1. 检索逻辑
  const embeddings = await getQueryEmbedding(question);
  let finalResults: [Document, number][];

  if (RAG_CONFIG.enableHybridSearch) {
    console.log('[RAG] 使用混合检索（向量 + BM25）');
    const k = RAG_CONFIG.retrievalK;
    const [vectorResults, bm25Results] = await Promise.all([
      store.similaritySearchVectorWithScore(embeddings, k * 2),
      store.bm25Search(question, k * 2),
    ]);
    console.log(`[RAG] 向量: ${vectorResults.length}, BM25: ${bm25Results.length}`);
    finalResults = reciprocalRankFusion(vectorResults, bm25Results, k);
  } else {
    console.log('[RAG] 使用纯向量检索');
    const rawResults = await store.similaritySearchVectorWithScore(embeddings, RAG_CONFIG.retrievalK);
    const filteredResults = rawResults.filter(([, distance]) => distance < RAG_CONFIG.similarityThreshold);
    finalResults = filteredResults.length > 0 ? filteredResults : rawResults.slice(0, RAG_CONFIG.retrievalK);
  }

  console.log(`[RAG] 最终返回 ${finalResults.length} 个文档块`);
  const docs = finalResults.map(([doc]) => doc);
  const sources = finalResults.map(([doc, score]) => ({
    source: doc.metadata.source,
    content: doc.pageContent,
    score,
  }));

  // 3. 构建 Prompt
  const context = formatDocumentsAsString(docs);
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
          const content = typeof chunk.content === 'string' 
            ? chunk.content 
            : Array.isArray(chunk.content) 
              ? chunk.content.map(c => typeof c === 'string' ? c : (c as { text?: string }).text || '').join('')
              : '';
          if (content) yield content;
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
