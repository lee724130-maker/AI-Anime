import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Typography, Card, Button, Spin, Tag, Space, Progress, Descriptions, Empty, message } from 'antd';
import { ArrowLeftOutlined, SyncOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;

const STATUS_MAP: Record<string, { color: string; label: string; icon: any }> = {
  pending: { color: 'default', label: '待生成', icon: <ClockCircleOutlined /> },
  processing: { color: 'processing', label: '生成中', icon: <SyncOutlined spin /> },
  completed: { color: 'success', label: '已完成', icon: <CheckCircleOutlined /> },
  failed: { color: 'error', label: '失败', icon: <CloseCircleOutlined /> },
};

export default function ViralProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/api/viral/projects/${id}`);
        setProject(data);
      } catch { message.error('项目加载失败'); }
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '100px 0' }}><Spin size="large" /></div>;
  }
  if (!project) {
    return (
      <div style={{ padding: '24px 32px' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/viral/projects')}>返回</Button>
        <Empty description="项目不存在" style={{ padding: '60px 0' }} />
      </div>
    );
  }

  const sm = STATUS_MAP[project.status] || { color: 'default', label: project.status, icon: null };

  return (
    <div style={{ padding: '24px 32px' }}>
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/viral/projects')}
        style={{ marginBottom: 16, color: '#666' }}>返回我的创作</Button>

      <Card style={{ borderRadius: 14, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>{project.name}</Title>
            <Tag color={sm.color} style={{ borderRadius: 6, marginTop: 8 }}>{sm.label}</Tag>
          </div>
        </div>

        {project.status === 'processing' && (
          <div style={{ marginBottom: 20 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>生成进度</Text>
            <Progress percent={project.progress} strokeColor="#7c3aed" style={{ maxWidth: 400 }} />
          </div>
        )}

        {project.status === 'completed' && project.result_url && (
          <div style={{ marginBottom: 20 }}>
            <video src={project.result_url} controls style={{ width: '100%', maxWidth: 600, borderRadius: 10 }} />
          </div>
        )}

        {project.error_msg && (
          <div style={{ background: '#fff2f0', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
            <Text type="danger" style={{ fontSize: 13 }}>{project.error_msg}</Text>
          </div>
        )}

        <Descriptions column={2} size="small" style={{ marginTop: 16 }}>
          <Descriptions.Item label="模板 ID">{project.template_id}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{new Date(project.created_at).toLocaleString('zh-CN')}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={sm.color} style={{ borderRadius: 6 }}>{sm.label}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="进度">{project.progress}%</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}
