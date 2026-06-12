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
      {/* Left dark panel */}
      <div style={{
        flex: 1,
        background: 'linear-gradient(135deg, #001529 0%, #002140 50%, #003060 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 48,
      }}>
        <div style={{ textAlign: 'center' }}>
          <SafetyCertificateOutlined style={{ fontSize: 72, color: 'rgba(255,255,255,0.9)', marginBottom: 24 }} />
          <Title level={1} style={{ color: '#fff', marginBottom: 8, fontSize: 36, fontWeight: 700 }}>
            AI 动漫短剧
          </Title>
          <Title level={2} style={{ color: 'rgba(255,255,255,0.65)', margin: 0, fontSize: 20, fontWeight: 400 }}>
            管理后台
          </Title>
          <div style={{ marginTop: 48, padding: '16px 32px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, display: 'inline-block' }}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>仅限管理员账号登录</Text>
          </div>
        </div>
      </div>

      {/* Right login form */}
      <div style={{
        width: 480,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 64,
        background: '#fff',
      }}>
        <div style={{ marginBottom: 40 }}>
          <Title level={3} style={{ marginBottom: 8, color: '#001529' }}>管理员登录</Title>
          <Text type="secondary">请输入管理员账号以访问后台系统</Text>
        </div>

        <Form onFinish={onFinish} size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined style={{ color: '#999' }} />} placeholder="管理员用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined style={{ color: '#999' }} />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{
                height: 44,
                background: '#001529',
                borderColor: '#001529',
                fontSize: 16,
                fontWeight: 500,
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
