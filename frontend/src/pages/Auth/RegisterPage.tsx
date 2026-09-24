import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Input, Button, Typography, message } from 'antd';
import api from '../../services/api';

const { Text } = Typography;

function passwordStrength(pw: string) {
  if (!pw) return { level: 0, label: '', color: '' };
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score <= 2
    ? { level: 1, label: '弱', color: '#ef4444' }
    : score <= 3
      ? { level: 2, label: '中', color: '#f59e0b' }
      : { level: 3, label: '强', color: '#22c55e' };
}

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const passwordValue = Form.useWatch('password', form) || '';
  const strength = useMemo(() => passwordStrength(passwordValue), [passwordValue]);

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

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
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            countdownRef.current = null;
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (err: any) {
      message.error(err.response?.data?.message || '验证码发送失败');
    } finally {
      setSending(false);
    }
  };

  const onFinish = async (values: {
    username: string;
    email: string;
    code: string;
    password: string;
  }) => {
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

  const inputStyle = { height: 48, borderRadius: 8, fontSize: 14, border: '1px solid var(--border)' };

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
            创建你的账号
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
          注册新账号
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
          注册即送 100 积分，免费体验全部功能
        </Text>
        <Form
          form={form}
          onFinish={onFinish}
          layout="vertical"
          size="large"
          requiredMark={false}
          style={{ marginBottom: 0 }}
        >
          <Form.Item name="username" rules={[{ required: true, min: 3, message: '用户名至少3位' }]}>
            <Input placeholder="用户名" style={inputStyle} />
          </Form.Item>
          <Form.Item
            name="email"
            rules={[{ required: true, type: 'email', message: '请输入正确的邮箱' }]}
          >
            <Input placeholder="邮箱" style={inputStyle} />
          </Form.Item>
          <Form.Item name="code" rules={[{ required: true, len: 6, message: '请输入6位验证码' }]}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input placeholder="验证码" maxLength={6} style={{ ...inputStyle, flex: 1 }} />
              <Button
                onClick={sendCode}
                loading={sending}
                disabled={countdown > 0}
                style={{
                  width: 120,
                  height: 48,
                  flexShrink: 0,
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                {countdown > 0 ? `${countdown}s` : '发送验证码'}
              </Button>
            </div>
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, min: 6, message: '密码至少6位' }]}>
            <Input.Password placeholder="密码（至少6位）" style={inputStyle} />
          </Form.Item>
          {passwordValue && (
            <div style={{ marginTop: -12, marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    style={{
                      flex: 1,
                      height: 3,
                      borderRadius: 2,
                      background: strength.level >= n ? strength.color : 'var(--border)',
                      transition: 'background 0.25s ease',
                    }}
                  />
                ))}
              </div>
              <div style={{ fontSize: 12, marginTop: 4, color: strength.color, fontWeight: 500 }}>
                密码强度：{strength.label}
              </div>
            </div>
          )}
          <Form.Item style={{ marginBottom: 16 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{ height: 44, borderRadius: 8, fontSize: 14, fontWeight: 600 }}
            >
              注册
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center' }}>
          <Text style={{ color: 'var(--text-muted)', fontSize: 13 }}>{'已有账号？ '}</Text>
          <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 500, fontSize: 13 }}>
            去登录
          </Link>
        </div>
      </div>
    </div>
  );
}
