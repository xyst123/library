# 08. LangChain 实用常用 API 指南

除了本项目目前使用的基础 RAG 流程外，LangChain 还提供了许多强大的 API，可以显著提升应用的智能程度和开发效率。

## 1. LCEL (LangChain Expression Language)

LCEL 是 LangChain 的核心声明式语言，用于构建 "Runnable" 序列。它让逻辑组合变得极其直观，支持流式传输、批处理和异步调用。

### 核心 API

- `RunnableSequence` / `.pipe()`: 链接多个组件。
- `RunnablePassthrough`: 传递输入值，常用于 RAG 中将 `question` 传递给 prompt。
- `RunnableLambda`: 将自定义函数包装成 Runnable。

### 示例代码

```typescript
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';

// 传统的 Chain 写法 (已过时)
// const chain = new LLMChain({ ... })

// LCEL 写法
const chain = RunnableSequence.from([
  {
    context: retriever.pipe(formatDocumentsAsString),
    question: new RunnablePassthrough(),
  },
  prompt,
  model,
  new StringOutputParser(),
]);

// 调用
const result = await chain.invoke('什么是 RAG?');
```

## 2. 结构化输出 (Structured Output)

让 LLM 返回 JSON 而不是纯文本，这对于构建 Agent 或需要精确数据提取的场景至关重要。

### 核心 API

- `StructuredOutputParser`: 定义期望的 JSON Schema。
- `.withMyMethod()` (Tool Calling): 各模型厂商的原生工具调用支持 (OpenAI, Gemini 等)。

### 示例代码

```typescript
import { z } from 'zod';
import { StructuredOutputParser } from 'langchain/output_parsers';

// 定义 Schema
const parser = StructuredOutputParser.fromZodSchema(
  z.object({
    sentiment: z.enum(['positive', 'negative']),
    topics: z.array(z.string()).describe('文本中提到的话题列表'),
  })
);

const chain = RunnableSequence.from([prompt, model, parser]);

const result = await chain.invoke({
  format_instructions: parser.getFormatInstructions(),
  input: '这款手机太棒了，拍照很清晰！',
});
// result: { sentiment: "positive", topics: ["手机", "拍照"] }
```

## 3. 高级检索器 (Advanced Retrievers)

基础的 `VectorStoreRetriever` 只能做语义相似度搜索，高级检索器可以解决复杂查询问题。

### 核心 API

- **`MultiQueryRetriever`**: 自动将用户的一个问题改写成多个不同角度的问题，分别检索后去重。解决用户提问不准确的问题。
- **`ContextualCompressionRetriever`**: 在检索回来的文档交给 LLM 之前，先用一个小模型（或算法）通过“压缩”或“过滤”提取相关内容。节省 Token，提升准确率。
- **`EnsembleRetriever`**: 混合检索（本项目已手动实现类似的 Hybrid Search），结合关键词检索 (BM25) 和向量检索。

### 示例代码 (MultiQuery)

```typescript
import { MultiQueryRetriever } from 'langchain/retrievers/multi_query';

const retriever = MultiQueryRetriever.fromLLM({
  llm: model,
  retriever: vectorStore.asRetriever(),
  verbose: true,
});

// 用户问 "怎么部署？"，LLM 可能会生成：
// 1. "如何安装部署该项目？"
// 2. "部署流程是什么？"
// 3. "系统环境要求有哪些？"
// 然后合并所有结果。
```

## 4. 记忆 (Memory / History)

管理对话上下文。虽然本项目使用了数据库手动管理，LangChain 提供了标准封装。

### 核心 API

- `RunnableWithMessageHistory`: 为任何 LCEL Chain 添加自动的读写历史记录功能。
- `ChatMessageHistory`: 标准的内存历史记录类。

### 示例代码

```typescript
import { RunnableWithMessageHistory } from '@langchain/core/runnables';

const chainWithHistory = new RunnableWithMessageHistory({
  runnable: chain,
  getMessageHistory: (sessionId) => new SQLChatMessageHistory({ sessionId }), // 适配器
  inputMessagesKey: 'question',
  historyMessagesKey: 'history',
});

await chainWithHistory.invoke(
  { question: '我刚才说了什么？' },
  { configurable: { sessionId: 'user-123' } }
);
```

## 5. Agent (智能体)

让 LLM 决定调用什么工具，而不仅仅是回答问题。

### 核心 API

- `createToolCallingAgent`: 创建支持 Function Calling 的 Agent。
- `AgentExecutor`: 执行 Agent 的运行时，处理循环调用。
- `@langchain/core/tools`: 定义自定义工具 (`DynamicTool`, `tool` 函数)。

### 示例代码

```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const weatherTool = tool(
  async ({ city }) => {
    return '25°C, 晴朗'; // 实际调用 API
  },
  {
    name: 'get_weather',
    description: '获取指定城市的天气',
    schema: z.object({ city: z.string() }),
  }
);

const tools = [weatherTool];
// 将 tools 绑定到支持 tool_calling 的模型
const llmWithTools = model.bindTools(tools);
```

## 总结

对于本项目 (Node.js/Electron 本地知识库)，最推荐深入尝试的是：

1.  **高级检索器 (`MultiQueryRetriever`)**: 能显著改善“明明有文档却搜不到”的情况。
2.  **结构化输出**: 如果未来通过意图识别来控制应用（比如“帮我把背景改成黑色”），这将非常有用。
