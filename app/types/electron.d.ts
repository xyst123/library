export {};

declare global {
  interface Window {
    electronAPI: {
      selectFiles: () => Promise<string[] | null>;

      ingestFiles: (
        filePaths: string[]
      ) => Promise<{ success: boolean; files?: string[]; error?: string }>;
      getFileList: () => Promise<{ success: boolean; files?: string[]; error?: string }>;
      deleteFile: (
        filePath: string
      ) => Promise<{ success: boolean; files?: string[]; error?: string }>;
      getStatus: () => Promise<{ documentCount: number }>;
      askQuestion: (
        question: string,
        history: { role: 'user' | 'assistant'; content: string }[],
        provider: string
      ) => Promise<{
        success: boolean;
        answer?: string;
        sources?: Array<{ source: string; content: string; score?: number }>;
        error?: string;
      }>;
      getHistory: () => Promise<{
        success: boolean;
        history?: { role: 'user' | 'assistant'; content: string }[];
        error?: string;
      }>;
      addHistory: (
        role: 'user' | 'assistant',
        content: string
      ) => Promise<{ success: boolean; error?: string }>;

      clearHistory: () => Promise<{ success: boolean; error?: string }>;

      // Events
      onAnswerStart: (
        callback: (
          event: unknown,
          data: { sources: Array<{ source: string; content: string; score?: number }> }
        ) => void
      ) => void;
      onAnswerChunk: (callback: (event: unknown, data: { chunk: string }) => void) => void;
      onIngestProgress: (
        callback: (
          event: unknown,
          data: { current: number; total: number; status: string; file: string }
        ) => void
      ) => void;
      removeListener: (channel: string) => void;
    };
  }
}
