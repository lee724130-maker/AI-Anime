import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Button, Row, Col, Card, Tag, Empty, Spin, Popconfirm, message, Descriptions } from 'antd';
import { PlusOutlined, FileTextOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../services/api';

const { Title, Text } = Typography;

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  draft:          { color: 'default', label: '草稿' },
  outline_pending: { color: 'processing', label: '待分析' },
  analysis_done:  { color: 'success', label: '已分析' },
  generating:     { color: 'processing', label: '生成中' },
  completed:      { color: 'success', label: '已完成' },
  failed:         { color: 'error', label: '失败' },
};

interface Project {
  id: number;
  title: string;
  description: string | null;
  cover_url: string | null;
  status: string;
  genre: string | null;
  episodes: number;
  duration: number | null;
  updated_at: string;
  created_at: string;
}

export default function DramaListPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  const fetchList = () => {
    setLoading(true);
    api.get('/api/drama').then(({ data }) => setProjects(data.items)).finally(() => setLoading(false));
  };

  useEffect(() => { fetchList(); }, []);

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api/drama/${id}`);
      message.success('已删除');
      fetchList();
    } catch { message.error('删除失败'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>短剧工作室</Title>
          <Text type="secondary">管理和创作您的 AI 短剧项目</Text>
        </div>
        <Button type="primary" size="large" icon={<PlusOutlined />}
          style={{ background: '#7c3aed', borderColor: '#7c3aed', borderRadius: 10 }}
          onClick={() => navigate('/drama/create')}>
          新建短剧
        </Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
      ) : projects.length === 0 ? (
        <Empty description="暂无短剧项目" />
      ) : (
        <Row gutter={[16, 16]}>
          {projects.map((p) => {
            const s = STATUS_MAP[p.status] || STATUS_MAP.draft;
            return (
              <Col xs={24} sm={12} lg={8} key={p.id}>
                <Card hoverable style={{ borderRadius: 12, height: '100%' }}
                  onClick={() => navigate(`/drama/${p.id}`)}>
                  <div style={{
                    width: '100%', height: 140, borderRadius: 8, marginBottom: 12,
                    background: p.cover_url ? `url(${p.cover_url}) center/cover` : 'linear-gradient(135deg, #7c3aed20, #ec489920)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative',
                  }}>
                    {!p.cover_url && <FileTextOutlined style={{ fontSize: 40, color: '#7c3aed40' }} />}
                    <Popconfirm title="确定删除此项目？此操作不可恢复。" onConfirm={(e) => { e?.stopPropagation(); handleDelete(p.id); }} onCancel={(e) => e?.stopPropagation()}
                      okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />}
                        style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(255,255,255,0.8)' }}
                        onClick={(e) => e.stopPropagation()} />
                    </Popconfirm>
                  </div>
                  <Title level={5} style={{ margin: 0 }}>{p.title}</Title>
                  <Tag color={s.color} style={{ position: 'absolute', top: 160, right: 16 }}>{s.label}</Tag>
                  <Descriptions size="small" column={1} style={{ marginTop: 8 }} colon={false}>
                    {p.genre && <Descriptions.Item label={<Text type="secondary" style={{ fontSize: 12 }}>题材</Text>}>{p.genre}</Descriptions.Item>}
                    <Descriptions.Item label={<Text type="secondary" style={{ fontSize: 12 }}>集数</Text>}>{p.episodes} 集</Descriptions.Item>
                    <Descriptions.Item label={<Text type="secondary" style={{ fontSize: 12 }}>创建时间</Text>}>
                      {dayjs(p.created_at).format('YYYY-MM-DD HH:mm')}
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
    </div>
  );
}
