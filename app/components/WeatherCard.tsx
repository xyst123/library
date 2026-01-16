import type React from 'react';
import { Card, Space, Typography } from 'antd';
import { colors } from '@/theme/colors';
import './WeatherCard.css';

const { Text, Title } = Typography;

interface WeatherCardProps {
  city: string;
  temp: number;
  condition: string;
  icon: string;
}

// 天气图标映射
const weatherIcons: Record<string, string> = {
  sunny: '☀️',
  cloudy: '☁️',
  rain: '🌧️',
  snow: '❄️',
  thunder: '⛈️',
  fog: '🌫️',
  wind: '💨',
  partlyCloudy: '⛅',
};

/**
 * 天气卡片组件
 * 展示城市天气信息，包含温度、天气状况和图标
 */
const WeatherCard: React.FC<WeatherCardProps> = ({ city, temp, condition, icon }) => {
  const weatherIcon = weatherIcons[icon] || '🌤️';

  return (
    <Card className="weather-card" size="small">
      <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {city}
          </Text>
          <Title level={3} style={{ margin: 0, color: colors.text.primary }}>
            {temp}°C
          </Title>
          <Text style={{ color: 'rgba(255,255,255,0.8)' }}>{condition}</Text>
        </div>
        <div className="weather-icon">{weatherIcon}</div>
      </Space>
    </Card>
  );
};

export default WeatherCard;
export type { WeatherCardProps };
