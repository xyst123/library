# 本地知识库项目 (Node.js)

这是一个基于 Node.js 的轻量级本地知识库应用。它支持读取文本文件，将其转化为向量存储在本地数据库中，并使用大型语言模型（DeepSeek 或 Gemini）进行检索增强生成（RAG）问答。

## ✨ 特性

- **多模型支持**：支持 DeepSeek 和 Google Gemini，可按需切换。
- **本地嵌入 (Embeddings)**：使用 `Xenova/all-MiniLM-L6-v2` 模型在本地生成向量，无需额外的 API 费用，保护隐私。
- **本地向量数据库**：使用 `HNSWLib` 进行高性能的本地向量存储和检索。
- **零外部依赖**：除 LLM API 外，核心的向量化和存储全在本地完成。

## 🏗️ 架构概览

项目主要包含以下模块：

- **Loader (`src/loader.ts`)**: 负责读取本地 TXT 文件，并将其分割成适合处理的小块（Chunks）。
- **VectorStore (`src/vectorStore.ts`)**: 封装了 `HNSWLib`，负责将文本块转换为向量并持久化存储到 `data/hnswlib` 目录。
- **Model (`src/model.ts`)**: 模型工厂，负责创建 LLM 实例（DeepSeek/Gemini）和 Embeddings 实例。
- **RAG (`src/rag.ts`)**: 实现了“检索-增强-生成”流程：检索相关文档 -> 组装 Prompt -> 调用 LLM 生成回答。
- **Index (`src/index.ts`)**: 命令行入口（CLI），提供导入和查询功能。

## 🚀 快速开始

### 1. 环境准备

- Node.js (建议 v18+)
- npm

### 2. 安装依赖

```bash
npm install
```

> 注意：如果遇到依赖冲突，可以尝试 `npm install --legacy-peer-deps`。
> 首次安装可能需要编译 `hnswlib-node`，请确保系统有基本的构建工具（如 C++ 编译器）。

### 3. 配置环境变量

复制 `.env.example` (如果有) 或直接创建 `.env` 文件，填入您的 API Key：

```env
# .env
DEEPSEEK_API_KEY=your_deepseek_key
GOOGLE_API_KEY=your_google_key
```

### 4. 使用方法

#### 📥 导入文档 (Ingest)

将您的文本文件放入 `docs/` 目录（或其他位置），然后运行：

```bash
npx ts-node src/index.ts ingest docs/sample.txt
```

> **第一次运行提示**：首次运行时，系统会自动从 HuggingFace 下载嵌入模型（约 30-50MB），取决于网络情况可能需要一些时间，请耐心等待。

#### ❓ 提问 (Query)

**使用 DeepSeek (默认)**
```bash
npx ts-node src/index.ts query "这里填入你的问题" --provider deepseek
```

**使用 Gemini**
```bash
npx ts-node src/index.ts query "这里填入你的问题" --provider gemini
```

## 🛠️ 常见问题

**Q: 报错 `Cannot find module ...`**
A: 请检查是否运行了 `npm install`。部分依赖（如 `@huggingface/transformers`）如果安装失败，请尝试手动单独安装：
`npm install @huggingface/transformers apache-arrow hnswlib-node --legacy-peer-deps`

**Q: 导入时报错 `SocketError` 或下载超时**
A: 这是因为首次下载嵌入模型需要访问 HuggingFace。请检查您的网络连接。下载成功后，模型会缓存到本地，以后无需再次下载。

**Q: 为什么生成的回答不准确？**
A: 
1. 检查导入的文档是否包含相关信息。
2. 尝试调整 `src/rag.ts` 中的 Prompt 模板。
3. 确保使用的 LLM 模型（DeepSeek/Gemini）API Key 有效且额度充足。
