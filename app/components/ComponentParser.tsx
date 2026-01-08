import type React from 'react';
import WeatherCard from './WeatherCard';
import type { WeatherCardProps } from './WeatherCard';

type ComponentType = 'weather';

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
