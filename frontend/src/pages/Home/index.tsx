import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Typography, Space, Card, Row, Col, Avatar } from 'antd';
import {
  ThunderboltOutlined,
  ArrowRightOutlined,
  FileTextOutlined,
  TeamOutlined,
  VideoCameraOutlined,
  UserOutlined,
  SettingOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../stores/authStore';

const { Title, Text } = Typography;

export default function HomePage() {
  const { user, logout, refreshUser } = useAuthStore();
  const navigate = useNavigate();

  // Refresh credits from server every time user visits the home page
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fb' }}>
      {/* Top bar */}
      <div style={{
        background: '#fff',
        padding: '12px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #f0f0f0',
      }}>
        <Text strong style={{ fontSize: 17, color: '#7c3aed' }}>🎬 AI 动漫短剧</Text>
        <Space size={20}>
          <Space>
            <Avatar icon={<UserOutlined />} size={32} style={{ background: '#7c3aed' }} />
            <div>
              <Text strong style={{ fontSize: 14 }}>{user?.username}</Text>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', lineHeight: 1 }}>
                <ThunderboltOutlined style={{ color: '#f59e0b', fontSize: 11 }} /> {user?.credits ?? 100} 算力
              </Text>
            </div>
          </Space>
          <Button type="text" icon={<WalletOutlined />} onClick={() => navigate('/order')}>充值</Button>
          <Button type="text" icon={<SettingOutlined />} onClick={() => navigate('/user')} />
          <Button type="text" danger onClick={() => { logout(); navigate('/login'); }}>退出</Button>
        </Space>
      </div>

      {/* Hero */}
      <div style={{
        textAlign: 'center',
        padding: '64px 24px 48px',
        background: 'linear-gradient(180deg, #fff 0%, #f8f9fb 100%)',
      }}>
        <Title level={1} style={{
          fontSize: 42, fontWeight: 800, margin: '0 0 16px',
          background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          用 AI 创造动漫世界
        </Title>
        <Text type="secondary" style={{ fontSize: 17, display: 'block', marginBottom: 40 }}>
          输入角色和剧情，AI 自动生成动漫短视频
        </Text>

        {/* Main CTA */}
        <Link to="/studio">
          <Button
            type="primary"
            size="large"
            icon={<ArrowRightOutlined />}
            style={{
              height: 52, padding: '0 40px', borderRadius: 14,
              fontSize: 17, fontWeight: 600,
              background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
              border: 'none', boxShadow: '0 4px 20px rgba(124,58,237,0.35)',
            }}
          >
            开始创作
          </Button>
        </Link>
      </div>

      {/* Quick links */}
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 24px 48px' }}>
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={6}>
            <Link to="/script" style={{ textDecoration: 'none' }}>
              <Card hoverable style={{ borderRadius: 14, textAlign: 'center', border: '1px solid #f0f0f0', boxShadow: 'none' }}>
                <FileTextOutlined style={{ fontSize: 24, color: '#7c3aed', marginBottom: 8 }} />
                <div><Text style={{ fontSize: 14 }}>剧本</Text></div>
              </Card>
            </Link>
          </Col>
          <Col xs={12} sm={6}>
            <Link to="/character" style={{ textDecoration: 'none' }}>
              <Card hoverable style={{ borderRadius: 14, textAlign: 'center', border: '1px solid #f0f0f0', boxShadow: 'none' }}>
                <TeamOutlined style={{ fontSize: 24, color: '#ec4899', marginBottom: 8 }} />
                <div><Text style={{ fontSize: 14 }}>角色</Text></div>
              </Card>
            </Link>
          </Col>
          <Col xs={12} sm={6}>
            <Link to="/video" style={{ textDecoration: 'none' }}>
              <Card hoverable style={{ borderRadius: 14, textAlign: 'center', border: '1px solid #f0f0f0', boxShadow: 'none' }}>
                <VideoCameraOutlined style={{ fontSize: 24, color: '#f59e0b', marginBottom: 8 }} />
                <div><Text style={{ fontSize: 14 }}>作品</Text></div>
              </Card>
            </Link>
          </Col>
          <Col xs={12} sm={6}>
            <Link to="/order" style={{ textDecoration: 'none' }}>
              <Card hoverable style={{ borderRadius: 14, textAlign: 'center', border: '1px solid #f0f0f0', boxShadow: 'none' }}>
                <WalletOutlined style={{ fontSize: 24, color: '#059669', marginBottom: 8 }} />
                <div><Text style={{ fontSize: 14 }}>充值</Text></div>
              </Card>
            </Link>
          </Col>
        </Row>
      </div>
    </div>
  );
}
