/* eslint-disable @typescript-eslint/no-var-requires */
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import * as fs from 'fs';

import * as path from 'path';
import * as cheerio from 'cheerio';
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

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

  console.log(`正在分割内容...`);
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 100,
    separators: ['\n\n', '\n', '。', '！', '？', '；', '，', ' ', ''], // 针对中文优化
  });

  const splitDocs = await splitter.splitDocuments(docs);
  console.log(`分割为 ${splitDocs.length} 个块。`);
  return splitDocs;
};
