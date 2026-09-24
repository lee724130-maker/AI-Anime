import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Typography, Alert, message } from 'antd';
import { SafetyCertificateOutlined, MailOutlined, LockOutlined } from '@ant-design/icons';
import api from '../../services/api';
import { useAdminAuthStore } from '../../stores/authStore';

const { Title, Text } = Typography;

export default function AdminLoginPage() {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'login' | 'verify'>('login');
  const [tempToken, setTempToken] = useState('');
  const [email, setEmail] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [formVerify] = Form.useForm();
  const navigate = useNavigate();
  const setAuth = useAdminAuthStore((s) => s.setAuth);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Left brand panel */}
      <div
        className="login-left-panel"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 48,
          borderRight: '1px solid var(--border)',
          background: 'var(--surface)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <SafetyCertificateOutlined style={{ fontSize: 72, color: 'var(--primary)', marginBottom: 24 }} />
          <Title level={1} style={{ color: 'var(--text)', marginBottom: 8, fontSize: 36, fontWeight: 700 }}>
            AI Anime
          </Title>
          <Title level={2} style={{ color: 'var(--text-muted)', margin: 0, fontSize: 20, fontWeight: 400, letterSpacing: 4 }}>
            管理后台
          </Title>
          <div style={{ marginTop: 48, padding: '14px 36px', border: '1px solid var(--border)', borderRadius: 10, display: 'inline-block' }}>
            <Text style={{ color: 'var(--text-muted)', fontSize: 13 }}>仅限管理员账号登录</Text>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div
        className="login-form-panel"
        style={{
          flex: '0 0 auto',
          width: 460,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 'clamp(32px, 6vw, 64px)',
          background: 'var(--surface)',
        }}
      >
        {step === 'login' ? (
          <>
            <div style={{ marginBottom: 40 }}>
              <Title level={3} style={{ marginBottom: 8, color: 'var(--text)', fontWeight: 700 }}>
                管理员登录
              </Title>
              <Text style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
                请输入管理员账号以访问后台系统
              </Text>
            </div>

            <Form
              onFinish={async (values: { username: string; password: string }) => {
                setLoading(true);
                try {
                  const { data } = await api.post('/api/auth/login', values);
                  if (data.user.role !== 'admin' && !data.user.is_super_admin) {
                    message.error('非管理员账号，无权登录后台');
                    return;
                  }
                  if (data.requiresVerification) {
                    setTempToken(data.tempToken);
                    setEmail(data.user.email || '***@qq.com');
                    setStep('verify');
                    try {
                      await api.post('/api/auth/send-admin-code', { tempToken: data.tempToken });
                      message.info('验证码已发送至绑定邮箱');
                    } catch (err: any) {
                      message.error(err.response?.data?.message || '验证码发送失败');
                    }
                    setCountdown(60);
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
              }}
              size="large"
              layout="vertical"
              style={{ maxWidth: 400 }}
            >
              <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]} style={{ marginBottom: 24 }}>
                <Input placeholder="管理员用户名" style={{ height: 48 }} />
              </Form.Item>
              <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]} style={{ marginBottom: 32 }}>
                <Input.Password placeholder="密码" style={{ height: 48 }} />
              </Form.Item>
              <Form.Item style={{ marginBottom: 0 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  size="large"
                  style={{ height: 48, fontSize: 16, fontWeight: 600, borderRadius: 10 }}
                >
                  登录后台
                </Button>
              </Form.Item>
            </Form>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 40 }}>
              <Title level={3} style={{ marginBottom: 8, color: 'var(--text)', fontWeight: 700 }}>
                <MailOutlined style={{ marginRight: 8, color: 'var(--primary)' }} />
                安全验证
              </Title>
              <Text style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
                超级管理员登录需要邮箱验证码
              </Text>
            </div>

            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 24, borderRadius: 8 }}
              message={`验证码已发送至 ${email}`}
              description="请查收邮箱，输入6位验证码完成登录"
            />

            <Form
              form={formVerify}
              onFinish={async (values: { code: string }) => {
                setLoading(true);
                try {
                  const { data } = await api.post('/api/auth/verify-admin', { tempToken, code: values.code });
                  setAuth(data.user, data.access_token);
                  message.success('验证通过，登录成功');
                  navigate('/');
                } catch (err: any) {
                  // 停留在验证步骤，提示错误并清空输入框，可直接重输（不会退回账号密码步骤）
                  message.error(err.response?.data?.message || '验证码错误或已过期');
                  formVerify.resetFields(['code']);
                } finally {
                  setLoading(false);
                }
              }}
              size="large"
              layout="vertical"
              style={{ maxWidth: 400 }}
            >
              <Form.Item name="code" rules={[{ required: true, message: '请输入验证码' }]} style={{ marginBottom: 32 }}>
                <Input
                  placeholder="6位验证码"
                  maxLength={6}
                  autoFocus
                  style={{ height: 48, fontSize: 20, letterSpacing: 8, textAlign: 'center' }}
                  prefix={<LockOutlined style={{ color: 'var(--text-muted)' }} />}
                />
              </Form.Item>
              <Form.Item style={{ marginBottom: 16 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  size="large"
                  style={{ height: 48, fontSize: 16, fontWeight: 600, borderRadius: 10 }}
                >
                  验证并登录
                </Button>
              </Form.Item>
            </Form>

            <div style={{ textAlign: 'center' }}>
              <Button
                type="link"
                onClick={async () => {
                  try {
                    await api.post('/api/auth/send-admin-code', { tempToken });
                    setCountdown(60);
                    message.success('验证码已重新发送');
                  } catch (err: any) {
                    message.error(err.response?.data?.message || '发送失败');
                  }
                }}
                disabled={countdown > 0}
                style={{ fontSize: 14, color: 'var(--text-muted)' }}
              >
                {countdown > 0 ? `${countdown}秒后可重发` : '重新发送验证码'}
              </Button>
              <Button
                type="link"
                onClick={() => setStep('login')}
                style={{ fontSize: 14, color: 'var(--text-muted)', marginLeft: 16 }}
              >
                返回登录
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
