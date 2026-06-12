import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Typography, Descriptions, Button, Space } from 'antd';
import { ArrowLeftOutlined, WalletOutlined } from '@ant-design/icons';
import api from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

const { Title } = Typography;

interface Profile {
  id: number;
  username: string;
  phone?: string;
  credits: number;
  created_at: string;
}

export default function UserPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const navigate = useNavigate();
  const { refreshUser } = useAuthStore();

  useEffect(() => {
    api.get('/api/user/profile')
      .then(({ data }) => {
        setProfile(data);
        // Sync fresh credits back to auth store so other pages show updated value
        refreshUser();
      })
      .catch(() => navigate('/login'));
  }, [navigate, refreshUser]);

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      <Space style={{ marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>返回首页</Button>
      </Space>
      <Card>
        <Title level={3}>个人中心</Title>
        {profile && (
          <Descriptions column={1} bordered>
            <Descriptions.Item label="用户名">{profile.username}</Descriptions.Item>
            <Descriptions.Item label="手机号">{profile.phone || '未绑定'}</Descriptions.Item>
            <Descriptions.Item label="剩余算力">{profile.credits}</Descriptions.Item>
            <Descriptions.Item label="注册时间">{new Date(profile.created_at).toLocaleDateString()}</Descriptions.Item>
          </Descriptions>
        )}
        <Button
          type="primary"
          icon={<WalletOutlined />}
          style={{ marginTop: 20 }}
          onClick={() => navigate('/order')}
        >
          充值算力
        </Button>
      </Card>
    </div>
  );
}
