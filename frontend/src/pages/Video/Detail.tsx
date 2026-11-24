import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Typography, Tag, Spin, message, Result, Progress, Space } from 'antd';
import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  ReloadOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import VideoPlayer from '../../components/VideoPlayer';
import { withDownload } from '../../utils/staticUrl';
import './video.css';   // 与列表/新建/拼接共用本页样式（作用域 .vid-root）

const { Title, Paragraph } = Typography;

const API_BASE = import.meta.env.VITE_API_BASE || '';

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
  const seqRef = useRef(0);

  const fetchTask = async () => {
    const seq = ++seqRef.current;
    try {
      const { data } = await api.get(`/api/video/${id}`);
      if (seq !== seqRef.current) return;
      setTask(data);
    } catch {
      if (seq !== seqRef.current) return;
      message.error('获取任务详情失败');
    } finally {
      if (seq === seqRef.current) setLoading(false);
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
    <div className="vid-root vid-root--narrow">
      <div className="vid-topbar">
        <div className="vid-topbar__lead">
          <Button shape="circle" icon={<ArrowLeftOutlined />} onClick={() => navigate('/video')} />
          <div className="vid-topbar__titles">
            <Title level={4} className="vid-topbar__title">视频任务详情</Title>
            <span className="vid-topbar__sub">页面每 3 秒自动刷新状态</span>
          </div>
        </div>
      </div>

      {/* 状态横幅：原先四档写死浅底（#f6ffed/#fff2f0/#e6f7ff/#fafafa）→ 暗色下是一整块白卡；
          改 data-status + color-mix */}
      <div className="vid-banner" data-status={task.status}>
        <Tag className="vid-banner__tag" icon={cfg.icon} color={cfg.color}>{cfg.label}</Tag>

        {task.status === 'completed' && videoSrc && (
          <>
            <div className="vid-banner__player">
              <VideoPlayer
                src={videoSrc}
                poster={getFullUrl(task.cover_url)}
                title="AI 生成的动漫短剧"
              />
            </div>
            <Button type="primary" className="vid-btn-primary" icon={<DownloadOutlined />}
              href={withDownload(videoSrc)} target="_blank">
              下载视频
            </Button>
          </>
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
              <Space>
                <Button icon={<ReloadOutlined />} type="primary" className="vid-btn-primary" onClick={async () => {
                  try {
                    await api.post(`/api/video/${id}/retry`);
                    message.success('已重新提交任务');
                    fetchTask();
                  } catch {
                    message.error('重试失败');
                  }
                }}>
                  重试
                </Button>
                <Button onClick={() => navigate('/video/create')}>重新创建任务</Button>
              </Space>
            }
          />
        )}

        {(task.status === 'pending' || task.status === 'processing') && (
          <>
            <Spin size="large" />
            <Progress className="vid-banner__progress"
              percent={task.progress || 0}
              status={task.status === 'processing' ? 'active' : 'normal'}
            />
            <Paragraph className="vid-banner__hint">
              {task.status === 'pending' ? '任务已提交，等待处理...' : 'AI 正在生成视频，请耐心等待...'}
            </Paragraph>
            <Paragraph className="vid-banner__hint vid-banner__hint--sm">页面每 3 秒自动刷新状态</Paragraph>
          </>
        )}
      </div>

      {/* 任务信息：Card + Descriptions(bordered) → 令牌面板 + 定义列表，字段与取值不变 */}
      <div className="vid-panel">
        <div className="vid-panel__head">
          <div className="vid-panel__title"><span>任务信息</span></div>
        </div>
        <dl className="vid-kv">
          <div className="vid-kv__row"><dt>任务 ID</dt><dd>{task.task_id}</dd></div>
          <div className="vid-kv__row"><dt>关联剧本</dt><dd>{task.scriptTitle || '无'}</dd></div>
          <div className="vid-kv__row"><dt>当前状态</dt><dd><Tag icon={cfg.icon} color={cfg.color}>{cfg.label}</Tag></dd></div>
          <div className="vid-kv__row"><dt>进度</dt><dd>{task.progress || 0}%</dd></div>
          <div className="vid-kv__row"><dt>风格</dt><dd>{task.style === 'realistic' ? '📷 真人' : '🎨 动漫'}</dd></div>
          <div className="vid-kv__row"><dt>规格</dt><dd>{task.resolution || '720p'} · {task.duration || 5} 秒</dd></div>
          <div className="vid-kv__row"><dt>本次算力</dt><dd>{task.credit_cost || 0}（成功完成后扣费）</dd></div>
          <div className="vid-kv__row"><dt>重试次数</dt><dd>{task.retry_count || 0}</dd></div>
          <div className="vid-kv__row"><dt>创建时间</dt><dd>{new Date(task.created_at).toLocaleString('zh-CN')}</dd></div>
          {task.completed_at && (
            <div className="vid-kv__row"><dt>完成时间</dt><dd>{new Date(task.completed_at).toLocaleString('zh-CN')}</dd></div>
          )}
          {task.video_url && (
            <div className="vid-kv__row"><dt>视频地址</dt><dd><a href={videoSrc} target="_blank" rel="noreferrer">打开</a></dd></div>
          )}
          {task.error_msg && (
            <div className="vid-kv__row"><dt>错误信息</dt><dd className="vid-kv__err">{task.error_msg}</dd></div>
          )}
        </dl>
      </div>
    </div>
  );
}
