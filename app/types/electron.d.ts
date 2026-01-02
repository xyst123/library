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
    };
  }
}
