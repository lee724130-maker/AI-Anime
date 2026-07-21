import { useNavigate, useLocation } from 'react-router-dom';
import { Button, Typography, Space, Avatar } from 'antd';
import {
  DashboardOutlined, ThunderboltOutlined, VideoCameraOutlined,
  DatabaseOutlined, WalletOutlined, UserOutlined, LogoutOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../stores/authStore';

const { Text } = Typography;

const NAV_ITEMS = [
  { key: '/dashboard', label: '工作台', icon: <DashboardOutlined /> },
  { key: '/generate', label: 'AI 生成', icon: <ThunderboltOutlined /> },
  { key: '/drama', label: '短剧工作室', icon: <VideoCameraOutlined /> },
  { key: '/global-assets', label: '大资产库', icon: <DatabaseOutlined /> },
];

export default function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const currentKey = '/' + location.pathname.split('/')[1];

  return (
    <div style={{
      background: '#fff',
      padding: '0 32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid #f0f0f0',
      height: 60,
      position: 'sticky',
      top: 0,
      zIndex: 100,
      backdropFilter: 'blur(8px)',
      backgroundClip: 'padding-box',
    }}>
      {/* Logo + Nav */}
      <Space size={4}>
        <Text strong style={{ fontSize: 17, color: '#7c3aed', cursor: 'pointer', whiteSpace: 'nowrap', marginRight: 20 }}
          onClick={() => navigate('/')}>
          🎬 AI 动漫短剧
        </Text>
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
      </Space>

      {/* Right side */}
      <Space size={8}>
        <Button
          icon={<WalletOutlined />}
          style={{
            borderRadius: 8, height: 38, fontSize: 14, fontWeight: 500,
            color: '#7c3aed', border: '1px solid #ede9f4', background: '#faf8ff',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4c8ec'; e.currentTarget.style.background = '#f5f0ff'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#ede9f4'; e.currentTarget.style.background = '#faf8ff'; }}
          onClick={() => navigate('/order')}>
          充值
        </Button>

        <div onClick={() => navigate('/user')} style={{
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
          padding: '3px 14px 3px 3px', borderRadius: 20,
          border: '1px solid #ede9f4', background: '#fff',
          transition: 'all 0.2s', height: 38,
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4c8ec'; e.currentTarget.style.background = '#faf8ff'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#ede9f4'; e.currentTarget.style.background = '#fff'; }}>
          <Avatar size={32} icon={<UserOutlined />} style={{ backgroundColor: '#7c3aed', flexShrink: 0 }} />
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{user?.username}</div>
            <div style={{ fontSize: 11, color: '#d48806', fontWeight: 500 }}>⚡ {user?.credits ?? 100}</div>
          </div>
        </div>

        <Button type="text" icon={<LogoutOutlined />}
          style={{ borderRadius: 8, height: 38, color: '#ff4d4f', fontSize: 13 }}
          onMouseEnter={e => { e.currentTarget.style.background = '#fff1f0'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          onClick={() => { logout(); navigate('/login'); }}>
          退出账号
        </Button>
      </Space>
    </div>
  );
}
