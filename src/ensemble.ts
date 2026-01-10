import { BaseRetriever, type BaseRetrieverInput } from '@langchain/core/retrievers';
import type { Document } from '@langchain/core/documents';

export interface EnsembleRetrieverInput extends BaseRetrieverInput {
  retrievers: BaseRetriever[];
  weights?: number[];
  c?: number; // RRF 常数，默认 60
}

/**
 * 自定义 EnsembleRetriever 实现，使用倒数排名融合 (RRF)。
 * 修复了 LangChain 包中缺失导出的问题。
 */
export class EnsembleRetriever extends BaseRetriever {
  lc_namespace = ['local', 'retrievers'];
  retrievers: BaseRetriever[];
  weights: number[];
  c: number;

  constructor(fields: EnsembleRetrieverInput) {
    super(fields);
    this.retrievers = fields.retrievers;
    this.weights =
      fields.weights || new Array(this.retrievers.length).fill(1 / this.retrievers.length);
    this.c = fields.c || 60;
  }

  async _getRelevantDocuments(query: string): Promise<Document[]> {
    // 1. 并行检索
    const results = await Promise.all(this.retrievers.map((retriever) => retriever.invoke(query)));

    // 2. 倒数排名融合 (Reciprocal Rank Fusion)
    const rrfScoreMap = new Map<string, { doc: Document; score: number }>();

    results.forEach((docs: Document[], retrieverIndex: number) => {
      const weight = this.weights[retrieverIndex];
      docs.forEach((doc: Document, rank: number) => {
        const docId = doc.metadata?.source
          ? `${doc.metadata.source}-${doc.pageContent}` // 使用 source+content 作为 ID
          : doc.pageContent; // 仅使用 content 作为 ID

        if (!rrfScoreMap.has(docId)) {
          rrfScoreMap.set(docId, { doc, score: 0 });
        }

        const current = rrfScoreMap.get(docId)!;
        // RRF 公式: score += weight / (c + rank)
        // 注意: 这里的 rank 是从 0 开始的
        current.score += weight / (this.c + rank + 1);
      });
    });

    // 3. 按分数排序
    const finalDocs = Array.from(rrfScoreMap.values())
      .sort((a, b) => b.score - a.score)
      .map((item) => item.doc);

    return finalDocs;
  }
}
