import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { UserOutlined, LockOutlined, PhoneOutlined, SmileOutlined } from '@ant-design/icons';
import api from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

const { Title, Text } = Typography;

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const onFinish = async (values: { username: string; password: string; phone?: string }) => {
    setLoading(true);
    try {
      const { data } = await api.post('/api/auth/register', values);
      setAuth(data.user, data.access_token);
      message.success('注册成功');
      navigate('/');
    } catch (err: any) {
      message.error(err.response?.data?.message || '注册失败');
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
          background: 'linear-gradient(135deg, #059669 0%, #10b981 40%, #34d399 100%)',
          padding: '40px 24px 32px',
          textAlign: 'center',
        }}>
          <SmileOutlined style={{ fontSize: 52, color: '#fff', marginBottom: 12 }} />
          <Title level={2} style={{ color: '#fff', margin: 0, fontWeight: 700 }}>
            加入我们
          </Title>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>
            创建账号，开始AI创作之旅
          </Text>
        </div>

        {/* Form */}
        <div style={{ padding: '32px 36px 36px' }}>
          <Form onFinish={onFinish} size="large">
            <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input prefix={<UserOutlined style={{ color: '#10b981' }} />} placeholder="用户名" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, min: 6, message: '密码至少6位' }]}>
              <Input.Password prefix={<LockOutlined style={{ color: '#10b981' }} />} placeholder="密码" />
            </Form.Item>
            <Form.Item name="phone">
              <Input prefix={<PhoneOutlined style={{ color: '#10b981' }} />} placeholder="手机号（选填）" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 12 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                size="large"
                style={{ background: 'linear-gradient(135deg, #059669, #10b981)', border: 'none' }}
              >
                注册
              </Button>
            </Form.Item>
          </Form>
          <div style={{ textAlign: 'center' }}>
            <Text type="secondary">已有账号？</Text>{' '}
            <Link to="/login" style={{ color: '#059669', fontWeight: 500 }}>去登录</Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
