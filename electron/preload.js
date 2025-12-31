// @ts-nocheck
const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script loaded!');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 选择文件
  selectFiles: () => ipcRenderer.invoke('select-files'),
  

  
  // 导入文件
  ingestFiles: (filePaths) => ipcRenderer.invoke('ingest-files', filePaths),
  
  // 获取文件列表
  getFileList: () => ipcRenderer.invoke('get-file-list'),
  
  // 删除文件
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  
  // 获取状态 (简化)
  getStatus: () => ipcRenderer.invoke('get-status'),
  
  // 查询
  query: (question, provider) => ipcRenderer.invoke('query', question, provider),
});
