import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, List, Card, Tag, Button, Space, Spin, Empty, Progress, message, Modal } from 'antd';
import { ArrowLeftOutlined, SyncOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, RightOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;

const STATUS_MAP: Record<string, { color: string; label: string; icon: any }> = {
  pending: { color: 'default', label: '待生成', icon: <ClockCircleOutlined /> },
  processing: { color: 'processing', label: '生成中', icon: <SyncOutlined spin /> },
  completed: { color: 'success', label: '已完成', icon: <CheckCircleOutlined /> },
  failed: { color: 'error', label: '失败', icon: <CloseCircleOutlined /> },
};

interface ProjectItem {
  id: number; template_id: number; name: string; status: string;
  progress: number; result_url: string; created_at: string; error_msg: string;
}

export default function ViralProjectList() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const { data } = await api.get('/api/viral/projects');
      setProjects(data || []);
    } catch { message.error('项目列表加载失败'); }
    setLoading(false);
  };

  const handleDelete = (e: React.MouseEvent, p: ProjectItem) => {
    e.stopPropagation();
    Modal.confirm({
      title: '确认删除',
      content: `删除「${p.name}」后数据无法恢复！`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.delete(`/api/viral/projects/${p.id}`);
          message.success('删除成功');
          loadProjects();
        } catch { message.error('删除失败'); }
      },
    });
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '100px 0' }}><Spin size="large" /></div>;
  }

  return (
    <div style={{ padding: '24px 32px' }}>
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/viral')}
        style={{ marginBottom: 16, color: '#666' }}>返回模板集市</Button>
      <Title level={4} style={{ margin: '0 0 20px' }}>我的创作</Title>

      {projects.length === 0 ? (
        <Empty description="暂无创作项目" image={Empty.PRESENTED_IMAGE_SIMPLE}>
          <Button type="primary" style={{ background: '#7c3aed', borderColor: '#7c3aed', borderRadius: 10 }}
            onClick={() => navigate('/viral')}>去选择模板</Button>
        </Empty>
      ) : (
        <List
          dataSource={projects}
          split={false}
          renderItem={p => {
            const sm = STATUS_MAP[p.status] || { color: 'default', label: p.status, icon: null };
            return (
              <Card hoverable style={{
                borderRadius: 14, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                marginBottom: 12,
              }} onClick={() => navigate(`/viral/projects/${p.id}`)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <Space size={8}>
                      <span style={{ fontSize: 18, color: sm.color === 'success' ? '#52c41a' : sm.color === 'error' ? '#ff4d4f' : '#faad14' }}>
                        {sm.icon}
                      </span>
                      <Text strong style={{ fontSize: 15 }}>{p.name}</Text>
                      <Tag color={sm.color} style={{ borderRadius: 6, fontSize: 10 }}>{sm.label}</Tag>
                    </Space>
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 16 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(p.created_at).toLocaleString('zh-CN')}
                      </Text>
                      {p.status === 'processing' && (
                        <div style={{ width: 120 }}>
                          <Progress percent={p.progress} size="small" strokeColor="#7c3aed" />
                        </div>
                      )}
                      {p.status === 'failed' && p.error_msg && (
                        <Text type="danger" style={{ fontSize: 11, maxWidth: 300 }} ellipsis>{p.error_msg}</Text>
                      )}
                    </div>
                  </div>
                  <Space size={4}>
                    <Button type="text" danger icon={<DeleteOutlined />}
                      style={{ color: '#ff4d4f', fontSize: 14 }}
                      onClick={(e) => handleDelete(e, p)} />
                    <Button type="text" icon={<RightOutlined />} style={{ color: '#bbb' }} />
                  </Space>
                </div>
              </Card>
            );
          }}
        />
      )}
    </div>
  );
}
