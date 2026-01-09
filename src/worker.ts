import { parentPort } from 'node:worker_threads';
import path from 'node:path';
import fs from 'node:fs';
import { loadAndSplit } from './loader';
import { getVectorStore, ingestDocs, getHistory, addHistory, clearHistory } from './sqliteStore';
import { askQuestionStream } from './rag';
import {
  LLMProvider,
  CHUNKING_CONFIG,
  ChunkingStrategy,
  STORAGE_CONFIG,
  RAG_CONFIG,
} from './config';
import type { Document } from '@langchain/core/documents';
import type { ChatMessage } from './utils';

import { PCA } from 'ml-pca';

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
    const settingsPath = path.join(STORAGE_CONFIG.dataDir, 'settings.json');
    console.log('[Worker] 尝试加载设置文件:', settingsPath);
    try {
      if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, 'utf-8');
        const settings = JSON.parse(data);

        // 应用设置到全局配置
        if (settings.chunkingStrategy === 'semantic') {
          CHUNKING_CONFIG.strategy = ChunkingStrategy.SEMANTIC;
        }
        if (typeof settings.enableContextEnhancement === 'boolean') {
          CHUNKING_CONFIG.enableContextEnhancement = settings.enableContextEnhancement;
        }
        if (typeof settings.enableHybridSearch === 'boolean') {
          RAG_CONFIG.enableHybridSearch = settings.enableHybridSearch;
        }
        if (typeof settings.enableReranking === 'boolean') {
          RAG_CONFIG.enableReranking = settings.enableReranking;
        }
        console.log('[Worker] 已加载保存的设置:', {
          reranking: RAG_CONFIG.enableReranking,
          hybrid: RAG_CONFIG.enableHybridSearch,
        });
      }
    } catch (error) {
      console.error('[Worker] 加载设置失败:', error);
    }

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
  const settingsPath = path.join(STORAGE_CONFIG.dataDir, 'settings.json');

  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[Worker] 读取设置失败:', error);
  }

  // 返回默认设置
  return {
    chunkingStrategy: 'character',
    enableContextEnhancement: true,
    enableHybridSearch: false,
    enableReranking: false,
  };
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
  const settingsPath = path.join(STORAGE_CONFIG.dataDir, 'settings.json');

  try {
    // 确保数据目录存在
    if (!fs.existsSync(STORAGE_CONFIG.dataDir)) {
      fs.mkdirSync(STORAGE_CONFIG.dataDir, { recursive: true });
    }

    // 更新全局配置 - Chunking 策略
    if (settings.chunkingStrategy === 'semantic') {
      CHUNKING_CONFIG.strategy = ChunkingStrategy.SEMANTIC;
    } else {
      CHUNKING_CONFIG.strategy = ChunkingStrategy.CHARACTER;
    }

    // 更新全局配置 - 上下文增强
    if (typeof settings.enableContextEnhancement === 'boolean') {
      CHUNKING_CONFIG.enableContextEnhancement = settings.enableContextEnhancement;
      console.log('[Worker] 上下文增强已更新为:', CHUNKING_CONFIG.enableContextEnhancement);
    }

    // 更新全局配置 - 混合检索
    if (typeof settings.enableHybridSearch === 'boolean') {
      RAG_CONFIG.enableHybridSearch = settings.enableHybridSearch;
      console.log('[Worker] 混合检索已更新为:', RAG_CONFIG.enableHybridSearch);
    }

    // 更新全局配置 - 重排序
    if (typeof settings.enableReranking === 'boolean') {
      RAG_CONFIG.enableReranking = settings.enableReranking;
      console.log('[Worker] 重排序已更新为:', RAG_CONFIG.enableReranking);
    }

    console.log('[Worker] Chunking 策略已更新为:', CHUNKING_CONFIG.strategy);

    // 保存到文件
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[Worker] 保存设置失败:', error);
    throw new Error(`保存设置失败: ${err.message}`);
  }
};

/** 计算向量位置处理器 (PCA 降维) */
const handleCalculateVectorPositions: MessageHandler = async (data) => {
  console.log('[Worker] handleCalculateVectorPositions triggered');
  const { query } = data as { query?: string };
  const store = await getVectorStore();
  const docs = await store.getAllVectors();
  console.log(`[Worker] getAllVectors returned ${docs.length} documents`);

  if (docs.length === 0) {
    console.log('[Worker] No vectors found.');
    return { points: [] };
  }

  // 准备数据矩阵
  const vectors = docs.map((d) => d.vector);
  let finalVectors = vectors;

  // 如果有查询，计算查询向量并添加到矩阵末尾
  let queryVector: number[] | null = null;
  if (query) {
    const { getEmbeddings } = await import('./model');
    const embeddings = await getEmbeddings();
    queryVector = await embeddings.embedQuery(query);
    finalVectors = [...vectors, queryVector];
  }

  // 运行 PCA 降维 (384 -> 2)
  console.log(`[Worker] 正在运行 PCA，数据量: ${finalVectors.length}`);
  const pca = new PCA(finalVectors);
  const predict = pca.predict(finalVectors, { nComponents: 2 });
  const reducedData = predict.to2DArray();

  // 映射回点对象
  const points = docs.map((doc, i) => ({
    x: reducedData[i][0],
    y: reducedData[i][1],
    text: doc.content,
    isQuery: false,
    id: doc.rowid,
  }));

  // 如果有查询点
  if (queryVector) {
    const queryPoint = reducedData[reducedData.length - 1];
    points.push({
      x: queryPoint[0],
      y: queryPoint[1],
      text: `查询: ${query}`,
      isQuery: true,
      id: -1,
    });
  }

  return { points };
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
