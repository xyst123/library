import { useState, useEffect, useRef } from 'react';
import type React from 'react';
import { Layout, Button, Card, Space, Typography, Select, Spin, message, Empty, Popconfirm } from 'antd';
import { Sender } from '@ant-design/x';
import { ClearOutlined } from '@ant-design/icons';
import { FileList, MessageItem } from './components';
import type { Message } from './components';

const { Header, Content, Sider } = Layout;
const { Text } = Typography;

const App: React.FC = () => {
  // 状态管理
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState('deepseek');
  const [documentCount, setDocumentCount] = useState(0);
  const [fileList, setFileList] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 刷新数据
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

  // 加载历史记录
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

  // 初始化
  useEffect(() => {
    refreshData();
    loadHistory();

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeListener('answer-start');
        window.electronAPI.removeListener('answer-chunk');
        window.electronAPI.removeListener('ingest-progress');
      }
    };
  }, []);

  // 上传文件
  const handleUpload = async () => {
    if (!window.electronAPI) return;

    try {
      const filePaths = await window.electronAPI.selectFiles();
      if (filePaths && filePaths.length > 0) {
        await ingestFiles(filePaths);
      }
    } catch (error: unknown) {
      const err = error as Error;
      message.error(`操作失败: ${err.message}`);
    }
  };

  // 导入文件（供拖放和上传共用）
  const ingestFiles = async (paths: string[]) => {
    if (!window.electronAPI) return;
    setUploading(true);
    message.loading({ content: '正在索引文件...', key: 'uploading' });

    try {
      const result = await window.electronAPI.ingestFiles(paths);
      if (result.success) {
        message.success({ content: `成功导入 ${paths.length} 个文件`, key: 'uploading' });
        await refreshData();
      } else {
        message.error({ content: `导入失败: ${result.error}`, key: 'uploading' });
      }
    } catch (error: unknown) {
      const err = error as Error;
      message.error(`导入发生错误: ${err.message}`);
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
    } catch (error: unknown) {
      const err = error as Error;
      message.error(`操作出错: ${err.message}`);
    }
  };

  // 清空历史
  const handleClearHistory = async () => {
    if (!window.electronAPI) return;
    await window.electronAPI.clearHistory();
    setMessages([]);
    message.success('对话历史已清空');
  };

  // 发送消息
  const handleSend = async () => {
    if (!input.trim()) return;

    const question = input.trim();
    setInput('');
    const newMessages = [...messages, { role: 'user', content: question } as Message];
    setMessages(newMessages);
    setLoading(true);

    // 保存用户历史记录
    try {
      if (window.electronAPI) await window.electronAPI.addHistory('user', question);
    } catch {
      /* 忽略 */
    }

    // 助手消息占位符
    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages((prev) => [...prev, assistantMsg]);

    if (!window.electronAPI) return;

    // 监听流式事件
    const handleAnswerStart = (_event: unknown, data: { sources: Message['sources'] }) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last.role === 'assistant') {
          return [...prev.slice(0, -1), { ...last, sources: data.sources }];
        }
        return prev;
      });
    };

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
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last.role === 'assistant') {
            return [...prev.slice(0, -1), { ...last, content: result.answer!, sources: result.sources }];
          }
          return prev;
        });

        await window.electronAPI.addHistory('assistant', result.answer!);
      } else {
        message.error(`查询失败: ${result.error}`);
      }
    } catch (error: unknown) {
      const err = error as Error;
      message.error(`查询出错: ${err.message}`);
    } finally {
      setLoading(false);
      refreshData();
    }
  };

  // 停止生成
  const handleStop = async () => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.stopGeneration();
      setLoading(false);
      message.info('已停止生成');
    } catch (error) {
      console.error('停止失败:', error);
    }
  };

  // 处理拖放文件
  const handleFilesDropped = async (paths: string[]) => {
    if (paths.length === 0) {
      message.warning('请拖入支持的文件 (.txt, .md, .pdf, .docx, .html)');
      return;
    }
    await ingestFiles(paths);
  };

  return (
    <Layout className="tech-layout-bg" style={{ height: '100vh' }}>
      {/* 顶部栏 */}
      <Header
        className="tech-header"
        style={{
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          WebkitAppRegion: 'drag',
          zIndex: 10,
        } as React.CSSProperties}
      >
        <Space style={{ WebkitAppRegion: 'no-drag', marginLeft: 'auto' } as React.CSSProperties}>
          <Select
            value={provider}
            onChange={setProvider}
            style={{ width: 120, marginRight: 8 }}
            options={[
              { value: 'deepseek', label: 'DeepSeek' },
              { value: 'gemini', label: 'Gemini' },
            ]}
          />
          <Text className="tech-text-primary" style={{ fontWeight: 'bold' }}>
            {documentCount} 文档块
          </Text>
          <Popconfirm title="确认清空对话历史？" onConfirm={handleClearHistory} okText="是" cancelText="否">
            <Button type="text" icon={<ClearOutlined style={{ color: '#a0a0a0' }} />} title="清空历史" />
          </Popconfirm>
        </Space>
      </Header>

      <Layout className="tech-layout-bg">
        {/* 左侧边栏 - 文件列表 */}
        <Sider
          width={280}
          className="tech-sider"
          style={{
            overflow: 'auto',
            height: 'calc(100vh - 64px)',
          }}
        >
          <FileList
            fileList={fileList}
            uploading={uploading}
            isDragging={isDragging}
            onUpload={handleUpload}
            onDelete={handleDeleteFile}
            onDragStateChange={setIsDragging}
            onFilesDropped={handleFilesDropped}
          />
        </Sider>

        {/* 主内容区 - 聊天 */}
        <Content
          className="tech-content"
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
                description={<Text style={{ color: '#666' }}>在左侧上传文档，然后在这里开始提问</Text>}
                style={{ marginTop: 100 }}
              />
            ) : (
              messages.map((msg, index) => <MessageItem key={index} message={msg} />)
            )}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <Card
                  size="small"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
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
              className="tech-sender"
              value={input}
              onChange={setInput}
              onSubmit={() => {
                handleSend();
              }}
              onCancel={handleStop}
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
