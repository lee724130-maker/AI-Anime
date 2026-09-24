import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Input, Button, Typography, message } from 'antd';
import api from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

const { Text } = Typography;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  return (
    <div
      className="auth-screen"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        background: 'var(--bg)',
        minHeight: '100vh',
      }}
    >
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: '-1px',
              background: 'linear-gradient(135deg, #7c3aed, #a855f7, #ec4899)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              lineHeight: 1.2,
              marginBottom: 8,
            }}
          >
            AI Anime
          </div>
          <Text style={{ display: 'block', fontSize: 14, color: 'var(--text-muted)' }}>
            登录你的账号
          </Text>
        </div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 400,
            color: 'var(--text)',
            marginBottom: 8,
            textAlign: 'center',
            lineHeight: 1.4,
          }}
        >
          欢迎回来
        </h1>
        <Text
          style={{
            display: 'block',
            textAlign: 'center',
            fontSize: 14,
            color: 'var(--text-secondary)',
            marginBottom: 32,
          }}
        >
          继续你的创作之旅
        </Text>
        <Form
          onFinish={async (values: { username: string; password: string }) => {
            setLoading(true);
            try {
              // 前台登录跳过超级管理员邮箱二次验证（管理后台另行 2FA）
              const { data } = await api.post('/api/auth/login', { ...values, skipVerification: true });
              if (!data.access_token) {
                message.error(data?.message || '登录失败');
                return;
              }
              setAuth(data.user, data.access_token);
              message.success('登录成功');
              navigate('/dashboard', { replace: true });
            } catch (err: any) {
              message.error(err.response?.data?.message || '登录失败');
            } finally {
              setLoading(false);
            }
          }}
          layout="vertical"
          size="large"
          requiredMark={false}
          style={{ marginBottom: 0 }}
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入邮箱或用户名' }]}
          >
            <Input
              placeholder="邮箱或用户名"
              style={{ height: 48, borderRadius: 8, fontSize: 14, border: '1px solid var(--border)' }}
            />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password
              placeholder="密码"
              style={{ height: 48, borderRadius: 8, fontSize: 14, border: '1px solid var(--border)' }}
            />
          </Form.Item>
          <div style={{ textAlign: 'right', marginBottom: 20, marginTop: -8 }}>
            <span
              style={{ color: 'var(--primary)', fontSize: 13, cursor: 'pointer' }}
              onClick={() => message.info('请联系客服重置密码')}
            >
              忘记密码？
            </span>
          </div>
          <Form.Item style={{ marginBottom: 16 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{ height: 44, borderRadius: 8, fontSize: 14, fontWeight: 600 }}
            >
              登录
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center' }}>
          <Text style={{ color: 'var(--text-muted)', fontSize: 13 }}>{'还没有账号？ '}</Text>
          <Link to="/register" style={{ color: 'var(--primary)', fontWeight: 500, fontSize: 13 }}>
            立即注册
          </Link>
        </div>
      </div>
    </div>
  );
}
