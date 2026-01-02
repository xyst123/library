import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import type { Document } from '@langchain/core/documents';
import { getLLM } from './model';
import { getVectorStore } from './sqliteStore';
import type { LLMProvider } from './config';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface RagResult {
  answer: string;
  sources: Array<{
    source: string;
    content: string;
    score?: number;
  }>;
}

const formatHistory = (history: ChatMessage[]): string => {
  return history
    .map((msg) => `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`)
    .join('\n');
};

const formatDocumentsAsString = (documents: Document[]): string => {
  return documents.map((doc) => doc.pageContent).join('\n\n');
};

export const askQuestion = async (
  question: string,
  history: ChatMessage[],
  provider: LLMProvider
): Promise<RagResult> => {
  console.log(`正在提问: "${question}" (Provider: ${provider})`);

  const llm = getLLM(provider);
  const store = await getVectorStore();

  // 1. 检索 (直接获取前 4 个)
  const embeddings = await store.embeddings.embedQuery(question);
  const results = await store.similaritySearchVectorWithScore(embeddings, 4);

  const relevantDocs = results.map((d) => d[0]);
  const sources = results.map((d) => ({
    source: d[0].metadata.source,
    content: d[0].pageContent,
    score: d[1],
  }));

  // 3. 构建 Prompt
  const context = formatDocumentsAsString(relevantDocs);
  const chatHistory = formatHistory(history.slice(-6)); // 只保留最近 6 条

  const template = `你是本地知识库助手。请根据以下上下文和对话历史回答问题。如果不知道，请直接回答不知道。

上下文 (根据相关性排序):
{context}

对话历史:
{chat_history}

当前问题: {question}

回答:`;

  const prompt = PromptTemplate.fromTemplate(template);

  // 4. 生成回答
  const chain = RunnableSequence.from([prompt, llm, new StringOutputParser()]);

  console.log('正在生成回答...');
  const answer = await chain.invoke({
    context,
    chat_history: chatHistory,
    question,
  });

  return {
    answer,
    sources,
  };
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
  provider: LLMProvider
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

  const template = `你是本地知识库助手。请根据以下上下文和对话历史回答问题。如果不知道，请直接回答不知道。

上下文 (根据相关性排序):
{context}

对话历史:
{chat_history}

当前问题: {question}

回答:`;

  const prompt = PromptTemplate.fromTemplate(template);

  // 4. 生成流式回答
  const chain = RunnableSequence.from([prompt, llm, new StringOutputParser()]);

  console.log('正在开始流式生成...');
  const stream = await chain.stream({
    context,
    chat_history: chatHistory,
    question,
  });

  return {
    stream,
    sources,
  };
};
