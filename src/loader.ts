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
      // @ts-expect-error quantized option is not in type definition but supported
      modelOptions: { quantized: true },
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
   * 计算平均值
   */
  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * 计算标准差
   */
  private calculateStdDev(values: number[], mean: number): number {
    if (values.length < 2) return 0;
    const squareDiffs = values.map((value) => {
      const diff = value - mean;
      return diff * diff;
    });
    return Math.sqrt(this.calculateMean(squareDiffs));
  }

  /**
   * 语义分割文档
   */
  async splitDocuments(docs: Document[]): Promise<Document[]> {
    const result: Document[] = [];
    const { breakpointThresholdAmount } = CHUNKING_CONFIG.semantic;

    // 将 95 这种配置值映射为标准差倍数 (Sigma)
    // 经验值：95 -> 1.5 sigma, 90 -> 1.25 sigma, 80 -> 1.0 sigma
    // 这里简单做一个转换，让用户可以继续用 0-100 的直觉配置
    const sigma = Math.max(0.5, (breakpointThresholdAmount - 50) / 25);

    for (const doc of docs) {
      // 1. 按句子预分割
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

      console.log(`[语义分割] 将文档预分割为 ${sentences.length} 个句子`);

      // 2. 计算每个句子的 embedding
      const embeddings = await Promise.all(sentences.map((s) => this.embeddings.embedQuery(s)));

      // 3. 计算相邻句子的相似度
      const similarities: number[] = [];
      for (let i = 0; i < embeddings.length - 1; i++) {
        similarities.push(this.cosineSimilarity(embeddings[i], embeddings[i + 1]));
      }

      // 4. 计算动态阈值 (基于标准差 Standard Deviation)
      // 这是解决"相似度都很高"问题的最佳方案，通过检测"相对低谷"来分割
      const mean = this.calculateMean(similarities);
      const stdDev = this.calculateStdDev(similarities, mean);

      // 阈值 = 平均值 - (sigma * 标准差)
      // 意义：只有当相似度显著低于平均水平时，才认为是不相关的
      const dynamicThreshold = mean - sigma * stdDev;

      console.log(
        `[语义分割] 统计信息: Mean=${mean.toFixed(4)}, StdDev=${stdDev.toFixed(4)}, Sigma=${sigma.toFixed(2)}`
      );
      console.log(`[语义分割] 动态阈值: ${dynamicThreshold.toFixed(4)}`);

      // 5. 根据阈值进行分割
      const chunks: string[] = [];
      let currentChunk = sentences[0];

      for (let i = 0; i < similarities.length; i++) {
        if (similarities[i] < dynamicThreshold) {
          chunks.push(currentChunk.trim());
          currentChunk = sentences[i + 1];
        } else {
          currentChunk += ' ' + sentences[i + 1];
        }
      }
      chunks.push(currentChunk.trim());

      console.log(`[语义分割] 最终分割为 ${chunks.length} 个语义块`);

      // 6. 创建 Document 对象
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
  } else if (strategy === ChunkingStrategy.LLM_ENHANCED) {
    console.log('[Loader] 进入 LLM_ENHANCED 分支');
    try {
      console.log('[Loader] 正在导入模块...');
      const { getLLM } = await import('./model');
      const { processFileWithLLM } = await import('./loader-llm');
      const { LLMProvider } = await import('./config');

      console.log('[Loader] 正在初始化 LLM...');
      const llm = getLLM(LLMProvider.DEEPSEEK);

      const fileContent = docs[0].pageContent;
      const filename = path.basename(filePath);

      console.log(
        `[Loader] 开始调用 processFileWithLLM, 文件: ${filename}, 长度: ${fileContent.length}`
      );
      const processedItems = await processFileWithLLM(fileContent, llm, filename);
      console.log(`[Loader] processFileWithLLM 完成, 获取到 ${processedItems.length} 个条目`);

      splitDocs = [];
      for (const item of processedItems) {
        // 策略：
        // 我们希望根据“问题”来检索，但检索回来后显示的是“答案”。
        // 我们在 utils.ts 中修改了 formatDocumentsAsString，优先使用 metadata.answer

        // 1. 主问题文档
        splitDocs.push(
          new Document({
            pageContent: item.primary_question,
            metadata: {
              ...docs[0].metadata, // 保留原有的 source 等元数据
              answer: item.original_text,
              type: 'qa_primary',
              qa_id: item.id,
            },
          })
        );

        // 2. 增强问题文档
        for (const q of item.augmented_questions) {
          splitDocs.push(
            new Document({
              pageContent: q,
              metadata: {
                ...docs[0].metadata,
                answer: item.original_text,
                type: 'qa_augmented',
                qa_id: item.id,
                ref_question: item.primary_question,
              },
            })
          );
        }

        // 3. 原始文本（可选，如果也想通过答案内容检索到）
        // splitDocs.push(new Document({
        //   pageContent: item.original_text,
        //   metadata: { ...docs[0].metadata, answer: item.original_text, type: 'original' }
        // }));
      }

      console.log(`[LLM Ingest] 生成了 ${splitDocs.length} 个检索向量文档`);
    } catch (error: unknown) {
      console.error('[Loader] LLM 处理过程中发生错误:', error);
      throw error;
    }
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
