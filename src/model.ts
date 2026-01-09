import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers';
import { LLMProvider, LLM_CONFIG, EMBEDDING_CONFIG, getEnv } from './config';
import { fork, type ChildProcess } from 'child_process';
import path from 'node:path';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Embeddings } from '@langchain/core/embeddings';

// ============ Embeddings ============

let embeddingInstance: Embeddings | null = null;

export const getEmbeddings = async (): Promise<Embeddings> => {
  if (embeddingInstance) return embeddingInstance;

  console.log(`[Model] 正在初始化 Embeddings (${EMBEDDING_CONFIG.model})...`);
  const { env } = await import('@huggingface/transformers');
  env.allowLocalModels = EMBEDDING_CONFIG.allowLocalModels;
  env.useBrowserCache = false;
  env.remoteHost = EMBEDDING_CONFIG.remoteHost;

  embeddingInstance = new HuggingFaceTransformersEmbeddings({ model: EMBEDDING_CONFIG.model });
  console.log('[Model] Embeddings 初始化完成');
  return embeddingInstance;
};

// ============ 模型下载进度 ============

type ProgressCallback = (data: {
  file: string;
  name: string;
  status: string;
  loaded: number;
  total: number;
  progress: number;
}) => void;
let onProgress: ProgressCallback | null = null;
export const setModelProgressCallback = (cb: ProgressCallback) => {
  onProgress = cb;
};

// ============ 模型子进程 ============

let modelChild: ChildProcess | null = null;
const pendingRequests = new Map<
  string,
  { resolve: (scores: number[]) => void; reject: (err: Error) => void }
>();

const getModelChild = () => {
  if (modelChild) return modelChild;

  console.log('[Model] 启动模型子进程...');
  modelChild = fork(path.join(__dirname, 'model-wrapper.js'), [], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelChild.on('message', (msg: any) => {
    if (msg.type === 'progress' && onProgress) onProgress(msg.data);
    else if (msg.type === 'rerank-result') {
      pendingRequests.get(msg.id)?.resolve(msg.scores);
      pendingRequests.delete(msg.id);
    } else if (msg.type === 'rerank-error') {
      pendingRequests.get(msg.id)?.reject(new Error(msg.error));
      pendingRequests.delete(msg.id);
    }
  });

  modelChild.on('exit', (code) => {
    console.error(`[Model] 模型子进程退出 (code: ${code})`);
    modelChild = null;
  });

  return modelChild;
};

export const preloadModels = () => {
  console.log('[Model] 预加载模型 (Reranker + Embedding)...');
  getModelChild();
};

export const rerankDocs = (query: string, documents: string[]): Promise<number[]> => {
  const child = getModelChild();
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2, 8);
    pendingRequests.set(id, { resolve, reject });
    child.send({ type: 'rerank', id, query, documents });
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('Rerank 超时'));
      }
    }, 300000);
  });
};

// ============ LLM ============

export const getLLM = (provider: LLMProvider): BaseChatModel => {
  console.log(`[Model] 使用 ${provider}`);
  switch (provider) {
    case LLMProvider.DEEPSEEK:
      return new ChatOpenAI({
        apiKey: getEnv('DEEPSEEK_API_KEY'),
        configuration: { baseURL: LLM_CONFIG.deepseek.baseURL },
        modelName: LLM_CONFIG.deepseek.model,
        temperature: LLM_CONFIG.deepseek.temperature,
      });
    case LLMProvider.GEMINI:
      return new ChatGoogleGenerativeAI({
        apiKey: getEnv('GOOGLE_API_KEY'),
        model: LLM_CONFIG.gemini.model,
        maxOutputTokens: LLM_CONFIG.gemini.maxOutputTokens,
      });
    default:
      throw new Error(`不支持的 LLM 提供商: ${provider}`);
  }
};
