import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button, Result } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 自定义降级 UI */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * 全局错误边界组件
 * 捕获子组件树中的 JavaScript 错误，显示备用 UI
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // 更新 state 使下一次渲染能够显示降级后的 UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // 记录错误信息
    console.error('错误边界捕获到错误:', error);
    console.error('组件堆栈:', errorInfo.componentStack);

    this.setState({ errorInfo });

    // 可以在这里上报错误到日志服务
    // logErrorToService(error, errorInfo);
  }

  handleReload = (): void => {
    // 重置状态并刷新页面
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleReset = (): void => {
    // 仅重置错误状态，尝试重新渲染
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      // 如果提供了自定义 fallback，使用它
      if (fallback) {
        return fallback;
      }

      // 默认错误 UI
      return (
        <div
          style={{
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0a0f1e 0%, #1a1f35 100%)',
          }}
        >
          <Result
            status="error"
            title="应用出错了"
            subTitle="抱歉，应用遇到了一个错误。请尝试刷新页面或重置应用。"
            extra={[
              <Button key="reset" onClick={this.handleReset} style={{ marginRight: 8 }}>
                重置应用
              </Button>,
              <Button
                key="reload"
                type="primary"
                icon={<ReloadOutlined />}
                onClick={this.handleReload}
              >
                刷新页面
              </Button>,
            ]}
          >
            {/* 开发环境显示详细错误信息 */}
            {process.env.NODE_ENV === 'development' && error && (
              <div
                style={{
                  marginTop: 24,
                  padding: 16,
                  background: 'rgba(255, 77, 79, 0.1)',
                  borderRadius: 8,
                  textAlign: 'left',
                  maxHeight: 300,
                  overflow: 'auto',
                }}
              >
                <div style={{ color: '#ff4d4f', fontWeight: 'bold', marginBottom: 8 }}>
                  {error.name}: {error.message}
                </div>
                {errorInfo && (
                  <pre
                    style={{
                      color: 'rgba(255, 255, 255, 0.65)',
                      fontSize: 12,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      margin: 0,
                    }}
                  >
                    {errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}
          </Result>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
