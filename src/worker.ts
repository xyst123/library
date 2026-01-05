import { parentPort } from 'node:worker_threads';
import path from 'node:path';
import { loadAndSplit } from './loader';
import { getVectorStore, ingestDocs, getHistory, addHistory, clearHistory } from './sqliteStore';
import { askQuestionStream } from './rag';
import { LLMProvider } from './config';
import type { Document } from '@langchain/core/documents';
import { ChatMessage } from './utils';

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
  | { type: 'stop-generation' };

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
    
    // 预热向量存储，避免首次查询时冷启动
    console.log('[Worker] 正在预热向量存储...');
    await getVectorStore();
    console.log('[Worker] 向量存储预热完成');
    
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
    const { stream, sources } = await askQuestionStream(
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

    return { success: true, answer: fullAnswer, sources };
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

// ============ 消息处理器注册表 ============

const handlers: Record<string, MessageHandler> = {
  'init': handleInit,
  'ingest-files': handleIngestFiles,
  'get-file-list': handleGetFileList,
  'delete-file': handleDeleteFile,
  'ask-question': handleAskQuestion,
  'stop-generation': handleStopGeneration,
  'get-history': handleGetHistory,
  'add-history': handleAddHistory,
  'clear-history': handleClearHistory,
  'get-status': handleGetStatus,
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
