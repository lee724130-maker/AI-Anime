import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { UserOutlined, LockOutlined, PlayCircleOutlined } from '@ant-design/icons';
import api from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

const { Title, Text } = Typography;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const { data } = await api.post('/api/auth/login', values);
      setAuth(data.user, data.access_token);
      message.success('登录成功');
      navigate('/');
    } catch (err: any) {
      message.error(err.response?.data?.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #ede9fe 0%, #fce7f3 50%, #fef3c7 100%)',
    }}>
      <Card style={{ width: 420, borderRadius: 16, overflow: 'hidden' }} styles={{ body: { padding: 0 } }}>
        {/* Hero banner */}
        <div style={{
          background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 30%, #ec4899 70%, #f59e0b 100%)',
          padding: '40px 24px 32px',
          textAlign: 'center',
        }}>
          <PlayCircleOutlined style={{ fontSize: 52, color: '#fff', marginBottom: 12 }} />
          <Title level={2} style={{ color: '#fff', margin: 0, fontWeight: 700, letterSpacing: 2 }}>
            AI 动漫短剧
          </Title>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>
            用AI打造你的动漫世界
          </Text>
        </div>

        {/* Form */}
        <div style={{ padding: '32px 36px 36px' }}>
          <Form onFinish={onFinish} size="large">
            <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input prefix={<UserOutlined style={{ color: '#a78bfa' }} />} placeholder="用户名" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<LockOutlined style={{ color: '#a78bfa' }} />} placeholder="密码" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 12 }}>
              <Button type="primary" htmlType="submit" loading={loading} block size="large">
                登录
              </Button>
            </Form.Item>
          </Form>
          <div style={{ textAlign: 'center' }}>
            <Text type="secondary">还没有账号？</Text>{' '}
            <Link to="/register" style={{ color: '#7c3aed', fontWeight: 500 }}>立即注册</Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
