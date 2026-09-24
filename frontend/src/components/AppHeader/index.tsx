import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, Typography, Space, Avatar, Drawer } from 'antd';
import {
  DashboardOutlined, ThunderboltOutlined, FireOutlined, LayoutOutlined,
  ScissorOutlined, VideoCameraOutlined, DatabaseOutlined, MenuOutlined,
  MoonOutlined, SunOutlined, WalletOutlined, UserOutlined, LogoutOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../theme/ThemeContext';
import api from '../../services/api';
import Logo from '../Logo';

const { Text } = Typography;

// 生产 bundle nI：移动端断点 hook
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

// 生产 bundle rI：AppHeader 逐字还原
export default function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { isDark, toggleTheme } = useTheme();
  const [rechargeEnabled, setRechargeEnabled] = useState(true);

  useEffect(() => {
    api.get('/api/admin/site/config')
      .then(({ data }) => {
        setRechargeEnabled(data.recharge_enabled === '1');
      })
      .catch(() => {});
  }, []);

  const currentKey = '/' + location.pathname.split('/')[1];
  const navItems = [
    { key: '/dashboard', label: '工作台', icon: <DashboardOutlined /> },
    { key: '/generate', label: 'AI 生成', icon: <ThunderboltOutlined /> },
    { key: '/viral', label: '热门创作', icon: <FireOutlined /> },
    { key: '/canvas', label: '画布', icon: <LayoutOutlined /> },
    ...(user?.role === 'admin' ? [{ key: '/editor', label: '剪辑', icon: <ScissorOutlined /> }] : []),
    { key: '/drama', label: '短剧工作室', icon: <VideoCameraOutlined /> },
    { key: '/global-assets', label: '大资产库', icon: <DatabaseOutlined /> },
  ];

  const go = (key: string) => {
    navigate(key);
    setDrawerOpen(false);
  };

  return (
    <div
      className="app-header"
      style={{
        background: 'var(--bg)',
        padding: isMobile ? '0 12px' : '0 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)',
        height: isMobile ? 52 : 60,
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backdropFilter: 'blur(10px)',
        backgroundClip: 'padding-box',
      }}
    >
      {/* 左侧：汉堡（移动端）+ Logo 品牌 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 0 }}>
        {isMobile && (
          <Button
            type="text"
            icon={<MenuOutlined />}
            style={{ fontSize: 18, color: 'var(--text-secondary)' }}
            onClick={() => setDrawerOpen(true)}
          />
        )}
        <div
          onClick={() => navigate('/')}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginRight: isMobile ? 0 : 20 }}
        >
          <Logo size={isMobile ? 24 : 28} />
          {!isMobile && (
            <Text strong style={{ fontSize: 16, color: 'var(--text)', letterSpacing: '-0.3px' }}>
              AI Anime
            </Text>
          )}
        </div>
      </div>

      {/* 导航（仅桌面） */}
      {!isMobile && (
        <div style={{ display: 'flex', gap: 4 }}>
          {navItems.map((item) => {
            const active = currentKey === item.key;
            return (
              <div
                key={item.key}
                onClick={() => navigate(item.key)}
                className="nav-item-hover"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--primary)' : 'var(--text-secondary)',
                  background: active ? 'var(--primary-bg)' : 'transparent',
                  transition: 'all 0.2s',
                }}
              >
                <span style={{ fontSize: 15 }}>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* 右侧操作区 */}
      <Space size={isMobile ? 4 : 8}>
        <Button
          icon={isDark ? <SunOutlined /> : <MoonOutlined />}
          onClick={toggleTheme}
          className="nav-icon-btn"
          style={{
            borderRadius: 8,
            height: isMobile ? 34 : 38,
            width: isMobile ? 34 : 38,
            color: 'var(--primary)',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title={isDark ? '切换到浅色模式' : '切换到深色模式'}
        />
        {rechargeEnabled && (
          <Button
            icon={<WalletOutlined />}
            className="nav-icon-btn"
            style={{
              borderRadius: 8,
              height: isMobile ? 34 : 38,
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--primary)',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: isMobile ? '0 10px' : undefined,
            }}
            onClick={() => navigate('/order')}
          >
            充值
          </Button>
        )}
        <div
          onClick={() => navigate('/user')}
          className="nav-avatar-wrap"
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: isMobile ? '3px 6px 3px 3px' : '3px 14px 3px 3px',
            borderRadius: 20,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            transition: 'all 0.2s',
            height: isMobile ? 34 : 38,
          }}
        >
          <Avatar
            size={isMobile ? 28 : 32}
            icon={<UserOutlined />}
            style={{ backgroundColor: 'var(--primary)', flexShrink: 0 }}
          />
          {!isMobile && (
            <div style={{ lineHeight: 1.15 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{user?.username}</div>
              <div style={{ fontSize: 11, color: 'var(--warning)', fontWeight: 500 }}>
                ⚡ {user?.credits ?? 0}
              </div>
            </div>
          )}
        </div>
        {!isMobile && (
          <Button
            type="text"
            icon={<LogoutOutlined />}
            className="nav-icon-btn nav-logout-btn"
            style={{ borderRadius: 8, height: 38, color: 'var(--danger)', fontSize: 13 }}
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            退出账号
          </Button>
        )}
      </Space>

      {/* 移动端抽屉 */}
      <Drawer
        title={<span style={{ color: 'var(--text)', fontWeight: 600 }}>AI Anime</span>}
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={260}
        styles={{ body: { padding: '8px 12px' } }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map((item) => {
            const active = currentKey === item.key;
            return (
              <div
                key={item.key}
                onClick={() => go(item.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 12px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontSize: 15,
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--primary)' : 'var(--text)',
                  background: active ? 'var(--primary-bg)' : 'transparent',
                }}
              >
                <span style={{ fontSize: 17 }}>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            );
          })}
          <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
          <div
            onClick={() => {
              logout();
              setDrawerOpen(false);
              navigate('/login');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 12px',
              borderRadius: 10,
              cursor: 'pointer',
              fontSize: 15,
              color: 'var(--danger)',
            }}
          >
            <LogoutOutlined />
            <span>退出账号（{user?.username ?? ''}）</span>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
