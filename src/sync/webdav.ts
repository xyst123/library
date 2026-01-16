import type { WebDAVClient } from 'webdav';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';

export interface WebDAVConfig {
  url: string;
  username?: string;
  password?: string;
}

export class WebDAVSync {
  private client: WebDAVClient | null = null;
  private config: WebDAVConfig;

  constructor(config: WebDAVConfig) {
    this.config = config;
  }

  private async getClient(): Promise<WebDAVClient> {
    if (this.client) {
      return this.client;
    }
    const { createClient } = await import('webdav');
    this.client = createClient(this.config.url, {
      username: this.config.username,
      password: this.config.password,
    });
    return this.client;
  }

  async testConnection(): Promise<boolean> {
    try {
      const client = await this.getClient();
      // 尝试列出根目录文件来验证连接
      await client.getDirectoryContents('/');
      return true;
    } catch (error) {
      console.error('[WebDAV] 连接测试失败:', error);
      throw error;
    }
  }

  /**
   * 上传文件到 WebDAV
   * @param localPath 本地绝对路径
   * @param remotePath 远程相对路径 (包含文件名)
   */
  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    const stream = createReadStream(localPath);
    const client = await this.getClient();
    await client.putFileContents(remotePath, stream);
  }

  /**
   * 从 WebDAV 下载文件
   * @param remotePath 远程相对路径 (包含文件名)
   * @param localPath 本地绝对路径
   */
  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    const client = await this.getClient();
    const buffer = (await client.getFileContents(remotePath)) as Buffer;
    await fs.writeFile(localPath, buffer);
  }

  /**
   * 同步指定目录的所有文件
   * 这是一个简单的单向同步示例，实际需要更复杂的逻辑
   */
  async syncDirectory(localDir: string, remoteDir: string = '/'): Promise<void> {
    const files = await fs.readdir(localDir);
    const client = await this.getClient();

    // 确保远程目录存在
    if (await client.exists(remoteDir) === false) {
      await client.createDirectory(remoteDir);
    }

    for (const file of files) {
      const localPath = path.join(localDir, file);
      const stat = await fs.stat(localPath);

      if (stat.isFile()) {
        try {
          await this.uploadFile(localPath, path.posix.join(remoteDir, file));
          console.log(`[WebDAV] 上传成功: ${file}`);
        } catch (e) {
          console.error(`[WebDAV] 上传失败 ${file}:`, e);
        }
      }
    }
  }
}
