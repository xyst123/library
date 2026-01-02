import { loadAndSplit } from './loader';
import { ingestDocs } from './sqliteStore';
import { askQuestion } from './rag';
import { LLMProvider } from './config';
import { Watcher } from './watcher';
import path from 'path';

const main = async () => {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.error('请提供命令: ingest (导入), query (查询) 或 watch (监听)');
    process.exit(1);
  }

  try {
    if (command === 'ingest') {
      const filePath = args[1];
      if (!filePath) {
        console.error('请提供要导入的文件路径');
        process.exit(1);
      }
      const absolutePath = path.resolve(filePath);
      const docs = await loadAndSplit(absolutePath);
      await ingestDocs(docs);
    } else if (command === 'watch') {
      const dirPath = args[1];
      if (!dirPath) {
        console.error('请提供要监听的文件夹路径');
        process.exit(1);
      }
      const watcher = new Watcher(dirPath);
      await watcher.start();
      // 保持进程运行
    } else if (command === 'query') {
      const question = args[1];
      if (!question) {
        console.error('请提供问题');
        process.exit(1);
      }

      // 解析 provider 参数 --provider deepseek|gemini
      let provider = LLMProvider.DEEPSEEK; // 默认
      const providerIndex = args.indexOf('--provider');
      if (providerIndex !== -1 && args[providerIndex + 1]) {
        const p = args[providerIndex + 1].toLowerCase();
        if (Object.values(LLMProvider).includes(p as LLMProvider)) {
          provider = p as LLMProvider;
        } else {
          console.warn(`未知提供商 '${p}', 使用默认值: ${provider}`);
        }
      }

      const answer = await askQuestion(question, [], provider);
      console.log('\n--- 回答 ---\n');
      console.log(answer);
      console.log('\n--------------\n');
    } else {
      console.error('未知命令。请使用 "ingest", "query" 或 "watch".');
    }
  } catch (error) {
    console.error('发生错误:', error);
  }
};

main();
