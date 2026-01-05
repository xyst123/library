import dotenv from 'dotenv';
import path from 'node:path';

// 确保从项目根目录加载 .env 文件
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ============ LLM 配置 ============

/** LLM 提供商枚举 */
export enum LLMProvider {
  DEEPSEEK = 'deepseek',
  GEMINI = 'gemini',
}

/** LLM 相关配置 */
export const LLM_CONFIG = {
  /** DeepSeek API 配置 */
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    temperature: 0.7,
  },
  /** Google Gemini API 配置 */
  gemini: {
    apiKey: process.env.GOOGLE_API_KEY || '',
    model: 'gemini-pro',
    maxOutputTokens: 2048,
  },
};

// ============ Embedding 配置 ============

/** Embedding 模型配置 */
export const EMBEDDING_CONFIG = {
  /** HuggingFace 模型名称 */
  model: 'Xenova/all-MiniLM-L6-v2',
  /** HuggingFace 镜像地址 (国内) */
  remoteHost: 'https://hf-mirror.com',
  /** 是否允许本地模型 */
  allowLocalModels: false,
};

// ============ 存储配置 ============

/** 数据存储配置 */
export const STORAGE_CONFIG = {
  /** 数据目录 */
  dataDir: path.join(process.cwd(), 'data'),
  /** 数据库文件名 */
  dbFileName: 'library.db',
  /** 数据库完整路径 */
  get dbPath() {
    return path.join(this.dataDir, this.dbFileName);
  },
};

// ============ RAG 配置 ============

/** RAG 检索配置 */
export const RAG_CONFIG = {
  /** 检索返回的文档数量 */
  retrievalK: 4,
  /** 对话历史保留条数 */
  historyLimit: 6,
  /** 相似度阈值 (距离，越小越相似，暂未启用) */
  similarityThreshold: 0.5,
};

// ============ 工具函数 ============

/**
 * 获取必需的环境变量
 * @param key - 环境变量名
 * @throws 如果环境变量不存在
 */
export const getEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`缺少环境变量: ${key}`);
  }
  return value;
};

/**
 * 获取可选的环境变量
 * @param key - 环境变量名
 * @param defaultValue - 默认值
 */
export const getEnvOptional = (key: string, defaultValue: string = ''): string => {
  return process.env[key] || defaultValue;
};

// ============ 兼容旧 API ============

/** @deprecated 使用 LLM_CONFIG 代替 */
export const CONFIG = {
  deepseekApiKey: LLM_CONFIG.deepseek.apiKey,
  googleApiKey: LLM_CONFIG.gemini.apiKey,
};
