import type React from 'react';
import WeatherCard from './WeatherCard';
import type { WeatherCardProps } from './WeatherCard';

// 支持的组件类型
type ComponentType = 'weather';

// 解析结果
interface ParsedContent {
  type: 'text' | 'component';
  content?: string;
  componentType?: ComponentType;
  props?: Record<string, unknown>;
}

// 组件标记正则: <!-- COMPONENT:type {...} -->
const COMPONENT_REGEX = /<!--\s*COMPONENT:(\w+)\s+(\{[^}]+\})\s*-->/g;

/**
 * 解析消息内容，提取组件标记
 * @param content 原始消息内容
 * @returns 解析后的内容数组
 */
export const parseContent = (content: string): ParsedContent[] => {
  const results: ParsedContent[] = [];
  let lastIndex = 0;

  // 重置正则 lastIndex
  COMPONENT_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = COMPONENT_REGEX.exec(content)) !== null) {
    // 添加组件前的文本
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim();
      if (text) {
        results.push({ type: 'text', content: text });
      }
    }

    // 解析组件
    try {
      const componentType = match[1] as ComponentType;
      const props = JSON.parse(match[2]);
      results.push({ type: 'component', componentType, props });
    } catch (e) {
      // JSON 解析失败，作为普通文本处理
      console.warn('[ComponentParser] JSON 解析失败:', match[2]);
    }

    lastIndex = match.index + match[0].length;
  }

  // 添加剩余文本
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex).trim();
    if (text) {
      results.push({ type: 'text', content: text });
    }
  }

  // 如果没有找到任何组件，返回原始内容
  if (results.length === 0) {
    results.push({ type: 'text', content });
  }

  return results;
}

/**
 * 渲染组件
 */
export const renderComponent = (
  componentType: ComponentType,
  props: Record<string, unknown>,
  key: number
): React.ReactNode => {
  switch (componentType) {
    case 'weather':
      return <WeatherCard key={key} {...(props as unknown as WeatherCardProps)} />;
    default:
      return null;
  }
};

export type { ParsedContent, ComponentType };
