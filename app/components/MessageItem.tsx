import type React from 'react';
import { Card, Space, Typography } from 'antd';
import { RobotOutlined, UserOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './MessageItem.css';

const { Text } = Typography;

interface MessageSource {
  source: string;
  content: string;
  score?: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: MessageSource[];
}

interface MessageItemProps {
  /** 消息对象 */
  message: Message;
}

/**
 * 单条消息组件
 * 展示用户或助手的消息，包含参考来源
 * 助手消息支持 Markdown 渲染
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
            
            {/* 用户消息直接显示，助手消息使用 Markdown 渲染 */}
            {isUser ? (
              <Text style={{ color: '#fff', whiteSpace: 'pre-wrap' }}>
                {message.content}
              </Text>
            ) : (
              <div className="markdown-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
              </div>
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
export type { Message, MessageSource };
