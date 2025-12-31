import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 选择文件夹
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  
  // 开始监听
  startWatch: (folderPath: string) => ipcRenderer.invoke('start-watch', folderPath),
  
  // 停止监听
  stopWatch: () => ipcRenderer.invoke('stop-watch'),
  
  // 获取状态
  getStatus: () => ipcRenderer.invoke('get-status'),
  
  // 查询
  query: (question: string, provider: string) => ipcRenderer.invoke('query', question, provider),
});
