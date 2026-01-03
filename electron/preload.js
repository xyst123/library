/* eslint-disable @typescript-eslint/no-var-requires */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFiles: () => ipcRenderer.invoke('select-files'),
  ingestFiles: (filePaths) => ipcRenderer.invoke('ingest-files', filePaths),
  getFileList: () => ipcRenderer.invoke('get-file-list'),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  getStatus: () => ipcRenderer.invoke('get-status'),
  askQuestion: (question, history, provider) =>
    ipcRenderer.invoke('ask-question', question, history, provider),

  getHistory: () => ipcRenderer.invoke('get-history'),
  addHistory: (role, content) => ipcRenderer.invoke('add-history', role, content),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  stopGeneration: () => ipcRenderer.invoke('stop-generation'),

  // 事件监听
  onAnswerStart: (callback) => {
    ipcRenderer.on('answer-start', callback);
  },
  onAnswerChunk: (callback) => {
    ipcRenderer.on('answer-chunk', callback);
  },
  onIngestProgress: (callback) => {
    ipcRenderer.on('ingest-progress', callback);
  },
  removeListener: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});

console.log('预加载脚本已加载!');
