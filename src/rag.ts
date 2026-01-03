import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import type { Document } from '@langchain/core/documents';
import { getLLM } from './model';
import { getVectorStore } from './sqliteStore';
import type { LLMProvider } from './config';
import { ChatMessage, formatHistory, formatDocumentsAsString } from './utils';



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

  // 1. 检索
  const embeddings = await store.embeddings.embedQuery(question);
  // 直接获取前 4 个最相关的文档 (无 Reranker)
  const results = await store.similaritySearchVectorWithScore(embeddings, 4);

  const relevantDocs = results.map((d) => d[0]);
  const sources = results.map((d) => ({
    source: d[0].metadata.source,
    content: d[0].pageContent,
    score: d[1], // 向量距离
  }));

  // 3. 构建 Prompt
  const context = formatDocumentsAsString(relevantDocs);
  const chatHistory = formatHistory(history.slice(-6));

  const template = `你是本地知识库助手。你同时拥有通用知识。
请优先根据以下【上下文】和【对话历史】来回答问题。
如果【上下文】中包含答案，请务必引用。
如果【上下文】不相关或为空，请忽略上下文，使用你的**通用知识**进行回答。

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
  const stream = await chain.stream(
    {
      context,
      chat_history: chatHistory,
      question,
    },
    { signal }
  );

  return {
    stream,
    sources,
  };
};
