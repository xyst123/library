/* eslint-disable @typescript-eslint/no-var-requires */
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

let mainWindow = null;
let documentCount = 0;
let knowledgeBase = null;

async function loadKnowledgeBase() {
  if (knowledgeBase) return knowledgeBase;

  // 使用 ts-node 注册
  require('ts-node').register({
    transpileOnly: true,
    compilerOptions: {
      module: 'commonjs',
      moduleResolution: 'node',
    },
  });

  const loaderPath = path.join(__dirname, '../src/loader');
  const vectorStorePath = path.join(__dirname, '../src/sqliteStore');
  const ragPath = path.join(__dirname, '../src/rag');
  const configPath = path.join(__dirname, '../src/config');
  const watcherPath = path.join(__dirname, '../src/watcher');

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
    watcherInstance: null,
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

// 选择文件
ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: '选择知识库文件',
    filters: [
      { name: '文档', extensions: ['txt', 'md', 'pdf', 'docx', 'html'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });

  if (result.canceled) return null;
  return result.filePaths;
});

// 导入文件 (手动上传)
ipcMain.handle('ingest-files', async (_event, filePaths) => {
  try {
    const kb = await loadKnowledgeBase();
    console.log('IPC: ingest-files', filePaths);

    const allDocs = [];
    for (const filePath of filePaths) {
      // 检查文件是否存在
      if (!require('fs').existsSync(filePath)) {
        console.warn(`文件未找到: ${filePath}`);
        continue;
      }
      const docs = await kb.loadAndSplit(filePath);
      allDocs.push(...docs);
    }

    if (allDocs.length > 0) {
      await kb.ingestDocs(allDocs);
    }

    // 返回最新的文件列表
    const store = await kb.getVectorStore();
    const files = await store.getSources();
    return { success: true, files };
  } catch (error) {
    console.error('导入错误:', error);
    return { success: false, error: error.message };
  }
});

// 获取文件列表
ipcMain.handle('get-file-list', async () => {
  try {
    const kb = await loadKnowledgeBase();
    // 确保初始化
    if (!kb) await loadKnowledgeBase();
    const store = await kb.getVectorStore();
    const files = await store.getSources();
    return { success: true, files };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 删除文件
ipcMain.handle('delete-file', async (_event, filePath) => {
  try {
    const kb = await loadKnowledgeBase();
    const store = await kb.getVectorStore();
    await store.deleteDocumentsBySource(filePath);
    await store.save(path.join(__dirname, '../data/vectors.json')); // 使用硬编码路径或更好的复用逻辑

    const files = await store.getSources();
    return { success: true, files };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 获取状态 (简化: 仅返回文档数)
ipcMain.handle('get-status', async () => {
  try {
    const kb = await loadKnowledgeBase();
    const store = await kb.getVectorStore();
    documentCount = store.memoryVectors.length;
  } catch (e) {
    // 首次加载可能失败
  }
  return {
    documentCount,
  };
});

// 查询
// 提问 (原 query)
ipcMain.handle('ask-question', async (_event, question, history, provider) => {
  try {
    const kb = await loadKnowledgeBase();
    const llmProvider = provider === 'gemini' ? kb.LLMProvider.GEMINI : kb.LLMProvider.DEEPSEEK;
    const result = await kb.askQuestion(question, history || [], llmProvider);

    const store = await kb.getVectorStore();
    documentCount = store.memoryVectors ? store.memoryVectors.length : 0; // SQLite store might not have this prop exposed directly same way, but let's safe check or remove if not needed for count update instantly

    // 返回答案和来源
    return { success: true, answer: result.answer, sources: result.sources };
  } catch (error) {
    console.error('提问错误:', error);
    return { success: false, error: error.message };
  }
});
