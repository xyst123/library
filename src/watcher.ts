import chokidar from 'chokidar';
import path from 'path';
import { loadAndSplit } from './loader';
import { getVectorStore } from './sqliteStore';

export class Watcher {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private watcher: any = null;
  private processingQueue: Set<string> = new Set();
  private isProcessing = false;

  constructor(private watchDir: string) {}

  public async start() {
    console.log(`正在启动监听，目录: ${this.watchDir}`);
    console.log(`支持的文件类型: .txt`);

    const absolutePath = path.resolve(this.watchDir);
    this.watcher = chokidar.watch(absolutePath, {
      ignored: /(^|[/\\])\../, // 忽略隐藏文件
      persistent: true,
      ignoreInitial: false, // 启动时处理已有文件
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100,
      },
    });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.watcher.on('add', async (filePath: any) => {this.handleFileChange(filePath, 'add')})
      .on('change', (path: string) => this.handleFileChange(path, 'change'))
      .on('unlink', (path: string) => this.handleFileRemove(path))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('error', (error: any) => console.error(`Watcher error: ${error}`));

    console.log('监听已就绪，正在扫描文件...');
  }

  private async handleFileChange(filePath: string, event: 'add' | 'change') {
    if (!filePath.endsWith('.txt')) return;

    console.log(`检测到文件变动 (${event}): ${filePath}`);

    try {
      const store = await getVectorStore();

      // 1. 如果是修改，先删除旧的向量
      if (event === 'change') {
        await store.deleteDocumentsBySource(filePath);
      }

      // 2. 对于 'add' 事件，为了防止重复添加（例如重启程序时），我们也先尝试删除
      // 如果是新文件，delete操作只是不产生效果而已，是安全的
      await store.deleteDocumentsBySource(filePath);

      // 3. 加载并分割文件
      // 注意：chokidar 的 add 事件会在程序启动时对已有文件触发
      // 如果我们能够持久化一个 "已处理文件列表"，就可以跳过未修改的文件
      // 但为了简单，我们选择总是重新索引（只要文件量不大，速度是可以接受的）
      const docs = await loadAndSplit(filePath);

      if (docs.length > 0) {
        await store.addDocuments(docs);
        // await store.save(path.join(process.cwd(), 'data/vectors.json'));
        console.log(`[成功] 已更新文件索引: ${path.basename(filePath)} (${docs.length} chunks)`);
      } else {
        console.warn(`[警告] 文件为空或无法读取: ${filePath}`);
      }
    } catch (error) {
      console.error(`[错误] 处理文件失败 ${filePath}:`, error);
    }
  }

  private async handleFileRemove(filePath: string) {
    if (!filePath.endsWith('.txt')) return;

    console.log(`检测到文件删除: ${filePath}`);
    try {
      const store = await getVectorStore();
      await store.deleteDocumentsBySource(filePath);
      // await store.save(path.join(process.cwd(), 'data/vectors.json'));
      console.log(`[成功] 已移除文件索引: ${path.basename(filePath)}`);
    } catch (error) {
      console.error(`[错误] 移除文件索引失败 ${filePath}:`, error);
    }
  }
}
