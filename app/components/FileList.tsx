import React, { memo, useCallback, useMemo } from 'react';
import { Button, Empty, Tooltip, Typography } from 'antd';
import { UploadOutlined, FileTextOutlined, DeleteOutlined } from '@ant-design/icons';
import { SUPPORTED_FILE_EXTENSIONS } from '../constants';
import { useDragDrop } from '../hooks/common';

const { Text } = Typography;

/** 单个文件项组件，使用 memo 避免不必要的重渲染 */
interface FileItemProps {
  filePath: string;
  onDelete: (filePath: string) => void;
}

const FileItem: React.FC<FileItemProps> = memo(({ filePath, onDelete }) => {
  const fileName = useMemo(() => filePath.split('/').pop(), [filePath]);
  const handleDelete = useCallback(() => onDelete(filePath), [filePath, onDelete]);

  return (
    <div
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
        <Tooltip title={filePath}>
          <Text style={{ color: '#e0e0e0', fontSize: 13 }} ellipsis>
            {fileName}
          </Text>
        </Tooltip>
      </div>
      <Tooltip title="删除">
        <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={handleDelete} />
      </Tooltip>
    </div>
  );
});

FileItem.displayName = 'FileItem';

interface FileListProps {
  /** 文件路径列表 */
  fileList: string[];
  /** 文档块总数 */
  documentCount: number;
  /** 是否正在上传 */
  uploading: boolean;
  /** 上传按钮点击回调 */
  onUpload: () => void;
  /** 删除文件回调 */
  onDelete: (filePath: string) => void;
  /** 文件拖放回调 */
  onFilesDropped: (paths: string[]) => void;
}

/**
 * 文件列表组件
 * 展示知识库中的文件，支持上传和拖放
 */
const FileList: React.FC<FileListProps> = memo(
  ({ fileList, documentCount, uploading, onUpload, onDelete, onFilesDropped }) => {
    // 使用拖放 hook
    const { dragProps, dragStyle } = useDragDrop({
      allowedExtensions: SUPPORTED_FILE_EXTENSIONS,
      onDrop: onFilesDropped,
    });

    // 合并容器样式
    const containerStyle = useMemo(
      () => ({
        padding: 16,
        height: '100%',
        ...dragStyle,
      }),
      [dragStyle]
    );

    return (
      <div style={containerStyle} {...dragProps}>
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

        <div
          style={{
            marginBottom: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text type="secondary" style={{ fontSize: 12 }}>
            知识库列表 ({fileList.length})
          </Text>
          <Text
            style={{
              fontSize: '12px',
              color: '#00f3ff', // colors.primary hardcoded or imported? colors not imported here. Using cyan hex.
              textShadow: '0 0 10px rgba(0, 243, 255, 0.4)',
            }}
          >
            {documentCount} 文档块
          </Text>
        </div>

        {fileList.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<Text style={{ color: '#666', fontSize: 12 }}>暂无文件</Text>}
          />
        ) : (
          <div style={{ height: 'calc(100% - 100px)', overflow: 'auto' }}>
            {fileList.map((item) => (
              <FileItem key={item} filePath={item} onDelete={onDelete} />
            ))}
          </div>
        )}
      </div>
    );
  }
);

FileList.displayName = 'FileList';

export default FileList;
