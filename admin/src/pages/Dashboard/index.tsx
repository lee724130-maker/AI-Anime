import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Typography, Space, Row, Col, Card, Avatar, Dropdown, Badge } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  SettingOutlined,
  FileTextOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  KeyOutlined,
  BarChartOutlined,
  BellOutlined,
  CloudServerOutlined,
  FormOutlined,
} from '@ant-design/icons';
import { useAdminAuthStore } from '../../stores/authStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useNotificationSocket } from '../../hooks/useNotificationSocket';
import api from '../../services/api';
import ApiKeyManagePage from '../ApiKeyManage';
import LogsPage from '../Logs';
import UserManagePage from '../UserManage';
import SystemConfigPage from '../SystemConfig';
import NotificationsPage from '../Notifications';
import ModelManagePage from '../ModelManage';
import PromptTemplatePage from '../PromptTemplate';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const menuItems = [
  { key: 'dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: 'apikeys', icon: <KeyOutlined />, label: 'API 密钥' },
  { key: 'models', icon: <CloudServerOutlined />, label: '模型管理' },
  { key: 'prompts', icon: <FormOutlined />, label: '提示词模板' },
  { key: 'users', icon: <UserOutlined />, label: '用户管理' },
  { key: 'logs', icon: <FileTextOutlined />, label: '系统日志' },
  { key: 'config', icon: <SettingOutlined />, label: '系统配置' },
];

function DashboardContent() {
  const navigate = useNavigate();
  const [stats, setStats] = useState([
    { title: '用户总数', value: '-', color: '#1890ff', icon: <UserOutlined /> },
    { title: '剧本数量', value: '-', color: '#52c41a', icon: <FileTextOutlined /> },
    { title: '今日调用', value: '-', color: '#faad14', icon: <BarChartOutlined /> },
    { title: 'API 密钥', value: '-', color: '#722ed1', icon: <KeyOutlined /> },
  ]);

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    try {
      const { data } = await api.get('/api/admin/dashboard');
      setStats([
        { title: '用户总数', value: String(data.userCount ?? '-'), color: '#1890ff', icon: <UserOutlined /> },
        { title: '剧本数量', value: String(data.scriptCount ?? '-'), color: '#52c41a', icon: <FileTextOutlined /> },
        { title: '今日调用', value: String(data.todayCalls ?? '0'), color: '#faad14', icon: <BarChartOutlined /> },
        { title: 'API 密钥', value: String(data.apiKeyCount ?? '0'), color: '#722ed1', icon: <KeyOutlined /> },
      ]);
    } catch {}
  };

  return (
    <>
      <Title level={3} style={{ marginBottom: 24 }}>仪表盘</Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {stats.map((s) => (
          <Col xs={24} sm={12} lg={6} key={s.title}>
            <Card className="stat-card" styles={{ body: { padding: 20 } }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 13 }}>{s.title}</Text>
                  <Title level={2} style={{ margin: '4px 0 0', color: s.color }}>{s.value}</Title>
                </div>
                <div style={{ fontSize: 40, color: s.color, opacity: 0.25 }}>{s.icon}</div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Title level={5} style={{ marginBottom: 16, color: '#888', fontWeight: 500 }}>快捷入口</Title>
      <Row gutter={[16, 16]}>
        {[
          { title: 'API 密钥配置', icon: <KeyOutlined />, desc: '管理第三方 AI API 密钥', color: '#52c41a', key: 'apikeys' },
          { title: '用户管理', icon: <UserOutlined />, desc: '查看和管理所有注册用户', color: '#1890ff', key: 'users' },
          { title: '系统日志', icon: <FileTextOutlined />, desc: '查看生成任务与接口调用日志', color: '#faad14', key: 'logs' },
          { title: '系统配置', icon: <SettingOutlined />, desc: '全局参数与限流策略配置', color: '#722ed1', key: 'config' },
        ].map((card) => (
          <Col xs={24} sm={12} lg={6} key={card.title}>
            <Card className="quick-link-card" hoverable onClick={() => navigate('/' + card.key)}
              styles={{ body: { padding: 24 } }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 28,
                  background: `${card.color}12`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 14px',
                }}>
                  <span style={{ fontSize: 26, color: card.color }}>{card.icon}</span>
                </div>
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

function currentKeyFromPath(pathname: string): string {
  const p = pathname.replace(/^\//, '');
  const valid = new Set(['dashboard', 'apikeys', 'models', 'prompts', 'users', 'logs', 'config', 'notifications']);
  return valid.has(p) ? p : 'dashboard';
}

export default function DashboardPage() {
  const { user, logout } = useAdminAuthStore();
  const { unreadCount } = useNotificationStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  useNotificationSocket();

  const currentPage = currentKeyFromPath(location.pathname);

  const handleMenuClick = (e: { key: string }) => {
    navigate('/' + e.key);
  };

  const renderContent = () => {
    switch (currentPage) {
      case 'dashboard': return <DashboardContent />;
      case 'apikeys': return <ApiKeyManagePage />;
      case 'users': return <UserManagePage />;
      case 'logs': return <LogsPage />;
      case 'config': return <SystemConfigPage />;
      case 'models': return <ModelManagePage />;
      case 'prompts': return <PromptTemplatePage />;
      case 'notifications': return <NotificationsPage />;
      default: return <DashboardContent />;
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
      <Sider
        collapsible collapsed={collapsed} onCollapse={setCollapsed}
        width={220}
        style={{ overflow: 'auto', position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 10 }}
      >
        <div style={{
          height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
        }} onClick={() => navigate('/dashboard')}>
          <SafetyCertificateOutlined style={{ fontSize: collapsed ? 24 : 26, color: '#1890ff' }} />
          {!collapsed && (
            <span style={{ color: '#fff', marginLeft: 10, fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap' }}>
              AI 动漫 · 管理
            </span>
          )}
        </div>
        <Menu
          theme="dark" mode="inline"
          selectedKeys={[currentPage]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ marginTop: 4 }}
        />
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 220, transition: 'margin-left 0.2s' }}>
        <Header style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          height: 64, position: 'sticky', top: 0, zIndex: 9,
        }}>
          <Title level={4} style={{ margin: 0, color: '#001529', fontWeight: 600 }}>{getPageTitle()}</Title>
          <Space size={20}>
            <Badge count={unreadCount} size="small" offset={[-4, 4]}>
              <BellOutlined style={{ fontSize: 20, color: '#595959', cursor: 'pointer' }}
                onClick={() => navigate('/notifications')} />
            </Badge>
            <Dropdown menu={userMenu} placement="bottomRight">
              <Space style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 6, transition: 'background 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <Avatar size={32} icon={<UserOutlined />} style={{ background: '#001529' }} />
                <Text strong>{user?.username}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>管理员</Text>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{ margin: 24, minHeight: 360 }}>
          {renderContent()}
        </Content>
      </Layout>
    </Layout>
  );
}
