import React, { useState, useEffect, useRef } from 'react';
import {
  Layout,
  Input,
  Button,
  Card,
  Space,
  Typography,
  Select,
  Badge,
  Spin,
  message,
  Empty,
} from 'antd';
import {
  FolderOpenOutlined,
  SendOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  RobotOutlined,
  UserOutlined,
  BookOutlined,
} from '@ant-design/icons';

const { Header, Content } = Layout;
const { Text, Title } = Typography;
const { TextArea } = Input;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Status {
  isWatching: boolean;
  watchPath: string;
  documentCount: number;
}

const App: React.FC = () => {
  const [status, setStatus] = useState<Status>({
    isWatching: false,
    watchPath: '',
    documentCount: 0,
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState('deepseek');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 初始化获取状态
  useEffect(() => {
    refreshStatus();
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const refreshStatus = async () => {
    try {
      const result = await window.electronAPI.getStatus();
      setStatus(result);
    } catch (error) {
      console.error('获取状态失败:', error);
    }
  };

  // 选择文件夹
  const handleSelectFolder = async () => {
    const folderPath = await window.electronAPI.selectFolder();
    if (folderPath) {
      const result = await window.electronAPI.startWatch(folderPath);
      if (result.success) {
        message.success(`已开始监听: ${folderPath}`);
        refreshStatus();
      } else {
        message.error(`监听失败: ${result.error}`);
      }
    }
  };

  // 停止监听
  const handleStopWatch = async () => {
    await window.electronAPI.stopWatch();
    message.info('已停止监听');
    refreshStatus();
  };

  // 发送查询
  const handleSend = async () => {
    if (!input.trim()) return;

    const question = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setLoading(true);

    try {
      const result = await window.electronAPI.query(question, provider);
      if (result.success) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: result.answer! },
        ]);
      } else {
        message.error(`查询失败: ${result.error}`);
      }
    } catch (error: any) {
      message.error(`查询出错: ${error.message}`);
    } finally {
      setLoading(false);
      refreshStatus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Layout style={{ height: '100vh', background: '#1a1a2e' }}>
      {/* 顶部栏 */}
      <Header
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #2d2d44',
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}
      >
        <Space>
          <BookOutlined style={{ fontSize: 24, color: '#6366f1' }} />
          <Title level={4} style={{ margin: 0, color: '#fff' }}>
            本地知识库
          </Title>
        </Space>

        <Space style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Badge
            status={status.isWatching ? 'success' : 'default'}
            text={
              <Text style={{ color: '#a0a0a0' }}>
                {status.isWatching
                  ? `监听中: ${status.watchPath.split('/').pop()}`
                  : '未监听'}
              </Text>
            }
          />
          <Text style={{ color: '#6366f1' }}>
            {status.documentCount} 文档块
          </Text>
        </Space>
      </Header>

      {/* 主内容区 */}
      <Content
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
          overflow: 'hidden',
        }}
      >
        {/* 控制栏 */}
        <Card
          size="small"
          style={{
            marginBottom: 16,
            background: '#16213e',
            border: '1px solid #2d2d44',
          }}
        >
          <Space wrap>
            {!status.isWatching ? (
              <Button
                type="primary"
                icon={<FolderOpenOutlined />}
                onClick={handleSelectFolder}
              >
                选择知识库文件夹
              </Button>
            ) : (
              <Button
                danger
                icon={<PauseCircleOutlined />}
                onClick={handleStopWatch}
              >
                停止监听
              </Button>
            )}
            <Select
              value={provider}
              onChange={setProvider}
              style={{ width: 140 }}
              options={[
                { value: 'deepseek', label: 'DeepSeek' },
                { value: 'gemini', label: 'Gemini' },
              ]}
            />
          </Space>
        </Card>

        {/* 对话区域 */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            marginBottom: 16,
            padding: '8px 0',
          }}
        >
          {messages.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <Text style={{ color: '#666' }}>
                  选择知识库文件夹，然后开始提问
                </Text>
              }
              style={{ marginTop: 100 }}
            />
          ) : (
            messages.map((msg, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  justifyContent:
                    msg.role === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: 12,
                }}
              >
                <Card
                  size="small"
                  style={{
                    maxWidth: '75%',
                    background:
                      msg.role === 'user'
                        ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                        : '#16213e',
                    border:
                      msg.role === 'user' ? 'none' : '1px solid #2d2d44',
                  }}
                >
                  <Space align="start">
                    {msg.role === 'assistant' && (
                      <RobotOutlined
                        style={{ color: '#6366f1', fontSize: 16 }}
                      />
                    )}
                    <Text
                      style={{
                        color: '#fff',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {msg.content}
                    </Text>
                    {msg.role === 'user' && (
                      <UserOutlined style={{ color: '#fff', fontSize: 16 }} />
                    )}
                  </Space>
                </Card>
              </div>
            ))
          )}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <Card
                size="small"
                style={{
                  background: '#16213e',
                  border: '1px solid #2d2d44',
                }}
              >
                <Space>
                  <Spin size="small" />
                  <Text style={{ color: '#a0a0a0' }}>思考中...</Text>
                </Space>
              </Card>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入区域 */}
        <Card
          size="small"
          style={{
            background: '#16213e',
            border: '1px solid #2d2d44',
          }}
        >
          <Space.Compact style={{ width: '100%' }}>
            <TextArea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的问题，按 Enter 发送..."
              autoSize={{ minRows: 1, maxRows: 4 }}
              style={{ resize: 'none' }}
              disabled={loading}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={loading}
              disabled={!input.trim()}
            >
              发送
            </Button>
          </Space.Compact>
        </Card>
      </Content>
    </Layout>
  );
};

export default App;
