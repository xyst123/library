import { pipeline } from '@huggingface/transformers';
import { Document } from '@langchain/core/documents';

// 单例保存模型
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rerankerModel: any = null;

const MODEL_ID = 'Xenova/bge-reranker-base';

export const getReranker = async () => {
  if (rerankerModel) return rerankerModel;

  console.log(`正在加载 Reranker 模型: ${MODEL_ID} ...`);
  try {
    // 使用 text-classification pipeline 进行重排 (Cross-Encoder)
    rerankerModel = await pipeline('text-classification', MODEL_ID);
    console.log('Reranker 模型加载完成');
    return rerankerModel;
  } catch (error) {
    console.error('加载 Reranker 模型失败:', error);
    return null;
  }
};

export const rerankDocs = async (
  query: string,
  documents: Array<[Document, number]> // [文档, 向量分数]
): Promise<Array<{ doc: Document; score: number }>> => {
  try {
    const classifier = await getReranker();
    if (!classifier) {
      // 降级: 仅返回向量检索结果
      return documents.map(([doc, score]) => ({ doc, score }));
    }

    // 构造输入: { text: query, text_pair: docContent }
    const inputs = documents.map(([doc]) => ({
      text: query,
      text_pair: doc.pageContent,
    }));

    // 批量预测
    // Reranker 模型的 text-classification 输出通常是分数或标签列表
    // bge-reranker 的输出通常是一个分数（Raw Logit 或 Label 1 的概率）
    // Transformers.js pipeline 通常返回 { label: string, score: number } 数组
    // 对于 BGE reranker，可能返回 'LABEL_1' (相关) 的分数
    // 这里我们假设它返回一个可用作相似度的分数。如果返回多个标签，我们取正向标签的分数。

    const results = await classifier(inputs);

    // results 可能是 { label, score } 数组，或者是分数嵌套数组
    // 处理通用情况

    const ranked = documents.map((docItem, index) => {
      const res = results[index];
      let score = 0;

      // 如果只有以 score，直接使用
      if (typeof res === 'number') {
        score = res;
      }
      // 如果是对象 { label, score }
      else if (res && typeof res.score === 'number') {
        // bge-reranker 通常返回正向类别的分数。
        score = res.score;
      }
      // 如果是数组 (logits)
      else if (Array.isArray(res)) {
        score = res[0];
      }

      return { doc: docItem[0], score: Number(score) };
    });

    // 按分数降序
    ranked.sort((a, b) => b.score - a.score);

    return ranked;
  } catch (error) {
    console.error('重排错误:', error);
    return documents.map(([doc, score]) => ({ doc, score }));
  }
};
