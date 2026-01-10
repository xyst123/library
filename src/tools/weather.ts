import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * 天气卡片工具 - 用于在回答中显示天气信息
 */
export const weatherCardTool = new DynamicStructuredTool({
  name: 'show_weather_card',
  description:
    '当用户询问天气相关问题时，调用此工具显示天气卡片。需要提供城市名称、温度、天气状况和图标代码。',
  schema: z.object({
    city: z.string().describe('城市名称'),
    temp: z.number().describe('温度（摄氏度）'),
    condition: z.string().describe('天气状况描述，如：晴、多云、雨、雪'),
    icon: z
      .enum(['sunny', 'cloudy', 'rain', 'snow', 'thunder', 'fog', 'wind', 'partlyCloudy'])
      .describe(
        '天气图标代码：sunny(晴), cloudy(多云), rain(雨), snow(雪), thunder(雷), fog(雾), wind(风), partlyCloudy(少云)'
      ),
  }),
  func: async ({ city, temp, condition }) => {
    // 返回格式化的天气信息（供 LLM 知晓工具已调用）
    // 注意：icon 参数会被传递到前端组件，这里不需要使用
    return `已显示${city}的天气卡片：${condition}，温度${temp}°C`;
  },
});
