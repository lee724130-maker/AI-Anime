import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Row, Col, Card, Tag, Space, Input, Select, Spin, Empty, Button, Badge, message, Modal } from 'antd';
import { SearchOutlined, FireOutlined, PlusOutlined, RightOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, VideoCameraAddOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../../services/api';
import CoverThumb from './CoverThumb';

const { Title, Text } = Typography;

const STATUS_MAP: Record<string, { color: string; label: string; icon: any }> = {
  pending: { color: 'default', label: '待生成', icon: <ClockCircleOutlined /> },
  processing: { color: 'processing', label: '生成中', icon: <SyncOutlined spin /> },
  completed: { color: 'success', label: '已完成', icon: <CheckCircleOutlined /> },
  failed: { color: 'error', label: '失败', icon: <CloseCircleOutlined /> },
};

interface TemplateItem {
  id: number; name: string; description: string; category: string;
  tags: string[]; thumbnail: string; cover_url: string; usage_count: number; is_system: boolean;
  created_at: string;
}

interface ProjectItem {
  id: number; template_id: number; name: string; status: string;
  progress: number; result_url: string; cover_url: string; created_at: string;
}

export default function ViralIndex() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [categories, setCategories] = useState<{ category: string; count: number }[]>([]);

  const fetchData = async () => {
    try {
      const params: any = { page: 1, limit: 20 };
      if (category !== 'all') params.category = category;
      if (keyword) params.keyword = keyword;

      const [tplRes, projRes, catRes] = await Promise.all([
        api.get('/api/viral/templates', { params }),
        api.get('/api/viral/projects'),
        api.get('/api/viral/categories'),
      ]);
      setTemplates(tplRes.data.items || []);
      setProjects(projRes.data || []);
      setCategories(catRes.data || []);
    } catch { message.error('数据加载失败'); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [category]);

  const handleDelete = (tpl: TemplateItem) => {
    Modal.confirm({
      title: '确认删除模板',
      content: `确定要删除「${tpl.name}」吗？删除后无法恢复，已创建的创作项目不受影响。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.delete(`/api/viral/templates/${tpl.id}`);
          message.success('模板已删除');
          fetchData();
        } catch (err: any) {
          message.error('删除失败: ' + (err?.response?.data?.message || err.message));
        }
      },
    });
  };

  const cardStyle = { borderRadius: 14, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>热门创作</Title>
        <Text type="secondary">参考爆款模板，替换你的内容，快速生成营销视频</Text>
      </div>

      {/* Search + Filter */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Input
            placeholder="搜索模板..."
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onPressEnter={() => fetchData()}
            style={{ borderRadius: 10 }}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Select
            value={category}
            onChange={setCategory}
            style={{ width: '100%', borderRadius: 10 }}
            options={[
              { value: 'all', label: '全部分类' },
              ...categories.map(c => ({ value: c.category, label: `${c.category} (${c.count})` })),
            ]}
          />
        </Col>
        <Col xs={12} sm={6} style={{ textAlign: 'right' }}>
          <Space>
            <Button icon={<VideoCameraAddOutlined />} style={{ borderRadius: 10 }}
              onClick={() => navigate('/viral/create')}>
              创建模板
            </Button>
            <Button icon={<PlusOutlined />} style={{ borderRadius: 10 }}
              onClick={() => navigate('/viral/projects')}>
              我的创作
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Template Grid */}
      <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
        {templates.map(tpl => (
          <Col xs={24} sm={12} md={8} key={tpl.id}>
            <Card hoverable style={{ ...cardStyle, height: '100%' }}
              onClick={() => navigate(`/viral/templates/${tpl.id}`)}>
              <div style={{ marginBottom: 12 }}>
                <CoverThumb src={tpl.cover_url || tpl.thumbnail} height={140} />
              </div>
              <Title level={5} style={{ margin: '0 0 4px', fontSize: 15 }}>{tpl.name}</Title>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8, lineHeight: 1.4 }}>
                {tpl.description || '暂无描述'}
              </Text>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space size={4}>
                  <Tag style={{ borderRadius: 6, fontSize: 10 }}>{tpl.category}</Tag>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    <FireOutlined /> {tpl.usage_count}
                  </Text>
                </Space>
                <Space size={4}>
                  <Button danger size="middle" type="text" icon={<DeleteOutlined />} style={{ fontSize: 15, padding: '4px 6px' }}
                    onClick={e => { e.stopPropagation(); handleDelete(tpl); }} />
                  <Button type="primary" size="small" style={{ borderRadius: 8, background: '#7c3aed', borderColor: '#7c3aed', fontSize: 11 }}
                    onClick={e => { e.stopPropagation(); navigate(`/viral/templates/${tpl.id}`); }}>
                    使用此模板
                  </Button>
                </Space>
              </div>
            </Card>
          </Col>
        ))}
        {templates.length === 0 && (
          <Col span={24}>
            <Empty description="暂无模板" style={{ padding: '40px 0' }} />
          </Col>
        )}
      </Row>

      {/* My Projects */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 3, height: 16, background: '#7c3aed', borderRadius: 2 }} />
        <Text strong style={{ fontSize: 15 }}>我的创作</Text>
        {projects.length > 0 && <Badge count={projects.length} style={{ backgroundColor: '#7c3aed', fontSize: 10, boxShadow: 'none' }} />}
      </div>
      {projects.length === 0 ? (
        <Card style={cardStyle}>
          <Empty description="还没有创作项目" image={Empty.PRESENTED_IMAGE_SIMPLE}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>选择一个模板开始创作你的第一个视频</Text>
          </Empty>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {projects.slice(0, 6).map(p => {
            const sm = STATUS_MAP[p.status] || { color: 'default', label: p.status, icon: null };
            return (
              <Col xs={12} sm={8} md={6} key={p.id}>
                <Card hoverable style={cardStyle} onClick={() => navigate(`/viral/projects/${p.id}`)}>
                  <div style={{ marginBottom: 8 }}>
                    <CoverThumb src={p.cover_url} height={90} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }} ellipsis>{p.name}</Text>
                    <Tag color={sm.color} style={{ borderRadius: 6, fontSize: 10 }}>{sm.label}</Tag>
                    {p.status === 'processing' && (
                      <div style={{ marginTop: 8 }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>进度 {p.progress}%</Text>
                      </div>
                    )}
                  </div>
                </Card>
              </Col>
            );
          })}
          {projects.length > 6 && (
            <Col span={24} style={{ textAlign: 'center' }}>
              <Button type="link" icon={<RightOutlined />} onClick={() => navigate('/viral/projects')}>
                查看全部 ({projects.length})
              </Button>
            </Col>
          )}
        </Row>
      )}
    </div>
  );
}
