import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout, Menu, Typography, Space, Row, Col, Card, Avatar, Dropdown } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  SettingOutlined,
  FileTextOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  KeyOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { useAdminAuthStore } from '../../stores/authStore';
import api from '../../services/api';
import ApiKeyManagePage from '../ApiKeyManage';
import LogsPage from '../Logs';
import UserManagePage from '../UserManage';
import SystemConfigPage from '../SystemConfig';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const menuItems = [
  { key: 'dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: 'apikeys', icon: <KeyOutlined />, label: 'API 密钥' },
  { key: 'users', icon: <UserOutlined />, label: '用户管理' },
  { key: 'logs', icon: <FileTextOutlined />, label: '系统日志' },
  { key: 'config', icon: <SettingOutlined />, label: '系统配置' },
];

function DashboardContent() {
  const [stats, setStats] = useState([
    { title: '用户总数', value: '-', color: '#1890ff', icon: <UserOutlined /> },
    { title: '剧本数量', value: '-', color: '#52c41a', icon: <FileTextOutlined /> },
    { title: '今日调用', value: '-', color: '#faad14', icon: <BarChartOutlined /> },
    { title: 'API 密钥', value: '-', color: '#722ed1', icon: <KeyOutlined /> },
  ]);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const { data } = await api.get('/api/admin/dashboard');
      setStats([
        { title: '用户总数', value: String(data.userCount ?? '-'), color: '#1890ff', icon: <UserOutlined /> },
        { title: '剧本数量', value: String(data.scriptCount ?? '-'), color: '#52c41a', icon: <FileTextOutlined /> },
        { title: '今日调用', value: String(data.todayCalls ?? '0'), color: '#faad14', icon: <BarChartOutlined /> },
        { title: 'API 密钥', value: String(data.apiKeyCount ?? '0'), color: '#722ed1', icon: <KeyOutlined /> },
      ]);
    } catch {
      // Use defaults if API not ready
    }
  };

  return (
    <>
      <Title level={3} style={{ marginBottom: 24 }}>仪表盘</Title>

      {/* Stats cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {stats.map((s) => (
          <Col xs={24} sm={12} lg={6} key={s.title}>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Text type="secondary">{s.title}</Text>
                  <Title level={3} style={{ margin: '4px 0 0' }}>{s.value}</Title>
                </div>
                <div style={{ fontSize: 36, color: s.color, opacity: 0.7 }}>{s.icon}</div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Quick links */}
      <Row gutter={[16, 16]}>
        {[
          { title: 'API 密钥配置', icon: <KeyOutlined />, desc: '管理第三方 AI API 密钥', color: '#52c41a', key: 'apikeys' },
          { title: '用户管理', icon: <UserOutlined />, desc: '查看和管理所有注册用户', color: '#1890ff', key: 'users' },
          { title: '系统日志', icon: <FileTextOutlined />, desc: '查看生成任务与接口调用日志', color: '#faad14', key: 'logs' },
          { title: '系统配置', icon: <SettingOutlined />, desc: '全局参数与限流策略配置', color: '#722ed1', key: 'config' },
        ].map((card) => (
          <Col xs={24} sm={12} lg={6} key={card.title}>
            <Card
              hoverable
              onClick={() => {
                const event = new CustomEvent('admin-menu-click', { detail: { key: card.key } });
                window.dispatchEvent(event);
              }}
            >
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ fontSize: 40, color: card.color, marginBottom: 12 }}>{card.icon}</div>
                <Title level={5} style={{ margin: '0 0 4px' }}>{card.title}</Title>
                <Text type="secondary" style={{ fontSize: 12 }}>{card.desc}</Text>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </>
  );
}

export default function DashboardPage() {
  const { user, logout } = useAdminAuthStore();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');

  // Listen for menu click events from DashboardContent cards
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setCurrentPage(detail.key);
    };
    window.addEventListener('admin-menu-click', handler);
    return () => window.removeEventListener('admin-menu-click', handler);
  }, []);

  const handleMenuClick = (e: { key: string }) => {
    setCurrentPage(e.key);
  };

  const renderContent = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardContent />;
      case 'apikeys':
        return <ApiKeyManagePage />;
      case 'users':
        return <UserManagePage />;
      case 'logs':
        return <LogsPage />;
      case 'config':
        return <SystemConfigPage />;
      default:
        return <DashboardContent />;
    }
  };

  const getPageTitle = () => {
    const item = menuItems.find((m) => m.key === currentPage);
    return item?.label || '仪表盘';
  };

  const userMenu = {
    items: [
      { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'logout') {
        logout();
        navigate('/login');
      }
    },
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Sidebar */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={220}
        style={{
          overflow: 'auto',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 10,
        }}
      >
        {/* Logo area */}
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          cursor: 'pointer',
        }} onClick={() => setCurrentPage('dashboard')}>
          <SafetyCertificateOutlined style={{ fontSize: collapsed ? 24 : 28, color: '#1890ff' }} />
          {!collapsed && (
            <span style={{ color: '#fff', marginLeft: 12, fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap' }}>
              AI 动漫 · 管理
            </span>
          )}
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[currentPage]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ marginTop: 8 }}
        />
      </Sider>

      {/* Main area */}
      <Layout style={{ marginLeft: collapsed ? 80 : 220, transition: 'margin-left 0.2s' }}>
        {/* Top header */}
        <Header style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: 64,
          position: 'sticky',
          top: 0,
          zIndex: 9,
        }}>
          <Title level={4} style={{ margin: 0, color: '#001529' }}>{getPageTitle()}</Title>
          <Dropdown menu={userMenu} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} style={{ background: '#001529' }} />
              <Text strong>{user?.username}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>管理员</Text>
            </Space>
          </Dropdown>
        </Header>

        {/* Content */}
        <Content style={{ margin: 24 }}>
          {renderContent()}
        </Content>
      </Layout>
    </Layout>
  );
}
