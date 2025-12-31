import dotenv from 'dotenv';
import path from 'path';

// 确保从项目根目录加载 .env 文件
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export enum LLMProvider {
  DEEPSEEK = 'deepseek',
  GEMINI = 'gemini',
}

export const getEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`缺少环境变量: ${key}`);
  }
  return value;
};

export const CONFIG = {
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  googleApiKey: process.env.GOOGLE_API_KEY, 
};
