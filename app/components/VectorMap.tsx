import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Card, Button, Typography, theme, Tooltip } from 'antd';
import {
  ReloadOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { colors } from '@/theme/colors';
import type { VectorPoint } from '@/types';

const { Text, Title } = Typography;

type Point = VectorPoint;

export const VectorMap: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<Point | null>(null);

  // 视图状态
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  const { token } = theme.useToken();

  const fetchData = useCallback(async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    try {
      // 默认不传 query，显示静态分布
      const result = await window.electronAPI.calculateVectorPositions();
      if (result && result.points) {
        setPoints(result.points);
        // 重置视图以适应内容
        fitToContent(result.points);
      }
    } catch (error) {
      console.error('获取向量数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 自动缩放以适应内容
  const fitToContent = (pts: Point[]) => {
    if (pts.length === 0) return;

    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const padding = 50;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.width;
    const height = canvas.height;

    // 计算适应比例
    const dataWidth = maxX - minX || 1;
    const dataHeight = maxY - minY || 1;

    const scaleX = (width - padding * 2) / dataWidth;
    const scaleY = (height - padding * 2) / dataHeight;
    const newScale = Math.min(scaleX, scaleY);

    // 居中
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setScale(newScale);
    setOffset({
      x: width / 2 - centerX * newScale,
      y: height / 2 - centerY * newScale,
    });
  };

  useEffect(() => {
    fetchData();

    // 监听窗口大小变化
    const handleResize = () => {
      if (canvasRef.current) {
        const parent = canvasRef.current.parentElement;
        if (parent) {
          canvasRef.current.width = parent.clientWidth;
          canvasRef.current.height = parent.clientHeight;
          // 重新绘制会由 dependency 触发
        }
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // 初始化大小

    return () => window.removeEventListener('resize', handleResize);
  }, [fetchData]);

  // 绘图逻辑
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制背景网格
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    // TODO: 实现网格绘制优化
    ctx.stroke();

    // 绘制点
    points.forEach((point) => {
      const screenX = point.x * scale + offset.x;
      const screenY = point.y * scale + offset.y;

      // 检查是否在可视范围内 (简单的视锥裁剪)
      if (
        screenX < -10 ||
        screenX > canvas.width + 10 ||
        screenY < -10 ||
        screenY > canvas.height + 10
      ) {
        return;
      }

      ctx.beginPath();

      const isHovered = hoveredPoint && hoveredPoint.id === point.id;
      const radius = point.isQuery ? 8 : isHovered ? 6 : 4;

      ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);

      if (point.isQuery) {
        ctx.fillStyle = '#ff4d4f'; // 红色查询点
        ctx.shadowColor = '#ff4d4f';
        ctx.shadowBlur = 10;
      } else {
        ctx.fillStyle = isHovered ? '#1890ff' : colors.primary; // 主色调
        ctx.shadowBlur = 0;
      }

      ctx.fill();

      // 绘制光晕
      if (isHovered) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  }, [points, scale, offset, hoveredPoint, token]);

  // 鼠标交互
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 拖拽处理
    if (isDragging) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }

    // 悬停检测 (反向映射：屏幕坐标 -> 原始坐标)
    // 寻找最近的点
    let found: Point | null = null;
    let minDist = 10; // 悬停半径

    for (const point of points) {
      const screenX = point.x * scale + offset.x;
      const screenY = point.y * scale + offset.y;
      const dist = Math.sqrt((screenX - mouseX) ** 2 + (screenY - mouseY) ** 2);

      if (dist < minDist) {
        minDist = dist;
        found = point;
      }
    }

    setHoveredPoint(found);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    const newScale = Math.max(0.1, Math.min(50, scale * (1 + delta)));

    // 以鼠标为中心缩放
    // 暂时简化为中心缩放
    setScale(newScale);
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: '#0a0f1e',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', cursor: isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* 悬停提示 */}
      {hoveredPoint && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <Card
            size="small"
            style={{ background: 'rgba(0,0,0,0.8)', border: '1px solid #333', maxWidth: 300 }}
          >
            <Text style={{ color: '#fff' }}>
              {hoveredPoint.text.slice(0, 100)}
              {hoveredPoint.text.length > 100 && '...'}
            </Text>
            <div>
              <Text type="secondary" style={{ fontSize: 10 }}>
                ID: {hoveredPoint.id}
              </Text>
            </div>
          </Card>
        </div>
      )}

      {/* 控制栏 */}
      <div style={{ position: 'absolute', bottom: 20, right: 20, display: 'flex', gap: 8 }}>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
          刷新
        </Button>
        <Button icon={<ZoomInOutlined />} onClick={() => setScale((s) => s * 1.2)} />
        <Button icon={<ZoomOutOutlined />} onClick={() => setScale((s) => s / 1.2)} />
      </div>

      <div style={{ position: 'absolute', top: 20, left: 20, pointerEvents: 'auto' }}>
        <Title level={4} style={{ color: '#fff', margin: 0 }}>
          知识星图
        </Title>
        <Text style={{ color: 'rgba(255,255,255,0.5)' }}>
          {points.length} 个语义节点 (PCA 降维)
          <Tooltip
            title={
              <div style={{ maxWidth: 300 }}>
                <p>
                  <b>这是怎么压缩的？</b>
                </p>
                <p>
                  我们使用 PCA（主成分分析）算法，将 <b>384 维</b> 的原始数据压缩到 2
                  维平面，提取出差异最大的特征。
                </p>
                <p>
                  <b>会丢失信息吗？</b>
                </p>
                <p>
                  是的。就像把立体的地球仪压平到一张纸上，必然会丢失“高度”等信息。但这种方法保留了数据间最核心的关系——通常来说，
                  <b>距离越近的点，含义越相似。</b>
                </p>
              </div>
            }
          >
            <InfoCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
          </Tooltip>
        </Text>
      </div>
    </div>
  );
};
