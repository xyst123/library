import { useState, useEffect } from 'react';
import type React from 'react';
import { Modal, Form, Select, Radio, Space, Typography, Divider, Tabs, Input, Switch, Button, message } from 'antd';
import { SettingOutlined, CloudSyncOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { Option } = Select;

interface SettingsData {
  provider?: string;
  chunkingStrategy?: string;
  enableContextEnhancement?: boolean;
  enableHybridSearch?: boolean;
  enableReranking?: boolean;
  enableCRAG?: boolean;
  enableSummaryMemory?: boolean;
  webdavUrl?: string;
  webdavUsername?: string;
  webdavPassword?: string;
  enableWebdav?: boolean;
}

interface SettingsProps {
  visible: boolean;
  onClose: () => void;
  provider: string;
  onProviderChange: (provider: string) => void;
  onSettingsChange?: (settings: SettingsData) => void;
}

export const Settings: React.FC<SettingsProps> = ({
  visible,
  onClose,
  provider,
  onProviderChange,
  onSettingsChange,
}) => {
  const [chunkingStrategy, setChunkingStrategy] = useState<string>('character');
  const [enableContextEnhancement, setEnableContextEnhancement] = useState<boolean>(true);
  const [enableHybridSearch, setEnableHybridSearch] = useState<boolean>(false);
  const [enableReranking, setEnableReranking] = useState<boolean>(false);
  const [enableCRAG, setEnableCRAG] = useState<boolean>(false);
  const [enableSummaryMemory, setEnableSummaryMemory] = useState<boolean>(false);
  const [webdavUrl, setWebdavUrl] = useState<string>('');
  const [webdavUsername, setWebdavUsername] = useState<string>('');
  const [webdavPassword, setWebdavPassword] = useState<string>('');
  const [enableWebdav, setEnableWebdav] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);

  // 加载当前配置
  useEffect(() => {
    if (visible && window.electronAPI) {
      loadSettings();
    }
  }, [visible]);

  const loadSettings = async () => {
    try {
      if (!window.electronAPI) {
        console.error('electronAPI 未定义');
        return;
      }
      const settings = await window.electronAPI.getSettings();
      if (settings) {
        setChunkingStrategy(settings.chunkingStrategy || 'character');
        setEnableContextEnhancement(settings.enableContextEnhancement ?? true);
        setEnableHybridSearch(settings.enableHybridSearch ?? false);
        setEnableReranking(settings.enableReranking ?? false);
        setEnableCRAG(settings.enableCRAG ?? false);

        setEnableSummaryMemory(settings.enableSummaryMemory ?? false);
        setWebdavUrl(settings.webdavUrl || '');
        setWebdavUsername(settings.webdavUsername || '');
        setWebdavPassword(settings.webdavPassword || '');
        setEnableWebdav(settings.enableWebdav ?? false);
      }
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  };


  const handleOk = async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    const settings = {
      provider,
      chunkingStrategy,
      enableContextEnhancement,
      enableHybridSearch,
      enableReranking,
      enableCRAG,
      enableSummaryMemory,
      webdavUrl,
      webdavUsername,
      webdavPassword,
      enableWebdav,
    };
    try {
      await window.electronAPI.saveSettings(settings);
      console.log('设置已保存:', settings);
      onSettingsChange?.(settings);
      onClose();
    } catch (error) {
      console.error('保存设置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!webdavUrl || !webdavUsername || !webdavPassword) {
      message.error('请填写完整的 WebDAV 信息');
      return;
    }
    if (!window.electronAPI) return;
    
    setLoading(true);
    try {
      const settings = {
        provider,
        chunkingStrategy,
        enableContextEnhancement,
        enableHybridSearch,
        enableReranking,
        enableCRAG,
        enableSummaryMemory,
        webdavUrl,
        webdavUsername,
        webdavPassword,
        enableWebdav,
      };
      
      const result = await window.electronAPI.testWebDAVConnection(settings);
      if (result.success) {
        message.success('连接测试成功');
      } else {
        message.error('连接失败: ' + result.error);
      }
    } catch (error) {
      message.error('连接失败: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncFiles = async () => {
    if (!webdavUrl || !webdavUsername || !webdavPassword) {
      message.error('请填写完整的 WebDAV 信息');
      return;
    }
    if (!window.electronAPI) return;

    setLoading(true);
    try {
      const settings = {
        provider,
        chunkingStrategy,
        enableContextEnhancement,
        enableHybridSearch,
        enableReranking,
        enableCRAG,
        enableSummaryMemory,
        webdavUrl,
        webdavUsername,
        webdavPassword,
        enableWebdav,
      };

      const result = await window.electronAPI.syncFiles(settings);
      if (result.success) {
        message.success('同步完成');
      } else {
        message.error('同步失败: ' + result.error);
      }
    } catch (error) {
      message.error('同步失败: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <SettingOutlined />
          <span>设置</span>
        </Space>
      }
      open={visible}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={loading}
      width={600}
    >
      <Tabs
        defaultActiveKey="general"
        items={[
          {
            key: 'general',
            label: '通用设置',
            icon: <SettingOutlined />,
            children: (
              <Form layout="vertical">
                {/* LLM 模型选择 */}
                <Form.Item label="LLM 模型">
                  <Select value={provider} onChange={onProviderChange} size="large">
                    <Option value="deepseek">
                      <Space>
                        <span>DeepSeek</span>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          (推荐，成本低)
                        </Text>
                      </Space>
                    </Option>
                    <Option value="gemini">
                      <Space>
                        <span>Google Gemini</span>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          (多模态支持)
                        </Text>
                      </Space>
                    </Option>
                  </Select>
                </Form.Item>

                <Divider />

                {/* Chunking 策略选择 */}
                <Form.Item
                  label="文档分割策略"
                  extra={
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      更改策略后需要重新导入文档才能生效
                    </Text>
                  }
                >
                  <Radio.Group
                    value={chunkingStrategy}
                    onChange={(e) => setChunkingStrategy(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <Space orientation="vertical" style={{ width: '100%' }}>
                      <Radio value="character">
                        <Space orientation="vertical" style={{ marginLeft: 8 }}>
                          <Text strong>字符递归分割（推荐）</Text>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            按段落、句子、标点符号递归分割，速度快，适合大多数场景
                          </Text>
                        </Space>
                      </Radio>

                      <Radio value="semantic">
                        <Space orientation="vertical" style={{ marginLeft: 8 }}>
                          <Text strong>语义分割（实验性）</Text>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            按语义相似度动态分组，检索更准确但速度较慢
                          </Text>
                          <Text type="warning" style={{ fontSize: '12px' }}>
                            ⚠️ 使用本地模型，首次运行会下载模型文件（约 90MB）
                          </Text>
                        </Space>
                      </Radio>

                      <Radio value="llm-enhanced">
                        <Space orientation="vertical" style={{ marginLeft: 8 }}>
                          <Text strong>LLM 智能提取（推荐）</Text>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            利用 LLM 自动提取 &quot;问题-答案&quot; 对，并生成相似问题
                          </Text>
                          <Text type="warning" style={{ fontSize: '12px' }}>
                            💡 需消耗 Token，适合构建高质量 FAQ 库
                          </Text>
                        </Space>
                      </Radio>
                    </Space>
                  </Radio.Group>
                </Form.Item>

                <Divider />

                {/* 上下文增强开关 */}
                <Form.Item
                  label="上下文增强"
                  extra={
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      为每个文档块添加文件名和位置信息，提升检索准确性
                    </Text>
                  }
                >
                  <Radio.Group
                    value={enableContextEnhancement}
                    onChange={(e) => setEnableContextEnhancement(e.target.value)}
                  >
                    <Space orientation="vertical">
                      <Radio value={true}>
                        <Space orientation="vertical" style={{ marginLeft: 8 }}>
                          <Text strong>启用（推荐）</Text>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            块前添加 &quot;[文档：xxx.txt - 第 1/5 块]&quot;，检索效果提升 15-40%
                          </Text>
                        </Space>
                      </Radio>
                      <Radio value={false}>
                        <Space orientation="vertical" style={{ marginLeft: 8 }}>
                          <Text strong>禁用</Text>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            保持原始文本，适合已包含丰富上下文的文档
                          </Text>
                        </Space>
                      </Radio>
                    </Space>
                  </Radio.Group>
                </Form.Item>

                <Divider />

                {/* 混合检索开关 */}
                <Form.Item
                  label="检索策略"
                  extra={
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      混合检索结合向量相似度和关键词匹配，提升召回率和准确性
                    </Text>
                  }
                >
                  <Radio.Group
                    value={enableHybridSearch}
                    onChange={(e) => setEnableHybridSearch(e.target.value)}
                  >
                    <Space orientation="vertical">
                      <Radio value={false}>
                        <Space orientation="vertical" style={{ marginLeft: 8 }}>
                          <Text strong>纯向量检索</Text>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            基于语义相似度检索，适合概念性查询
                          </Text>
                        </Space>
                      </Radio>
                      <Radio value={true}>
                        <Space orientation="vertical" style={{ marginLeft: 8 }}>
                          <Text strong>混合检索（向量 + BM25）</Text>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            使用 RRF 算法融合向量和关键词结果，召回率提升 20-50%
                          </Text>
                          <Text type="warning" style={{ fontSize: '12px' }}>
                            💡 适合专有名词、代码、精确匹配等场景
                          </Text>
                        </Space>
                      </Radio>
                    </Space>
                  </Radio.Group>
                </Form.Item>

                <Divider />

                {/* 重排序开关 */}
                <Form.Item
                  label="重排序 (Reranking)"
                  extra={
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      使用 Cross-Encoder 模型对检索结果进行二次精排，显著提升相关性
                    </Text>
                  }
                >
                  <Radio.Group value={enableReranking} onChange={(e) => setEnableReranking(e.target.value)}>
                    <Space orientation="vertical">
                      <Radio value={true}>
                        <Space orientation="vertical" style={{ marginLeft: 8 }}>
                          <Text strong>启用 (推荐)</Text>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            对检索结果进行语义打分，减少“幻觉”
                          </Text>
                          <Text type="warning" style={{ fontSize: '12px' }}>
                            ⚠️ 会增加额外的计算耗时，首次运行需下载模型
                          </Text>
                        </Space>
                      </Radio>
                      <Radio value={false}>
                        <Space orientation="vertical" style={{ marginLeft: 8 }}>
                          <Text strong>禁用</Text>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            速度最快，仅依赖初始检索结果
                          </Text>
                        </Space>
                      </Radio>
                    </Space>
                  </Radio.Group>
                </Form.Item>

                <Divider />

                {/* CRAG 开关 */}
                <Form.Item
                  label="自修正 RAG (CRAG)"
                  extra={
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      对检索结果进行评分，若不相关则触发网络搜索（模拟），提高回答准确性
                    </Text>
                  }
                >
                  <Radio.Group value={enableCRAG} onChange={(e) => setEnableCRAG(e.target.value)}>
                    <Space orientation="vertical">
                      <Radio value={true}>
                        <Space orientation="vertical" style={{ marginLeft: 8 }}>
                          <Text strong>启用 (推荐)</Text>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            自动评估并修正检索结果，减少幻觉
                          </Text>
                          <Text type="warning" style={{ fontSize: '12px' }}>
                            💡 适合需要高准确性的场景
                          </Text>
                        </Space>
                      </Radio>
                      <Radio value={false}>
                        <Space orientation="vertical" style={{ marginLeft: 8 }}>
                          <Text strong>禁用</Text>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            标准 RAG 流程
                          </Text>
                        </Space>
                      </Radio>
                    </Space>
                  </Radio.Group>
                </Form.Item>

                <Divider />

                {/* 摘要记忆开关 */}
                <Form.Item
                  label="对话摘要记忆 (Summary Memory)"
                  extra={
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      自动摘要早期对话历史，解决&quot;长对话失忆&quot;问题，节省 Token
                    </Text>
                  }
                >
                  <Radio.Group
                    value={enableSummaryMemory}
                    onChange={(e) => setEnableSummaryMemory(e.target.value)}
                  >
                    <Space orientation="vertical">
                      <Radio value={true}>
                        <Space orientation="vertical" style={{ marginLeft: 8 }}>
                          <Text strong>启用 (推荐)</Text>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            超过历史限制时，将旧对话压缩成摘要保留
                          </Text>
                          <Text type="warning" style={{ fontSize: '12px' }}>
                            💡 每次超限会触发额外的 LLM 摘要生成
                          </Text>
                        </Space>
                      </Radio>
                      <Radio value={false}>
                        <Space orientation="vertical" style={{ marginLeft: 8 }}>
                          <Text strong>禁用</Text>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            直接丢弃超出限制的历史对话
                          </Text>
                        </Space>
                      </Radio>
                    </Space>
                  </Radio.Group>
                </Form.Item>

                <Divider />

                <Form.Item label="当前配置">
                  <Space orientation="vertical" style={{ width: '100%' }}>
                    <Text type="secondary">
                      <Text code>字符分割</Text>: 块大小 500 字符，重叠 100 字符
                    </Text>
                    <Text type="secondary">
                      <Text code>语义分割</Text>: 相似度阈值 95%，动态块大小
                    </Text>
                  </Space>
                </Form.Item>
              </Form>
            ),
          },
          {
            key: 'sync',
            label: '多端同步',
            icon: <CloudSyncOutlined />,
            children: (
              <Form layout="vertical">
                <Form.Item
                  label="WebDAV 服务"
                  extra={
                    <Text type="secondary">
                      启用后，知识库文件将通过 WebDAV 自定同步到云端，实现多设备共享
                    </Text>
                  }
                >
                  <Space>
                    <Switch checked={enableWebdav} onChange={setEnableWebdav} />
                    <span>启用同步</span>
                  </Space>
                </Form.Item>

                {enableWebdav && (
                  <>
                    <Form.Item label="服务器地址 (URL)" required>
                      <Input
                        placeholder="https://dav.example.com/remote.php/webdav/"
                        value={webdavUrl}
                        onChange={(e) => setWebdavUrl(e.target.value)}
                      />
                    </Form.Item>
                    <Form.Item label="用户名" required>
                      <Input
                        placeholder="username"
                        value={webdavUsername}
                        onChange={(e) => setWebdavUsername(e.target.value)}
                      />
                    </Form.Item>
                    <Form.Item label="密码" required>
                      <Input
                        placeholder="password"
                        value={webdavPassword}
                        onChange={(e) => setWebdavPassword(e.target.value)}
                        type="password"
                      />
                    </Form.Item>
                    <Form.Item>
                      <Space>
                        <Button onClick={handleTestConnection} icon={<CloudSyncOutlined />}>
                          测试连接
                        </Button>
                        <Button onClick={handleSyncFiles} type="primary" icon={<CloudSyncOutlined />}>
                          立即同步
                        </Button>
                      </Space>
                    </Form.Item>
                  </>
                )}
              </Form>
            ),
          },
        ]}
      />
    </Modal>
  );
};
