import { useEffect, useState } from 'react';
import { Modal, Checkbox, Button, Typography, Space } from 'antd';
import { ExperimentOutlined } from '@ant-design/icons';
import { useAuthStore } from '../stores/authStore';
import api from '../services/api';

const { Paragraph, Text } = Typography;

export default function TestNoticeModal() {
  const { token, user } = useAuthStore();
  const [visible, setVisible] = useState(false);
  const [noAgain, setNoAgain] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!token || !user) return;

    const sessionKey = `tn_shown_${user.id}`;
    if (sessionStorage.getItem(sessionKey)) { setChecked(true); return; }
    const dismissKey = `tn_dismissed_${user.id}`;
    if (localStorage.getItem(dismissKey)) { setChecked(true); return; }

    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/api/user/profile');
        if (cancelled) return;
        if (data && data.test_notice_dismissed) {
          localStorage.setItem(dismissKey, '1');
          setChecked(true);
          return;
        }
        setVisible(true);
        sessionStorage.setItem(sessionKey, '1');
      } catch {
        if (!cancelled) setVisible(true);
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  if (!checked) return null;

  const handleConfirm = async () => {
    setLoading(true);
    if (noAgain && user) {
      try {
        await api.post('/api/user/dismiss-test-notice');
        localStorage.setItem(`tn_dismissed_${user.id}`, '1');
      } catch {
        // 接口失败不阻断关闭，下次登录仍会提示
      }
    }
    setLoading(false);
    setVisible(false);
  };

  return (
    <Modal
      open={visible}
      title={
        <Space>
          <ExperimentOutlined style={{ color: 'var(--primary)' }} />
          <span>测试版说明</span>
        </Space>
      }
      closable={false}
      mask={{ closable: false }}
      width={520}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Checkbox checked={noAgain} onChange={(e) => setNoAgain(e.target.checked)}>
            不再提示
          </Checkbox>
          <Button type="primary" loading={loading} onClick={handleConfirm}>
            确认
          </Button>
        </div>
      }
    >
      <Paragraph style={{ marginBottom: 8 }}>
        感谢您体验 <Text strong>AI 短剧创作平台</Text>！
      </Paragraph>
      <Paragraph style={{ marginBottom: 8 }}>
        目前该网站还处于<Text strong>测试状态</Text>，<Text strong>支付功能暂时未开通</Text>，注册即可获赠{' '}
        <Text strong type="success">100 积分</Text>。
      </Paragraph>
      <Paragraph style={{ marginBottom: 0 }}>
        您可以先使用积分体验文生图、文生视频、热门创作解析、短剧生成等全部功能； 正式版上线后将开放充值渠道，届时积分不足也能随时补充。
      </Paragraph>
    </Modal>
  );
}
