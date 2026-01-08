import { useState, useEffect, useRef } from 'react';
import type React from 'react';
import {
  Layout,
  Button,
  Card,
  Space,
  Typography,
  Spin,
  App as AntApp,
  Empty,
  Popconfirm,
} from 'antd';
import { Sender } from '@ant-design/x';
import { ClearOutlined, SettingOutlined } from '@ant-design/icons';
import { FileList, MessageItem, Settings } from './components';
import { useChat } from './hooks';
import { colors } from './theme/colors';

const { Header, Content, Sider } = Layout;
const { Text } = Typography;

const AppContent: React.FC = () => {
  const { message } = AntApp.useApp();

  // 聊天相关（使用 useChat hook）
  const [provider, setProvider] = useState('deepseek');
  const { messages, loading, sendMessage, clearHistory, loadHistory, stopGeneration } = useChat({
    provider,
  });

  // 设置
  const [settingsVisible, setSettingsVisible] = useState(false);

  // 其他状态
  const [input, setInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [documentCount, setDocumentCount] = useState(0);
  const [fileList, setFileList] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const refreshData = async () => {
    if (!window.electronAPI) return;
    try {
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

  // 初始化
  useEffect(() => {
    refreshData();
    loadHistory();

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeListener('ingest-progress');
      }
    };
  }, [loadHistory]);

  const handleUpload = async () => {
    if (!window.electronAPI) return;
    try {
      const filePaths = await window.electronAPI.selectFiles();
      if (filePaths && filePaths.length > 0) {
        await ingestFiles(filePaths);
      }
    } catch (error: unknown) {
      message.error(`操作失败: ${(error as Error).message}`);
    }
  };

  const ingestFiles = async (paths: string[]) => {
    if (!window.electronAPI) return;
    setUploading(true);
    message.loading({ content: '正在索引文件...', key: 'uploading' });

    try {
      const result = await window.electronAPI.ingestFiles(paths);
      message[result.success ? 'success' : 'error']({
        content: result.success ? `成功导入 ${paths.length} 个文件` : `导入失败: ${result.error}`,
        key: 'uploading'
      });
      if (result.success) await refreshData();
    } catch (error: unknown) {
      message.error(`导入发生错误: ${(error as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFile = async (filePath: string) => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.deleteFile(filePath);
      message[result.success ? 'success' : 'error'](
        result.success ? '文件已删除并更新索引' : `删除失败: ${result.error}`
      );
      if (result.success) await refreshData();
    } catch (error: unknown) {
      message.error(`操作出错: ${(error as Error).message}`);
    }
  };

  // 发送消息
  const handleSend = async () => {
    if (!input.trim()) return;
    const question = input.trim();
    setInput('');
    setHistoryIndex(-1);
    await sendMessage(question);
    await refreshData();
  };

  // 处理键盘事件（上箭头填入历史问题）
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' && !e.shiftKey) {
      const userMessages = messages.filter((msg) => msg.role === 'user');
      if (userMessages.length === 0) return;

      e.preventDefault();
      const newIndex = historyIndex + 1;
      if (newIndex < userMessages.length) {
        setHistoryIndex(newIndex);
        setInput(userMessages[userMessages.length - 1 - newIndex].content);
      }
    } else if (e.key === 'ArrowDown' && !e.shiftKey && historyIndex >= 0) {
      e.preventDefault();
      const userMessages = messages.filter((msg) => msg.role === 'user');
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      if (newIndex >= 0) {
        setInput(userMessages[userMessages.length - 1 - newIndex].content);
      } else {
        setInput('');
      }
    }
  };

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
        style={
          {
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            WebkitAppRegion: 'drag',
            zIndex: 10,
          } as React.CSSProperties
        }
      >
        <Space
          size="middle"
          style={{ WebkitAppRegion: 'no-drag', marginLeft: 'auto' } as React.CSSProperties}
        >
          <Text
            className="tech-text-primary"
            style={{
              fontWeight: 'bold',
              fontSize: '14px',
              color: colors.primary,
              textShadow: colors.shadow.primary,
            }}
          >
            {documentCount} 文档块
          </Text>
          <Popconfirm
            title="确认清空对话历史？"
            onConfirm={clearHistory}
            okText="是"
            cancelText="否"
          >
            <Button
              type="text"
              icon={<ClearOutlined />}
              title="清空历史"
              style={{
                color: colors.text.secondary,
                fontSize: '16px',
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                Object.assign(e.currentTarget.style, {
                  color: colors.danger,
                  background: colors.background.hover.danger,
                  transform: 'scale(1.1)',
                });
              }}
              onMouseLeave={(e) => {
                Object.assign(e.currentTarget.style, {
                  color: colors.text.secondary,
                  background: colors.background.transparent,
                  transform: 'scale(1)',
                });
              }}
            />
          </Popconfirm>
          <Button
            type="text"
            icon={<SettingOutlined />}
            title="设置"
            onClick={() => setSettingsVisible(true)}
            style={{
              color: colors.text.secondary,
              fontSize: '16px',
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={(e) => {
              Object.assign(e.currentTarget.style, {
                color: colors.primary,
                background: colors.background.hover.primary,
                transform: 'rotate(90deg) scale(1.1)',
              });
            }}
            onMouseLeave={(e) => {
              Object.assign(e.currentTarget.style, {
                color: colors.text.secondary,
                background: colors.background.transparent,
                transform: 'rotate(0deg) scale(1)',
              });
            }}
          />
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
                description={
                  <Text style={{ color: colors.text.muted }}>在左侧上传文档，然后在这里开始提问</Text>
                }
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
                    background: colors.background.overlay,
                    border: `1px solid ${colors.border.light}`,
                  }}
                >
                  <Space>
                    <Spin size="small" />
                    <Text style={{ color: colors.text.secondary }}>思考中...</Text>
                  </Space>
                </Card>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 渐变过渡层 */}
          <div
            style={{
              position: 'absolute',
              bottom: '0',
              left: 0,
              right: 0,
              height: '120px',
              background:
                'linear-gradient(to bottom, rgba(10, 15, 30, 0) 0%, rgba(10, 15, 30, 0.85) 15%, rgba(10, 15, 30, 0.93) 30%, rgba(10, 15, 30, 0.96) 50%, rgba(10, 15, 30, 0.98) 70%, rgba(10, 15, 30, 0.99) 85%, rgba(10, 15, 30, 1) 100%)',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />

          {/* 输入区域 */}
          <div 
            style={{ padding: '0', position: 'relative', zIndex: 2 }}
            onKeyDown={handleKeyDown}
          >
            <Sender
              className="tech-sender"
              value={input}
              onChange={setInput}
              onSubmit={() => {
                handleSend();
              }}
              onCancel={stopGeneration}
              loading={loading}
              placeholder="输入你的问题，按 Enter 发送（↑ 历史问题）..."
              style={{ width: '100%' }}
            />
          </div>
        </Content>
      </Layout>

      {/* 设置弹窗 */}
      <Settings
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        provider={provider}
        onProviderChange={setProvider}
      />
    </Layout>
  );
};

const App: React.FC = () => {
  return (
    <AntApp>
      <AppContent />
    </AntApp>
  );
};

export default App;
