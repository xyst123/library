/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');

// 注册 ts-node 以直接运行 TypeScript 文件
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
  },
});

// 加载模型子进程逻辑（Reranker + Embedding）
require(path.join(__dirname, 'model-child.ts'));
