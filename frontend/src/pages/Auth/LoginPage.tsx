import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Input, Button, Typography, Alert, message } from 'antd';
import api from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

const { Text } = Typography;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'login' | 'verify'>('login');
  const [tempToken, setTempToken] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [formVerify] = Form.useForm();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  /** 申请发送超级管理员验证码（登录切换到验证步骤时自动调用 / 重发按钮调用）
   *  token 必须显式传入登录响应里的 tempToken —— 自动调用发生在 setState 同一事件里，
   *  闭包里的 state 还是旧值（首登为空串 → 后端 400「无效的验证令牌或令牌已过期」）。 */
  const sendCode = async (auto: boolean, token?: string) => {
    try {
      await api.post('/api/auth/send-admin-code', { tempToken: token || tempToken });
      setCountdown(60);
      if (auto) message.info('验证码已发送至绑定邮箱');
      else message.success('验证码已重新发送');
    } catch (err: any) {
      message.error(err.response?.data?.message || '验证码发送失败');
    }
  };

  const loginForm = (
    <Form
      onFinish={async (values: { username: string; password: string }) => {
        setLoading(true);
        try {
          const { data } = await api.post('/api/auth/login', values);
          if (data.requiresVerification) {
            // 超级管理员：进入邮箱验证码步骤（前台不再跳过 2FA）
            setTempToken(data.tempToken);
            setMaskedEmail(data.user?.email || '***@qq.com');
            setStep('verify');
            void sendCode(true, data.tempToken);
            return;
          }
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
  );

  const verifyForm = (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 24, borderRadius: 8 }}
        message={`验证码已发送至 ${maskedEmail}`}
        description="超级管理员登录需邮箱验证码，请查收后输入 6 位验证码完成登录"
      />
      <Form
        form={formVerify}
        onFinish={async (values: { code: string }) => {
          setLoading(true);
          try {
            const { data } = await api.post('/api/auth/verify-admin', { tempToken, code: values.code });
            setAuth(data.user, data.access_token);
            message.success('验证通过，登录成功');
            navigate('/dashboard', { replace: true });
          } catch (err: any) {
            // 停留在验证步骤，提示错误并清空输入框，可直接重输
            message.error(err.response?.data?.message || '验证码错误或已过期');
            formVerify.resetFields(['code']);
          } finally {
            setLoading(false);
          }
        }}
        layout="vertical"
        size="large"
        requiredMark={false}
        style={{ marginBottom: 0 }}
      >
        <Form.Item name="code" rules={[{ required: true, message: '请输入验证码' }]}>
          <Input
            placeholder="6位验证码"
            maxLength={6}
            autoFocus
            style={{ height: 48, borderRadius: 8, fontSize: 20, letterSpacing: 8, textAlign: 'center', border: '1px solid var(--border)' }}
          />
        </Form.Item>
        <Form.Item style={{ marginBottom: 12 }}>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            block
            style={{ height: 44, borderRadius: 8, fontSize: 14, fontWeight: 600 }}
          >
            验证并登录
          </Button>
        </Form.Item>
      </Form>
      <div style={{ textAlign: 'center' }}>
        <Button
          type="link"
          onClick={() => void sendCode(false)}
          disabled={countdown > 0}
          style={{ fontSize: 13, color: countdown > 0 ? 'var(--text-muted)' : 'var(--primary)', padding: 0 }}
        >
          {countdown > 0 ? `${countdown}s 后可重发` : '重新发送验证码'}
        </Button>
        <Button
          type="link"
          onClick={() => setStep('login')}
          style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 16, padding: 0 }}
        >
          返回登录
        </Button>
      </div>
    </>
  );

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
            {step === 'login' ? '登录你的账号' : '超级管理员安全验证'}
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
          {step === 'login' ? '欢迎回来' : '邮箱验证'}
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
          {step === 'login' ? '继续你的创作之旅' : '请输入邮箱收到的 6 位验证码'}
        </Text>
        {step === 'login' ? loginForm : verifyForm}
        {step === 'login' && (
          <div style={{ textAlign: 'center' }}>
            <Text style={{ color: 'var(--text-muted)', fontSize: 13 }}>{'还没有账号？ '}</Text>
            <Link to="/register" style={{ color: 'var(--primary)', fontWeight: 500, fontSize: 13 }}>
              立即注册
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
