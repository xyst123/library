import { parentPort } from 'node:worker_threads';
import path from 'node:path';
import fs from 'node:fs';
import { loadAndSplit } from './loader';
import { getVectorStore, ingestDocs, getHistory, addHistory, clearHistory } from './sqliteStore';
import { askQuestionStream } from './rag';
import { createCRAGGraph } from './crag';
import {
  LLMProvider,
  CHUNKING_CONFIG,
  ChunkingStrategy,
  STORAGE_CONFIG,
  RAG_CONFIG,
} from './config';
import type { Document } from '@langchain/core/documents';
import type { ChatMessage } from './utils';

import { initSettings, getSettings, saveSettings } from './settings';
import { calculateVectorPositions } from './vector-analysis';

// 消息类型定义
type WorkerMessage =
  | { type: 'init' }
  | { type: 'ingest-files'; filePaths: string[] }
  | { type: 'get-file-list' }
  | { type: 'delete-file'; filePath: string }
  | { type: 'ask-question'; question: string; history: ChatMessage[]; provider: string }
  | { type: 'get-status' }
  | { type: 'get-history' }
  | { type: 'add-history'; role: 'user' | 'assistant'; content: string }
  | { type: 'clear-history' }
  | { type: 'stop-generation' }
  | { type: 'get-settings' }
  | { type: 'calculate-vector-positions'; query?: string }
  | {
      type: 'save-settings';
      settings: {
        provider: string;
        chunkingStrategy: string;
        enableContextEnhancement?: boolean;
        enableHybridSearch?: boolean;
        enableReranking?: boolean;
      };
    };

// 消息处理器上下文
interface HandlerContext {
  id: string;
  postProgress: (progress: object) => void;
}

// 消息处理器类型
type MessageHandler = (data: WorkerMessage, ctx: HandlerContext) => Promise<object>;

let isInitialized = false;
let currentController: AbortController | null = null;

// ============ 消息处理器实现 ============

/** 初始化处理器 */
const handleInit: MessageHandler = async () => {
  if (!isInitialized) {
    console.log('[Worker] 正在初始化...');

    // 加载已保存的设置
    initSettings();

    // 预热向量存储，避免首次查询时冷启动
    console.log('[Worker] 正在预热向量存储...');
    await getVectorStore();
    console.log('[Worker] 向量存储预热完成');

    // 设置模型下载进度回调，转发到主进程
    const { setModelProgressCallback, preloadModels } = await import('./model');
    setModelProgressCallback((data) => {
      parentPort?.postMessage({
        id: 'model-status',
        data: {
          type: 'model-download-progress',
          ...data,
        },
      });
    });

    // 启动时预加载模型（Reranker + Embedding）
    preloadModels();

    isInitialized = true;
    console.log('[Worker] 初始化完成');
  }
  return { success: true };
};

/** 导入文件处理器 */
const handleIngestFiles: MessageHandler = async (data, ctx) => {
  const { filePaths } = data as { filePaths: string[] };
  console.log('[Worker] 正在导入文件:', filePaths);

  const allDocs: Document[] = [];
  const total = filePaths.length;

  for (let i = 0; i < total; i++) {
    const filePath = filePaths[i];

    ctx.postProgress({
      type: 'ingest-progress',
      current: i + 1,
      total,
      status: 'reading',
      file: path.basename(filePath),
    });

    try {
      const docs = await loadAndSplit(filePath);
      allDocs.push(...docs);
    } catch (e: unknown) {
      const err = e as Error;
      console.warn(`[Worker] 加载失败 ${filePath}: ${err.message}`);
    }
  }

  if (allDocs.length > 0) {
    ctx.postProgress({
      type: 'ingest-progress',
      current: total,
      total,
      status: 'embedding',
      file: '正在生成向量 (首次需下载模型)...',
    });
    await ingestDocs(allDocs);
  }

  const store = await getVectorStore();
  const files = await store.getSources();
  return { success: true, files };
};

/** 获取文件列表处理器 */
const handleGetFileList: MessageHandler = async () => {
  const store = await getVectorStore();
  const files = await store.getSources();
  return { success: true, files };
};

/** 删除文件处理器 */
const handleDeleteFile: MessageHandler = async (data) => {
  const { filePath } = data as { filePath: string };
  const store = await getVectorStore();
  await store.deleteDocumentsBySource(filePath);
  const files = await store.getSources();
  return { success: true, files };
};

/** 提问处理器 */
const handleAskQuestion: MessageHandler = async (data, ctx) => {
  const { question, history, provider } = data as {
    question: string;
    history: ChatMessage[];
    provider: string;
  };

  // 取消之前的请求
  if (currentController) {
    currentController.abort();
  }
  currentController = new AbortController();

  const llmProvider = provider === 'gemini' ? LLMProvider.GEMINI : LLMProvider.DEEPSEEK;

  try {
    // 检查是否启用 CRAG
    if (RAG_CONFIG.enableCRAG) {
      console.log('[Worker] 使用 CRAG (Self-Correcting RAG) 模式');
      const app = await createCRAGGraph();
      const result = await app.invoke({
        question: question,
        documents: [],
        generation: '',
        webSearchNeeded: false,
        searchQuery: '',
      });

      // CRAG 返回的是完整结果，模拟流式输出以兼容前端
      const answer = result.generation as string;
      ctx.postProgress({ type: 'answer-chunk', chunk: answer }); // Changed from 'token' to 'answer-chunk' for consistency
      ctx.postProgress({ type: 'answer-end' }); // Changed from 'done' to 'answer-end' for consistency

      // 保存历史记录
      await addHistory('user', question);
      await addHistory('assistant', answer);
      return { success: true, answer: answer, sources: [], toolCalls: [] }; // Return full structure
    }

    // 标准 RAG 流程
    const { stream, sources, toolCalls } = await askQuestionStream(
      question,
      history || [],
      llmProvider,
      currentController.signal
    );

    parentPort?.postMessage({ id: ctx.id, type: 'answer-start', sources });

    let fullAnswer = '';
    for await (const chunk of stream) {
      fullAnswer += chunk;
      parentPort?.postMessage({ id: ctx.id, type: 'answer-chunk', chunk });
    }

    // 流结束后发送工具调用事件（结构化数据）
    if (toolCalls.length > 0) {
      console.log('[Worker] 发送工具调用事件，共', toolCalls.length, '个');
      parentPort?.postMessage({ id: ctx.id, type: 'tool-calls', toolCalls });
    }

    return { success: true, answer: fullAnswer, sources, toolCalls };
  } catch (error: unknown) {
    if (currentController.signal.aborted) {
      console.log('[Worker] 生成已停止');
      return { success: false, error: 'Aborted' };
    }
    throw error;
  } finally {
    currentController = null;
  }
};

/** 停止生成处理器 */
const handleStopGeneration: MessageHandler = async () => {
  if (currentController) {
    currentController.abort();
    currentController = null;
    console.log('[Worker] 收到停止指令，已中止。');
  }
  return { success: true };
};

/** 获取历史记录处理器 */
const handleGetHistory: MessageHandler = async () => {
  const history = await getHistory();
  return { success: true, history };
};

/** 添加历史记录处理器 */
const handleAddHistory: MessageHandler = async (data) => {
  const { role, content } = data as { role: 'user' | 'assistant'; content: string };
  await addHistory(role, content);
  return { success: true };
};

/** 清空历史记录处理器 */
const handleClearHistory: MessageHandler = async () => {
  await clearHistory();
  return { success: true };
};

/** 获取状态处理器 */
const handleGetStatus: MessageHandler = async () => {
  try {
    const store = await getVectorStore();
    const count = await store.getDocumentCount();
    return { documentCount: count };
  } catch (e) {
    console.error('[Worker] 获取状态失败:', e);
    return { documentCount: 0 };
  }
};

/** 获取设置处理器 */
const handleGetSettings: MessageHandler = async () => {
  return getSettings();
};

/** 保存设置处理器 */
const handleSaveSettings: MessageHandler = async (data) => {
  const { settings } = data as {
    settings: {
      provider: string;
      chunkingStrategy: string;
      enableContextEnhancement?: boolean;
      enableHybridSearch?: boolean;
      enableReranking?: boolean;
    };
  };
  saveSettings(settings);
  return { success: true };
};

/** 计算向量位置处理器 (PCA 降维) */
const handleCalculateVectorPositions: MessageHandler = async (data) => {
  const { query } = data as { query?: string };
  return calculateVectorPositions(query);
};

// ============ 消息处理器注册表 ============

const handlers: Record<string, MessageHandler> = {
  init: handleInit,
  'ingest-files': handleIngestFiles,
  'get-file-list': handleGetFileList,
  'delete-file': handleDeleteFile,
  'ask-question': handleAskQuestion,
  'stop-generation': handleStopGeneration,
  'get-history': handleGetHistory,
  'add-history': handleAddHistory,
  'clear-history': handleClearHistory,
  'get-status': handleGetStatus,
  'get-settings': handleGetSettings,
  'save-settings': handleSaveSettings,
  'calculate-vector-positions': handleCalculateVectorPositions,
};

// ============ 主消息监听器 ============

if (!parentPort) {
  throw new Error('此文件必须作为 Worker 线程运行。');
}

parentPort.on('message', async (message: { id: string; data: WorkerMessage }) => {
  const { id, data } = message;

  // 创建处理器上下文
  const ctx: HandlerContext = {
    id,
    postProgress: (progress) => parentPort?.postMessage({ id, ...progress }),
  };

  try {
    const handler = handlers[data.type];

    if (!handler) {
      throw new Error(`未知消息类型: ${data.type}`);
    }

    const result = await handler(data, ctx);
    parentPort?.postMessage({ id, success: true, data: result });
  } catch (error: unknown) {
    const err = error as Error;
    console.error(`[Worker] 处理错误 ${data.type}:`, error);
    parentPort?.postMessage({ id, success: false, error: err.message });
  }
});
