import { readRequirements } from './steps/01-read-requirements';
import { reviewRequirements } from './steps/02-review-requirements';
import { generateCode } from './steps/03-generate-code';
import { reviewCode } from './steps/04-review-code';

export interface ReqToCodeResult {
  requirements: string;
  reviewResult: { approved: boolean; feedback: string };
  generatedCode?: string;
  codeReview?: string;
  success: boolean;
}

export async function runReqToCodeFlow(filePath: string): Promise<ReqToCodeResult> {
  console.log('🚀 [ReqToCode] 开始工作流...');

  // 1. Read
  const requirements = await readRequirements(filePath);

  // 2. Review
  const reviewResult = await reviewRequirements(requirements);
  console.log('[ReqToCode] 评审结果:', reviewResult.approved ? '✅ APPROVED' : '⚠️ 需要修改');

  if (!reviewResult.approved) {
    console.warn('[ReqToCode] 工作流因需求问题已停止。');
    console.warn('反馈意见:', reviewResult.feedback);
    return {
      requirements,
      reviewResult,
      success: false,
    };
  }

  // 3. Generate
  const generatedCode = await generateCode(requirements);

  // 4. Code Review
  const codeReview = await reviewCode(generatedCode);

  return {
    requirements,
    reviewResult,
    generatedCode,
    codeReview,
    success: true,
  };
}
