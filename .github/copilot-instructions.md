# Copilot Instructions

## 项目核心

基于 **Electron + React + TypeScript** 的本地 RAG 知识库桌面应用。

**关键技术**:
- 本地 Embeddings: HuggingFace Transformers（Xenova/all-MiniLM-L6-v2）
- 向量数据库: SQLite + sqlite-vss
- LLM: DeepSeek / Gemini

## 架构规则

### 模块职责（严格遵守）

```
electron/main.js    → IPC 桥接，不含业务逻辑
electron/worker.js  → Worker 入口，加载 src/worker.ts
src/worker.ts       → 消息处理器，协调业务逻辑
src/rag.ts          → RAG 核心，LLM 调用
src/loader.ts       → 文档加载与分割
src/sqliteStore.ts  → 向量存储操作
app/                → React UI 层
```

**关键点**：
- ❌ 不要在 main.js 中写业务逻辑
- ✅ 耗时操作必须在 Worker 线程执行
- ✅ IPC 通信使用 `invoke/handle` 模式
- 在确保可读性的前提下，编写精简的代码

### IPC 通信模式

```typescript
// preload.js - 必须显式暴露每个方法
contextBridge.exposeInMainWorld('electronAPI', {
  methodName: (args) => ipcRenderer.invoke('channel-name', args),
});

// main.js - 代理到 Worker
ipcMain.handle('channel-name', createWorkerProxy('worker-type'));

// worker.ts - 实现处理器
const handlers = { 'worker-type': handleMethod };
```

**易错点**：
- ⚠️ 添加新功能时，三个文件都要更新
- ⚠️ preload.js 使用 CommonJS（require），不能用 ES6 import

## 编码规则（强制）

### TypeScript

- 使用箭头函数，禁用 `function` 关键字
- 避免 `any`，使用明确类型或 `unknown`
- 导入类型用 `import type`
- 中文注释和调试信息

```typescript
// ✅ 正确
const myFunc = async (param: string): Promise<void> => {
  console.log('处理中...');
};

// ❌ 错误
async function myFunc(param: string): Promise<void> { }
```

### React 组件

- 使用 `React.FC` 类型
- 导出使用 `export { Component }` 或 `export default Component`
- 组件文件与样式文件同名

### 模块系统

- Electron 主进程: CommonJS (`module.exports`)
- TypeScript 代码: ESM (`export`)
- **注意**: `mcp_server.js` 和 `preload.js` 必须用 `module.exports`

## Function Calling（最佳实践）

**数据流（禁止修改）**：
```
LLM tool_calls (JSON) 
  → Worker 收集 
  → IPC event: 'tool-calls' (结构化) 
  → React 直接使用
```

**❌ 禁止**：转为字符串、HTML 注释、正则解析
**✅ 正确**：始终保持结构化传递

### 添加新工具

1. `src/rag.ts` - 用 `DynamicStructuredTool` + Zod 定义
2. `bindTools([newTool])` 绑定到 LLM
3. `streamWithToolCalls` 中检测并收集
4. `ComponentParser.tsx` 添加渲染逻辑

## Chunking 策略

**当前支持**：
- 字符递归分割（默认）：500 字符，100 重叠
- 语义分割（可选）：本地模型计算相似度

**配置位置**：`src/config.ts` - `CHUNKING_CONFIG`

**切换策略后**：需重新导入文档

## 环境变量

```bash
DEEPSEEK_API_KEY=xxx
GOOGLE_API_KEY=xxx
```

从 `.env` 加载，不要硬编码。

## 参考

学习文档：`docs/ai-learning/`

