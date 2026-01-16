import React, { memo, useCallback } from 'react';
import {
  Card,
  Space,
  Typography,
  Button,
  message as antdMessage,
  Popover,
  Tag,
  Avatar,
  Spin,
} from 'antd';
import { RobotOutlined, UserOutlined, CopyOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { renderComponent } from '@/components/ComponentParser';
import { colors } from '@/theme/colors';
import type { Message, ToolCall } from '@/types';
import { MESSAGES, UI_CONSTANTS } from '@/constants';
import '@/components/MessageItem.css';

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
      {/* Avatar - Left for Assistant */}
      {!isUser && (
        <Avatar
          className="interactive-icon interactive-avatar"
          icon={<RobotOutlined />}
          style={{
            marginRight: 12,
            marginTop: 4,
            flexShrink: 0,
            // backgroundColor removed to let CSS handle transparent -> hover color
          }}
        />
      )}

      <Card
        size="small"
        className="message-card"
        style={{
          maxWidth: isUser ? UI_CONSTANTS.MAX_MESSAGE_WIDTH : undefined,
          flex: isUser ? undefined : 1,
          minWidth: 0, // Prevent flex item from overflowing container when content is wide
          marginRight: isUser ? 0 : 44, // Align with User bubble (Avatar 32 + Margin 12)
          background: isUser
            ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.15) 100%)'
            : 'rgba(10, 15, 30, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          color: colors.text.primary,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: isUser ? '4px 0px 4px 4px' : '0px 4px 4px 4px',
          boxShadow: isUser ? '0 2px 8px rgba(0, 0, 0, 0.2)' : '0 2px 12px rgba(0, 243, 255, 0.15)',
        }}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Space align="start">
            {/* 用户消息直接显示，助手消息使用混合渲染 */}
            {isUser ? (
              <Text style={{ color: '#fff', whiteSpace: 'pre-wrap' }}>{message.content}</Text>
            ) : isStreaming &&
              !message.content &&
              (!message.toolCalls || message.toolCalls.length === 0) ? (
              <Space>
                <Spin size="small" />
                <Text style={{ color: colors.text.secondary }}>AI 正在思考...</Text>
              </Space>
            ) : (
              <AssistantContent
                content={message.content}
                toolCalls={message.toolCalls}
                isStreaming={isStreaming} // 通过父组件属性传递
              />
            )}
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
                        <Text style={{ color: colors.text.primary }}>
                          [{idx + 1}] {s.source.split('/').pop()}
                        </Text>
                        {s.score && (
                          <Tag
                            color="cyan"
                            bordered={false}
                            style={{ background: 'rgba(0, 243, 255, 0.2)', color: colors.primary }}
                          >
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
                      className="interactive-icon"
                      style={{
                        minWidth: 120,
                        maxWidth: 160,
                        padding: '8px 12px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          marginBottom: 4,
                          width: '100%',
                        }}
                      >
                        <span style={{ marginRight: 6, fontSize: 10, color: '#fff' }}>
                          {idx + 1}
                        </span>
                        <Text ellipsis style={{ color: 'inherit', fontSize: 12, flex: 1 }}>
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

      {/* Avatar - Right for User */}
      {isUser && (
        <Avatar
          className="interactive-icon interactive-avatar"
          icon={<UserOutlined />}
          style={{
            marginLeft: 12,
            marginTop: 4,
            flexShrink: 0,
            // Transparent by default via interactive-icon
          }}
        />
      )}
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

export default MessageItem;
export type { Message, ToolCall };
