import { BaseRetriever, type BaseRetrieverInput } from '@langchain/core/retrievers';
import type { Document } from '@langchain/core/documents';

export interface EnsembleRetrieverInput extends BaseRetrieverInput {
  retrievers: BaseRetriever[];
  weights?: number[];
  c?: number; // RRF constant, default 60
}

/**
 * Custom implementation of EnsembleRetriever using Reciprocal Rank Fusion (RRF).
 * Fixes missing export issues in LangChain package.
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
    // 1. Parallel retrieval
    const results = await Promise.all(this.retrievers.map((retriever) => retriever.invoke(query)));

    // 2. Reciprocal Rank Fusion
    const rrfScoreMap = new Map<string, { doc: Document; score: number }>();

    results.forEach((docs: Document[], retrieverIndex: number) => {
      const weight = this.weights[retrieverIndex];
      docs.forEach((doc: Document, rank: number) => {
        const docId = doc.metadata?.source
          ? `${doc.metadata.source}-${doc.pageContent}` // Use source+content as ID
          : doc.pageContent; // Fallback to content

        if (!rrfScoreMap.has(docId)) {
          rrfScoreMap.set(docId, { doc, score: 0 });
        }

        const current = rrfScoreMap.get(docId)!;
        // RRF formula: score += weight / (c + rank)
        // Note: rank is 0-indexed here
        current.score += weight / (this.c + rank + 1);
      });
    });

    // 3. Sort by score
    const finalDocs = Array.from(rrfScoreMap.values())
      .sort((a, b) => b.score - a.score)
      .map((item) => item.doc);

    return finalDocs;
  }
}
