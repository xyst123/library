import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;
let isWatching = false;
let watchPath = '';
let documentCount = 0;

// 动态导入知识库模块（避免打包冲突）
let knowledgeBase: any = null;

async function loadKnowledgeBase() {
  if (knowledgeBase) return knowledgeBase;
  
  // 动态导入 - 使用相对路径
  const loaderPath = path.join(__dirname, '../src/loader');
  const vectorStorePath = path.join(__dirname, '../src/vectorStore');
  const ragPath = path.join(__dirname, '../src/rag');
  const configPath = path.join(__dirname, '../src/config');
  const watcherPath = path.join(__dirname, '../src/watcher');
  
  // 使用 ts-node 注册
  require('ts-node').register({
    transpileOnly: true,
    compilerOptions: {
      module: 'commonjs',
    },
  });
  
  const { loadAndSplit } = require(loaderPath);
  const { getVectorStore, ingestDocs } = require(vectorStorePath);
  const { askQuestion } = require(ragPath);
  const { LLMProvider } = require(configPath);
  const { Watcher } = require(watcherPath);
  
  knowledgeBase = {
    loadAndSplit,
    getVectorStore,
    ingestDocs,
    askQuestion,
    LLMProvider,
    Watcher,
    watcherInstance: null as any,
  };
  
  return knowledgeBase;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e',
  });

  // 开发模式加载 Vite 服务器
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC 处理器

// 选择文件夹
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: '选择知识库文件夹',
  });
  
  if (result.canceled) return null;
  return result.filePaths[0];
});

// 开始监听
ipcMain.handle('start-watch', async (_event, folderPath: string) => {
  try {
    const kb = await loadKnowledgeBase();
    
    if (kb.watcherInstance) {
      isWatching = false;
    }
    
    kb.watcherInstance = new kb.Watcher(folderPath);
    await kb.watcherInstance.start();
    isWatching = true;
    watchPath = folderPath;
    
    const store = await kb.getVectorStore();
    documentCount = store.memoryVectors.length;
    
    return { success: true, path: folderPath };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 停止监听
ipcMain.handle('stop-watch', async () => {
  const kb = await loadKnowledgeBase();
  if (kb.watcherInstance) {
    kb.watcherInstance = null;
  }
  isWatching = false;
  watchPath = '';
  return { success: true };
});

// 获取状态
ipcMain.handle('get-status', async () => {
  try {
    const kb = await loadKnowledgeBase();
    const store = await kb.getVectorStore();
    documentCount = store.memoryVectors.length;
  } catch (e) {
    // 首次加载可能失败
  }
  return {
    isWatching,
    watchPath,
    documentCount,
  };
});

// 查询
ipcMain.handle('query', async (_event, question: string, provider: string) => {
  try {
    const kb = await loadKnowledgeBase();
    const llmProvider = provider === 'gemini' ? kb.LLMProvider.GEMINI : kb.LLMProvider.DEEPSEEK;
    const answer = await kb.askQuestion(question, llmProvider);
    
    const store = await kb.getVectorStore();
    documentCount = store.memoryVectors.length;
    
    return { success: true, answer };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});
