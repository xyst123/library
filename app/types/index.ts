// 消息相关类型
export interface MessageSource {
  source: string;
  content: string;
  score?: number;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: MessageSource[];
  toolCalls?: ToolCall[];
}

// 文件操作结果类型
export interface OperationResult {
  success: boolean;
  error?: string;
  answer?: string;
  sources?: MessageSource[];
}

export interface FileListResult extends OperationResult {
  files?: string[];
}

export interface StatusResult {
  documentCount: number;
}

// 设置相关类型
export interface AppSettings {
  provider: string;
  chunkingStrategy: string;
  enableContextEnhancement: boolean;
  enableHybridSearch: boolean;
  enableReranking?: boolean;
  enableCRAG?: boolean;
  enableSummaryMemory?: boolean;
}

/** 历史消息格式（用于 IPC 传输） */
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** 提问结果 */
export interface AskQuestionResult {
  success: boolean;
  answer?: string;
  sources?: MessageSource[];
  error?: string;
}

/** 历史记录结果 */
export interface HistoryResult {
  success: boolean;
  history?: Message[];
}

// 模型下载状态
export interface ModelDownloadStatus {
  file: string;
  status: 'progress' | 'done' | 'ready' | 'error';
  name: string;
  loaded?: number;
  total?: number;
  progress?: number;
}

export interface VectorPoint {
  x: number;
  y: number;
  text: string;
  isQuery: boolean;
  id: number;
}

// Electron API 类型
export interface ElectronAPI {
  // 文件操作
  selectFiles: () => Promise<string[] | null>;
  ingestFiles: (paths: string[]) => Promise<OperationResult>;
  deleteFile: (path: string) => Promise<OperationResult>;
  getFileList: () => Promise<FileListResult>;
  getStatus: () => Promise<StatusResult>;

  // 问答相关
  askQuestion: (
    question: string,
    history: HistoryMessage[],
    provider: string
  ) => Promise<AskQuestionResult>;
  stopGeneration: () => Promise<void>;

  // 历史记录
  addHistory: (role: 'user' | 'assistant', content: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  getHistory: () => Promise<HistoryResult>;

  // 设置
  saveSettings: (settings: AppSettings) => Promise<void>;
  getSettings: () => Promise<AppSettings>;

  // 向量地图
  calculateVectorPositions: (query?: string) => Promise<{ points: VectorPoint[] }>;

  // Agent
  runAgent: (input: string) => Promise<OperationResult>;

  // 通用事件
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  removeListener: (channel: string) => void;
  // 事件
  onAnswerStart: (
    callback: (
      event: unknown,
      data: { sources: Array<{ source: string; content: string; score?: number }> }
    ) => void
  ) => void;
  onAnswerChunk: (callback: (event: unknown, data: { chunk: string }) => void) => void;
  onToolCalls: (
    callback: (
      event: unknown,
      data: { toolCalls: Array<{ name: string; args: Record<string, unknown> }> }
    ) => void
  ) => void;
  onIngestProgress: (
    callback: (
      event: unknown,
      data: { current: number; total: number; status: string; file: string }
    ) => void
  ) => void;
  onModelDownloadProgress: (callback: (event: unknown, data: ModelDownloadStatus) => void) => void;
  onAgentThought: (callback: (event: unknown, data: { content: string }) => void) => void;
  onAgentToolOutput: (callback: (event: unknown, data: { content: string }) => void) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
