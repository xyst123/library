import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { STORAGE_CONFIG } from '../config';

/**
 * 确保路径在安全目录下
 */
const getSafePath = (relativePath: string): string => {
  // 规范化路径以解析 '..' 和 '.' 片段
  const safePath = path.resolve(STORAGE_CONFIG.dataDir, relativePath);

  // 确保解析后的路径以数据目录开头
  if (!safePath.startsWith(path.resolve(STORAGE_CONFIG.dataDir))) {
    throw new Error('访问被拒绝：路径超出了数据目录范围。');
  }
  return safePath;
};

// 工具1: 列出文件
export const listFilesTool = tool(
  async () => {
    try {
      const files = await fs.readdir(STORAGE_CONFIG.dataDir);
      // 过滤掉隐藏文件和系统文件
      const visibleFiles = files.filter((f) => !f.startsWith('.'));
      return JSON.stringify(visibleFiles);
    } catch (error) {
      return `列出文件失败: ${(error as Error).message}`;
    }
  },
  {
    name: 'list_files',
    description: '列出库中所有可见的文件和目录。',
    schema: z.object({}),
  }
);

// 工具2: 读取文件内容
export const readFileTool = tool(
  async ({ filename, lines = 50 }) => {
    try {
      const filePath = getSafePath(filename);
      // 检查文件是否存在
      try {
        await fs.access(filePath);
      } catch {
        return `错误：文件 "${filename}" 不存在。`;
      }

      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        return `错误："${filename}" 是一个目录，不是文件。`;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const allLines = content.split('\n');
      const preview = allLines.slice(0, lines).join('\n');

      if (allLines.length > lines) {
        return `${preview}\n...（已截断，共 ${allLines.length} 行）`;
      }
      return content;
    } catch (error) {
      return `读取文件失败: ${(error as Error).message}`;
    }
  },
  {
    name: 'read_file',
    description: '读取文件的内容（前 N 行）以进行查看。',
    schema: z.object({
      filename: z.string().describe('要读取的文件名'),
      lines: z.number().optional().describe('要读取的行数（默认 50 行）'),
    }),
  }
);

// 工具3: 移动/重命名文件
export const moveFileTool = tool(
  async ({ source, destination }) => {
    try {
      const srcPath = getSafePath(source);
      const destPath = getSafePath(destination);

      try {
        await fs.access(srcPath);
      } catch {
        return `错误：源文件 "${source}" 不存在。`;
      }

      try {
        await fs.access(destPath);
        return `错误：目标 "${destination}" 已存在。`;
      } catch {
        // 目标不存在，这是符合预期的
      }

      // 确保目标目录存在
      const destDir = path.dirname(destPath);
      await fs.mkdir(destDir, { recursive: true });

      await fs.rename(srcPath, destPath);
      return `成功将 "${source}" 移动/重命名为 "${destination}"。`;
    } catch (error) {
      return `移动文件失败: ${(error as Error).message}`;
    }
  },
  {
    name: 'move_file',
    description: '移动或重命名文件或目录。',
    schema: z.object({
      source: z.string().describe('当前文件路径'),
      destination: z.string().describe('新文件路径（相对于库根目录）'),
    }),
  }
);

// 工具4: 创建目录
export const createDirectoryTool = tool(
  async ({ directoryName }) => {
    try {
      const dirPath = getSafePath(directoryName);
      try {
        await fs.access(dirPath);
        return `目录 "${directoryName}" 已存在。`;
      } catch {
        // 目录不存在，继续创建
      }

      await fs.mkdir(dirPath, { recursive: true });
      return `成功创建目录 "${directoryName}"。`;
    } catch (error) {
      return `创建目录失败: ${(error as Error).message}`;
    }
  },
  {
    name: 'create_directory',
    description: '创建一个新目录。',
    schema: z.object({
      directoryName: z.string().describe('新目录的名称'),
    }),
  }
);

// 工具5: 删除文件
export const deleteFileTool = tool(
  async ({ filename }) => {
    try {
      const filePath = getSafePath(filename);
      try {
        await fs.access(filePath);
      } catch {
        return `错误：文件 "${filename}" 不存在。`;
      }

      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        await fs.rm(filePath, { recursive: true, force: true });
        return `成功删除目录 "${filename}"。`;
      } else {
        await fs.unlink(filePath);
        return `成功删除文件 "${filename}"。`;
      }
    } catch (error) {
      return `删除文件失败: ${(error as Error).message}`;
    }
  },
  {
    name: 'delete_file',
    description: '永久删除文件或目录。',
    schema: z.object({
      filename: z.string().describe('要删除的文件或目录名'),
    }),
  }
);

export const ALL_TOOLS = [
  listFilesTool,
  readFileTool,
  moveFileTool,
  createDirectoryTool,
  deleteFileTool,
];
