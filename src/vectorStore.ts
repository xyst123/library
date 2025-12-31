import { VectorStore } from "@langchain/core/vectorstores";
import { Embeddings } from "@langchain/core/embeddings";
import { Document } from "@langchain/core/documents";
import * as fs from 'fs';
import * as path from 'path';
import { getEmbeddings } from './model';

// 实现余弦相似度函数
// 用于计算两个向量之间的相似程度

const cosineSimilarity = (a: number[], b: number[]): number => {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'vectors.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface StoredVector {
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
  id?: string;
}

export class JSONVectorStore extends VectorStore {
  memoryVectors: StoredVector[] = [];

  constructor(embeddings: Embeddings) {
    super(embeddings, {});
  }

  _vectorstoreType(): string {
    return "json";
  }

  async addDocuments(documents: Document[]): Promise<void> {
    const texts = documents.map(({ pageContent }) => pageContent);
    const embeddings = await this.embeddings.embedDocuments(texts);
    return this.addVectors(embeddings, documents);
  }

  async addVectors(vectors: number[][], documents: Document[]): Promise<void> {
    const rows = vectors.map((embedding, idx) => ({
      content: documents[idx].pageContent,
      embedding,
      metadata: documents[idx].metadata,
    }));
    this.memoryVectors.push(...rows);
  }

  async similaritySearchVectorWithScore(query: number[], k: number): Promise<[Document, number][]> {
    const searches = this.memoryVectors.map((vector) => ({
      similarity: cosineSimilarity(query, vector.embedding),
      document: new Document({ pageContent: vector.content, metadata: vector.metadata }),
    }));

    searches.sort((a, b) => b.similarity - a.similarity);
    return searches.slice(0, k).map((item) => [item.document, item.similarity]);
  }

  // Support Persistence
  static async load(path: string, embeddings: Embeddings): Promise<JSONVectorStore> {
    const store = new JSONVectorStore(embeddings);
    if (fs.existsSync(path)) {
      try {
        const raw = fs.readFileSync(path, 'utf-8');
        const data = JSON.parse(raw);
        store.memoryVectors = data;
      } catch (e) {
        console.error("加载向量库失败，将创建一个新的库:", e);
      }
    }
    return store;
  }

  async save(path: string): Promise<void> {
    fs.writeFileSync(path, JSON.stringify(this.memoryVectors, null, 2));
  }

  async deleteDocumentsBySource(sourcePath: string): Promise<void> {
    const initialCount = this.memoryVectors.length;
    this.memoryVectors = this.memoryVectors.filter(v => v.metadata?.source !== sourcePath);
    console.log(`已删除文件 ${sourcePath} 相关的 ${initialCount - this.memoryVectors.length} 条向量。`);
  }
}

let storeInstance: JSONVectorStore | null = null;

export const getVectorStore = async (): Promise<JSONVectorStore> => {
    if (storeInstance) return storeInstance;
    const embeddings = await getEmbeddings();
    storeInstance = await JSONVectorStore.load(DB_PATH, embeddings);
    return storeInstance;
}

export const ingestDocs = async (docs: Document[]) => {
  console.log(`正在导入 ${docs.length} 个文档...`);
  const store = await getVectorStore();
  await store.addDocuments(docs);
  await store.save(DB_PATH);
  console.log('导入完成并保存。');
};

export const getRetriever = async () => {
  const store = await getVectorStore();
  return store.asRetriever({ k: 4 });
};
