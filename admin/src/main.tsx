import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import './index.css';
import App from './App.tsx';
import { useTheme } from './hooks/useTheme';

// Exe: applies persisted admin theme (data-theme) on mount
function ThemeBootstrap() {
  useTheme();
  return null;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeBootstrap />
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#818CF8',
          borderRadius: 6,
          fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        },
      }}
    >
      <App />
    </ConfigProvider>
  </StrictMode>,
);
