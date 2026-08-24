import { useEffect, useState, useCallback } from 'react';
import { Modal, Button } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export default function SessionExpiredModal() {
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);

  const handleExpired = useCallback(() => {
    setVisible(true);
  }, []);

  useEffect(() => {
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, [handleExpired]);

  const handleOk = () => {
    logout();
    setVisible(false);
    navigate('/login', { replace: true });
  };

  return (
    <Modal
      open={visible}
      closable={false}
      mask={{ closable: false }}
      title={
        <span>
          <ExclamationCircleOutlined style={{ color: '#faad14', marginRight: 8 }} />
          登录已过期
        </span>
      }
      width={400}
      footer={
        <Button type="primary" onClick={handleOk}>
          确认
        </Button>
      }
    >
      <span>您的登录凭证已失效，请重新登录。</span>
    </Modal>
  );
}
