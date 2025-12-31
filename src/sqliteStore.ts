import { VectorStore } from "@langchain/core/vectorstores";
import { Embeddings } from "@langchain/core/embeddings";
import { Document } from "@langchain/core/documents";
import Database from 'better-sqlite3';
import * as sqlite_vss from "sqlite-vss";
import * as path from 'path';
import * as fs from 'fs';
import { getEmbeddings } from './model';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'library.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export class SQLiteVectorStore extends VectorStore {
  private db: Database.Database;

  constructor(embeddings: Embeddings, dbPath: string) {
    super(embeddings, {});
    
    this.db = new Database(dbPath);
    sqlite_vss.load(this.db);
    
    this.initDB();
  }

  _vectorstoreType(): string {
    return "sqlite";
  }

  private initDB() {
    // 创建基础文档表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        rowid INTEGER PRIMARY KEY,
        content TEXT,
        metadata TEXT,
        source TEXT
      );
    `);

    // 创建向量表 (vss0)
    // 假设向量维度是 384 (all-MiniLM-L6-v2)
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vss_documents USING vss0(
        vector(384)
      );
    `);
  }

  async addDocuments(documents: Document[]): Promise<void> {
    const texts = documents.map(({ pageContent }) => pageContent);
    const embeddings = await this.embeddings.embedDocuments(texts);
    
    const insertDoc = this.db.prepare(`
      INSERT INTO documents (content, metadata, source) VALUES (?, ?, ?)
    `);
    const insertVector = this.db.prepare(`
      INSERT INTO vss_documents (rowid, vector) VALUES (?, ?)
    `);

    const transaction = this.db.transaction((docs: Document[], vecs: number[][]) => {
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        const vec = vecs[i];
        const source = doc.metadata?.source || '';
        
        const info = insertDoc.run(doc.pageContent, JSON.stringify(doc.metadata), source);
        const rowid = info.lastInsertRowid;
        
        insertVector.run(rowid, JSON.stringify(vec));
      }
    });

    transaction(documents, embeddings);
  }

  async addVectors(vectors: number[][], documents: Document[]): Promise<void> {
    // Reusing logic in addDocuments for simplicity, or implementation here if specific
    const insertDoc = this.db.prepare(`
      INSERT INTO documents (content, metadata, source) VALUES (?, ?, ?)
    `);
    const insertVector = this.db.prepare(`
      INSERT INTO vss_documents (rowid, vector) VALUES (?, ?)
    `);

    const transaction = this.db.transaction((docs: Document[], vecs: number[][]) => {
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        const vec = vecs[i];
        const source = doc.metadata?.source || '';
        
        const info = insertDoc.run(doc.pageContent, JSON.stringify(doc.metadata), source);
        const rowid = info.lastInsertRowid;
        
        insertVector.run(rowid, JSON.stringify(vec));
      }
    });

    transaction(documents, vectors);
  }

  async similaritySearchVectorWithScore(query: number[], k: number): Promise<[Document, number][]> {
    // sqlite-vss 搜索
    const stmt = this.db.prepare(`
      with matches as (
        select rowid, distance
        from vss_documents
        where vss_search(vector, ?)
        limit ?
      )
      select d.content, d.metadata, m.distance
      from matches m
      left join documents d on m.rowid = d.rowid
    `);

    const results = stmt.all(JSON.stringify(query), k) as any[];

    return results.map(row => {
      const metadata = JSON.parse(row.metadata);
      const doc = new Document({
        pageContent: row.content,
        metadata: metadata
      });
      // 距离越小越相似，LangChain通常期望相似度分数
      // 这里直接返回距离作为 score，调用者需要知晓
      return [doc, row.distance];
    });
  }

  async deleteDocumentsBySource(sourcePath: string): Promise<void> {
    const findIds = this.db.prepare(`SELECT rowid FROM documents WHERE source = ?`);
    const rows = findIds.all(sourcePath) as { rowid: number }[];
    
    if (rows.length === 0) return;

    const deleteDoc = this.db.prepare(`DELETE FROM documents WHERE rowid = ?`);
    const deleteVec = this.db.prepare(`DELETE FROM vss_documents WHERE rowid = ?`);

    const transaction = this.db.transaction((ids: number[]) => {
      for (const id of ids) {
        deleteDoc.run(id);
        deleteVec.run(id);
      }
    });

    transaction(rows.map(r => r.rowid));
    console.log(`已删除文件 ${sourcePath} 相关的 ${rows.length} 条向量。`);
  }

  async getSources(): Promise<string[]> {
    const stmt = this.db.prepare(`SELECT DISTINCT source FROM documents`);
    const rows = stmt.all() as { source: string }[];
    return rows.map(r => r.source).filter(s => !!s);
  }

  static async load(path: string, embeddings: Embeddings): Promise<SQLiteVectorStore> {
    return new SQLiteVectorStore(embeddings, path);
  }
}

let storeInstance: SQLiteVectorStore | null = null;

export const getVectorStore = async (): Promise<SQLiteVectorStore> => {
    if (storeInstance) return storeInstance;
    const embeddings = await getEmbeddings();
    storeInstance = await SQLiteVectorStore.load(DB_PATH, embeddings);
    return storeInstance;
}

export const ingestDocs = async (docs: Document[]) => {
  console.log(`正在导入 ${docs.length} 个文档...`);
  const store = await getVectorStore();
  await store.addDocuments(docs);
  console.log('导入完成。');
};

export const getRetriever = async () => {
  const store = await getVectorStore();
  return store.asRetriever({ k: 4 });
};
