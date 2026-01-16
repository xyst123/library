import { SUPPORTED_FILE_EXTENSIONS } from '@/constants';

/**
 * 验证文件扩展名是否支持
 */
export const isValidFileExtension = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return SUPPORTED_FILE_EXTENSIONS.includes(ext as (typeof SUPPORTED_FILE_EXTENSIONS)[number]);
};

/**
 * 从完整路径中提取文件名
 */
export const getFileName = (filePath: string): string => {
  return filePath.split('/').pop() || filePath;
};

/**
 * 过滤有效的文件列表
 */
export const filterValidFiles = (files: File[]): File[] => {
  return files.filter((f) => isValidFileExtension(f.name));
};

/**
 * 从 File 对象中提取路径（Electron 特定）
 */
export const extractFilePaths = (files: File[]): string[] => {
  return files.map((f) => (f as unknown as { path: string }).path);
};

/**
 * 格式化错误消息
 */
export const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

/**
 * 安全的 JSON 解析
 */
export const safeJsonParse = <T>(jsonString: string, fallback: T): T => {
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return fallback;
  }
};

/**
 * 防抖函数
 */
export const debounce = <T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

/**
 * 节流函数
 */
export const throttle = <T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};
