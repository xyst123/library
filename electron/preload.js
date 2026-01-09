/* eslint-disable @typescript-eslint/no-var-requires */
// @ts-nocheck
const { contextBridge, ipcRenderer } = require('electron');

// IPC 事件名称
const IPC_EVENTS = {
  SELECT_FILES: 'select-files',
  INGEST_FILES: 'ingest-files',
  GET_FILE_LIST: 'get-file-list',
  DELETE_FILE: 'delete-file',
  GET_STATUS: 'get-status',
  ASK_QUESTION: 'ask-question',
  ANSWER_START: 'answer-start',
  ANSWER_CHUNK: 'answer-chunk',
  TOOL_CALLS: 'tool-calls',
  GET_HISTORY: 'get-history',
  ADD_HISTORY: 'add-history',
  CLEAR_HISTORY: 'clear-history',
  STOP_GENERATION: 'stop-generation',
  GET_SETTINGS: 'get-settings',
  SAVE_SETTINGS: 'save-settings',
  CALCULATE_VECTOR_POSITIONS: 'calculate-vector-positions',
  INGEST_PROGRESS: 'ingest-progress',
  MODEL_DOWNLOAD_PROGRESS: 'model-download-progress',
};

// 允许监听的事件
const LISTEN_CHANNELS = [
  IPC_EVENTS.MODEL_DOWNLOAD_PROGRESS,
  IPC_EVENTS.INGEST_PROGRESS,
  IPC_EVENTS.ANSWER_START,
  IPC_EVENTS.ANSWER_CHUNK,
  IPC_EVENTS.TOOL_CALLS,
];

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const listen = (channel, cb) => ipcRenderer.on(channel, cb);

contextBridge.exposeInMainWorld('electronAPI', {
  selectFiles: () => invoke(IPC_EVENTS.SELECT_FILES),
  ingestFiles: (paths) => invoke(IPC_EVENTS.INGEST_FILES, paths),
  getFileList: () => invoke(IPC_EVENTS.GET_FILE_LIST),
  deleteFile: (path) => invoke(IPC_EVENTS.DELETE_FILE, path),
  getStatus: () => invoke(IPC_EVENTS.GET_STATUS),
  askQuestion: (q, h, p) => invoke(IPC_EVENTS.ASK_QUESTION, q, h, p),
  getHistory: () => invoke(IPC_EVENTS.GET_HISTORY),
  addHistory: (role, content) => invoke(IPC_EVENTS.ADD_HISTORY, role, content),
  clearHistory: () => invoke(IPC_EVENTS.CLEAR_HISTORY),
  stopGeneration: () => invoke(IPC_EVENTS.STOP_GENERATION),
  getSettings: () => invoke(IPC_EVENTS.GET_SETTINGS),
  saveSettings: (s) => invoke(IPC_EVENTS.SAVE_SETTINGS, s),
  calculateVectorPositions: (query) => invoke(IPC_EVENTS.CALCULATE_VECTOR_POSITIONS, { query }),
  
  onAnswerStart: (cb) => listen(IPC_EVENTS.ANSWER_START, cb),
  onAnswerChunk: (cb) => listen(IPC_EVENTS.ANSWER_CHUNK, cb),
  onToolCalls: (cb) => listen(IPC_EVENTS.TOOL_CALLS, cb),
  onIngestProgress: (cb) => listen(IPC_EVENTS.INGEST_PROGRESS, cb),
  onModelDownloadProgress: (cb) => listen(IPC_EVENTS.MODEL_DOWNLOAD_PROGRESS, cb),
  
  on: (channel, cb) => LISTEN_CHANNELS.includes(channel) && listen(channel, cb),
  removeListener: (channel) => ipcRenderer.removeAllListeners(channel),
  IPC_EVENTS,
});

console.log('预加载脚本已加载');
