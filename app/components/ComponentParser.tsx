import type React from 'react';
import WeatherCard from './WeatherCard';
import type { WeatherCardProps } from './WeatherCard';

// 支持的组件类型
type ComponentType = 'weather';

/**
 * 渲染工具调用组件
 * 
 * 【最佳实践】直接使用结构化数据：
 * 1. LLM 返回 tool_calls（结构化 JSON）
 * 2. 后端直接传递工具调用数据（无需转换为字符串）
 * 3. 前端接收结构化数据并渲染组件（无需正则解析）
 * 
 * 这避免了 "结构化 → 字符串 → 正则解析 → 结构化" 的循环
 * 
 * @param componentType 组件类型（如 'weather'）
 * @param props 组件参数（结构化对象）
 * @param key React key
 * @returns React 组件
 */
export const renderComponent = (
  componentType: string,
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

export type { ComponentType };
