import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Typography, Tag, Descriptions, Spin, message, Result, Progress } from 'antd';
import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import VideoPlayer from '../../components/VideoPlayer';

const { Title, Text, Paragraph } = Typography;

const API_BASE = 'http://localhost:3000';

function getFullUrl(path: string | null): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE}${path}`;
}

const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  pending: { color: 'default', icon: <ClockCircleOutlined />, label: '等待处理' },
  processing: { color: 'processing', icon: <SyncOutlined spin />, label: '正在生成' },
  completed: { color: 'success', icon: <CheckCircleOutlined />, label: '已完成' },
  failed: { color: 'error', icon: <CloseCircleOutlined />, label: '生成失败' },
};

export default function VideoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchTask = async () => {
    try {
      const { data } = await api.get(`/api/video/${id}`);
      setTask(data);
    } catch {
      message.error('获取任务详情失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTask();
  }, [id]);

  // Auto-poll while processing
  useEffect(() => {
    if (!task || (task.status !== 'pending' && task.status !== 'processing')) return;
    const timer = setInterval(fetchTask, 3000);
    return () => clearInterval(timer);
  }, [task?.status]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!task) {
    return (
      <Result
        status="404"
        title="任务不存在"
        extra={<Button type="primary" onClick={() => navigate('/video')}>返回列表</Button>}
      />
    );
  }

  const cfg = statusConfig[task.status] || statusConfig.pending;
  const videoSrc = getFullUrl(task.video_url);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/video')} style={{ marginBottom: 20 }}>
        返回列表
      </Button>

      <Title level={2} style={{ marginBottom: 24 }}>视频任务详情</Title>

      {/* Status banner */}
      <Card style={{
        marginBottom: 24,
        borderRadius: 12,
        textAlign: 'center',
        background: task.status === 'completed' ? '#f6ffed'
          : task.status === 'failed' ? '#fff2f0'
          : task.status === 'processing' ? '#e6f7ff'
          : '#fafafa',
      }}>
        <Tag icon={cfg.icon} color={cfg.color} style={{ fontSize: 16, padding: '4px 16px', marginBottom: 16 }}>
          {cfg.label}
        </Tag>

        {task.status === 'completed' && videoSrc && (
          <div style={{ marginTop: 16 }}>
            <VideoPlayer
              src={videoSrc}
              poster={getFullUrl(task.cover_url)}
              title="AI 生成的动漫短剧"
            />
          </div>
        )}

        {task.status === 'completed' && !videoSrc && (
          <Result
            status="success"
            title="视频生成完成"
            subTitle={task.completed_at ? `完成时间: ${new Date(task.completed_at).toLocaleString('zh-CN')}` : ''}
          />
        )}

        {task.status === 'failed' && (
          <Result
            status="error"
            title="生成失败"
            subTitle={task.error_msg || '未知错误'}
            extra={
              <Button icon={<ReloadOutlined />} onClick={() => navigate('/video/create')}>
                重新创建任务
              </Button>
            }
          />
        )}

        {(task.status === 'pending' || task.status === 'processing') && (
          <div style={{ padding: '24px 0' }}>
            <Spin size="large" />
            <Progress
              percent={task.progress || 0}
              status={task.status === 'processing' ? 'active' : 'normal'}
              style={{ maxWidth: 420, margin: '20px auto 0' }}
            />
            <Paragraph type="secondary" style={{ marginTop: 16 }}>
              {task.status === 'pending' ? '任务已提交，等待处理...' : 'AI 正在生成视频，请耐心等待...'}
            </Paragraph>
            <Paragraph type="secondary" style={{ fontSize: 12 }}>
              页面每 3 秒自动刷新状态
            </Paragraph>
          </div>
        )}
      </Card>

      {/* Detail info */}
      <Card title="任务信息" style={{ borderRadius: 12, marginBottom: 24 }}>
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="任务 ID">{task.task_id}</Descriptions.Item>
          <Descriptions.Item label="关联剧本">{task.scriptTitle || '无'}</Descriptions.Item>
          <Descriptions.Item label="当前状态">
            <Tag icon={cfg.icon} color={cfg.color}>{cfg.label}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="进度">{task.progress || 0}%</Descriptions.Item>
          <Descriptions.Item label="风格">{task.style === 'realistic' ? '📷 真人' : '🎨 动漫'}</Descriptions.Item>
          <Descriptions.Item label="规格">{task.resolution || '720p'} · {task.duration || 5} 秒</Descriptions.Item>
          <Descriptions.Item label="本次算力">{task.credit_cost || 0}（成功完成后扣费）</Descriptions.Item>
          <Descriptions.Item label="重试次数">{task.retry_count || 0}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{new Date(task.created_at).toLocaleString('zh-CN')}</Descriptions.Item>
          {task.completed_at && (
            <Descriptions.Item label="完成时间">{new Date(task.completed_at).toLocaleString('zh-CN')}</Descriptions.Item>
          )}
          {task.video_url && (
            <Descriptions.Item label="视频地址">
              <a href={videoSrc} target="_blank" rel="noreferrer">{videoSrc}</a>
            </Descriptions.Item>
          )}
          {task.error_msg && (
            <Descriptions.Item label="错误信息">
              <Text type="danger">{task.error_msg}</Text>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>
    </div>
  );
}
