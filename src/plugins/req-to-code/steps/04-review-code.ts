import { getLLM } from '../../../model';
import { LLMProvider } from '../../../config';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

export async function reviewCode(code: string): Promise<string> {
  console.log('[ReqToCode] 正在审查生成的代码...');
  const llm = getLLM(LLMProvider.DEEPSEEK);

  const systemPrompt = `你是一位代码审查 (QA) 机器人。
请审查以下代码，关注以下方面：
1. Bug 或逻辑错误。
2. 类型安全问题 (TS)。
3. 最佳实践和可读性。
4. 安全漏洞。

请用中文输出你的审查报告。如果代码看起来不错，请给予肯定。`;

  const response = await llm.invoke([new SystemMessage(systemPrompt), new HumanMessage(code)]);

  return response.content.toString();
}
