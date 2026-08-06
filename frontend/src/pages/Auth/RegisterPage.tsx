import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, SmileOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const sendCode = async () => {
    const email = form.getFieldValue('email');
    if (!email) {
      message.warning('请先输入邮箱');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      message.warning('邮箱格式不正确');
      return;
    }
    setSending(true);
    try {
      const { data } = await api.post('/api/auth/send-code', { email });
      message.success(data.message || '验证码已发送，请查收邮箱');
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) { clearInterval(timer); return 0; }
          return c - 1;
        });
      }, 1000);
    } catch (err: any) {
      message.error(err.response?.data?.message || '验证码发送失败');
    } finally {
      setSending(false);
    }
  };

  const onFinish = async (values: { username: string; email: string; code: string; password: string }) => {
    setLoading(true);
    try {
      await api.post('/api/auth/register', values);
      message.success('注册成功，请登录');
      navigate('/login', { replace: true });
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
          <Form form={form} onFinish={onFinish} size="large">
            <Form.Item name="username" rules={[{ required: true, min: 3, message: '用户名至少3位' }]}>
              <Input prefix={<UserOutlined style={{ color: '#10b981' }} />} placeholder="用户名（登录使用，3-50位）" />
            </Form.Item>
            <Form.Item name="email" rules={[{ required: true, type: 'email', message: '请输入正确的邮箱' }]}>
              <Input prefix={<MailOutlined style={{ color: '#10b981' }} />} placeholder="邮箱（接收验证码）" />
            </Form.Item>
            <Form.Item name="code" rules={[{ required: true, len: 6, message: '请输入6位验证码' }]}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input prefix={<LockOutlined style={{ color: '#10b981' }} />} placeholder="6位验证码" maxLength={6} />
                <Button
                  onClick={sendCode}
                  loading={sending}
                  disabled={countdown > 0}
                  style={{ width: 132, borderRadius: 8, flexShrink: 0 }}
                >
                  {countdown > 0 ? `${countdown}s 后重发` : '发送验证码'}
                </Button>
              </div>
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, min: 6, message: '密码至少6位' }]}>
              <Input.Password prefix={<LockOutlined style={{ color: '#10b981' }} />} placeholder="密码（至少6位）" />
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
