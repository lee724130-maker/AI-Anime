import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, List, Typography, Tag, Space, Popconfirm, message, Empty, Progress } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  VideoCameraOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  EyeOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;

const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  pending: { color: 'default', icon: <ClockCircleOutlined />, label: '等待中' },
  processing: { color: 'processing', icon: <SyncOutlined spin />, label: '生成中' },
  completed: { color: 'success', icon: <CheckCircleOutlined />, label: '已完成' },
  failed: { color: 'error', icon: <CloseCircleOutlined />, label: '失败' },
};

export default function VideoListPage() {
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const fetchVideos = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/video/list');
      setVideos(data.items || []);
    } catch {
      message.error('获取视频列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchVideos(); }, []);

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api/video/${id}`);
      message.success('删除成功');
      fetchVideos();
    } catch {
      message.error('删除失败');
    }
  };

  // Auto-poll for processing tasks
  useEffect(() => {
    const hasProcessing = videos.some((v) => v.status === 'pending' || v.status === 'processing');
    if (!hasProcessing) return;
    const timer = setInterval(fetchVideos, 5000);
    return () => clearInterval(timer);
  }, [videos]);

  return (
    <div>
      <div style={{
        background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
        padding: '32px 24px', textAlign: 'center', borderRadius: '0 0 24px 24px', marginBottom: 24,
        position: 'relative',
      }}>
        <Button
          icon={<HomeOutlined />}
          onClick={() => navigate('/')}
          style={{ position: 'absolute', left: 24, top: 32, borderRadius: 20 }}
        >
          返回主页
        </Button>
        <VideoCameraOutlined style={{ fontSize: 36, color: '#fff', marginBottom: 8 }} />
        <Title level={2} style={{ color: '#fff', margin: 0 }}>视频生成</Title>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <Button icon={<HomeOutlined />} onClick={() => navigate('/')}>返回主页</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/video/create')} size="large">
            新建生成任务
          </Button>
        </div>

        <List
          loading={loading}
          dataSource={videos}
          locale={{ emptyText: <Empty description="暂无视频任务，点击上方按钮创建" /> }}
          renderItem={(item: any) => {
            const cfg = statusConfig[item.status] || statusConfig.pending;
            return (
              <Card style={{ marginBottom: 12, borderRadius: 12 }} hoverable>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <Space>
                      <Tag icon={cfg.icon} color={cfg.color}>{cfg.label}</Tag>
                      {item.scriptTitle && <Text type="secondary">剧本：{item.scriptTitle}</Text>}
                    </Space>
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        任务ID: {item.task_id}
                      </Text>
                    </div>
                    {item.error_msg && (
                      <Text type="danger" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                        错误: {item.error_msg}
                      </Text>
                    )}
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                      创建于: {new Date(item.created_at).toLocaleString('zh-CN')}
                    </Text>
                    {(item.status === 'pending' || item.status === 'processing') && (
                      <Progress
                        percent={item.progress || 0}
                        size="small"
                        status={item.status === 'processing' ? 'active' : 'normal'}
                        style={{ maxWidth: 360, marginTop: 8 }}
                      />
                    )}
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                      {item.style === 'realistic' ? '📷 真人' : '🎨 动漫'} · {item.resolution || '720p'} · {item.duration || 5} 秒 · {item.credit_cost || 0} 算力
                    </Text>
                  </div>
                  <Space>
                    {item.status === 'completed' && item.video_url && (
                      <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/video/${item.id}`)}>
                        查看
                      </Button>
                    )}
                    <Popconfirm title="确定删除？" onConfirm={() => handleDelete(item.id)}>
                      <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                  </Space>
                </div>
              </Card>
            );
          }}
        />
      </div>
    </div>
  );
}
