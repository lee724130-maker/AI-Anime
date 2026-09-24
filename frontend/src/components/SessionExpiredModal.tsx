import { useCallback, useEffect, useState } from 'react';
import { Modal, Button } from 'antd';
import { StopOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

// 生产 bundle uI 逐字还原（401 → auth:expired / 403 → auth:banned 双分支）
export default function SessionExpiredModal() {
  const [open, setOpen] = useState(false);
  const [banned, setBanned] = useState(false);
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);

  const handleExpired = useCallback(() => {
    setBanned(false);
    setOpen(true);
  }, []);

  const handleBanned = useCallback(() => {
    setBanned(true);
    setOpen(true);
  }, []);

  useEffect(() => {
    window.addEventListener('auth:expired', handleExpired);
    window.addEventListener('auth:banned', handleBanned);
    return () => {
      window.removeEventListener('auth:expired', handleExpired);
      window.removeEventListener('auth:banned', handleBanned);
    };
  }, [handleExpired, handleBanned]);

  return (
    <Modal
      open={open}
      closable={false}
      mask={{ closable: false }}
      title={
        <span>
          {banned ? (
            <StopOutlined style={{ color: 'var(--error, #ff4d4f)', marginRight: 8 }} />
          ) : (
            <ExclamationCircleOutlined style={{ color: 'var(--warning, #faad14)', marginRight: 8 }} />
          )}
          {banned ? '账号已被封禁' : '登录已过期'}
        </span>
      }
      width={400}
      footer={
        <Button
          type="primary"
          onClick={() => {
            logout();
            setOpen(false);
            setBanned(false);
            navigate('/login', { replace: true });
          }}
        >
          确认
        </Button>
      }
    >
      <span>
        {banned ? '您的账号已被管理员封禁，如有疑问请联系客服。' : '您的登录凭证已失效，请重新登录。'}
      </span>
    </Modal>
  );
}
