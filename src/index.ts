import { loadAndSplit } from './loader';
import { ingestDocs } from './sqliteStore';
import { askQuestionStream } from './rag';
import { LLMProvider } from './config';

import path from 'path';

const main = async () => {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.error('请提供命令: ingest (导入) 或 query (查询)');
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

      const { stream, sources } = await askQuestionStream(question, [], provider);
      console.log('\n--- 回答 ---\n');
      
      let fullAnswer = '';
      for await (const chunk of stream) {
        process.stdout.write(chunk);
        fullAnswer += chunk;
      }
      
      if (sources && sources.length > 0) {
        console.log('\n\n--- 参考来源 ---\n');
        sources.forEach((s: { source: string; score?: number }) => {
          console.log(`- ${s.source.split('/').pop()} (相似度: ${(1 - (s.score || 0)).toFixed(2)})`);
        });
      }
      
      console.log('\n--------------\n');
    } else {
      console.error('未知命令。请使用 "ingest" 或 "query".');
    }
  } catch (error) {
    console.error('发生错误:', error);
  }
};

main();
