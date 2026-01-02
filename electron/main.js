/* eslint-disable @typescript-eslint/no-var-requires */
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { Worker } = require('worker_threads');

let mainWindow = null;
let worker = null;
// 存储挂起请求的 Map: id -> { resolve, reject }
// 存储挂起请求的 Map: id -> { resolve, reject }
var pendingRequests = new Map();

function createWorker() {
  const workerPath = path.join(__dirname, 'worker.js');
  worker = new Worker(workerPath);

  worker.on('message', (message) => {
    const { id, success, data, error, type } = message;

    // 处理流式事件和进度
    if (type === 'answer-start' || type === 'answer-chunk' || type === 'ingest-progress') {
      // 直接转发给渲染器
      // 我们需要知道哪个窗口发送了请求？或者只是广播到 mainWindow。
      if (mainWindow) {
        mainWindow.webContents.send(type, message);
      }
      return;
    }

    if (pendingRequests.has(id)) {
      const { resolve, reject } = pendingRequests.get(id);
      if (success !== undefined) {
        // 检查最终响应
        pendingRequests.delete(id);
        if (success) {
          resolve(data);
        } else {
          reject(new Error(error));
        }
      }
    }
  });

  worker.on('error', (err) => {
    console.error('Worker 错误:', err);
    // Reject all pending requests
    for (const { reject } of pendingRequests.values()) {
      reject(new Error(`Worker error: ${err.message}`));
    }
    pendingRequests.clear();
  });

  worker.on('exit', (code) => {
    if (code !== 0) {
      console.error(new Error(`Worker 以退出码 ${code} 停止`));
      // Reject all pending requests
      for (const { reject } of pendingRequests.values()) {
        reject(new Error(`Worker exited with code ${code}`));
      }
      pendingRequests.clear();
    }
  });
}

function sendToWorker(type, data = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).substring(7);
    pendingRequests.set(id, { resolve, reject });
    // 超时: 默认 30s，对于导入文件/提问需要更多时间 (模型加载/下载)
    const timeoutMs = type === 'ingest-files' || type === 'ask-question' ? 600000 : 30000;

    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Worker 请求 ${type} 在 ${timeoutMs}ms 后超时`));
      }
    }, timeoutMs);

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

  // 初始化 Worker
  sendToWorker('init').catch((err) => console.error('Worker 初始化失败:', err));
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

// IPC 处理器 代理到 Worker

// 选择文件 (仍然在主进程中运行，因为它打开本机对话框)
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

// 历史记录方法
ipcMain.handle('get-history', async () => {
  try {
    const result = await sendToWorker('get-history');
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('add-history', async (_event, role, content) => {
  try {
    const result = await sendToWorker('add-history', { role, content });
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('clear-history', async () => {
  try {
    const result = await sendToWorker('clear-history');
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});
