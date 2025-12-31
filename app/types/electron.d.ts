export {};

declare global {
  interface Window {
    electronAPI: {
      selectFiles: () => Promise<string[] | null>;

      ingestFiles: (filePaths: string[]) => Promise<{ success: boolean; files?: string[]; error?: string }>;
      getFileList: () => Promise<{ success: boolean; files?: string[]; error?: string }>;
      deleteFile: (filePath: string) => Promise<{ success: boolean; files?: string[]; error?: string }>;
      getStatus: () => Promise<{ documentCount: number }>;
      query: (question: string, provider: string) => Promise<{ success: boolean; answer?: string; error?: string }>;
    };
  }
}
