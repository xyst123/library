import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers';
import { LLMProvider, LLM_CONFIG, EMBEDDING_CONFIG, getEnv } from './config';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Embeddings } from '@langchain/core/embeddings';

let embeddingInstance: Embeddings | null = null;

// 移除顶层 import，避免 CJS/ESM 冲突
// import { env } from '@huggingface/transformers';

export const getEmbeddings = async (): Promise<Embeddings> => {
  if (!embeddingInstance) {
    console.log(`正在初始化本地 Embeddings (${EMBEDDING_CONFIG.model})...`);
    try {
      // 动态导入 ESM 模块
      const { env } = await import('@huggingface/transformers');

      // 配置 HuggingFace 镜像
      env.allowLocalModels = EMBEDDING_CONFIG.allowLocalModels;
      env.useBrowserCache = false; // 在 Node.js 中禁用浏览器缓存
      env.remoteHost = EMBEDDING_CONFIG.remoteHost;
      console.log(`[Model] HF 镜像已配置: ${EMBEDDING_CONFIG.remoteHost}`);

      console.log('[Model] 正在实例化 HuggingFaceTransformersEmbeddings...');
      embeddingInstance = new HuggingFaceTransformersEmbeddings({
        model: EMBEDDING_CONFIG.model,
      });
      console.log('[Model] Embeddings 实例化成功。');
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
          baseURL: LLM_CONFIG.deepseek.baseURL,
        },
        modelName: LLM_CONFIG.deepseek.model,
        temperature: LLM_CONFIG.deepseek.temperature,
      });

    case LLMProvider.GEMINI:
      console.log('使用 Google Gemini');
      return new ChatGoogleGenerativeAI({
        apiKey: getEnv('GOOGLE_API_KEY'),
        model: LLM_CONFIG.gemini.model,
        maxOutputTokens: LLM_CONFIG.gemini.maxOutputTokens,
      });

    default:
      throw new Error(`不支持的提供商: ${provider}`);
  }
};
