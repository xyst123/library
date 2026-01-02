/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');

// Register ts-node to run TypeScript files directly
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
  },
});

// Load the actual worker logic
require(path.join(__dirname, '../src/worker.ts'));
