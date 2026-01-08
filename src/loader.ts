/* eslint-disable @typescript-eslint/no-var-requires */
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers';
import * as fs from 'fs';

import * as path from 'path';
import * as cheerio from 'cheerio';
import { CHUNKING_CONFIG, ChunkingStrategy, EMBEDDING_CONFIG } from './config';

const pdf = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * 语义分割器（使用本地 Embedding 模型）
 */
class SemanticChunker {
  private embeddings: HuggingFaceTransformersEmbeddings;
  private threshold: number;

  constructor() {
    this.embeddings = new HuggingFaceTransformersEmbeddings({
      model: EMBEDDING_CONFIG.model,
    });
    this.threshold = CHUNKING_CONFIG.semantic.breakpointThresholdAmount / 100;
  }

  /**
   * 计算两个向量的余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * 语义分割文档
   */
  async splitDocuments(docs: Document[]): Promise<Document[]> {
    const result: Document[] = [];

    for (const doc of docs) {
      // 按句子分割
      const sentences = doc.pageContent
        .split(/([。！？\n]+)/)
        .filter((s) => s.trim().length > 0)
        .map((s, i, arr) => {
          // 合并句子和标点
          if (i % 2 === 0 && arr[i + 1]) {
            return s + arr[i + 1];
          }
          return s;
        })
        .filter((_, i) => i % 2 === 0);

      if (sentences.length === 0) continue;

      console.log(`[语义分割] 将文档分割为 ${sentences.length} 个句子`);

      // 计算每个句子的 embedding
      const embeddings = await Promise.all(
        sentences.map((s) => this.embeddings.embedQuery(s))
      );

      // 计算相邻句子的相似度
      const similarities: number[] = [];
      for (let i = 0; i < embeddings.length - 1; i++) {
        similarities.push(this.cosineSimilarity(embeddings[i], embeddings[i + 1]));
      }

      // 找到相似度低于阈值的位置作为分割点
      const chunks: string[] = [];
      let currentChunk = sentences[0];

      for (let i = 0; i < similarities.length; i++) {
        if (similarities[i] < this.threshold) {
          // 相似度低，开始新块
          chunks.push(currentChunk.trim());
          currentChunk = sentences[i + 1];
        } else {
          // 相似度高，合并到当前块
          currentChunk += ' ' + sentences[i + 1];
        }
      }
      chunks.push(currentChunk.trim());

      console.log(`[语义分割] 最终分割为 ${chunks.length} 个语义块`);

      // 创建 Document 对象
      for (const chunk of chunks) {
        result.push(
          new Document({
            pageContent: chunk,
            metadata: { ...doc.metadata },
          })
        );
      }
    }

    return result;
  }
}

export const loadAndSplit = async (filePath: string): Promise<Document[]> => {
  console.log(`正在加载文件: ${filePath}`);

  let text = '';
  const ext = path.extname(filePath).toLowerCase();

  try {
    if (ext === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);
      text = data.text;
    } else if (ext === '.docx') {
      const dataBuffer = fs.readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer: dataBuffer });
      text = result.value;
    } else if (ext === '.html') {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const $ = cheerio.load(fileContent);
      text = $('body').text().replace(/\s+/g, ' ').trim();
    } else {
      // 默认为文本文件 (.txt, .md, etc.)
      text = fs.readFileSync(filePath, 'utf-8');
    }
  } catch (error) {
    console.error(`解析文件失败 ${filePath}:`, error);
    throw error;
  }

  const docs = [new Document({ pageContent: text, metadata: { source: filePath } })];

  // 根据配置选择分割策略
  const strategy = CHUNKING_CONFIG.strategy;
  console.log(`正在使用 ${strategy} 策略分割内容...`);

  let splitDocs: Document[];

  if (strategy === ChunkingStrategy.SEMANTIC) {
    // 语义分割
    const semanticChunker = new SemanticChunker();
    splitDocs = await semanticChunker.splitDocuments(docs);
  } else {
    // 字符递归分割（默认）
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHUNKING_CONFIG.character.chunkSize,
      chunkOverlap: CHUNKING_CONFIG.character.chunkOverlap,
      separators: CHUNKING_CONFIG.character.separators,
    });
    splitDocs = await splitter.splitDocuments(docs);
  }

  console.log(`分割为 ${splitDocs.length} 个块。`);

  // 上下文增强：根据配置决定是否为每个块添加文档信息
  const filename = path.basename(filePath);
  const finalDocs = splitDocs.map((doc, index) => {
    const baseMetadata = {
      ...doc.metadata,
      filename,
      chunkIndex: index,
      totalChunks: splitDocs.length,
    };

    // 检查是否启用上下文增强
    if (CHUNKING_CONFIG.enableContextEnhancement) {
      const contextPrefix = `[文档：${filename} - 第 ${index + 1}/${splitDocs.length} 块]`;
      return new Document({
        pageContent: `${contextPrefix}\n\n${doc.pageContent}`,
        metadata: baseMetadata,
      });
    } else {
      return new Document({
        pageContent: doc.pageContent,
        metadata: baseMetadata,
      });
    }
  });

  if (CHUNKING_CONFIG.enableContextEnhancement) {
    console.log(`✓ 已完成上下文增强`);
  }
  return finalDocs;
};
