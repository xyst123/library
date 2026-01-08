/* eslint-disable @typescript-eslint/no-var-requires */
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { Worker } = require('worker_threads');
const { startMcpServer } = require('./mcp_server');

// 屏蔽非致命的 Chromium 错误日志 (如 Autofill.enable failed)
app.commandLine.appendSwitch('log-level', '3');

// 重定向 console.log 到 console.error，避免干扰 MCP stdio 传输
console.log = function(...args) {
  console.error(...args);
};

let mainWindow = null;
let worker = null;
// 存储挂起请求的 Map: id -> { resolve, reject }
const pendingRequests = new Map();

const createWorker = () => {
  const workerPath = path.join(__dirname, 'worker.js');
  worker = new Worker(workerPath);

  worker.on('message', (message) => {
    const { id, success, data, error, type } = message;

    // 处理流式事件和进度（包括 tool-calls）
    if (type === 'answer-start' || type === 'answer-chunk' || type === 'tool-calls' || type === 'ingest-progress') {
      // 直接转发给渲染器
      if (mainWindow) {
        mainWindow.webContents.send(type, message);
      }
      return;
    }

    // 处理特殊消息 (如模型下载进度)
    if (id === 'model-status') {
       if (data.type === 'model-download-progress') {
          mainWindow.webContents.send('model-download-progress', data);
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
    // 拒绝所有挂起的请求
    for (const { reject } of pendingRequests.values()) {
      reject(new Error(`Worker 错误: ${err.message}`));
    }
    pendingRequests.clear();
  });

  worker.on('exit', (code) => {
    if (code !== 0) {
      console.error(new Error(`Worker 以退出码 ${code} 停止`));
      // 拒绝所有挂起的请求
      for (const { reject } of pendingRequests.values()) {
        reject(new Error(`Worker 以退出码 ${code} 退出`));
      }
      pendingRequests.clear();

      // 自动重启 Worker (延迟 1 秒防止快速循环)
      console.error('[Main] Worker 崩溃，1 秒后自动重启...');
      setTimeout(() => {
        console.error('[Main] 正在重启 Worker...');
        createWorker();
        // 重新初始化
        sendToWorker('init').catch((e) => {
          console.error('[Main] Worker 重新初始化失败:', e);
        });
      }, 1000);
    }
  });
}

const sendToWorker = (type, data = {}) => {
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

const createWindow = () => {
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

  // 启动 MCP 服务
  startMcpServer(sendToWorker).catch((err) => console.error('MCP 服务启动失败:', err));
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

/**
 * 创建通用 Worker 代理处理器
 * @param {string} workerType - Worker 消息类型
 * @param {function} [argsMapper] - 可选的参数映射函数
 * @param {object} [defaultError] - 可选的默认错误返回值
 */
const createWorkerProxy = (workerType, argsMapper = null, defaultError = null) => {
  return async (_event, ...args) => {
    try {
      const data = argsMapper ? argsMapper(...args) : (args[0] || {});
      const result = await sendToWorker(workerType, data);
      return result;
    } catch (error) {
      if (defaultError) return defaultError;
      return { success: false, error: error.message };
    }
  };
}

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

// 简单代理处理器
ipcMain.handle('get-file-list', createWorkerProxy('get-file-list'));
ipcMain.handle('get-history', createWorkerProxy('get-history'));
ipcMain.handle('clear-history', createWorkerProxy('clear-history'));
ipcMain.handle('get-status', createWorkerProxy('get-status', null, { documentCount: 0 }));

// 带参数映射的代理处理器
ipcMain.handle('ingest-files', createWorkerProxy('ingest-files', (filePaths) => ({ filePaths })));
ipcMain.handle('delete-file', createWorkerProxy('delete-file', (filePath) => ({ filePath })));
ipcMain.handle('add-history', createWorkerProxy('add-history', (role, content) => ({ role, content })));
ipcMain.handle('ask-question', createWorkerProxy('ask-question', (question, history, provider) => ({ question, history, provider })));

ipcMain.handle('stop-generation', async () => {
  try {
    // 发送停止信号给 Worker
    // 我们不使用 sendToWorker 因为它期望响应/超时逻辑，而这里我们希望快速发送不等待
    if (worker) {
       worker.postMessage({ id: 'stop', data: { type: 'stop-generation' } });
    }
    // 同时清理任何匹配 'ask-question' 的挂起请求（如果可能）？
    // 实际上 worker 在中止时会解决/拒绝挂起的 'ask-question' 请求。
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 设置相关
ipcMain.handle('get-settings', createWorkerProxy('get-settings', null, { chunkingStrategy: 'character' }));
ipcMain.handle('save-settings', createWorkerProxy('save-settings', (settings) => ({ settings })));
