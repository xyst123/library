import type React from 'react';
import { Card, Space, Typography } from 'antd';
import { RobotOutlined, UserOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { renderComponent } from './ComponentParser';
import './MessageItem.css';

const { Text } = Typography;

interface MessageSource {
  source: string;
  content: string;
  score?: number;
}

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: MessageSource[];
  toolCalls?: ToolCall[];
}

interface MessageItemProps {
  /** 消息对象 */
  message: Message;
}

/**
 * 渲染助手消息内容
 * 支持 Markdown 文本和结构化工具调用（无需正则解析）
 */
const AssistantContent: React.FC<{ content: string; toolCalls?: ToolCall[] }> = ({ 
  content, 
  toolCalls 
}) => {
  return (
    <div className="assistant-content">
      {/* 渲染文本内容 */}
      <div className="markdown-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>
      
      {/* 渲染工具调用组件（直接使用结构化数据，不需要正则） */}
      {toolCalls && toolCalls.map((toolCall, idx) => 
        renderComponent(toolCall.name, toolCall.args, idx)
      )}
    </div>
  );
};

/**
 * 单条消息组件
 * 展示用户或助手的消息，包含参考来源
 * 助手消息支持 Markdown 和自定义组件渲染
 */
const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const isUser = message.role === 'user';

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
          maxWidth: '75%',
          background: isUser
            ? 'linear-gradient(135deg, #00f3ff 0%, #2563eb 100%)'
            : 'rgba(255, 255, 255, 0.05)',
          border: isUser ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
          color: isUser ? '#000' : '#fff',
        }}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Space align="start">
            {!isUser && <RobotOutlined style={{ color: '#00f3ff', fontSize: 16 }} />}
            
            {/* 用户消息直接显示，助手消息使用混合渲染 */}
            {isUser ? (
              <Text style={{ color: '#fff', whiteSpace: 'pre-wrap' }}>
                {message.content}
              </Text>
            ) : (
              <AssistantContent content={message.content} toolCalls={message.toolCalls} />
            )}
            
            {isUser && <UserOutlined style={{ color: '#fff', fontSize: 16 }} />}
          </Space>

          {/* 参考来源 */}
          {message.sources && message.sources.length > 0 && (
            <div
              style={{
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                参考来源:
              </Text>
              <ul style={{ paddingLeft: 16, margin: 0 }}>
                {message.sources.map((s, idx) => (
                  <li key={idx}>
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>
                      {s.source.split('/').pop()}
                      {s.score && (
                        <span style={{ marginLeft: 4, opacity: 0.5 }}>
                          ({(1 - s.score).toFixed(2)})
                        </span>
                      )}
                    </Text>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Space>
      </Card>
    </div>
  );
};

export default MessageItem;
export type { Message, MessageSource, ToolCall };

