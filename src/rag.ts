import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import type { Document } from '@langchain/core/documents';
import { getLLM } from './model';
import { getVectorStore } from './sqliteStore';
import { LLMProvider, RAG_CONFIG } from './config';
import { ChatMessage, formatHistory, formatDocumentsAsString } from './utils';

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


export interface RagStreamResult {
  stream: AsyncGenerator<string>;
  sources: Array<{
    source: string;
    content: string;
    score?: number;
  }>;
}

export const askQuestionStream = async (
  question: string,
  history: ChatMessage[],
  provider: LLMProvider,
  signal?: AbortSignal
): Promise<RagStreamResult> => {
  console.log(`正在提问 (流式): "${question}" (Provider: ${provider})`);

  const llm = getLLM(provider);
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

【特殊组件规则】
如果用户询问天气相关问题，请在回答末尾添加天气组件标记（使用合理的估计数据）：
<!-- COMPONENT:weather {{"city":"城市名","temp":温度数字,"condition":"天气状况","icon":"图标代码"}} -->
图标代码可选: sunny(晴), cloudy(多云), rain(雨), snow(雪), thunder(雷), fog(雾), wind(风), partlyCloudy(少云)

上下文:
{context}

对话历史:
{chat_history}

当前问题: {question}

回答:`;

  const prompt = PromptTemplate.fromTemplate(template);

  // 4. 生成流式回答
  const chain = RunnableSequence.from([prompt, llm, new StringOutputParser()]);

  console.log('正在开始流式生成...');
  const rawStream = await chain.stream(
    {
      context,
      chat_history: chatHistory,
      question,
    },
    { signal }
  );

  // 包装 stream，在完成时输出日志
  async function* streamWithLog(): AsyncGenerator<string> {
    try {
      for await (const chunk of rawStream) {
        yield chunk;
      }
    } finally {
      console.log('流式生成完成');
    }
  }

  return {
    stream: streamWithLog(),
    sources,
  };
};
