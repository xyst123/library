import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type React from 'react';
import {
  Layout,
  Button,
  Space,
  Typography,
  App as AntApp,
  Empty,
  Popconfirm,
  ConfigProvider,
  theme,
  Segmented,
} from 'antd';
import { Sender } from '@ant-design/x';
import {
  ClearOutlined,
  SettingOutlined,
  MessageOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import { FileList, MessageItem, Settings, ErrorBoundary, VectorMap } from '@/components';
import { useChat } from '@/hooks';
import { colors } from '@/theme/colors';
import { MESSAGES, UI_CONSTANTS } from '@/constants';
import { formatError } from '@/utils';

const { Header, Content, Sider } = Layout;
const { Text } = Typography;

const AppContent: React.FC = () => {
  const { message } = AntApp.useApp();

  // 视图状态
  const [currentView, setCurrentView] = useState<'chat' | 'map'>('chat');

  // 聊天相关（使用 useChat hook）
  const [provider, setProvider] = useState('deepseek');
  const { messages, loading, sendMessage, clearHistory, loadHistory, stopGeneration } = useChat({
    provider,
    messageApi: message,
  });

  // 设置
  const [settingsVisible, setSettingsVisible] = useState(false);

  // 其他状态
  const [input, setInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [documentCount, setDocumentCount] = useState(0);
  const [fileList, setFileList] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [modelDownloading, setModelDownloading] = useState<string | null>(null); // 模型下载进度提示

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const refreshData = useCallback(async () => {
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
  }, []);

  // 初始化
  useEffect(() => {
    refreshData();
    loadHistory();

    // 监听模型下载进度
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleModelProgress = async (_event: unknown, data: any) => {
      const { status, progress, name, file } = data;
      if (window.electronAPI) {
        const settings = await window.electronAPI.getSettings();
        if (!settings.enableReranking) return setModelDownloading(null);
      }
      // 无论是 Reranker 还是 Embedding 模型，下载中都显示进度
      if (status === 'progress') {
        setModelDownloading(`正在下载 ${name || file}: ${Math.round(progress || 0)}%`);
      } else if (status === 'ready' || status === 'done') {
        // 只有当没有其他模型在下载时才清除状态
        // 这里简化处理：每个模型 ready 都尝试清除，最后一个 ready 会生效
        setModelDownloading(null);
      } else if (status === 'error') {
        setModelDownloading(null);
        message.error(`模型 ${name || file} 下载失败`);
      }
    };

    if (window.electronAPI) {
      window.electronAPI.on('model-download-progress', handleModelProgress);
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeListener('ingest-progress');
        window.electronAPI.removeListener('model-download-progress');
      }
    };
  }, [loadHistory, refreshData, message]);

  const ingestFiles = useCallback(
    async (paths: string[]) => {
      if (!window.electronAPI) return;
      setUploading(true);
      message.loading({ content: MESSAGES.UPLOAD.LOADING, key: 'uploading' });

      try {
        const result = await window.electronAPI.ingestFiles(paths);
        message[result.success ? 'success' : 'error']({
          content: result.success
            ? MESSAGES.UPLOAD.SUCCESS(paths.length)
            : MESSAGES.UPLOAD.ERROR(result.error ?? '未知错误'),
          key: 'uploading',
        });
        if (result.success) await refreshData();
      } catch (error: unknown) {
        message.error(MESSAGES.UPLOAD.ERROR(formatError(error)));
      } finally {
        setUploading(false);
      }
    },
    [message, refreshData]
  );

  const handleUpload = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      const filePaths = await window.electronAPI.selectFiles();
      if (filePaths && filePaths.length > 0) {
        await ingestFiles(filePaths);
      }
    } catch (error: unknown) {
      message.error(`操作失败: ${(error as Error).message}`);
    }
  }, [ingestFiles, message]);

  const handleDeleteFile = useCallback(
    async (filePath: string) => {
      if (!window.electronAPI) return;
      try {
        const result = await window.electronAPI.deleteFile(filePath);
        message[result.success ? 'success' : 'error'](
          result.success
            ? MESSAGES.DELETE.SUCCESS
            : MESSAGES.DELETE.ERROR(result.error ?? '未知错误')
        );
        if (result.success) await refreshData();
      } catch (error: unknown) {
        message.error(MESSAGES.DELETE.ERROR(formatError(error)));
      }
    },
    [message, refreshData]
  );

  // 发送消息
  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    const question = input.trim();
    setInput('');
    setHistoryIndex(-1);
    await sendMessage(question);
    await refreshData();
  }, [input, sendMessage, refreshData]);

  // 缓存用户消息列表
  const userMessages = useMemo(() => messages.filter((msg) => msg.role === 'user'), [messages]);

  // 处理键盘事件（上箭头填入历史问题）
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowUp' && !e.shiftKey) {
        if (userMessages.length === 0) return;

        e.preventDefault();
        const newIndex = historyIndex + 1;
        if (newIndex < userMessages.length) {
          setHistoryIndex(newIndex);
          setInput(userMessages[userMessages.length - 1 - newIndex].content);
        }
      } else if (e.key === 'ArrowDown' && !e.shiftKey && historyIndex >= 0) {
        e.preventDefault();
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        if (newIndex >= 0) {
          setInput(userMessages[userMessages.length - 1 - newIndex].content);
        } else {
          setInput('');
        }
      }
    },
    [userMessages, historyIndex]
  );

  const handleFilesDropped = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) {
        message.warning(MESSAGES.FILE.INVALID);
        return;
      }
      await ingestFiles(paths);
    },
    [message, ingestFiles]
  );

  return (
    <Layout className="tech-layout-bg" style={{ height: '100vh' }}>
      {/* 顶部栏 */}
      <Header
        className="tech-header"
        style={
          {
            height: UI_CONSTANTS.HEADER_HEIGHT,
            lineHeight: `${UI_CONSTANTS.HEADER_HEIGHT}px`,
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
          {/* 视图切换 */}
          {/* 视图切换 Tabs */}
          <div style={{ marginRight: 16 }}>
            <Segmented
              value={currentView}
              onChange={(value) => setCurrentView(value as 'chat' | 'map')}
              options={[
                {
                  label: '对话',
                  value: 'chat',
                  icon: <MessageOutlined />,
                },
                {
                  label: '知识星图',
                  value: 'map',
                  icon: <ExperimentOutlined />,
                },
              ]}
              className="tech-segmented"
              style={{
                background: 'transparent',
                border: 'none',
                color: colors.text.secondary,
              }}
            />
          </div>

          <Popconfirm
            title={MESSAGES.HISTORY.CONFIRM}
            onConfirm={clearHistory}
            okText="是"
            cancelText="否"
          >
            <Button
              type="text"
              className="interactive-icon"
              icon={<ClearOutlined />}
              title="清空历史"
              onClick={clearHistory}
              style={{
                fontSize: UI_CONSTANTS.BUTTON_FONT_SIZE,
                borderRadius: '50%',
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
          </Popconfirm>
          <Button
            type="text"
            className="interactive-icon"
            icon={<SettingOutlined />}
            title="设置"
            onClick={() => setSettingsVisible(true)}
            style={{
              fontSize: UI_CONSTANTS.BUTTON_FONT_SIZE,
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          />
        </Space>
      </Header>

      <Layout className="tech-layout-bg">
        {/* 左侧边栏 - 文件列表 */}
        <Sider
          width={UI_CONSTANTS.SIDEBAR_WIDTH}
          className="tech-sider"
          style={{
            overflow: 'auto',
            height: `calc(100vh - ${UI_CONSTANTS.HEADER_HEIGHT}px)`,
          }}
        >
          <FileList
            fileList={fileList}
            documentCount={documentCount}
            uploading={uploading}
            onUpload={handleUpload}
            onDelete={handleDeleteFile}
            onFilesDropped={handleFilesDropped}
          />
        </Sider>

        {/* 主内容区 - 聊天 */}
        <Content
          className="tech-content"
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: currentView === 'chat' ? '16px' : 0, // 地图模式全屏
            position: 'relative',
          }}
        >
          {currentView === 'map' ? (
            <VectorMap />
          ) : (
            <>
              <div
                style={{
                  flex: 1,
                  overflow: 'auto',
                  marginBottom: 0,
                  padding: '24px 0 120px 0', // 底部留白，为悬浮输入框预留空间
                  maxWidth: '1600px', // 更宽的视野
                  width: '100%',
                  margin: '0 auto',
                  zIndex: 0,
                }}
              >
                {messages.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      <Text style={{ color: colors.text.muted }}>
                        在左侧上传文档，然后在这里开始提问
                      </Text>
                    }
                    style={{ marginTop: 150 }}
                  />
                ) : (
                  messages.map((msg, index) => (
                    <MessageItem
                      key={index}
                      message={msg}
                      isStreaming={
                        loading && index === messages.length - 1 && msg.role === 'assistant'
                      }
                    />
                  ))
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
                  height: `${UI_CONSTANTS.GRADIENT_HEIGHT}px`,
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
                  disabled={!!modelDownloading}
                  placeholder={modelDownloading || '输入你的问题，按 Enter 发送（↑ 历史问题）...'}
                  style={{ width: '100%' }}
                  autoSize={{ minRows: 1, maxRows: 3 }}
                />
              </div>
            </>
          )}
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
    <ErrorBoundary>
      <ConfigProvider
        theme={{
          algorithm: theme.darkAlgorithm,
          token: {
            colorPrimary: colors.primary,
            colorBgContainer: colors.background.overlay,
            colorText: colors.text.primary,
            colorTextSecondary: colors.text.secondary,
            colorBorder: colors.border.light,
          },
          components: {
            Button: {
              primaryShadow: colors.shadow.primary,
            },
            Layout: {
              headerBg: 'transparent',
              bodyBg: 'transparent',
            },
          },
        }}
      >
        <AntApp>
          <AppContent />
        </AntApp>
      </ConfigProvider>
    </ErrorBoundary>
  );
};

export default App;
