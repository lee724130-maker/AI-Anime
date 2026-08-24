import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, Typography, Space, Avatar, Drawer } from 'antd';
import {
  DashboardOutlined, ThunderboltOutlined, VideoCameraOutlined,
  DatabaseOutlined, WalletOutlined, UserOutlined, LogoutOutlined, FireOutlined, LayoutOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../stores/authStore';

const { Text } = Typography;

const NAV_ITEMS = [
  { key: '/dashboard', label: '工作台', icon: <DashboardOutlined /> },
  { key: '/generate', label: 'AI 生成', icon: <ThunderboltOutlined /> },
  { key: '/viral', label: '热门创作', icon: <FireOutlined /> },
  { key: '/canvas', label: '画布', icon: <LayoutOutlined /> },
  // { key: '/editor', label: '剪辑', icon: <ScissorOutlined /> }, // 暂时关闭（服务器内存不足）
  { key: '/drama', label: '短剧工作室', icon: <VideoCameraOutlined /> },
  { key: '/global-assets', label: '大资产库', icon: <DatabaseOutlined /> },
];

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

export default function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const currentKey = '/' + location.pathname.split('/')[1];

  const go = (key: string) => {
    navigate(key);
    setDrawerOpen(false);
  };

  return (
    <div className="app-header" style={{
      background: '#fff',
      padding: isMobile ? '0 12px' : '0 32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid #f0f0f0',
      height: isMobile ? 52 : 60,
      position: 'sticky',
      top: 0,
      zIndex: 100,
      backdropFilter: 'blur(8px)',
      backgroundClip: 'padding-box',
    }}>
      {/* Left: hamburger (mobile) + Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 0 }}>
        {isMobile && (
          <Button type="text" icon={<MenuOutlined />} style={{ fontSize: 18, color: '#7c3aed' }}
            onClick={() => setDrawerOpen(true)} />
        )}
        <Text strong style={{ fontSize: isMobile ? 15 : 17, color: '#7c3aed', cursor: 'pointer', whiteSpace: 'nowrap', marginRight: isMobile ? 0 : 20 }}
          onClick={() => navigate('/')}>
          🎬 AI 动漫短剧
        </Text>
      </div>

      {/* Nav (desktop only) */}
      {!isMobile && (
        <div style={{ display: 'flex', gap: 4 }}>
          {NAV_ITEMS.map(item => {
            const active = currentKey === item.key;
            return (
              <div
                key={item.key}
                onClick={() => navigate(item.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 8,
                  cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 400,
                  color: active ? '#7c3aed' : '#666',
                  background: active ? 'rgba(124,58,237,0.08)' : 'transparent',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.color = '#333'; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#666'; } }}
              >
                <span style={{ fontSize: 15 }}>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Right side */}
      <Space size={isMobile ? 4 : 8}>
        <Button
          icon={<WalletOutlined />}
          style={{
            borderRadius: 8, height: isMobile ? 34 : 38, fontSize: 14, fontWeight: 500,
            color: '#7c3aed', border: '1px solid #ede9f4', background: '#faf8ff',
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: isMobile ? '0 10px' : undefined,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4c8ec'; e.currentTarget.style.background = '#f5f0ff'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#ede9f4'; e.currentTarget.style.background = '#faf8ff'; }}
          onClick={() => navigate('/order')}>
          {isMobile ? '充值' : '充值'}
        </Button>

        <div onClick={() => navigate('/user')} style={{
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
          padding: isMobile ? '3px 6px 3px 3px' : '3px 14px 3px 3px', borderRadius: 20,
          border: '1px solid #ede9f4', background: '#fff',
          transition: 'all 0.2s', height: isMobile ? 34 : 38,
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4c8ec'; e.currentTarget.style.background = '#faf8ff'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#ede9f4'; e.currentTarget.style.background = '#fff'; }}>
          <Avatar size={isMobile ? 28 : 32} icon={<UserOutlined />} style={{ backgroundColor: '#7c3aed', flexShrink: 0 }} />
          {!isMobile && (
            <div style={{ lineHeight: 1.15 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{user?.username}</div>
              <div style={{ fontSize: 11, color: '#d48806', fontWeight: 500 }}>⚡ {user?.credits ?? 100}</div>
            </div>
          )}
        </div>

        {!isMobile && (
          <Button type="text" icon={<LogoutOutlined />}
            style={{ borderRadius: 8, height: 38, color: '#ff4d4f', fontSize: 13 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fff1f0'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            onClick={() => { logout(); navigate('/login'); }}>
            退出账号
          </Button>
        )}
      </Space>

      {/* Mobile drawer */}
      <Drawer
        title={<span style={{ color: '#7c3aed', fontWeight: 600 }}>🎬 AI 动漫短剧</span>}
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={260}
        styles={{ body: { padding: '8px 12px' } }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map(item => {
            const active = currentKey === item.key;
            return (
              <div
                key={item.key}
                onClick={() => go(item.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 12px', borderRadius: 10,
                  cursor: 'pointer', fontSize: 15, fontWeight: active ? 600 : 400,
                  color: active ? '#7c3aed' : '#444',
                  background: active ? 'rgba(124,58,237,0.08)' : 'transparent',
                }}
              >
                <span style={{ fontSize: 17 }}>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            );
          })}
          <div style={{ height: 1, background: '#f0f0f0', margin: '8px 0' }} />
          <div
            onClick={() => { logout(); setDrawerOpen(false); navigate('/login'); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 12px', borderRadius: 10,
              cursor: 'pointer', fontSize: 15, color: '#ff4d4f',
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