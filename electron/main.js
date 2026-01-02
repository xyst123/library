/* eslint-disable @typescript-eslint/no-var-requires */
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { Worker } = require('worker_threads');

let mainWindow = null;
let worker = null;
// Map to store pending requests: id -> { resolve, reject }
const pendingRequests = new Map();

function createWorker() {
  const workerPath = path.join(__dirname, 'worker.js');
  worker = new Worker(workerPath);

  worker.on('message', (message) => {
    const { id, success, data, error } = message;
    if (pendingRequests.has(id)) {
      const { resolve, reject } = pendingRequests.get(id);
      pendingRequests.delete(id);
      if (success) {
        resolve(data);
      } else {
        reject(new Error(error));
      }
    }
  });

  worker.on('error', (err) => {
    console.error('Worker error:', err);
  });

  worker.on('exit', (code) => {
    if (code !== 0) {
      console.error(new Error(`Worker stopped with exit code ${code}`));
    }
  });
}

function sendToWorker(type, data = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).substring(7);
    pendingRequests.set(id, { resolve, reject });
    worker.postMessage({ id, data: { type, ...data } });
  });
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

app.whenReady().then(() => {
  createWorker();
  createWindow();
  
  // Initialize worker
  sendToWorker('init').catch(err => console.error('Worker init failed:', err));
});

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

// IPC 处理器 proxy to Worker

// 选择文件 (Still runs in Main Process as it opens a native dialog)
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
    const result = await sendToWorker('ingest-files', { filePaths });
    return result; // result is { success: true, files: [...] }
  } catch (error) {
    console.error('导入错误:', error);
    return { success: false, error: error.message };
  }
});

// 获取文件列表
ipcMain.handle('get-file-list', async () => {
  try {
    const result = await sendToWorker('get-file-list');
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 删除文件
ipcMain.handle('delete-file', async (_event, filePath) => {
  try {
    const result = await sendToWorker('delete-file', { filePath });
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 获取状态
ipcMain.handle('get-status', async () => {
  try {
    const result = await sendToWorker('get-status');
    return result;
  } catch (e) {
    return { documentCount: 0 };
  }
});

// 查询
// 提问 (原 query)
ipcMain.handle('ask-question', async (_event, question, history, provider) => {
  try {
    const result = await sendToWorker('ask-question', { question, history, provider });
    return result;
  } catch (error) {
    console.error('提问错误:', error);
    return { success: false, error: error.message };
  }
});
