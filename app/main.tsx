import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from '@/App';
import './styles/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('未找到 root 元素');
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#1dd1f7',
          borderRadius: 8,
          colorBgContainer: 'rgba(255, 255, 255, 0.05)',
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>
);
