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
}

export const getSettings = (): AppSettings => {
  const settingsPath = path.join(STORAGE_CONFIG.dataDir, 'settings.json');

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
  };
};

export const saveSettings = (settings: AppSettings): void => {
  const settingsPath = path.join(STORAGE_CONFIG.dataDir, 'settings.json');

  try {
    // 确保数据目录存在
    if (!fs.existsSync(STORAGE_CONFIG.dataDir)) {
      fs.mkdirSync(STORAGE_CONFIG.dataDir, { recursive: true });
    }

    // 更新全局配置 - Chunking 策略
    if (settings.chunkingStrategy === ChunkingStrategy.SEMANTIC) {
      CHUNKING_CONFIG.strategy = ChunkingStrategy.SEMANTIC;
    } else if (settings.chunkingStrategy === ChunkingStrategy.LLM_ENHANCED) {
      CHUNKING_CONFIG.strategy = ChunkingStrategy.LLM_ENHANCED;
    } else {
      CHUNKING_CONFIG.strategy = ChunkingStrategy.CHARACTER;
    }

    // 更新全局配置 - 上下文增强
    if (typeof settings.enableContextEnhancement === 'boolean') {
      CHUNKING_CONFIG.enableContextEnhancement = settings.enableContextEnhancement;
      console.log('[Settings] 上下文增强已更新为:', CHUNKING_CONFIG.enableContextEnhancement);
    }

    // 更新全局配置 - 混合检索
    if (typeof settings.enableHybridSearch === 'boolean') {
      RAG_CONFIG.enableHybridSearch = settings.enableHybridSearch;
      console.log('[Settings] 混合检索已更新为:', RAG_CONFIG.enableHybridSearch);
    }

    // 更新全局配置 - 重排序
    if (typeof settings.enableReranking === 'boolean') {
      RAG_CONFIG.enableReranking = settings.enableReranking;
      console.log('[Settings] 重排序已更新为:', RAG_CONFIG.enableReranking);
    }

    // 更新全局配置 - CRAG
    if (typeof settings.enableCRAG === 'boolean') {
      RAG_CONFIG.enableCRAG = settings.enableCRAG;
      console.log('[Settings] CRAG 已更新为:', RAG_CONFIG.enableCRAG);
    }

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
  if (settings.chunkingStrategy === ChunkingStrategy.SEMANTIC) {
    CHUNKING_CONFIG.strategy = ChunkingStrategy.SEMANTIC;
  } else if (settings.chunkingStrategy === ChunkingStrategy.LLM_ENHANCED) {
    CHUNKING_CONFIG.strategy = ChunkingStrategy.LLM_ENHANCED;
  }
  if (typeof settings.enableContextEnhancement === 'boolean') {
    CHUNKING_CONFIG.enableContextEnhancement = settings.enableContextEnhancement;
  }
  if (typeof settings.enableHybridSearch === 'boolean') {
    RAG_CONFIG.enableHybridSearch = settings.enableHybridSearch;
  }
  if (typeof settings.enableReranking === 'boolean') {
    RAG_CONFIG.enableReranking = settings.enableReranking;
  }
  if (typeof settings.enableCRAG === 'boolean') {
    RAG_CONFIG.enableCRAG = settings.enableCRAG;
  }
  console.log('[Settings] 已加载保存的设置:', {
    reranking: RAG_CONFIG.enableReranking,
    hybrid: RAG_CONFIG.enableHybridSearch,
    crag: RAG_CONFIG.enableCRAG,
  });
};
