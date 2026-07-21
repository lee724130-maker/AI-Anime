import { useEffect, useState } from 'react';
import { Card, Typography, Space, Tag, Button, List, Empty, Spin } from 'antd';
import { CheckOutlined, BellOutlined, CheckCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../services/api';
import { useNotificationStore } from '../../stores/notificationStore';

const { Title, Text, Paragraph } = Typography;

const TYPE_COLORS: Record<string, string> = {
  model_fallback: 'orange',
  system: 'blue',
  warning: 'red',
  info: 'default',
};

export default function NotificationsPage() {
  const [loading, setLoading] = useState(false);
  const { notifications, setNotifications, setUnreadCount, unreadCount } = useNotificationStore();

  const fetch = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/admin/notifications');
      setNotifications(data.items);
    } catch {} finally { setLoading(false); }
  };

  const markAllRead = async () => {
    await api.put('/api/admin/notifications/read-all');
    setUnreadCount(0);
    setNotifications(notifications.map((n) => ({ ...n, read: true })));
  };

  const markRead = async (id: number) => {
    await api.put(`/api/admin/notifications/${id}/read`);
    setNotifications(notifications.map((n) => (n.id === id ? { ...n, read: true } : n)));
    if (unreadCount > 0) setUnreadCount(unreadCount - 1);
  };

  useEffect(() => { fetch(); }, []);

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={3} style={{ marginBottom: 0 }}>
          <BellOutlined style={{ color: '#fa8c16', marginRight: 8 }} />
          系统通知
        </Title>
        {unreadCount > 0 && (
          <Button icon={<CheckOutlined />} onClick={markAllRead}>全部标为已读</Button>
        )}
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
      ) : notifications.length === 0 ? (
        <Empty description="暂无通知" />
      ) : (
        <List
          dataSource={notifications}
          renderItem={(item) => (
            <List.Item style={{
              background: item.read ? '#fff' : '#f6f9ff',
              padding: '14px 20px', borderRadius: 8, marginBottom: 8,
              border: '1px solid #f0f0f0',
            }}>
              <List.Item.Meta
                avatar={
                  !item.read && <div style={{
                    width: 8, height: 8, borderRadius: 4, background: '#1677ff',
                    marginTop: 6,
                  }} />
                }
                title={
                  <Space>
                    <Tag color={TYPE_COLORS[item.type] || 'default'}>{item.type}</Tag>
                    <Text strong style={{ fontSize: 14 }}>{item.title}</Text>
                    {item.read
                      ? <Tag icon={<CheckCircleOutlined />} color="default" style={{ marginLeft: 8 }}>已读</Tag>
                      : <Button type="link" size="small" onClick={() => markRead(item.id)} style={{ padding: 0 }}>
                          标为已读
                        </Button>
                    }
                  </Space>
                }
                description={
                  <div>
                    {item.message && <Paragraph style={{ margin: '4px 0', color: '#595959' }}>{item.message}</Paragraph>}
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {dayjs(item.created_at).format('YYYY-MM-DD HH:mm')}
                    </Text>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );
}
