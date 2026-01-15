import React, { memo, useCallback } from 'react';
import { Card, Space, Typography, Button, message as antdMessage, Popover, Tag } from 'antd';
import { RobotOutlined, UserOutlined, CopyOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { renderComponent } from './ComponentParser';
import { colors } from '../theme/colors';
import type { Message, ToolCall } from '../types';
import { MESSAGES, UI_CONSTANTS } from '../constants';
import './MessageItem.css';

const { Text } = Typography;

interface MessageItemProps {
  message: Message;
  isStreaming?: boolean;
}

const AssistantContent: React.FC<{
  content: string;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
}> = memo(({ content, toolCalls, isStreaming }) => (
  <div className={`assistant-content ${isStreaming ? 'streaming-active' : ''}`}>
    <div className="markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
    {toolCalls?.map((toolCall, idx) => renderComponent(toolCall.name, toolCall.args, idx))}
  </div>
));

AssistantContent.displayName = 'AssistantContent';

/**
 * 单条消息组件
 * 展示用户或助手的消息，包含参考来源
 * 助手消息支持 Markdown 和自定义组件渲染
 */
const MessageItem: React.FC<MessageItemProps> = memo(({ message, isStreaming }) => {
  const isUser = message.role === 'user';

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(message.content)
      .then(() => antdMessage.success(MESSAGES.COPY.SUCCESS))
      .catch(() => antdMessage.error(MESSAGES.COPY.ERROR));
  }, [message.content]);

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 12,
      }}
    >
      <Card
        size="small"
        style={{
          maxWidth: UI_CONSTANTS.MAX_MESSAGE_WIDTH,
          background: isUser ? colors.gradient.user : colors.background.overlay, // 毛玻璃背景
          border: isUser ? 'none' : `1px solid ${colors.border.light}`,
          color: isUser ? colors.text.dark : colors.text.primary,
          backdropFilter: 'blur(10px)',
        }}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Space align="start">
            {!isUser && <RobotOutlined style={{ color: colors.primary, fontSize: 16 }} />}

            {/* 用户消息直接显示，助手消息使用混合渲染 */}
            {isUser ? (
              <Text style={{ color: '#fff', whiteSpace: 'pre-wrap' }}>{message.content}</Text>
            ) : (
              <AssistantContent
                content={message.content}
                toolCalls={message.toolCalls}
                isStreaming={isStreaming} // 通过父组件属性传递
              />
            )}

            {isUser && <UserOutlined style={{ color: '#fff', fontSize: 16 }} />}
          </Space>

          {/* 参考来源 - 交互式卡片 */}
          {message.sources && message.sources.length > 0 && (
            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: `1px solid ${colors.background.code}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <Text type="secondary" style={{ fontSize: 12, color: colors.text.muted }}>
                参考 {message.sources.length} 个文档片段:
              </Text>

              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  overflowX: 'auto',
                  paddingBottom: 4,
                  scrollbarWidth: 'none', // 隐藏滚动条以保持界面整洁
                }}
              >
                {message.sources.map((s, idx) => (
                  <Popover
                    key={idx}
                    title={
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Text strong style={{ color: colors.primary }}>
                          [{idx + 1}] {s.source.split('/').pop()}
                        </Text>
                        {s.score && (
                          <Tag color="blue" variant="filled">
                            {(1 - s.score).toFixed(2)}
                          </Tag>
                        )}
                      </div>
                    }
                    content={
                      <div style={{ maxWidth: 300, maxHeight: 400, overflow: 'auto' }}>
                        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
                          {s.content}
                        </Text>
                      </div>
                    }
                    overlayInnerStyle={{
                      background: 'rgba(10, 15, 30, 0.95)',
                      backdropFilter: 'blur(10px)',
                      border: `1px solid ${colors.border.light}`,
                    }}
                  >
                    <div
                      style={{
                        minWidth: 120,
                        maxWidth: 160,
                        padding: '8px 12px',
                        background: colors.background.overlay,
                        border: `1px solid ${colors.border.light}`,
                        borderRadius: 8,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        fontSize: 12,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = colors.background.hover.primary;
                        e.currentTarget.style.borderColor = colors.primary;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = colors.background.overlay;
                        e.currentTarget.style.borderColor = colors.border.light;
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                        <span className="tech-citation" style={{ marginRight: 6 }}>
                          {idx + 1}
                        </span>
                        <Text ellipsis style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
                          {s.source.split('/').pop()}
                        </Text>
                      </div>
                      <Text
                        ellipsis
                        style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, display: 'block' }}
                      >
                        {s.content.substring(0, 30)}...
                      </Text>
                    </div>
                  </Popover>
                ))}
              </div>
            </div>
          )}

          {/* 复制按钮 - 放在底部 */}
          {!isUser && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={handleCopy}
                style={{
                  color: colors.text.muted,
                  fontSize: '12px',
                }}
                title="复制回答"
              >
                复制
              </Button>
            </div>
          )}
        </Space>
      </Card>
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

export default MessageItem;
export type { Message, ToolCall };
