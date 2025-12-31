import { Document } from '@langchain/core/documents';
import fs from 'fs';

class SimpleTextSplitter {
  constructor(private config: { chunkSize: number, chunkOverlap: number }) {}
  
  async splitDocuments(docs: Document[]): Promise<Document[]> {
    const result: Document[] = [];
    for (const doc of docs) {
      const chunks = this.splitText(doc.pageContent);
      chunks.forEach(chunk => {
        result.push(new Document({ pageContent: chunk, metadata: doc.metadata }));
      });
    }
    return result;
  }

  private splitText(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      let end = start + this.config.chunkSize;
      if (end > text.length) {
        end = text.length;
      }
      chunks.push(text.slice(start, end));
      
      if (end === text.length) break;
      start = end - this.config.chunkOverlap;
    }
    return chunks;
  }
}

export const loadAndSplit = async (filePath: string): Promise<Document[]> => {
  console.log(`正在加载文件: ${filePath}`);
  const text = fs.readFileSync(filePath, 'utf-8');
  const docs = [new Document({ pageContent: text, metadata: { source: filePath } })];

  console.log(`正在分割内容...`);
  const splitter = new SimpleTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const splitDocs = await splitter.splitDocuments(docs);
  console.log(`分割为 ${splitDocs.length} 个块。`);
  return splitDocs;
};
