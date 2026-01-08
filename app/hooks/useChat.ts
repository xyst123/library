import { useState, useCallback } from 'react';
import { message as antMessage } from 'antd';
import type { Message } from '../components';

interface UseChatOptions {
  provider?: string;
  onError?: (error: Error) => void;
}

interface UseChatReturn {
  messages: Message[];
  loading: boolean;
  sendMessage: (content: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  loadHistory: () => Promise<void>;
  stopGeneration: () => Promise<void>;
}

/**
 * 聊天 Hook - 封装与 Electron IPC 的交互逻辑
 * 
 * 功能：
 * - 管理消息列表状态
 * - 处理流式响应（文本 + 工具调用）
 * - 自动保存历史记录
 * - 错误处理
 * 
 * @example
 * ```tsx
 * const { messages, loading, sendMessage } = useChat({ provider: 'deepseek' });
 * 
 * <Button onClick={() => sendMessage('你好')}>发送</Button>
 * ```
 */
export const useChat = (options: UseChatOptions = {}): UseChatReturn => {
  const { provider = 'deepseek', onError } = options;

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  /**
   * 发送消息
   */
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;
      if (!window.electronAPI) {
        const error = new Error('Electron API 不可用');
        onError?.(error);
        return;
      }

      const question = content.trim();

      // 添加用户消息
      setMessages((prev) => [...prev, { role: 'user', content: question }]);
      setLoading(true);

      // 保存用户历史记录
      try {
        await window.electronAPI.addHistory('user', question);
      } catch (err) {
        console.warn('[useChat] 保存用户历史失败:', err);
      }

      // 助手消息占位符
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      // 监听流式事件
      const handleAnswerStart = (
        _event: unknown,
        data: { sources: Message['sources'] }
      ) => {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last.role === 'assistant') {
            return [...prev.slice(0, -1), { ...last, sources: data.sources }];
          }
          return prev;
        });
      };

      const handleChunk = (_event: unknown, msg: { chunk: string }) => {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last.role === 'assistant') {
            return [...prev.slice(0, -1), { ...last, content: last.content + msg.chunk }];
          }
          return prev;
        });
      };

      const handleToolCalls = (
        _event: unknown,
        data: { toolCalls: Array<{ name: string; args: Record<string, unknown> }> }
      ) => {
        console.log('[useChat] 收到工具调用事件:', data.toolCalls);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last.role === 'assistant') {
            return [...prev.slice(0, -1), { ...last, toolCalls: data.toolCalls }];
          }
          return prev;
        });
      };

      window.electronAPI.onAnswerStart(handleAnswerStart);
      window.electronAPI.onAnswerChunk(handleChunk);
      window.electronAPI.onToolCalls(handleToolCalls);

      try {
        const history = messages.map((m) => ({ role: m.role, content: m.content }));
        const result = await window.electronAPI.askQuestion(question, history, provider);

        // 移除事件监听器
        window.electronAPI.removeListener('answer-start');
        window.electronAPI.removeListener('answer-chunk');
        window.electronAPI.removeListener('tool-calls');

        if (result.success) {
          // 更新最终消息内容（保留已设置的 sources 和 toolCalls）
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last.role === 'assistant') {
              return [
                ...prev.slice(0, -1),
                { 
                  ...last, 
                  content: result.answer!,
                  // 只在 result 中有 sources 且不为空时才覆盖
                  ...(result.sources && result.sources.length > 0 ? { sources: result.sources } : {})
                },
              ];
            }
            return prev;
          });

          // 保存助手历史记录
          await window.electronAPI.addHistory('assistant', result.answer!);
        } else {
          const error = new Error(result.error || '查询失败');
          onError?.(error);
          antMessage.error(`查询失败: ${result.error}`);
        }
      } catch (error: unknown) {
        const err = error as Error;
        onError?.(err);
        antMessage.error(`查询出错: ${err.message}`);
      } finally {
        setLoading(false);
      }
    },
    [messages, provider, onError]
  );

  /**
   * 清空历史记录
   */
  const clearHistory = useCallback(async () => {
    if (!window.electronAPI) return;

    try {
      await window.electronAPI.clearHistory();
      setMessages([]);
      antMessage.success('对话历史已清空');
    } catch (error: unknown) {
      const err = error as Error;
      antMessage.error(`清空历史失败: ${err.message}`);
    }
  }, []);

  /**
   * 加载历史记录
   */
  const loadHistory = useCallback(async () => {
    if (!window.electronAPI) return;

    try {
      const res = await window.electronAPI.getHistory();
      if (res.success && res.history) {
        setMessages(res.history);
      }
    } catch (error) {
      console.error('[useChat] 加载历史失败:', error);
    }
  }, []);

  /**
   * 停止生成
   */
  const stopGeneration = useCallback(async () => {
    if (!window.electronAPI) return;

    try {
      await window.electronAPI.stopGeneration();
      setLoading(false);
      antMessage.info('已停止生成');
    } catch (error) {
      console.error('[useChat] 停止生成失败:', error);
    }
  }, []);

  return {
    messages,
    loading,
    sendMessage,
    clearHistory,
    loadHistory,
    stopGeneration,
  };
};

export type { UseChatOptions, UseChatReturn };
