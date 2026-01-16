import { StateGraph, MessagesAnnotation, START } from '@langchain/langgraph';
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt';
import type { BaseMessage } from '@langchain/core/messages';
import { SystemMessage } from '@langchain/core/messages';
import { getLLM } from '../model';
import { LLMProvider } from '../config';
import { ALL_TOOLS } from './tools';
import { FILE_ADMIN_SYSTEM_PROMPT } from '../prompts';

/**
 * 创建图书管理员 Agent (ReAct) 使用 StateGraph
 */
export const createFileAdminAgent = async (provider: LLMProvider) => {
  const model = getLLM(provider);
  if (!model.bindTools) {
    throw new Error(`当前 LLM 提供商 (${provider}) 不支持工具绑定 (bindTools 未定义)。`);
  }
  const ModelWithTools = model.bindTools(ALL_TOOLS);

  // 定义 Agent 节点：调用 LLM
  const agentNode = async (state: typeof MessagesAnnotation.State) => {
    const { messages } = state;
    // 确保 System Prompt 在最前面
    const sysMsg = new SystemMessage(FILE_ADMIN_SYSTEM_PROMPT);

    // 调用模型
    const result = await ModelWithTools.invoke([sysMsg, ...messages]);
    return { messages: [result] };
  };

  // 定义工具节点
  const toolNode = new ToolNode(ALL_TOOLS);

  // 构建图
  const workflow = new StateGraph(MessagesAnnotation)
    .addNode('agent', agentNode)
    .addNode('tools', toolNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', toolsCondition)
    .addEdge('tools', 'agent');

  // 编译图
  return workflow.compile();
};

/**
 * 运行 Agent
 * @param input 用户指令
 * @param provider LLM 提供商
 */
export const runFileAdminAgent = async (
  input: string,
  provider: LLMProvider
): Promise<
  AsyncGenerator<
    { agent?: { messages: BaseMessage[] }; tools?: { messages: BaseMessage[] } },
    void,
    unknown
  >
> => {
  if (!input || !input.trim()) {
    throw new Error('输入指令不能为空。');
  }
  if (!Object.values(LLMProvider).includes(provider)) {
    throw new Error(`无效的 LLM 提供商: ${provider}`);
  }

  console.log(`[Agent] 收到指令: "${input}" 使用提供商: ${provider}`);
  const agent = await createFileAdminAgent(provider);

  const stream = await agent.stream({
    messages: [{ role: 'user', content: input }],
  });

  return stream;
};
