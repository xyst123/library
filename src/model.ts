import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers';
import { LLMProvider, getEnv } from './config';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Embeddings } from '@langchain/core/embeddings';

let embeddingInstance: Embeddings | null = null;

export const getEmbeddings = async (): Promise<Embeddings> => {
  if (!embeddingInstance) {
    console.log('正在初始化本地 Embeddings (Xenova/all-MiniLM-L6-v2)...');
    try {
      // 注意: 底层 transformers 库会显示 "dtype not specified" 警告，这是正常的（使用 CPU 默认 fp32）
      embeddingInstance = new HuggingFaceTransformersEmbeddings({
        model: 'Xenova/all-MiniLM-L6-v2',
      });
    } catch (e) {
      console.error(
        '加载 Embeddings 失败。请确保已安装 @langchain/community 和 @huggingface/transformers。'
      );
      throw e;
    }
  }
  return embeddingInstance;
};

export const getLLM = (provider: LLMProvider): BaseChatModel => {
  switch (provider) {
    case LLMProvider.DEEPSEEK:
      console.log('使用 DeepSeek (通过 OpenAI 兼容接口)');
      return new ChatOpenAI({
        apiKey: getEnv('DEEPSEEK_API_KEY'),
        configuration: {
          baseURL: 'https://api.deepseek.com',
        },
        modelName: 'deepseek-chat',
        temperature: 0.7,
      });

    case LLMProvider.GEMINI:
      console.log('使用 Google Gemini');
      return new ChatGoogleGenerativeAI({
        apiKey: getEnv('GOOGLE_API_KEY'),
        model: 'gemini-pro',
        maxOutputTokens: 2048,
      });

    default:
      throw new Error(`不支持的提供商: ${provider}`);
  }
};
