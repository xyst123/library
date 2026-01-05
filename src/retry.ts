/**
 * 通用重试工具函数
 * 使用指数退避策略
 */

export interface RetryOptions {
  /** 最大重试次数 */
  maxRetries?: number;
  /** 初始延迟 (毫秒) */
  initialDelay?: number;
  /** 最大延迟 (毫秒) */
  maxDelay?: number;
  /** 可重试的错误类型 (返回 true 表示可重试) */
  shouldRetry?: (error: Error) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  shouldRetry: () => true,
};

/**
 * 带重试的异步函数执行器
 * @param fn - 要执行的异步函数
 * @param options - 重试选项
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // 检查是否应该重试
      if (!opts.shouldRetry(lastError)) {
        throw lastError;
      }

      // 最后一次尝试失败，不再重试
      if (attempt === opts.maxRetries) {
        break;
      }

      // 计算延迟 (指数退避)
      const delay = Math.min(
        opts.initialDelay * Math.pow(2, attempt),
        opts.maxDelay
      );

      console.log(`[Retry] 第 ${attempt + 1} 次失败，${delay}ms 后重试...`);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * 睡眠函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 判断是否为可重试的 LLM 错误
 * (网络错误、速率限制等)
 */
export function isRetryableLLMError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('rate limit') ||
    message.includes('429') ||
    message.includes('503') ||
    message.includes('502') ||
    message.includes('econnreset') ||
    message.includes('enotfound')
  );
}
