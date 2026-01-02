import { useState, useEffect, useRef } from 'react';
import type React from 'react';
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
  Tooltip,
  Popconfirm,
} from 'antd';
import { Sender } from '@ant-design/x';
import {
  UploadOutlined,
  FileTextOutlined,
  DeleteOutlined,
  RobotOutlined,
  UserOutlined,
  ReadOutlined,
  ClearOutlined,
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

  useEffect(() => {
    refreshData();
  }, []);

  // 自动滚动

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

  const loadHistory = async () => {
    if (!window.electronAPI) return;
    try {
      const res = await window.electronAPI.getHistory();
      if (res.success && res.history) {
        setMessages(res.history);
      }
    } catch (e) {
      console.error('加载历史失败:', e);
    }
  };

  useEffect(() => {
    refreshData();
    loadHistory();

    // 监听流式事件
    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeListener('answer-start');
        window.electronAPI.removeListener('answer-chunk');
        window.electronAPI.removeListener('ingest-progress');
      }
    };
  }, []);

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

  const handleClearHistory = async () => {
    if (!window.electronAPI) return;
    await window.electronAPI.clearHistory();
    setMessages([]);
    message.success('对话历史已清空');
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const question = input.trim();
    setInput('');
    // 为用户提供乐观 UI
    const newMessages = [...messages, { role: 'user', content: question } as Message];
    setMessages(newMessages);
    setLoading(true);

    // 保存用户历史记录
    try {
      if (window.electronAPI) await window.electronAPI.addHistory('user', question);
    } catch (e) {
      /* 忽略 */
    }

    // 助手消息占位符
    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages((prev) => [...prev, assistantMsg]);

    // 实际上，只要我们进行清理，就可以在这里注册一次性侦听器
    // 但 React 严格模式可能会重复调用。
    // 更好：使用 ref 跟踪我们是否正在流式传输并附加到当前消息。

    if (!window.electronAPI) return;

    const handleAnswerStart = (_event: unknown, data: { sources: Message['sources'] }) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last.role === 'assistant') {
          return [...prev.slice(0, -1), { ...last, sources: data.sources }];
        }
        return prev;
      });
    };

    // 监听回答片段
    // handleSend 设置“正在接收”状态。
    const onChunk = (_event: unknown, msg: { chunk: string }) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last.role === 'assistant') {
          return [...prev.slice(0, -1), { ...last, content: last.content + msg.chunk }];
        }
        return prev;
      });
    };

    window.electronAPI.onAnswerStart(handleAnswerStart);
    window.electronAPI.onAnswerChunk(onChunk);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      const result = await window.electronAPI.askQuestion(question, history, provider);

      window.electronAPI.removeListener('answer-start');
      window.electronAPI.removeListener('answer-chunk');

      if (result.success) {
        // 最终一致性检查 (确保保存完整答案)
        // result.answer 包含全文。
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last.role === 'assistant') {
            return [
              ...prev.slice(0, -1),
              { ...last, content: result.answer!, sources: result.sources },
            ];
          }
          return prev;
        });

        await window.electronAPI.addHistory('assistant', result.answer!);
      } else {
        message.error(`查询失败: ${result.error}`);
        // 失败是否删除空的助手消息？或者显示错误。
      }
    } catch (error: unknown) {
      const err = error as Error;
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
        <Space style={{ WebkitAppRegion: 'no-drag', marginLeft:'auto' } as React.CSSProperties}>
          <Select
            value={provider}
            onChange={setProvider}
            style={{ width: 120, marginRight: 8 }}
            options={[
              { value: 'deepseek', label: 'DeepSeek' },
              { value: 'gemini', label: 'Gemini' },
            ]}
          />
          <Text style={{ color: '#6366f1' }}>{documentCount} 文档块</Text>
          <Popconfirm
            title="确认清空对话历史？"
            onConfirm={handleClearHistory}
            okText="是"
            cancelText="否"
          >
            <Button
              type="text"
              icon={<ClearOutlined style={{ color: '#a0a0a0' }} />}
              title="清空历史"
            />
          </Popconfirm>
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

            {fileList.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<Text style={{ color: '#666', fontSize: 12 }}>暂无文件</Text>}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {fileList.map((item) => (
                  <div
                    key={item}
                    style={{
                      padding: '8px 0',
                      borderBottom: '1px solid #2d2d44',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        overflow: 'hidden',
                        flex: 1,
                        marginRight: 8,
                      }}
                    >
                      <FileTextOutlined
                        style={{ color: '#a0a0a0', marginLeft: 8, marginRight: 8, flexShrink: 0 }}
                      />
                      <Tooltip title={item}>
                        <Text style={{ color: '#e0e0e0', fontSize: 13 }} ellipsis>
                          {item.split('/').pop()}
                        </Text>
                      </Tooltip>
                    </div>
                    <Tooltip title="删除">
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDeleteFile(item)}
                      />
                    </Tooltip>
                  </div>
                ))}
              </div>
            )}
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
                    <Space orientation="vertical" style={{ width: '100%' }}>
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
