import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Typography, Descriptions, Button, Space, Avatar, Divider, Tag, message, Statistic, Row, Col,
} from 'antd';
import {
  ArrowLeftOutlined, WalletOutlined, UserOutlined, ThunderboltOutlined,
  CalendarOutlined, PhoneOutlined, CrownOutlined, LogoutOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import AppHeader from '../../components/AppHeader';

const { Title, Text } = Typography;

interface Profile {
  id: number;
  username: string;
  phone?: string;
  credits: number;
  role: string;
  created_at: string;
}

export default function UserPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const navigate = useNavigate();
  const { user, logout, refreshUser } = useAuthStore();

  useEffect(() => {
    api.get('/api/user/profile')
      .then(({ data }) => {
        setProfile(data);
        refreshUser();
      })
      .catch(() => navigate('/login'));
  }, [navigate, refreshUser]);

  const handleLogout = () => {
    logout();
    message.success('已退出登录');
    navigate('/login');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fb' }}>
      <AppHeader />
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 24px 0' }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <Title level={3} style={{ margin: 0 }}>个人中心</Title>
        </div>
        <Button className="back-btn" icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')} style={{ marginBottom: 16 }}>返回</Button>
      </div>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 24px 32px' }}>

        {/* User Card */}
        <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid #f0f0f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          styles={{ body: { padding: 32 } }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
            <Avatar size={72} icon={<UserOutlined />}
              style={{ backgroundColor: '#7c3aed', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <Space align="center" style={{ marginBottom: 4 }}>
                <Title level={3} style={{ margin: 0 }}>{profile?.username || user?.username || '-'}</Title>
                <Tag color={profile?.role === 'admin' ? 'purple' : 'blue'}>
                  {profile?.role === 'admin' ? '管理员' : '普通用户'}
                </Tag>
              </Space>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <Space>
                  <ThunderboltOutlined style={{ color: '#f59e0b' }} />
                  <Text strong style={{ fontSize: 16 }}>{profile?.credits ?? user?.credits ?? 0}</Text>
                  <Text type="secondary">算力</Text>
                </Space>
                {profile?.phone && (
                  <Space>
                    <PhoneOutlined style={{ color: '#52c41a' }} />
                    <Text>{profile.phone}</Text>
                  </Space>
                )}
                <Space>
                  <CalendarOutlined style={{ color: '#1890ff' }} />
                  <Text type="secondary">
                    {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('zh-CN') : '-'} 加入
                  </Text>
                </Space>
              </div>
            </div>
          </div>
          <Divider style={{ margin: '0 0 20px' }} />
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12}>
              <Button type="primary" size="large" icon={<WalletOutlined />} block
                onClick={() => navigate('/order')}
                style={{ borderRadius: 12, height: 48, fontWeight: 600 }}>
                充值算力
              </Button>
            </Col>
            <Col xs={24} sm={12}>
              <Button size="large" icon={<LogoutOutlined />} block
                onClick={handleLogout}
                style={{ borderRadius: 12, height: 48 }}>
                退出登录
              </Button>
            </Col>
          </Row>
        </Card>

        {/* Account Details */}
        <Card title={<Space><CrownOutlined style={{ color: '#7c3aed' }} />账户信息</Space>}
          style={{ borderRadius: 16, border: '1px solid #f0f0f0' }}
          styles={{ body: { padding: 24 } }}>
          {profile && (
            <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
              <Descriptions.Item label="用户 ID">{profile.id}</Descriptions.Item>
              <Descriptions.Item label="用户名">{profile.username}</Descriptions.Item>
              <Descriptions.Item label="手机号">{profile.phone || '未绑定'}</Descriptions.Item>
              <Descriptions.Item label="角色">
                <Tag color={profile.role === 'admin' ? 'purple' : 'blue'}>
                  {profile.role === 'admin' ? '管理员' : '普通用户'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="剩余算力">
                <Text strong style={{ color: '#f59e0b' }}>{profile.credits}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="注册时间">
                {new Date(profile.created_at).toLocaleDateString('zh-CN')}
              </Descriptions.Item>
            </Descriptions>
          )}
        </Card>

        {/* Quick Stats */}
        <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
          <Col xs={12}>
            <Card style={{ borderRadius: 12, textAlign: 'center' }}
              styles={{ body: { padding: 20 } }}>
              <Statistic title="可用算力" value={profile?.credits ?? user?.credits ?? 0}
                prefix={<ThunderboltOutlined style={{ color: '#f59e0b' }} />}
                valueStyle={{ color: '#7c3aed' }} />
            </Card>
          </Col>
          <Col xs={12}>
            <Card style={{ borderRadius: 12, textAlign: 'center' }}
              styles={{ body: { padding: 20 } }}
              hoverable onClick={() => navigate('/order')}>
              <Statistic title="充值" value="去充值"
                prefix={<WalletOutlined style={{ color: '#52c41a' }} />}
                valueStyle={{ color: '#7c3aed', fontSize: 16 }} />
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
}
