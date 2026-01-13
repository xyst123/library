import { runReqToCodeFlow } from '../src/plugins/req-to-code/index';
import { initSettings } from '../src/settings';
import path from 'path';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('用法: npx tsx scripts/run-req-flow.ts <需求文件路径>');
    process.exit(1);
  }

  const filePath = args[0];

  console.log('=== 运行 Requirements-to-Code 工作流 ===');
  initSettings();

  try {
    const result = await runReqToCodeFlow(filePath);

    console.log('\n=============================================');
    if (result.success) {
      console.log('✅ 工作流执行成功！');
      console.log('--- 生成的代码 (Generated Code) ---');
      console.log(result.generatedCode);
      console.log('--- 代码审查 (Code Review) ---');
      console.log(result.codeReview);
    } else {
      console.log('❌ 工作流已停止。');
      console.log('原因: 需求未通过评审。');
    }
    console.log('=============================================');
  } catch (error) {
    console.error('❌ 工作流执行出错:', error);
  }
}

main();
