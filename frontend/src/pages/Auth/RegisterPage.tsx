import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Input, Button, Typography, message } from 'antd';
import api from '../../services/api';
import './auth.css';   // 与登录页共用样式（作用域 .auth-page）

const { Text } = Typography;

function passwordStrength(pw: string) {
  if (!pw) return { level: 0, label: '', color: '' };
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  // 强度色走全站令牌（原来是写死的 #ef4444/#f59e0b/#22c55e，与 --danger/--warning/--success 不同值）
  return score <= 2
    ? { level: 1, label: '弱', color: 'var(--danger)' }
    : score <= 3
      ? { level: 2, label: '中', color: 'var(--warning)' }
      : { level: 3, label: '强', color: 'var(--success)' };
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

  return (
    <div className="auth-page">
      <div className="auth-col">
        <div className="auth-brand">
          <div className="auth-wordmark">AI Anime</div>
          <Text className="auth-brand__sub">创建你的账号</Text>
        </div>
        <h1 className="auth-title">注册新账号</h1>
        <Text className="auth-lede">注册即送 100 积分，免费体验全部功能</Text>

        <div className="auth-card">
          <Form form={form} onFinish={onFinish} layout="vertical" size="large" requiredMark={false} style={{ marginBottom: 0 }}>
            <Form.Item name="username" rules={[{ required: true, min: 3, message: '用户名至少3位' }]}>
              <Input placeholder="用户名" autoComplete="username" />
            </Form.Item>
            <Form.Item name="email" rules={[{ required: true, type: 'email', message: '请输入正确的邮箱' }]}>
              <Input placeholder="邮箱" autoComplete="email" />
            </Form.Item>
            <Form.Item name="code" rules={[{ required: true, len: 6, message: '请输入6位验证码' }]}>
              <div className="auth-code-row">
                <Input placeholder="验证码" maxLength={6} inputMode="numeric" />
                <Button className="auth-btn-code" onClick={sendCode} loading={sending} disabled={countdown > 0}>
                  {countdown > 0 ? `${countdown}s` : '发送验证码'}
                </Button>
              </div>
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, min: 6, message: '密码至少6位' }]}>
              <Input.Password placeholder="密码（至少6位）" autoComplete="new-password" />
            </Form.Item>
            {passwordValue && (
              <div className="auth-strength" style={{ ['--st-color' as any]: strength.color }}>
                <div className="auth-strength__bars">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="auth-strength__seg" data-on={strength.level >= n ? '1' : '0'} />
                  ))}
                </div>
                <div className="auth-strength__label">密码强度：{strength.label}</div>
              </div>
            )}
            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" loading={loading} block className="auth-btn-submit">
                注册
              </Button>
            </Form.Item>
          </Form>
          <div className="auth-foot">
            {'已有账号？ '}
            <Link to="/login">去登录</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
