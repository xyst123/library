import { VectorStore } from '@langchain/core/vectorstores';
import type { Embeddings } from '@langchain/core/embeddings';
import { Document } from '@langchain/core/documents';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import { getEmbeddings } from './model';
import { STORAGE_CONFIG } from './config';

// 使用集中配置
const DATA_DIR = STORAGE_CONFIG.dataDir;
const DB_PATH = STORAGE_CONFIG.dbPath;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export class SQLiteVectorStore extends VectorStore {
  private db: Database.Database;
  private vectorDimension: number = 384; // 默认值，会在初始化时动态检测

  constructor(embeddings: Embeddings, dbPath: string) {
    super(embeddings, {});

    this.db = new Database(dbPath);
    console.log('[SQLite] 数据库已打开。');
  }

  async initialize() {
    // 使用 new Function 绕过 TS 编译，确保在 CommonJS 环境中也能发送真正的 ESM import
    // 否则 ts-node/tsc 可能会将其编译为 require()，导致 ERR_REQUIRE_ESM 错误
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    const sqlite_vss = await dynamicImport('sqlite-vss');

    sqlite_vss.load(this.db);
    console.log('[SQLite] sqlite-vss 已加载。');

    // 动态检测向量维度
    await this.detectVectorDimension();

    this.initDB();
  }

  /**
   * 动态检测嵌入模型的向量维度
   */
  private async detectVectorDimension() {
    try {
      const testEmbedding = await this.embeddings.embedQuery('测试');
      this.vectorDimension = testEmbedding.length;
      console.log(`[SQLite] 检测到向量维度: ${this.vectorDimension}`);
    } catch (e) {
      console.warn('[SQLite] 无法检测向量维度，使用默认值 384');
    }
  }

  _vectorstoreType(): string {
    return 'sqlite';
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
    // 使用动态检测的向量维度
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vss_documents USING vss0(
        vector(${this.vectorDimension})
      );
    `);

    // 创建对话历史表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);

    // 创建 FTS5 全文索引表（用于 BM25 检索）
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
        content,
        metadata UNINDEXED,
        source UNINDEXED,
        content='documents',
        content_rowid='rowid'
      );
    `);

    // 创建触发器，自动同步 documents 表到 FTS5
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
        INSERT INTO documents_fts(rowid, content, metadata, source)
        VALUES (new.rowid, new.content, new.metadata, new.source);
      END;
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
        DELETE FROM documents_fts WHERE rowid = old.rowid;
      END;
    `);

    // 创建索引优化查询性能
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source);
    `);
    console.log('[SQLite] 数据库索引和 FTS5 全文索引已创建');
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
    // 为了简单起见复用 addDocuments 的逻辑，或者在此处实现特定逻辑
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = stmt.all(JSON.stringify(query), k) as any[];

    return results.map((row) => {
      const metadata = JSON.parse(row.metadata);
      const doc = new Document({
        pageContent: row.content,
        metadata: metadata,
      });
      // 距离越小越相似，LangChain通常期望相似度分数
      // 这里直接返回距离作为 score，调用者需要知晓
      return [doc, row.distance];
    });
  }

  /**
   * BM25 关键词检索（使用 FTS5）
   * @param query 查询关键词
   * @param k 返回结果数量
   * @returns 文档和 BM25 分数的数组（分数越高越相关）
   */
  async bm25Search(query: string, k: number): Promise<[Document, number][]> {
    // FTS5 的 BM25 排序（rank 是负数，越接近 0 表示越相关）
    const stmt = this.db.prepare(`
      SELECT
        d.content,
        d.metadata,
        documents_fts.rank as score
      FROM documents_fts
      JOIN documents d ON documents_fts.rowid = d.rowid
      WHERE documents_fts MATCH ?
      ORDER BY documents_fts.rank
      LIMIT ?
    `);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = stmt.all(query, k) as any[];

    return results.map((row) => {
      const metadata = JSON.parse(row.metadata);
      const doc = new Document({
        pageContent: row.content,
        metadata: metadata,
      });
      // 将 FTS5 的负分转为正分（绝对值越小表示越相关）
      return [doc, Math.abs(row.score)];
    });
  }

  async deleteDocumentsBySource(sourcePath: string): Promise<void> {
    const findIds = this.db.prepare('SELECT rowid FROM documents WHERE source = ?');
    const rows = findIds.all(sourcePath) as { rowid: number }[];

    if (rows.length === 0) return;

    const deleteDoc = this.db.prepare('DELETE FROM documents WHERE rowid = ?');
    const deleteVec = this.db.prepare('DELETE FROM vss_documents WHERE rowid = ?');

    const transaction = this.db.transaction((ids: number[]) => {
      for (const id of ids) {
        deleteDoc.run(id);
        deleteVec.run(id);
      }
    });

    transaction(rows.map((r) => r.rowid));
    console.log(`已删除文件 ${sourcePath} 相关的 ${rows.length} 条向量。`);
  }

  async getSources(): Promise<string[]> {
    const stmt = this.db.prepare('SELECT DISTINCT source FROM documents');
    const rows = stmt.all() as { source: string }[];
    return rows.map((r) => r.source).filter((s) => !!s);
  }

  async getDocumentCount(): Promise<number> {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM documents');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  static async load(dbPath: string, embeddings: Embeddings): Promise<SQLiteVectorStore> {
    const store = new SQLiteVectorStore(embeddings, dbPath);
    await store.initialize();
    return store;
  }

  // 聊天历史相关方法
  async addHistory(role: 'user' | 'assistant', content: string) {
    const stmt = this.db.prepare(
      'INSERT INTO chat_history (role, content, timestamp) VALUES (?, ?, ?)'
    );
    stmt.run(role, content, Math.floor(Date.now() / 1000));
  }

  async getHistory() {
    const stmt = this.db.prepare('SELECT role, content FROM chat_history ORDER BY id ASC');
    return stmt.all() as { role: 'user' | 'assistant'; content: string }[];
  }

  async clearHistory() {
    this.db.exec('DELETE FROM chat_history');
  }
}

let storeInstance: SQLiteVectorStore | null = null;

export const getVectorStore = async (): Promise<SQLiteVectorStore> => {
  if (storeInstance) return storeInstance;
  console.log('[SQLite] 正在初始化向量存储...');
  const embeddings = await getEmbeddings();
  console.log('[SQLite] Embeddings 就绪，正在加载数据库...');
  storeInstance = await SQLiteVectorStore.load(DB_PATH, embeddings);
  console.log('[SQLite] 向量存储已加载。');
  return storeInstance;
};

export const ingestDocs = async (docs: Document[]) => {
  console.log(`正在导入 ${docs.length} 个文档...`);
  const store = await getVectorStore();
  await store.addDocuments(docs);
  console.log('导入完成。');
};

export const addHistory = async (role: 'user' | 'assistant', content: string) => {
  const store = await getVectorStore();
  await store.addHistory(role, content);
};

export const getHistory = async () => {
  const store = await getVectorStore();
  return store.getHistory();
};

export const clearHistory = async () => {
  const store = await getVectorStore();
  await store.clearHistory();
};

export const getRetriever = async () => {
  const store = await getVectorStore();
  return store.asRetriever({ k: 4 });
};
