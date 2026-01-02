import React, { useState, useEffect, useRef } from 'react';
import {
  Layout,
  Button,
  Card,
  Space,
  Typography,
  Select,
  Spin,
  message,
  Empty,
  List,
  Tooltip,
} from 'antd';
import { Sender } from '@ant-design/x';
import {
  UploadOutlined,
  FileTextOutlined,
  DeleteOutlined,
  RobotOutlined,
  UserOutlined,
  BookOutlined,
} from '@ant-design/icons';

const { Header, Content, Sider } = Layout;
const { Text, Title } = Typography;

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{
    source: string;
    content: string;
    score?: number;
  }>;
}

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState('deepseek');
  const [documentCount, setDocumentCount] = useState(0);
  const [fileList, setFileList] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 初始化
  useEffect(() => {
    refreshData();
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const refreshData = async () => {
    try {
      if (!window.electronAPI) return;

      const status = await window.electronAPI.getStatus();
      setDocumentCount(status.documentCount);

      const filesResult = await window.electronAPI.getFileList();
      if (filesResult.success && filesResult.files) {
        setFileList(filesResult.files);
      }
    } catch (error) {
      console.error('刷新数据失败:', error);
    }
  };

  // 上传文件
  const handleUpload = async () => {
    if (!window.electronAPI) return;

    try {
      const filePaths = await window.electronAPI.selectFiles();
      if (filePaths && filePaths.length > 0) {
        setUploading(true);
        message.loading({ content: '正在索引文件...', key: 'uploading' });

        const result = await window.electronAPI.ingestFiles(filePaths);

        if (result.success) {
          message.success({ content: `成功导入 ${filePaths.length} 个文件`, key: 'uploading' });
          await refreshData();
        } else {
          message.error({ content: `导入失败: ${result.error}`, key: 'uploading' });
        }
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = error as any;
      message.error(`操作失败: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  // 删除文件
  const handleDeleteFile = async (filePath: string) => {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.deleteFile(filePath);
      if (result.success) {
        message.success('文件已删除并更新索引');
        await refreshData();
      } else {
        message.error(`删除失败: ${result.error}`);
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = error as any;
      message.error(`操作出错: ${err.message}`);
    }

  };

  // 发送查询
  const handleSend = async () => {
    if (!input.trim()) return;

    const question = input.trim();
    setInput('');
    const newMessages = [...messages, { role: 'user', content: question } as Message];
    setMessages(newMessages);
    setLoading(true);

    try {
      // 准备历史记录 (去除 source 等多余字段，仅保留 role 和 content 给后端)
      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      const result = await window.electronAPI.askQuestion(question, history, provider);
      if (result.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: result.answer!,
            sources: result.sources,
          },
        ]);
      } else {
        message.error(`查询失败: ${result.error}`);
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = error as any;
      message.error(`查询出错: ${err.message}`);
    } finally {
      setLoading(false);
      refreshData();
    }
  };

  return (
    <Layout style={{ height: '100vh', background: '#1a1a2e' }}>
      {/* 顶部栏 */}
      <Header
        style={
          {
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #2d2d44',
            WebkitAppRegion: 'drag',
            zIndex: 10,
          } as React.CSSProperties
        }
      >
        <Space>
          <BookOutlined style={{ fontSize: 24, color: '#6366f1' }} />
          <Title level={4} style={{ margin: 0, color: '#fff' }}>
            本地知识库
          </Title>
        </Space>

        <Space style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Text style={{ color: '#6366f1' }}>{documentCount} 文档块</Text>
        </Space>
      </Header>

      <Layout>
        {/* 左侧边栏 - 文件列表 */}
        <Sider
          width={280}
          style={{
            background: '#16213e',
            borderRight: '1px solid #2d2d44',
            overflow: 'auto',
            height: 'calc(100vh - 64px)', // 头部高度为 64px
          }}
        >
          <div
            style={{
              padding: 16,
              height: '100%',
              backgroundColor: isDragging ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
              transition: 'background-color 0.2s',
              border: isDragging ? '2px dashed #6366f1' : 'none',
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragging(false);
            }}
            onDrop={async (e) => {
              e.preventDefault();
              setIsDragging(false);

              const files = Array.from(e.dataTransfer.files);
              const validFiles = files.filter((f) => {
                const ext = f.name.split('.').pop()?.toLowerCase();
                return ['txt', 'md', 'pdf', 'docx', 'html'].includes(ext || '');
              });

              if (validFiles.length === 0) {
                message.warning('请拖入支持的文件 (.txt, .md, .pdf, .docx, .html)');
                return;
              }

              const paths = validFiles.map((f) => (f as unknown as { path: string }).path); // Electron 在 File 对象上暴露 'path' 属性

              setUploading(true);
              try {
                const res = await window.electronAPI.ingestFiles(paths);
                if (res.success) {
                  message.success(`成功导入 ${paths.length} 个文件`);
                  await refreshData();
                } else {
                  message.error('导入失败: ' + res.error);
                }
              } catch (error) {
                console.error(error);
                message.error('导入发生错误');
              } finally {
                setUploading(false);
              }
            }}
          >
            <Button
              block
              type="primary"
              icon={<UploadOutlined />}
              onClick={handleUpload}
              loading={uploading}
              style={{ marginBottom: 16 }}
            >
              上传文件
            </Button>

            <div style={{ marginBottom: 12 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                知识库列表 ({fileList.length})
              </Text>
            </div>

            <List
              dataSource={fileList}
              renderItem={(item) => (
                <List.Item
                  key={item}
                  actions={[
                    <Tooltip key="delete" title="删除">
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDeleteFile(item)}
                      />
                    </Tooltip>,
                  ]}
                  style={{
                    padding: '8px 0',
                    borderBottom: '1px solid #2d2d44',
                  }}
                >
                  <List.Item.Meta
                    avatar={<FileTextOutlined style={{ color: '#a0a0a0', marginLeft: 8 }} />}
                    title={
                      <Tooltip title={item}>
                        <Text style={{ color: '#e0e0e0', fontSize: 13 }} ellipsis>
                          {item.split('/').pop()}
                        </Text>
                      </Tooltip>
                    }
                  />
                </List.Item>
              )}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={<Text style={{ color: '#666', fontSize: 12 }}>暂无文件</Text>}
                  />
                ),
              }}
            />
          </div>
        </Sider>

        {/* 主内容区 - 聊天 */}
        <Content
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '16px',
            position: 'relative',
          }}
        >
          {/* 顶部 Provider 选择 */}
          <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 5 }}>
            <Select
              value={provider}
              onChange={setProvider}
              style={{ width: 120 }}
              options={[
                { value: 'deepseek', label: 'DeepSeek' },
                { value: 'gemini', label: 'Gemini' },
              ]}
              variant="filled"
            />
          </div>

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
                  <Text style={{ color: '#666' }}>在左侧上传文档，然后在这里开始提问</Text>
                }
                style={{ marginTop: 100 }}
              />
            ) : (
              messages.map((msg, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
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
                      border: msg.role === 'user' ? 'none' : '1px solid #2d2d44',
                    }}
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Space align="start">
                        {msg.role === 'assistant' && (
                          <RobotOutlined style={{ color: '#6366f1', fontSize: 16 }} />
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
                      {msg.sources && msg.sources.length > 0 && (
                        <div
                          style={{
                            marginTop: 8,
                            paddingTop: 8,
                            borderTop: '1px solid rgba(255,255,255,0.1)',
                          }}
                        >
                          <Text
                            type="secondary"
                            style={{ fontSize: 12, display: 'block', marginBottom: 4 }}
                          >
                            参考来源:
                          </Text>
                          <ul style={{ paddingLeft: 16, margin: 0 }}>
                            {msg.sources.map((s, idx) => (
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
          <div style={{ padding: '0 16px' }}>
            <Sender
              value={input}
              onChange={setInput}
              onSubmit={() => {
                handleSend();
              }}
              loading={loading}
              placeholder="输入你的问题，按 Enter 发送..."
              style={{ width: '100%' }}
            />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
