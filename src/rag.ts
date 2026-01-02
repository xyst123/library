import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { Document } from '@langchain/core/documents';
import { getLLM } from './model';
import { getVectorStore } from './sqliteStore';
import { LLMProvider } from './config';

import { rerankDocs } from './reranker';

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

  // 1. 检索 (获取更多候选以备重排)
  const embeddings = await store.embeddings.embedQuery(question);
  // 获取前 10 个作为候选
  const results = await store.similaritySearchVectorWithScore(embeddings, 10); // 获取前 10 个作为候选

  // 2. Rerank 重排
  console.log(`初筛检索到 ${results.length} 个文档，正在重排...`);
  const reranked = await rerankDocs(question, results);

  // 取前 5 个最相关的
  const topDocs = reranked.slice(0, 5);
  console.log(
    '重排完成，Top 5 得分:',
    topDocs.map((d) => d.score.toFixed(4))
  );

  const relevantDocs = topDocs.map((d) => d.doc);
  const sources = topDocs.map((d) => ({
    source: d.doc.metadata.source,
    content: d.doc.pageContent,
    score: d.score, // 重排分数
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
