import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Drawer, Avatar } from 'antd';
import {
  DashboardOutlined, ThunderboltOutlined, FireOutlined, LayoutOutlined,
  ScissorOutlined, VideoCameraOutlined, DatabaseOutlined, MenuOutlined,
  MoonOutlined, SunOutlined, WalletOutlined, UserOutlined, LogoutOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../theme/ThemeContext';
import api from '../../services/api';
import Logo from '../Logo';

// 移动端断点 hook（原 AppHeader nI 同款）
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

// LibTV 风格侧边栏应用壳：桌面固定左边栏 / 移动端顶栏+抽屉
// 功能与原 AppHeader 完全一致（导航·主题切换·充值·积分·头像·退出），只换样式与布局
export default function AppShell({ children }: { children: ReactNode }) {
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

  const brand = (
    <div
      onClick={() => go('/')}
      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
    >
      <Logo size={26} />
      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>
        AI Anime
      </span>
    </div>
  );

  // LibTV 黑色主按钮「＋ 开始创作」→ /generate（纯导航入口）
  const createBtn = (
    <div
      onClick={() => go('/generate')}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        height: 38, borderRadius: 10, cursor: 'pointer',
        background: 'var(--text)', color: 'var(--bg)',
        fontSize: 13, fontWeight: 600,
        transition: 'opacity .15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
    >
      <PlusOutlined style={{ fontSize: 12 }} />
      <span>开始创作</span>
    </div>
  );

  const navList = (large = false) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {navItems.map((item) => {
        const active = currentKey === item.key;
        return (
          <div
            key={item.key}
            onClick={() => go(item.key)}
            className={`side-nav-item${active ? ' active' : ''}`}
            style={large ? { height: 44, fontSize: 14.5, borderRadius: 10 } : undefined}
          >
            <span style={{ fontSize: large ? 17 : 15 }}>{item.icon}</span>
            <span>{item.label}</span>
          </div>
        );
      })}
    </div>
  );

  const utilityRows = (large = false) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div
        onClick={toggleTheme}
        className="side-nav-item"
        title={isDark ? '切换到浅色模式' : '切换到深色模式'}
        style={large ? { height: 44, fontSize: 14.5, borderRadius: 10 } : undefined}
      >
        <span style={{ fontSize: large ? 17 : 15 }}>{isDark ? <SunOutlined /> : <MoonOutlined />}</span>
        <span>{isDark ? '浅色模式' : '深色模式'}</span>
      </div>
      {rechargeEnabled && (
        <div
          onClick={() => go('/order')}
          className="side-nav-item"
          style={large ? { height: 44, fontSize: 14.5, borderRadius: 10 } : undefined}
        >
          <span style={{ fontSize: large ? 17 : 15 }}><WalletOutlined /></span>
          <span>充值</span>
        </div>
      )}
      <div
        onClick={() => go('/user')}
        className="side-nav-item"
        style={{
          height: large ? 48 : 42, borderRadius: 10, gap: 10,
        }}
      >
        <Avatar size={large ? 32 : 28} icon={<UserOutlined />} style={{ backgroundColor: 'var(--primary)', flexShrink: 0 }} />
        <div style={{ lineHeight: 1.2, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.username}
          </div>
          <div style={{ fontSize: 11, color: 'var(--warning)', fontWeight: 500 }}>
            ⚡ {user?.credits ?? 0}
          </div>
        </div>
      </div>
      <div
        onClick={() => {
          logout();
          setDrawerOpen(false);
          navigate('/login');
        }}
        className="side-nav-item"
        style={{
          color: 'var(--danger)',
          height: large ? 44 : 36,
          fontSize: large ? 14.5 : 13,
          borderRadius: large ? 10 : 8,
        }}
      >
        <span style={{ fontSize: large ? 17 : 15 }}><LogoutOutlined /></span>
        <span>退出账号{large ? `（${user?.username ?? ''}）` : ''}</span>
      </div>
    </div>
  );

  return (
    <>
      {isMobile ? (
        // ───── 移动端：固定顶栏 + 抽屉 ─────
        <div
          className="app-topbar"
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, height: 52, zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 12px',
            background: 'var(--bg)', borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div
              onClick={() => setDrawerOpen(true)}
              style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 8, color: 'var(--text)', fontSize: 18 }}
            >
              <MenuOutlined />
            </div>
            {brand}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              onClick={toggleTheme}
              className="side-nav-item"
              style={{ width: 34, height: 34, padding: 0, justifyContent: 'center' }}
              title={isDark ? '切换到浅色模式' : '切换到深色模式'}
            >
              {isDark ? <SunOutlined style={{ fontSize: 16 }} /> : <MoonOutlined style={{ fontSize: 16 }} />}
            </div>
            <div onClick={() => go('/user')} style={{ cursor: 'pointer', display: 'flex' }}>
              <Avatar size={30} icon={<UserOutlined />} style={{ backgroundColor: 'var(--primary)' }} />
            </div>
          </div>
        </div>
      ) : (
        // ───── 桌面：LibTV 风格固定左边栏 ─────
        <aside
          className="app-sidebar"
          style={{
            position: 'fixed', top: 0, left: 0, bottom: 0, width: 240, zIndex: 100,
            display: 'flex', flexDirection: 'column',
            padding: '14px 12px',
            background: 'var(--bg)', borderRight: '1px solid var(--border)',
            overflowY: 'auto',
          }}
        >
          <div style={{ padding: '4px 6px 14px' }}>{brand}</div>
          <div style={{ marginBottom: 14 }}>{createBtn}</div>
          {navList()}
          <div style={{ flex: 1, minHeight: 20 }} />
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 10 }}>
            {utilityRows()}
          </div>
        </aside>
      )}

      {/* 内容区（桌面左侧让出 240px / 移动端顶部让出 52px） */}
      <div className="app-shell">{children}</div>

      {/* 移动端抽屉 */}
      <Drawer
        placement="left"
        open={isMobile && drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={260}
        styles={{ body: { padding: '14px 12px' } }}
      >
        <div style={{ marginBottom: 14 }}>{brand}</div>
        <div style={{ marginBottom: 14 }}>{createBtn}</div>
        {navList(true)}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 12 }}>
          {utilityRows(true)}
        </div>
      </Drawer>
    </>
  );
}
