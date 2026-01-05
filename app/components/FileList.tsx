import type React from 'react';
import { Button, Empty, Tooltip, Typography } from 'antd';
import { UploadOutlined, FileTextOutlined, DeleteOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface FileListProps {
  /** 文件路径列表 */
  fileList: string[];
  /** 是否正在上传 */
  uploading: boolean;
  /** 是否正在拖拽 */
  isDragging: boolean;
  /** 上传按钮点击回调 */
  onUpload: () => void;
  /** 删除文件回调 */
  onDelete: (filePath: string) => void;
  /** 拖拽状态变化回调 */
  onDragStateChange: (isDragging: boolean) => void;
  /** 文件拖放回调 */
  onFilesDropped: (paths: string[]) => void;
}

/**
 * 文件列表组件
 * 展示知识库中的文件，支持上传和拖放
 */
const FileList: React.FC<FileListProps> = ({
  fileList,
  uploading,
  isDragging,
  onUpload,
  onDelete,
  onDragStateChange,
  onFilesDropped,
}) => {
  // 处理拖放事件
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    onDragStateChange(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    onDragStateChange(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    onDragStateChange(false);

    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      return ['txt', 'md', 'pdf', 'docx', 'html'].includes(ext || '');
    });

    if (validFiles.length === 0) {
      return; // 父组件会处理警告提示
    }

    // Electron 在 File 对象上暴露 'path' 属性
    const paths = validFiles.map((f) => (f as unknown as { path: string }).path);
    onFilesDropped(paths);
  };

  return (
    <div
      style={{
        padding: 16,
        height: '100%',
        backgroundColor: isDragging ? 'rgba(0, 243, 255, 0.1)' : 'transparent',
        transition: 'background-color 0.2s',
        border: isDragging ? '2px dashed #00f3ff' : 'none',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Button
        block
        type="primary"
        icon={<UploadOutlined />}
        onClick={onUpload}
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
                  onClick={() => onDelete(item)}
                />
              </Tooltip>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileList;
