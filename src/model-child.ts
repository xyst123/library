import { RERANKING_CONFIG, EMBEDDING_CONFIG } from './config';
import fs from 'node:fs';
import path from 'node:path';

// Reranker 模型
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rerankerModel: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rerankerTokenizer: any = null;
let rerankerInitPromise: Promise<void> | null = null;
// Embedding 模型已移除（子进程仅用于 Rerank，节省内存）

const send = (type: string, data?: unknown) => process.send?.({ type, ...(data as object) });
const sendProgress = (data: unknown) => send('progress', { data });

/** 获取模型缓存目录 */
const getCacheDir = (modelName: string) =>
  path.join(
    process.cwd(),
    'node_modules/@huggingface/transformers/.cache',
    modelName.replace('/', path.sep)
  );

/** 清除损坏的模型缓存 */
const clearModelCache = (modelName: string, logPrefix: string) => {
  const cacheDir = getCacheDir(modelName);
  if (fs.existsSync(cacheDir)) {
    console.log(`[${logPrefix}] 清除损坏的缓存:`, cacheDir);
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
};

/** 初始化 Reranker 模型 */
const initReranker = async (): Promise<void> => {
  try {
    const { env, AutoTokenizer, AutoModelForSequenceClassification } =
      await import('@huggingface/transformers');
    env.allowLocalModels = true;
    env.useBrowserCache = false;
    env.remoteHost = EMBEDDING_CONFIG.remoteHost;

    sendProgress({
      file: RERANKING_CONFIG.model,
      name: '正在初始化 Reranker...',
      status: 'progress',
      loaded: 0,
      total: 100,
      progress: 0,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const progressCallback = (info: any) =>
      sendProgress({
        file: info.file,
        name: info.name,
        status: info.status,
        loaded: info.loaded,
        total: info.total,
        progress: info.progress,
      });

    rerankerTokenizer = await AutoTokenizer.from_pretrained(RERANKING_CONFIG.model, {
      progress_callback: progressCallback,
    });
    rerankerModel = await AutoModelForSequenceClassification.from_pretrained(
      RERANKING_CONFIG.model,
      {
        progress_callback: progressCallback,
        // @ts-expect-error quantized option is not in type definition but supported
        quantized: false,
      }
    );

    sendProgress({
      file: RERANKING_CONFIG.model,
      name: 'Reranker 就绪',
      status: 'ready',
      loaded: 100,
      total: 100,
      progress: 100,
    });
    console.log('[Reranker] 模型加载完成');
  } catch (err: unknown) {
    const error = err as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('[Reranker] 初始化失败:', error);
    if (
      error.message &&
      (error.message.includes('Protobuf') ||
        error.message.includes('out of bounds') ||
        error.message.includes('Deserialize tensor'))
    ) {
      console.log('[Reranker] 检测到缓存损坏 (Protobuf/Tensor)，清除后重试...');
      clearModelCache(RERANKING_CONFIG.model, 'Reranker');
      rerankerInitPromise = null;
      return ensureRerankerInit();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    send('error', { error: (err as any).message });
  }
};

const ensureRerankerInit = () => (rerankerInitPromise ??= initReranker());

// 启动时并行初始化两个模型
// 顶层异常捕获
process.on('uncaughtException', (err) => {
  console.error('[Model Child] Uncaught Exception:', err);
  send('error', { error: `Uncaught Exception: ${err.message}` });
});

process.on('unhandledRejection', (reason) => {
  console.error('[Model Child] Unhandled Rejection:', reason);
  send('error', { error: `Unhandled Rejection: ${reason}` });
});

// 启动时串行初始化两个模型，避免内存压力过大导致的 crash
(async () => {
  try {
    console.log('[Model Child] 开始初始化模型...');

    // 给 GC 一点时间
    if (global.gc) {
      try {
        global.gc();
      } catch (e) {
        /* ignore */
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    // 初始化 Reranker
    await ensureRerankerInit();
    console.log('[Model Child] 所有模型初始化完成');
  } catch (error) {
    console.error('[Model Child] 初始化流程失败:', error);
  }
})();

// 处理重排序请求
// eslint-disable-next-line @typescript-eslint/no-explicit-any
process.on('message', async (msg: any) => {
  if (msg.type !== 'rerank') return;
  const { query, documents, id } = msg;

  try {
    await ensureRerankerInit();
    if (!rerankerModel || !rerankerTokenizer) throw new Error('Reranker 模型初始化失败');

    const inputs = rerankerTokenizer(new Array(documents.length).fill(query), documents, {
      padding: true,
      truncation: true,
    });
    const { logits } = await rerankerModel(inputs);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dims = (logits as any).dims; // [batch_size, num_labels]

    let scores: number[] = [];
    if (dims && dims.length === 2 && dims[1] === 2) {
      // 兼容二分类输出模型 (Non-Relevant, Relevant)
      const data = logits.data;
      for (let i = 0; i < dims[0]; i++) {
        scores.push(data[i * 2 + 1]);
      }
    } else {
      scores = Array.from(logits.data);
    }

    console.log(
      `[Reranker] 计算完成 (前3个分数: ${scores
        .slice(0, 3)
        .map((n) => n.toFixed(4))
        .join(', ')}...)`
    );
    send('rerank-result', { id, scores });
  } catch (error: unknown) {
    console.error('[Reranker] 推理失败:', error);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    send('rerank-error', { id, error: (error as any).message });
  }
});
