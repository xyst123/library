import path from 'node:path';
import fs from 'node:fs';
import { STORAGE_CONFIG, CHUNKING_CONFIG, RAG_CONFIG, ChunkingStrategy } from './config';

export interface AppSettings {
  provider: string;
  chunkingStrategy: string;
  enableContextEnhancement?: boolean;
  enableHybridSearch?: boolean;
  enableReranking?: boolean;
  enableCRAG?: boolean;
  enableSummaryMemory?: boolean;
}
const SETTINGS_FILENAME = 'settings.json';

/** 配置值类型枚举 */
enum SettingType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  OBJECT = 'object',
}

/** 布尔类型配置项映射定义 */
interface BooleanConfig {
  key: keyof AppSettings;
  updateFn: (val: boolean) => void;
  label?: string;
}

/** 全局布尔配置项列表 */
const BOOLEAN_SETTINGS: BooleanConfig[] = [
  {
    key: 'enableContextEnhancement',
    updateFn: (val) => (CHUNKING_CONFIG.enableContextEnhancement = val),
    label: '上下文增强',
  },
  {
    key: 'enableHybridSearch',
    updateFn: (val) => (RAG_CONFIG.enableHybridSearch = val),
    label: '混合检索',
  },
  {
    key: 'enableReranking',
    updateFn: (val) => (RAG_CONFIG.enableReranking = val),
    label: '重排序',
  },
  {
    key: 'enableCRAG',
    updateFn: (val) => (RAG_CONFIG.enableCRAG = val),
    label: 'CRAG',
  },
  {
    key: 'enableSummaryMemory',
    updateFn: (val) => (RAG_CONFIG.enableSummaryMemory = val),
    label: '摘要记忆',
  },
];

/**
 * 辅助函数：根据类型更新配置并可选地打印日志
 * 支持 boolean, string, number 等
 */
const applySetting = <T>(
  value: T | undefined,
  expectedType: SettingType,
  updateFn: (val: T) => void,
  logLabel?: string
) => {
  if (typeof value === expectedType) {
    updateFn(value as T);
    if (logLabel) {
      console.log(`[Settings] ${logLabel}已更新为:`, value);
    }
  }
};

export const getSettings = (): AppSettings => {
  const settingsPath = path.join(STORAGE_CONFIG.dataDir, SETTINGS_FILENAME);

  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[Settings] 读取设置失败:', error);
  }

  // 返回默认设置
  return {
    provider: 'deepseek', // Default provider, can be inferred or set
    chunkingStrategy: 'character',
    enableContextEnhancement: true,
    enableHybridSearch: false,
    enableReranking: false,
    enableCRAG: false,
    enableSummaryMemory: false,
  };
};

export const saveSettings = (settings: AppSettings): void => {
  const settingsPath = path.join(STORAGE_CONFIG.dataDir, SETTINGS_FILENAME);

  try {
    // 确保数据目录存在
    if (!fs.existsSync(STORAGE_CONFIG.dataDir)) {
      fs.mkdirSync(STORAGE_CONFIG.dataDir, { recursive: true });
    }

    // 更新全局配置 - Chunking 策略
    applySetting(
      settings.chunkingStrategy,
      SettingType.STRING,
      (val) => {
        if (val === ChunkingStrategy.SEMANTIC) {
          CHUNKING_CONFIG.strategy = ChunkingStrategy.SEMANTIC;
        } else if (val === ChunkingStrategy.LLM_ENHANCED) {
          CHUNKING_CONFIG.strategy = ChunkingStrategy.LLM_ENHANCED;
        } else {
          CHUNKING_CONFIG.strategy = ChunkingStrategy.CHARACTER;
        }
      },
      'Chunking 策略'
    );

    // 循环更新所有布尔配置
    BOOLEAN_SETTINGS.forEach(({ key, updateFn, label }) => {
      applySetting(settings[key] as boolean | undefined, SettingType.BOOLEAN, updateFn, label);
    });

    console.log('[Settings] Chunking 策略已更新为:', CHUNKING_CONFIG.strategy);

    // 保存到文件
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[Settings] 保存设置失败:', error);
    throw new Error(`保存设置失败: ${err.message}`);
  }
};

export const initSettings = () => {
  console.log('[Settings] 正在初始化...');
  const settings = getSettings();

  // Apply settings to global config on init
  applySetting(settings.chunkingStrategy, SettingType.STRING, (val) => {
    if (val === ChunkingStrategy.SEMANTIC) {
      CHUNKING_CONFIG.strategy = ChunkingStrategy.SEMANTIC;
    } else if (val === ChunkingStrategy.LLM_ENHANCED) {
      CHUNKING_CONFIG.strategy = ChunkingStrategy.LLM_ENHANCED;
    }
  });

  // 循环初始化所有布尔配置
  BOOLEAN_SETTINGS.forEach(({ key, updateFn }) => {
    applySetting(settings[key] as boolean | undefined, SettingType.BOOLEAN, updateFn);
  });

  console.log('[Settings] 已加载保存的设置:', {
    reranking: RAG_CONFIG.enableReranking,
    hybrid: RAG_CONFIG.enableHybridSearch,
    crag: RAG_CONFIG.enableCRAG,
    summary: RAG_CONFIG.enableSummaryMemory,
  });
};
