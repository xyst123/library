import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { Document } from '@langchain/core/documents';
import { getLLM, getEmbeddings } from './model';
import { getRetriever } from './sqliteStore';
import { LLMProvider } from './config';

const formatDocumentsAsString = (documents: Document[]): string => {
  return documents.map((doc) => doc.pageContent).join('\n\n');
};

export const askQuestion = async (
  question: string,
  provider: LLMProvider
): Promise<string> => {
  console.log(`正在提问: "${question}" 使用提供商: ${provider}`);
  
  const llm = getLLM(provider);

  const retriever = await getRetriever();

  // 创建提示模板
  const template = `请基于以下上下文回答问题:
{context}

问题: {question}

回答:`;
  
  const prompt = PromptTemplate.fromTemplate(template);

  // 创建链
  const chain = RunnableSequence.from([
    {
      context: async (input: { question: string }) => {
        console.log('正在检索上下文...');
        const relevantDocs = await retriever.invoke(input.question);
        console.log(`找到 ${relevantDocs.length} 个相关文档。`);
        return formatDocumentsAsString(relevantDocs);
      },
      question: (input: { question: string }) => input.question,
    },
    prompt,
    llm,
    new StringOutputParser(),
  ]);

  console.log('正在调用处理链...');
  const result = await chain.invoke({ question });
  return result;
};
