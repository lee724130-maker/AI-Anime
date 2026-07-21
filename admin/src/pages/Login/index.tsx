import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Typography, message } from 'antd';
import { UserOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import api from '../../services/api';
import { useAdminAuthStore } from '../../stores/authStore';

const { Title, Text } = Typography;

export default function AdminLoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAdminAuthStore((s) => s.setAuth);

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const { data } = await api.post('/api/auth/login', values);
      if (data.user.role !== 'admin') {
        message.error('非管理员账号，无权登录后台');
        return;
      }
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
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Left panel */}
      <div className="login-left-panel" style={{
        flex: 1,
        background: 'linear-gradient(135deg, #001529 0%, #002140 50%, #003060 100%)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
        padding: 48,
      }}>
        <div style={{ textAlign: 'center' }}>
          <SafetyCertificateOutlined style={{ fontSize: 72, color: 'rgba(255,255,255,0.9)', marginBottom: 24 }} />
          <Title level={1} style={{ color: '#fff', marginBottom: 8, fontSize: 36, fontWeight: 700, letterSpacing: 1 }}>
            AI 动漫短剧
          </Title>
          <Title level={2} style={{ color: 'rgba(255,255,255,0.65)', margin: 0, fontSize: 20, fontWeight: 400, letterSpacing: 4 }}>
            管理后台
          </Title>
          <div style={{ marginTop: 48, padding: '14px 36px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, display: 'inline-block', background: 'rgba(255,255,255,0.03)' }}>
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, letterSpacing: 1 }}>仅限管理员账号登录</Text>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="login-form-panel" style={{
        width: 460, display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: 64, background: '#fff',
      }}>
        <div style={{ marginBottom: 40 }}>
          <Title level={3} style={{ marginBottom: 8, color: '#001529', fontWeight: 700 }}>管理员登录</Title>
          <Text type="secondary" style={{ fontSize: 15 }}>请输入管理员账号以访问后台系统</Text>
        </div>

        <Form onFinish={onFinish} size="large" layout="vertical" style={{ maxWidth: 400 }}>
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]} style={{ marginBottom: 24 }}>
            <Input prefix={<UserOutlined style={{ color: '#bbb' }} />} placeholder="管理员用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]} style={{ marginBottom: 32 }}>
            <Input.Password prefix={<LockOutlined style={{ color: '#bbb' }} />} placeholder="密码" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              size="large"
              style={{
                height: 48, fontSize: 16, fontWeight: 600, borderRadius: 8,
                background: '#001529', borderColor: '#001529',
              }}
            >
              登录后台
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
}
