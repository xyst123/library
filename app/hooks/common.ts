import { useState, useCallback, useMemo } from 'react';
import type React from 'react';

/**
 * 管理异步操作状态的 Hook
 */
export const useAsync = <T, E = Error>() => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<E | null>(null);
  const [loading, setLoading] = useState(false);

  const execute = useCallback(async (asyncFn: () => Promise<T>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await asyncFn();
      setData(result);
      return result;
    } catch (err) {
      setError(err as E);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, error, loading, execute, reset };
};

/**
 * 管理布尔状态的 Hook
 */
export const useToggle = (initialValue = false) => {
  const [value, setValue] = useState(initialValue);

  const toggle = useCallback(() => setValue((v) => !v), []);
  const setTrue = useCallback(() => setValue(true), []);
  const setFalse = useCallback(() => setValue(false), []);

  return { value, toggle, setTrue, setFalse, setValue };
};

/**
 * 管理本地存储的 Hook
 */
export const useLocalStorage = <T>(key: string, initialValue: T) => {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      } catch (error) {
        console.error('LocalStorage error:', error);
      }
    },
    [key, storedValue]
  );

  return [storedValue, setValue] as const;
};

/** useDragDrop 配置选项 */
interface UseDragDropOptions {
  /** 允许的文件扩展名列表 */
  allowedExtensions?: readonly string[];
  /** 文件放下时的回调 */
  onDrop: (paths: string[]) => void;
}

/** useDragDrop 返回值 */
interface UseDragDropResult {
  /** 是否正在拖拽 */
  isDragging: boolean;
  /** 拖拽区域的事件处理器 */
  dragProps: {
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  /** 根据拖拽状态返回的容器样式 */
  dragStyle: React.CSSProperties;
}

/**
 * 文件拖放逻辑 Hook
 * @param options 配置选项
 * @returns 拖拽状态和事件处理器
 */
export const useDragDrop = (options: UseDragDropOptions): UseDragDropResult => {
  const { allowedExtensions, onDrop } = options;
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);

      // 如果指定了允许的扩展名，进行过滤
      const validFiles = allowedExtensions
        ? files.filter((f) => {
            const ext = f.name.split('.').pop()?.toLowerCase();
            return ext && allowedExtensions.includes(ext);
          })
        : files;

      if (validFiles.length === 0) return;

      // Electron 环境下 File 对象带有 path 属性
      const paths = validFiles.map((f) => (f as unknown as { path: string }).path);
      onDrop(paths);
    },
    [allowedExtensions, onDrop]
  );

  const dragProps = useMemo(
    () => ({
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    }),
    [handleDragOver, handleDragLeave, handleDrop]
  );

  const dragStyle = useMemo<React.CSSProperties>(
    () => ({
      backgroundColor: isDragging ? 'rgba(29, 209, 247, 0.1)' : 'transparent',
      border: isDragging ? '2px dashed #1dd1f7' : '2px dashed transparent',
      transition: 'background-color 0.2s, border-color 0.2s',
    }),
    [isDragging]
  );

  return { isDragging, dragProps, dragStyle };
};
