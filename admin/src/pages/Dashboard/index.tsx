import { useState, useEffect, useMemo } from 'react';
import { Layout, Menu, Dropdown, Badge, Avatar, Typography, Space } from 'antd';
import {
  DashboardOutlined,
  KeyOutlined,
  CloudServerOutlined,
  FormOutlined,
  UserOutlined,
  SafetyOutlined,
  DollarOutlined,
  FileTextOutlined,
  SettingOutlined,
  CloudSyncOutlined,
  DatabaseOutlined,
  SafetyCertificateOutlined,
  SunOutlined,
  MoonOutlined,
  BellOutlined,
  CrownOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAdminAuthStore } from '../../stores/authStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useTheme } from '../../hooks/useTheme';
import { useNotificationSocket } from '../../hooks/useNotificationSocket';
import DashboardHome from './Home';
import ApiKeyManagePage from '../ApiKeyManage';
import UserManagePage from '../UserManage';
import AccessStatsPage from '../AccessStats';
import LogsPage from '../Logs';
import SystemConfigPage from '../SystemConfig';
import ModelManagePage from '../ModelManage';
import PromptTemplatePage from '../PromptTemplate';
import NotificationsPage from '../Notifications';
import PaymentsPage from '../Payments';
import ServerPage from '../Server';
import DatabasePage from '../Database';

const { Title, Text } = Typography;
const { Header, Sider, Content } = Layout;

// Sxe — path → page key
function resolveKey(pathname: string): string {
  const key = pathname.replace(/^\//, '');
  return new Set([
    'dashboard',
    'apikeys',
    'models',
    'prompts',
    'users',
    'logs',
    'config',
    'notifications',
    'access',
    'payments',
    'server',
    'database',
  ]).has(key)
    ? key
    : 'dashboard';
}

// $9 — admin menu
const MENU = [
  { key: 'dashboard', icon: <DashboardOutlined />, label: '仪表盘', permission: 'dashboard' },
  { key: 'apikeys', icon: <KeyOutlined />, label: 'API 密钥', permission: 'apikeys' },
  { key: 'models', icon: <CloudServerOutlined />, label: '模型管理', permission: 'models' },
  { key: 'prompts', icon: <FormOutlined />, label: '提示词模板', permission: 'prompts' },
  { key: 'users', icon: <UserOutlined />, label: '用户管理', permission: 'users' },
  { key: 'access', icon: <SafetyOutlined />, label: '访问统计', permission: 'access' },
  { key: 'payments', icon: <DollarOutlined />, label: '支付记录', permission: 'payments' },
  { key: 'logs', icon: <FileTextOutlined />, label: '系统日志', permission: 'logs' },
  { key: 'config', icon: <SettingOutlined />, label: '系统配置', permission: 'config' },
  { key: 'server', icon: <CloudSyncOutlined />, label: '服务器管理', permission: 'server', superAdminOnly: true },
  { key: 'database', icon: <DatabaseOutlined />, label: '数据库操作', permission: 'database', superAdminOnly: true },
] as const;

type MenuItemDef = (typeof MENU)[number];

// Cxe — admin layout
export default function AdminLayout() {
  const user = useAdminAuthStore((s) => s.user);
  const logout = useAdminAuthStore((s) => s.logout);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const { isDark, toggleTheme } = useTheme();
  const nav = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => window.innerWidth <= 768);

  useNotificationSocket();

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setCollapsed(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const selectedKey = resolveKey(location.pathname);

  const menuItems = useMemo(() => {
    const strip = (items: MenuItemDef[]) => items.map(({ superAdminOnly: _s, ...rest }: any) => rest);
    if (user?.is_super_admin) return strip(MENU as any);
    if (!user?.admin_permissions) return strip(MENU.filter((m: any) => !m.superAdminOnly) as any);
    try {
      const perms = JSON.parse(user.admin_permissions);
      return strip(
        Array.isArray(perms)
          ? (MENU.filter(
              (m: any) =>
                !m.superAdminOnly &&
                perms.some((p: string) => p === m.permission || p.startsWith(m.permission + ':')),
            ) as any)
          : (MENU.filter((m: any) => !m.superAdminOnly) as any),
      );
    } catch {
      return strip(MENU.filter((m: any) => !m.superAdminOnly) as any);
    }
  }, [user]);

  const onMenuClick = ({ key }: { key: string }) => {
    nav('/' + key);
  };

  const renderPage = () => {
    if ((selectedKey === 'server' || selectedKey === 'database') && !user?.is_super_admin) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Title level={4} type="warning">
            无权访问
          </Title>
          <Text type="secondary">此功能仅超级管理员可用</Text>
        </div>
      );
    }
    switch (selectedKey) {
      case 'dashboard':
        return <DashboardHome />;
      case 'apikeys':
        return <ApiKeyManagePage />;
      case 'users':
        return <UserManagePage />;
      case 'access':
        return <AccessStatsPage />;
      case 'logs':
        return <LogsPage />;
      case 'config':
        return <SystemConfigPage />;
      case 'models':
        return <ModelManagePage />;
      case 'prompts':
        return <PromptTemplatePage />;
      case 'notifications':
        return <NotificationsPage />;
      case 'payments':
        return <PaymentsPage />;
      case 'server':
        return <ServerPage />;
      case 'database':
        return <DatabasePage />;
      default:
        return (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Title level={3} style={{ marginBottom: 8 }}>
              404
            </Title>
            <Text type="secondary">页面不存在</Text>
          </div>
        );
    }
  };

  const pageTitle = menuItems.find((m: any) => m.key === selectedKey)?.label || '仪表盘';

  const userMenu = {
    items: [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true }],
    onClick: ({ key }: { key: string }) => {
      if (key === 'logout') {
        logout();
        nav('/login');
      }
    },
  };

  return (
    <Layout className="admin-main-layout" style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={220}
        className="admin-sider"
        style={{ overflow: 'auto', position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 10 }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid var(--border)',
            cursor: 'pointer',
          }}
          onClick={() => nav('/dashboard')}
        >
          <SafetyCertificateOutlined style={{ fontSize: collapsed ? 24 : 26, color: 'var(--primary)' }} />
          {!collapsed && (
            <span
              style={{
                color: 'var(--text)',
                marginLeft: 10,
                fontSize: 16,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              AI Anime
            </span>
          )}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems as any}
          onClick={onMenuClick}
          style={{ marginTop: 4 }}
        />
      </Sider>
      <Layout
        style={{ marginLeft: collapsed ? 80 : 220, transition: 'margin-left 0.2s' }}
        className="admin-content-layout"
      >
        <Header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            height: 64,
            position: 'sticky',
            top: 0,
            zIndex: 9,
          }}
        >
          <Title level={4} style={{ margin: 0, color: 'var(--text)', fontWeight: 600 }}>
            {pageTitle}
          </Title>
          <Space size={20}>
            <span
              onClick={toggleTheme}
              style={{
                fontSize: 20,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'color 0.2s',
                lineHeight: 1,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
            >
              {isDark ? <SunOutlined /> : <MoonOutlined />}
            </span>
            <Badge count={unreadCount} size="small" offset={[-4, 4]}>
              <BellOutlined
                style={{ fontSize: 20, color: 'var(--text-secondary)', cursor: 'pointer' }}
                onClick={() => nav('/notifications')}
              />
            </Badge>
            <Dropdown menu={userMenu} placement="bottomRight">
              <Space
                style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 8, transition: 'background 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-bg)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Avatar
                  size={32}
                  icon={<UserOutlined />}
                  style={{ background: user?.is_super_admin ? '#7C3AED' : 'var(--border)' }}
                />
                <span
                  className="admin-header-username"
                  style={{ color: 'var(--text)', fontWeight: 600 }}
                >
                  {user?.username}
                </span>
                {user?.is_super_admin ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#7C3AED',
                    }}
                  >
                    <CrownOutlined style={{ fontSize: 13 }} />
                    超级管理员
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>管理员</span>
                )}
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{ margin: 24, minHeight: 360 }}>{renderPage()}</Content>
      </Layout>
    </Layout>
  );
}
