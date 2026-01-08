import React from 'react';
import { Card, Space, Typography, Collapse, Button, message as antdMessage } from 'antd';
import { RobotOutlined, UserOutlined, CopyOutlined } from '@ant-design/icons';
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

  // 复制消息内容
  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).then(() => {
      antdMessage.success('已复制到剪贴板');
    }).catch(() => {
      antdMessage.error('复制失败');
    });
  };

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
            ? 'linear-gradient(135deg, #1dd1f7 0%, #2563eb 100%)'
            : 'rgba(255, 255, 255, 0.05)',
          border: isUser ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
          color: isUser ? '#000' : '#fff',
        }}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Space align="start">
            {!isUser && <RobotOutlined style={{ color: '#1dd1f7', fontSize: 16 }} />}
            
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
                参考来源 ({message.sources.length} 个分块):
              </Text>
              <Collapse 
                ghost 
                size="small"
                style={{ 
                  background: 'transparent',
                  border: 'none'
                }}
                items={message.sources.map((s, idx) => ({
                  key: idx,
                  label: (
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                      分块 {idx + 1}: {s.source.split('/').pop()}
                      {s.score && (
                        <span style={{ marginLeft: 8, color: '#1dd1f7' }}>
                          相似度: {(1 - s.score).toFixed(3)}
                        </span>
                      )}
                    </Text>
                  ),
                  style: {
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  },
                  children: (
                    <div style={{
                      background: 'rgba(0,0,0,0.2)',
                      padding: '8px 12px',
                      borderRadius: 4,
                      maxHeight: 200,
                      overflow: 'auto'
                    }}>
                      <Text style={{ 
                        color: 'rgba(255,255,255,0.7)', 
                        fontSize: 11,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                      }}>
                        {s.content}
                      </Text>
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>
                          字符数: {s.content.length}
                        </Text>
                      </div>
                    </div>
                  ),
                }))}
              />
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
                  color: 'rgba(255,255,255,0.5)',
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
};

export default MessageItem;
export type { Message, MessageSource, ToolCall };

