import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getLLM } from './model';
import { LLMProvider } from './config';
import type { ChatMessage } from './utils';
import { formatHistory } from './utils';

// 摘要生成 Prompt
const SUMMARY_PROMPT = `
你是一个专业的对话摘要助手。你的任务是将一段对话历史压缩成简洁的摘要，以作为“长期记忆”保留。

要求：
1. **保留关键信息**：保留用户意图、关键事实（如姓名、偏好、项目背景）、助手的关键回答。
2. **第一人称视角**：摘要应以“当前对话状态”为视角，例如“用户询问了...助手回答了...”。
3. **简洁**：去除寒暄、废话，只保留核心逻辑。
4. **语言**：使用中文。

输入格式：
- 现有摘要：（如果有）
- 新对话：（需要被合并的对话）

输出：
- 更新后的完整摘要
`;

/**
 * 生成对话摘要
 * @param newHistory 需要被摘要的新对话片段
 * @param currentSummary 当前已有的摘要（可选）
 * @param provider LLM 提供商
 */
export const generateSummary = async (
  newHistory: ChatMessage[],
  currentSummary: string = '',
  provider: LLMProvider = LLMProvider.DEEPSEEK
): Promise<string> => {
  if (newHistory.length === 0) return currentSummary;

  console.log('[Memory] 正在生成对话摘要...');
  const llm = getLLM(provider);

  const formattedHistory = formatHistory(newHistory);

  const content = `
现有摘要：
${currentSummary || '无'}

新对话：
${formattedHistory}

请根据以上信息生成一份更新后的摘要：
`;

  try {
    const response = await llm.invoke([
      new SystemMessage(SUMMARY_PROMPT),
      new HumanMessage(content),
    ]);

    const summary = typeof response.content === 'string' ? response.content : '';
    console.log('[Memory] 摘要生成完成:', summary.slice(0, 50) + '...');
    return summary;
  } catch (error) {
    console.error('[Memory] 摘要生成失败:', error);
    return currentSummary; // 降级：返回旧摘要，避免丢失
  }
};
