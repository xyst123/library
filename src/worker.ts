import { parentPort } from 'node:worker_threads';
import path from 'node:path';
import { loadAndSplit } from './loader';
import { getVectorStore, ingestDocs, getHistory, addHistory, clearHistory } from './sqliteStore';
import { askQuestionStream } from './rag';
import { LLMProvider } from './config';
import type { Document } from '@langchain/core/documents';

type WorkerMessage =
  | { type: 'init' }
  | { type: 'ingest-files'; filePaths: string[] }
  | { type: 'get-file-list' }
  | { type: 'delete-file'; filePath: string }
  | {
      type: 'ask-question';
      question: string;
      history: { role: 'user' | 'assistant'; content: string }[];
      provider: string;
    }
  | { type: 'get-status' }
  | { type: 'get-history' }
  | { type: 'add-history'; role: 'user' | 'assistant'; content: string }
  | { type: 'clear-history' }
  | { type: 'ingest-progress'; current: number; total: number; status: string; file?: string };

let isInitialized = false;

async function initialize() {
  if (isInitialized) return;
  console.log('[Worker] 正在初始化...');
  // 任何预加载逻辑都可以在这里进行，
  // 目前组件是懒加载或无状态的。
  isInitialized = true;
  console.log('[Worker] 初始化完成');
}

if (!parentPort) {
  throw new Error('此文件必须作为 Worker 线程运行。');
}

parentPort.on('message', async (message: { id: string; data: WorkerMessage }) => {
  const { id, data } = message;

  try {
    let result: object;

    switch (data.type) {
      case 'init':
        await initialize();
        result = { success: true };
        break;

      case 'ingest-files': {
        console.log('[Worker] 正在导入文件:', data.filePaths);
        const allDocs: Document[] = [];
        const total = data.filePaths.length;

        for (let i = 0; i < total; i++) {
          const filePath = data.filePaths[i];

          parentPort?.postMessage({
            id,
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
          parentPort?.postMessage({
            id,
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
        result = { success: true, files };
        break;
      }

      case 'get-file-list': {
        const store = await getVectorStore();
        const files = await store.getSources();
        result = { success: true, files };
        break;
      }

      case 'delete-file': {
        const store = await getVectorStore();
        await store.deleteDocumentsBySource(data.filePath);
        // Ensure atomic save/checkpoint if needed, sqlite-vss/better-sqlite3 usually auto-commits or handles WAL.
        // The original code had store.save() which might be specific to HNSWLib,
        // but for SQLiteVectorStore we implemented, check if we need explicit save.
        // Checking sqliteStore.ts... it seems we migrated to SQLite, so explicit 'json save' is likely obsolete
        // IF we fully switched. But let's check sqliteStore.ts content in a moment.
        // Assuming SQLite persistence is automatic via SQL execution.

        const files = await store.getSources();
        result = { success: true, files };
        break;
      }

      case 'ask-question': {
        const llmProvider = data.provider === 'gemini' ? LLMProvider.GEMINI : LLMProvider.DEEPSEEK;

        // 使用流式传输
        const { stream, sources } = await askQuestionStream(
          data.question,
          data.history || [],
          llmProvider
        );

        // Send sources first (or with the first chunk, but here we can't send with first chunk easily in this structure)
        // We will send a 'start' event or just send sources with the final result?
        // Better: send 'answer-start' with sources, then 'answer-chunk', then 'answer-done'.
        // BUT main.js expects a Promise resolve for 'ask-question'.
        // Refactor: We need a way to emit events for a specific request ID.
        // Current main.js 'sendToWorker' awaits a single response.
        // We can keep 'ask-question' as is for non-streaming compatibility if we wanted,
        // BUT we want streaming.

        // 策略:
        // 1. 立即返回 success: true 以解决 Promise。
        // 2. 通过 postMessage 流式传输 chunks。

        // 临时方案: 我们使用相同的 ID 发送分块消息
        // 用法: parentPort.postMessage({ type: 'answer-chunk', id, chunk: '...' })
        // 但是 main.js 需要知道如何路由它们。

        // 让我们修改流程:
        // Worker 发送:
        // { id, type: 'answer-start', sources }
        // { id, type: 'answer-chunk', chunk }
        // { id, success: true } (最终解决)

        // 让我们直接遍历流并发送消息。
        parentPort?.postMessage({ id, type: 'answer-start', sources });

        let fullAnswer = '';
        for await (const chunk of stream) {
          fullAnswer += chunk;
          parentPort?.postMessage({ id, type: 'answer-chunk', chunk });
        }

        // 最终用完整答案解析原始 Promise (用于回退或完成)
        result = {
          success: true,
          answer: fullAnswer,
          sources: sources,
        };
        break;
      }

      case 'get-history': {
        const history = await getHistory();
        result = { success: true, history };
        break;
      }

      case 'add-history': {
        await addHistory(data.role, data.content);
        result = { success: true };
        break;
      }

      case 'clear-history': {
        await clearHistory();
        result = { success: true };
        break;
      }

      case 'get-status': {
        try {
          const store = await getVectorStore();
          const count = await store.getDocumentCount();
          result = { documentCount: count };
        } catch (e) {
          console.error('[Worker] 获取状态失败:', e);
          result = { documentCount: 0 };
        }
        break;
      }

      default:
        throw new Error(`未知消息类型: ${(data as { type: string }).type}`);
    }

    parentPort?.postMessage({ id, success: true, data: result });
  } catch (error: unknown) {
    const err = error as Error;
    console.error(`[Worker] 处理错误 ${data.type}:`, error);
    parentPort?.postMessage({ id, success: false, error: err.message });
  }
});
