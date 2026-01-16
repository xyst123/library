import { useState, useCallback } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import type { Message } from '@/components';

interface UseChatOptions {
  provider?: string;
  onError?: (error: Error) => void;
  messageApi?: MessageInstance;
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
 * const { message } = App.useApp();
 * const { messages, loading, sendMessage } = useChat({ provider: 'deepseek', messageApi: message });
 *
 * <Button onClick={() => sendMessage('你好')}>发送</Button>
 * ```
 */
export const useChat = (options: UseChatOptions = {}): UseChatReturn => {
  const { provider = 'deepseek', onError, messageApi } = options;

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
      const handleAnswerStart = (_event: unknown, data: { sources: Message['sources'] }) => {
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

      const handleAgentThought = (_event: unknown, data: { content: string }) => {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last.role === 'assistant') {
            // 将思考内容添加到内容中还是作为一个特殊的块？目前先附加到内容中，并保留格式
            const newContent = last.content ? last.content + '\n\n' + data.content : data.content;
            return [...prev.slice(0, -1), { ...last, content: newContent }];
          }
          return prev;
        });
      };

      const handleAgentToolOutput = (_event: unknown, data: { content: string }) => {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last.role === 'assistant') {
            const newContent = last.content ? last.content + '\n' + data.content : data.content;
            return [...prev.slice(0, -1), { ...last, content: newContent }];
          }
          return prev;
        });
      };

      window.electronAPI.onAnswerStart(handleAnswerStart);
      window.electronAPI.onAnswerChunk(handleChunk);
      window.electronAPI.onToolCalls(handleToolCalls);

      // Agent 事件监听器
      window.electronAPI.onAgentThought(handleAgentThought);
      window.electronAPI.onAgentToolOutput(handleAgentToolOutput);

      try {
        const history = messages.map((m) => ({ role: m.role, content: m.content }));
        let result;

        // 检查是否为 Agent 指令
        if (question.startsWith('/admin') || question.startsWith('/agent')) {
          const input = question.replace(/^\/(admin|agent)\s+/, '');
          result = await window.electronAPI.runAgent(input);

          // 如果 runAgent 没有返回最终答案（它流式传输思考过程），则模拟一个
          if (result.success && !result.answer) {
            // 通常最后的思考或工具输出就是答案，但我们已经流式传输了它。
            // 确保不会报错即可。
            result.answer = '';
          }
        } else {
          result = await window.electronAPI.askQuestion(question, history, provider);
        }

        // 移除事件监听器
        window.electronAPI.removeListener('answer-start');
        window.electronAPI.removeListener('answer-chunk');
        window.electronAPI.removeListener('tool-calls');
        window.electronAPI.removeListener('agent-thought');
        window.electronAPI.removeListener('agent-tool-output');

        if (result.success) {
          // 更新最终消息内容（保留已设置的 sources 和 toolCalls）
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last.role === 'assistant' && result.answer) {
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  content: result.answer,
                  ...(result.sources && result.sources.length > 0
                    ? { sources: result.sources }
                    : {}),
                },
              ];
            }
            return prev;
          });

          // 保存助手历史记录
          if (result.answer) {
            await window.electronAPI.addHistory('assistant', result.answer);
          }
        } else {
          const error = new Error(result.error || '查询失败');
          onError?.(error);
          messageApi?.error(`查询失败: ${result.error}`);
        }
      } catch (error: unknown) {
        const err = error as Error;
        onError?.(err);
        messageApi?.error(`查询出错: ${err.message}`);
      } finally {
        setLoading(false);
      }
    },
    [messages, provider, onError, messageApi]
  );

  /**
   * 清空历史记录
   */
  const clearHistory = useCallback(async () => {
    if (!window.electronAPI) return;

    try {
      await window.electronAPI.clearHistory();
      setMessages([]);
      messageApi?.success('对话历史已清空');
    } catch (error: unknown) {
      const err = error as Error;
      messageApi?.error(`清空历史失败: ${err.message}`);
    }
  }, [messageApi]);

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
      messageApi?.info('已停止生成');
    } catch (error) {
      console.error('[useChat] 停止生成失败:', error);
    }
  }, [messageApi]);

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
