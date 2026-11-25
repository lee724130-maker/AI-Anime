import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Tag, Button, Spin, Empty, Progress, message, Modal } from 'antd';
import { ArrowLeftOutlined, SyncOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, RightOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../../services/api';
import CoverThumb from './CoverThumb';
import './project-list.css';   // 本页质感改造样式（作用域 .vpl-）

const { Title, Text } = Typography;

const STATUS_MAP: Record<string, { color: string; label: string; icon: any }> = {
  pending: { color: 'default', label: '待生成', icon: <ClockCircleOutlined /> },
  processing: { color: 'processing', label: '生成中', icon: <SyncOutlined spin /> },
  completed: { color: 'success', label: '已完成', icon: <CheckCircleOutlined /> },
  failed: { color: 'error', label: '失败', icon: <CloseCircleOutlined /> },
};

interface ProjectItem {
  id: number; template_id: number; name: string; status: string;
  progress: number; result_url: string; cover_url: string; created_at: string; error_msg: string;
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
    return <div className="vpl-loading"><Spin size="large" /></div>;
  }

  return (
    <div className="vpl-root">
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/viral')}
        className="vpl-back">返回模板集市</Button>
      <Title level={4} className="vpl-title">我的创作</Title>

      {projects.length === 0 ? (
        <div className="vpl-empty">
          <Empty description="暂无创作项目" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          <Button type="primary" className="vpl-btn-brand"
            onClick={() => navigate('/viral')}>去选择模板</Button>
        </div>
      ) : (
        <div className="vpl-list">
          {projects.map(p => {
            const sm = STATUS_MAP[p.status] || { color: 'default', label: p.status, icon: null };
            return (
              <div key={p.id} className="vpl-item" onClick={() => navigate(`/viral/projects/${p.id}`)}>
                <div className="vpl-item__lead">
                  <div className="vpl-item__cover">
                    <CoverThumb src={p.cover_url} height={90} radius={8} />
                  </div>
                  <div className="vpl-item__body">
                    <div className="vpl-item__hd">
                      <span className="vpl-item__ico" data-tone={sm.color}>{sm.icon}</span>
                      <Text className="vpl-item__name">{p.name}</Text>
                      <Tag className="vpl-item__tag" color={sm.color}>{sm.label}</Tag>
                    </div>
                    <div className="vpl-item__meta">
                      <Text className="vpl-item__time">
                        {new Date(p.created_at).toLocaleString('zh-CN')}
                      </Text>
                      {p.status === 'processing' && (
                        <div className="vpl-item__prog">
                          <Progress percent={p.progress} size="small" strokeColor="var(--primary)" />
                        </div>
                      )}
                      {p.status === 'failed' && p.error_msg && (
                        <Text type="danger" className="vpl-item__err" ellipsis>{p.error_msg}</Text>
                      )}
                    </div>
                  </div>
                </div>
                <div className="vpl-item__acts">
                  <Button type="text" danger icon={<DeleteOutlined />} className="vpl-item__del"
                    onClick={(e) => handleDelete(e, p)} />
                  <Button type="text" icon={<RightOutlined />} className="vpl-item__go" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
