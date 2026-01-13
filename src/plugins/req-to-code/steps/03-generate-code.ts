import { getLLM } from '../../../model';
import { LLMProvider } from '../../../config';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

export async function generateCode(requirements: string): Promise<string> {
  console.log('[ReqToCode] 正在生成代码...');
  const llm = getLLM(LLMProvider.DEEPSEEK);

  const systemPrompt = `你是一位资深软件工程师专家。
你的任务是实现以下需求。
产出整洁、可维护且可工作的代码。
如果需要多个文件，请清楚地分隔它们，或者解释结构。
如果适用，请专注于 Typescript/React。
代码注释和说明请使用中文。`;

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(requirements),
  ]);

  return response.content.toString();
}
