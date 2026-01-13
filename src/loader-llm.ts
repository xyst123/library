import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { randomUUID } from 'node:crypto';
// Prompts
const EXTRACT_PROMPT = `
你是一个专业的知识提取专家。你的任务是阅读给定的 Markdown 文档，提取出核心知识点，并将其转化为“问题-答案”对 (QA Pairs)。

要求：
1. **聚合与完整性（关键）**：不要将一个完整的逻辑或流程拆分成多个细碎的 QA。尽量将相关的步骤、原理解释、配置项合并到一个 QA 中。答案应该是一个完整的“小短文”，而不是一句话。
2. **粒度控制**：专注于提取“如何做(How-to)”、“是什么(Concept)”、“为什么(Why)”等层面的知识。忽略琐碎的、显而易见的细节。
3. **独立性**：每个 QA 对必须是独立的，不需要依赖上下文即可理解。即便是合并后的答案，也需要包含足够的背景信息。
4. **准确性**：答案必须忠实于原文，不要通过臆测添加信息。
5. **格式**：必须严格返回一个 JSON 数组，数组中每个对象包含 "question" 和 "answer" 两个字段。不要包含其他废话。

示例（正确 vs 错误）：
❌ 错误：
Q: 如何启动？ A: 运行 npm start。
Q: 启动前要干什么？ A: 要安装依赖。

✅ 正确：
Q: 如何部署和启动服务？
A: 启动服务由以下步骤组成：
1. 首先运行 \`npm install\` 安装依赖。
2. 确保环境变量配置文件 \`.env\` 已创建。
3. 最后运行 \`npm start\` 启动服务。
`;

const EXPAND_PROMPT = `
你是一个搜索查询优化专家。给定一个标准问题，请生成 5 个语义相似但表达方式不同的查询 (Similar Queries)。这些查询应该模拟真实用户的口语化搜索习惯。

要求：
1. **多样性**：涵盖不同的句式、同义词和提问角度（如“怎么做”、“是什么”、“报错了怎么办”等）。
2. **口语化**：使用用户在大白话中常用的表达。
3. **格式**：必须严格返回一个 JSON 字符串数组。不要包含其他废话。

输入问题：如何重置密码？
输出示例：["怎么改密码", "忘记密码了怎么办", "在哪里可以重设密码", "密码重置流程", "无法登录怎么找回密码"]
`;

// 类型定义
interface QAPair {
  question: string;
  answer: string;
}

export interface ProcessedItem {
  id: string;
  original_text: string;
  primary_question: string;
  augmented_questions: string[];
}

// 工具函数：安全的 JSON 解析
const safeJsonParse = (text: string): unknown => {
  try {
    // 移除 markdown 代码块标记
    let cleanText = text.replace(/```json\n?|\n?```/g, '').trim();
    const startIndex = cleanText.indexOf('[');
    const endIndex = cleanText.lastIndexOf(']');
    if (startIndex !== -1 && endIndex !== -1) {
      cleanText = cleanText.substring(startIndex, endIndex + 1);
    }
    return JSON.parse(cleanText);
  } catch (e) {
    console.warn(`[JSON Parse Error] 解析失败，原始文本: ${text.slice(0, 50)}...`);
    return null;
  }
};

// 工具函数：重试机制
const retry = async <T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000,
  actionName = 'Operation'
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    console.warn(
      `[Retry] ${actionName} 失败，剩余重试次数: ${retries}。错误: ${(error as Error).message}`
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
    return retry(fn, retries - 1, delay * 2, actionName);
  }
};

/**
 * 使用 LLM 处理文件内容，提取 QA 对并泛化问题
 * @param content 文档内容
 * @param llm LLM 实例
 * @param filename 文件名（用于日志）
 */
export const processFileWithLLM = async (
  content: string,
  llm: BaseChatModel,
  filename: string
): Promise<ProcessedItem[]> => {
  if (!content.trim()) return [];

  console.log(`[LLM Ingest] 开始处理: ${filename}`);

  // 1. 提取 QA 对
  console.log(`[LLM Ingest] 正在提取知识点...`);
  const extractionRes = await retry(
    async () => {
      const response = await llm.invoke([
        new SystemMessage(EXTRACT_PROMPT),
        new HumanMessage(`请解析以下文档内容：\n\n${content}`),
      ]);
      const parsed = safeJsonParse(response.content as string);
      if (!Array.isArray(parsed)) throw new Error('提取结果不是有效的 JSON 数组');
      return parsed as QAPair[];
    },
    3,
    2000,
    `提取文件 ${filename}`
  );

  console.log(`[LLM Ingest] ${filename} 提取到 ${extractionRes.length} 个 QA 对`);

  // 2. 泛化问题 (串行处理)
  const results: ProcessedItem[] = [];

  for (const [index, qa] of extractionRes.entries()) {
    console.log(
      `[LLM Ingest] (${index + 1}/${extractionRes.length}) 正在泛化问题: "${qa.question}"`
    );

    // 如果问题很简单，可能不需要泛化，或者泛化失败也接受
    let similarQueries: string[] = [];
    try {
      similarQueries = await retry(
        async () => {
          const response = await llm.invoke([
            new SystemMessage(EXPAND_PROMPT),
            new HumanMessage(`输入问题：${qa.question}`),
          ]);
          const parsed = safeJsonParse(response.content as string);
          if (!Array.isArray(parsed)) throw new Error('泛化结果不是有效的 JSON 数组');
          return parsed as string[];
        },
        2,
        2000,
        `泛化问题 "${qa.question}"`
      );
    } catch (e) {
      console.warn(`[LLM Ingest] 泛化失败 "${qa.question}"，仅使用原问题。`);
    }

    results.push({
      id: randomUUID(),
      original_text: qa.answer,
      primary_question: qa.question,
      augmented_questions: similarQueries,
    });
  }

  return results;
};
