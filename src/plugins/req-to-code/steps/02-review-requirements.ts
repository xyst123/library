import { getLLM } from '../../../model';
import { LLMProvider } from '../../../config';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

export async function reviewRequirements(
  requirements: string
): Promise<{ approved: boolean; feedback: string }> {
  console.log('[ReqToCode] 正在评审需求...');
  const llm = getLLM(LLMProvider.DEEPSEEK);

  const systemPrompt = `你是一位能够使用中文的资深技术项目经理和架构师。
你的目标是评审以下需求文档，确保其清晰、完整且技术上可行。
如果需求足够完善，可以开始编码，请在回复开头写上 "APPROVED"。
如果存在问题、歧义或缺少细节，请提供简洁的建设性反馈，指出需要澄清的地方。
请用中文回复。
暂时不要生成代码，只需评审需求。`;

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(requirements),
  ]);

  const content = response.content.toString();
  const approved = content.trim().toUpperCase().startsWith('APPROVED');

  return {
    approved,
    feedback: content,
  };
}
