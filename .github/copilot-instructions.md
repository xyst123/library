# Copilot Instructions

本文档为 GitHub Copilot 提供项目上下文和编码规范指导。

## 项目概述

这是一个基于 **Electron + React** 的本地 RAG（检索增强生成）知识库桌面应用，支持多格式文档导入、本地向量化存储和多模型问答。

### 技术栈

- **前端**: React 19 + TypeScript + Ant Design 6 + @ant-design/x
- **桌面框架**: Electron 33
- **构建工具**: Vite
- **AI/ML**: LangChain + HuggingFace Transformers（本地 Embeddings）
- **数据库**: SQLite + sqlite-vss（向量搜索）
- **LLM**: DeepSeek / Google Gemini

## 项目结构

```
├── app/                  # React 前端（UI 层）
│   ├── components/       # UI 组件
│   ├── styles/           # 样式文件
│   └── types/            # 类型定义
├── electron/             # Electron 主进程
│   ├── main.js           # 主进程入口
│   ├── preload.js        # 预加载脚本
│   └── worker.js         # Worker 线程
├── src/                  # 核心业务逻辑（RAG 引擎）
│   ├── config.ts         # 配置管理
│   ├── loader.ts         # 文档加载分割
│   ├── model.ts          # Embeddings & LLM
│   ├── rag.ts            # RAG 检索生成
│   ├── sqliteStore.ts    # 向量存储
│   └── worker.ts         # Worker 线程逻辑
└── docs/                 # 文档
    └── ai-learning/      # AI 学习资料
```

## 编码规范

### TypeScript

- 目标版本: ES2022
- 模块系统: ESNext
- 严格模式: 启用 `strict: true`
- 路径别名: `@/*` 映射到 `app/*`
- 避免使用 `any` 类型，优先使用明确的类型定义
- 代码注释使用中文编写
- console.log 等调试信息使用中文描述
- 使用箭头函数，不使用 function 关键字

### 代码风格（Prettier）

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

### ESLint 规则

- 使用 `@typescript-eslint` 解析器
- React Hooks 规则启用
- `@typescript-eslint/no-explicit-any`: warn
- `@typescript-eslint/no-unused-vars`: warn（忽略 `_` 前缀参数）
- 无需显式导入 React（`react/react-in-jsx-scope: off`）

### React 组件规范

- 使用函数式组件 + Hooks
- 组件类型: `React.FC`
- 状态管理: `useState` / `useEffect` / `useRef`
- 样式: 独立 CSS 文件（如 `ComponentName.css`）
- 导入类型时使用 `import type`

```tsx
import { useState, useEffect } from 'react';
import type React from 'react';
import type { SomeType } from './types';

const MyComponent: React.FC = () => {
  const [state, setState] = useState<string>('');
  
  useEffect(() => {
    // 副作用逻辑
  }, []);

  return <div>{/* JSX */}</div>;
};
```

### 配置管理

- 使用枚举定义常量类型（如 `LLMProvider`）
- 配置对象使用 `const` + 大写命名（如 `LLM_CONFIG`）
- 环境变量通过 `dotenv` 加载，从 `.env` 文件读取
- 敏感信息（API Key）不要硬编码

### Electron IPC 通信

- 主进程与渲染进程通过 `electronAPI` 通信
- 渲染进程使用 `window.electronAPI` 调用主进程方法
- 支持事件监听模式（如流式响应）

### 文件命名

- 组件文件: PascalCase（如 `MessageItem.tsx`）
- 样式文件: 与组件同名（如 `MessageItem.css`）
- 工具/配置文件: camelCase（如 `config.ts`）
- 类型定义: `.d.ts` 后缀（如 `electron.d.ts`）

## 常用命令

```bash
npm run dev        # 启动开发环境（Vite + Electron）
npm run build      # 构建前端
npm run dist       # 打包桌面应用
npm run lint       # ESLint 检查
npm run format     # Prettier 格式化
```

## 注意事项

1. **本地优先**: Embeddings 在本地运行，确保数据隐私
2. **Worker 线程**: 耗时操作（如文档处理）在 Worker 中执行，避免阻塞主进程
3. **流式输出**: LLM 响应使用流式传输，逐字显示
4. **多格式支持**: 支持 PDF、DOCX、HTML、TXT、MD 格式文档
5. **向量存储**: 使用 SQLite + sqlite-vss 实现本地向量搜索
6. **Function Calling**: 使用 OpenAI Function Calling 实现天气卡片等交互组件
   - 工具定义在 `src/rag.ts` 中使用 zod schema
   - 通过 `bindTools()` 绑定到 LLM
   - tool_calls 自动转换为 HTML 注释标记
   - 前端 `ComponentParser` 解析标记并渲染组件

## Function Calling 工作流程（最佳实践）

1. **工具定义**（`src/rag.ts`）：使用 `DynamicStructuredTool` 定义工具，schema 使用 zod
2. **绑定工具**：通过 `llm.bindTools([tool])` 启用 Function Calling
3. **LLM 调用**：当用户提问触发工具时，LLM 返回 `tool_calls`（结构化 JSON）
4. **收集工具调用**：RAG 系统收集 tool_calls 数据
5. **结构化传递**：Worker 发送独立的 `tool-calls` 事件（**避免转换为字符串**）
6. **前端接收**：App 监听 `tool-calls` 事件，直接使用结构化数据
7. **组件渲染**：直接传递给组件，**无需正则解析**

### 技术要点

**❌ 旧方案（不推荐）**：
```
结构化 tool_calls → HTML 注释字符串 → 正则解析 → 结构化数据
```

**✅ 新方案（最佳实践）**：
```
结构化 tool_calls → 结构化事件传递 → 直接使用
```

### 代码示例

### 代码示例

```typescript
// 1. 在 src/rag.ts 定义工具
const myTool = new DynamicStructuredTool({
  name: 'tool_name',
  description: '工具描述',
  schema: z.object({
    param: z.string().describe('参数说明'),
  }),
  func: async ({ param }) => {
    return `工具执行结果`;
  },
});

// 2. 绑定工具
const llm = baseLLM.bindTools([weatherCardTool, myTool]);

// 3. 在 streamWithToolCalls 中检测 tool_call.function.name
// 4. 在 app/components/ComponentParser.tsx 添加对应的组件渲染逻辑
```

## AI 相关概念

如需了解 RAG、向量存储、Embeddings 等概念，请参考 `docs/ai-learning/` 目录下的学习文档。
