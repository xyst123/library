// 文件相关常量
export const SUPPORTED_FILE_EXTENSIONS = ['txt', 'md', 'pdf', 'docx', 'html'] as const;

// UI 相关常量
export const UI_CONSTANTS = {
  SIDEBAR_WIDTH: 280,
  HEADER_HEIGHT: 64,
  GRADIENT_HEIGHT: 120,
  BUTTON_FONT_SIZE: 16,
  MAX_MESSAGE_WIDTH: '75%',
} as const;

// 消息提示
export const MESSAGES = {
  UPLOAD: {
    LOADING: '正在索引文件...',
    SUCCESS: (count: number) => `成功导入 ${count} 个文件`,
    ERROR: (error: string) => `导入失败: ${error}`,
    EXCEPTION: (error: string) => `导入发生错误: ${error}`,
  },
  DELETE: {
    SUCCESS: '文件已删除并更新索引',
    ERROR: (error: string) => `删除失败: ${error}`,
    EXCEPTION: (error: string) => `操作出错: ${error}`,
  },
  FILE: {
    INVALID: '请拖入支持的文件 (.txt, .md, .pdf, .docx, .html)',
  },
  HISTORY: {
    CONFIRM: '确认清空对话历史？',
  },
  COPY: {
    SUCCESS: '已复制到剪贴板',
    ERROR: '复制失败',
  },
  SETTINGS: {
    SAVED: '设置已保存',
  },
} as const;

// 动画和过渡
export const TRANSITIONS = {
  DEFAULT: 'all 0.3s ease',
  BACKGROUND: 'background-color 0.2s',
} as const;

// 缓存大小
export const CACHE_CONFIG = {
  EMBEDDING_SIZE: 50,
  QUERY_HISTORY_SIZE: 10,
} as const;
