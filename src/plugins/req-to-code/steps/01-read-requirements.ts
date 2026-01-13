import fs from 'fs/promises';
import path from 'path';

export async function readRequirements(filePath: string): Promise<string> {
  try {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);
    console.log(`[ReqToCode] 正在读取需求文件: ${absolutePath}`);
    const content = await fs.readFile(absolutePath, 'utf-8');
    return content;
  } catch (error) {
    throw new Error(`读取需求文件失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}
