// Local EnsembleRetriever fixed import issues
import { EnsembleRetriever } from './ensemble';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import type { Document } from '@langchain/core/documents';
import { getLLM } from './model';
import { getVectorStore, SQLiteBM25Retriever } from './sqliteStore';
import type { LLMProvider } from './config';
import { RAG_CONFIG } from './config';
import type { ChatMessage } from './utils';
import { formatHistory, formatDocumentsAsString } from './utils';
import { weatherCardTool } from './tools/weather';

// 简单的 embedding 缓存 (LRU 风格)
const CACHE_SIZE = 50;
const embeddingCache = new Map<string, number[]>();

/**
 * 获取查询的 embedding (带缓存)
 */
const getQueryEmbedding = async (query: string): Promise<number[]> => {
  if (embeddingCache.has(query)) {
    console.log('[RAG] 使用缓存的 embedding');
    const cached = embeddingCache.get(query);
    if (cached) return cached;
    throw new Error('缓存异常：embeddingCache.has 但 get 失败');
  }

  const store = await getVectorStore();
  const embedding = await store.embeddings.embedQuery(query);

  if (embeddingCache.size >= CACHE_SIZE) {
    const first = embeddingCache.keys().next();
    if (!first.done) embeddingCache.delete(first.value);
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
// ============ 混合检索算法 ============
// 已替换为 LangChain EnsembleRetriever

// ============ Function Calling 工具定义 ============

/**
 * 天气卡片工具 - 用于在回答中显示天气信息
 */
// Weather tool imported from ./tools/weather

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

  // 如果启用 Reranking，初始检索数量扩大
  const initialK = RAG_CONFIG.enableReranking ? RAG_CONFIG.retrievalK * 5 : RAG_CONFIG.retrievalK;
  console.log(`[RAG] 初始检索数量: ${initialK} (Reranking: ${RAG_CONFIG.enableReranking})`);

  if (RAG_CONFIG.enableHybridSearch) {
    console.log('[RAG] 使用混合检索（向量 + BM25）- EnsembleRetriever');

    // 初始化两个检索器
    // 注意: initialK 这里作为每个检索器返回的候选数量
    const vectorRetriever = store.asRetriever(initialK * 2);
    const bm25Retriever = new SQLiteBM25Retriever(store, initialK * 2);

    // 初始化混合检索器
    const ensembleRetriever = new EnsembleRetriever({
      retrievers: [vectorRetriever, bm25Retriever],
      weights: [1 - RAG_CONFIG.bm25Weight, RAG_CONFIG.bm25Weight],
    });

    // 执行检索
    const docs = await ensembleRetriever.invoke(question);
    // EnsembleRetriever 返回的数据没有 score 字段 (它是基于 Rank 融合的)
    // 我们为了兼容后续流程，给一个模拟的 score (基于 rank)
    finalResults = docs.slice(0, initialK).map((doc: Document, i: number) => [doc, 0.9 - i * 0.01]); // 模拟降序分数
  } else {
    console.log('[RAG] 使用纯向量检索');
    const rawResults = await store.similaritySearchVectorWithScore(embeddings, initialK);
    // 向量检索的 score 是距离 (越小越好)，如果不 Rerank 需过滤
    // 如果 Rerank，我们先不过滤，让 Reranker 决定
    finalResults = RAG_CONFIG.enableReranking
      ? rawResults
      : rawResults.filter(([, distance]) => distance < RAG_CONFIG.similarityThreshold);
  }

  // 2. 重排序 (Reranking)
  if (RAG_CONFIG.enableReranking && finalResults.length > 0) {
    console.log(`[RAG] 正在重排序 (Reranking)...`);
    try {
      const { rerankDocs } = await import('./model');

      const docsToRank = finalResults.map(([doc]) => doc.pageContent);
      const scores = await rerankDocs(question, docsToRank);

      // 更新分数并重新排序
      finalResults = finalResults.map(([doc], i) => [doc, scores[i] as number]);
      finalResults.sort((a, b) => b[1] - a[1]); // 分数从高到低

      // 截取 Top N
      finalResults = finalResults.slice(0, RAG_CONFIG.retrievalK);

      // 打印前3条结果
      finalResults.forEach(([doc, score], i) => {
        if (i < 3) {
          console.log(
            `[Rerank] Top ${i + 1}: ${(score as number).toFixed(4)} - ${doc.pageContent.slice(0, 20)}...`
          );
        }
      });
    } catch (e) {
      console.error('[RAG] 重排序失败，降级为原始结果:', e);
      // 重排序失败时，直接按距离排序后截取（不再过滤，因为初始检索已扩大范围）
      finalResults.sort((a, b) => a[1] - b[1]); // 距离从小到大
      finalResults = finalResults.slice(0, RAG_CONFIG.retrievalK);
    }
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
          const content =
            typeof chunk.content === 'string'
              ? chunk.content
              : Array.isArray(chunk.content)
                ? chunk.content
                    .map((c) => (typeof c === 'string' ? c : (c as { text?: string }).text || ''))
                    .join('')
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
