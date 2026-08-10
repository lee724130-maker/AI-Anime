import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Row, Col, Card, Tag, Space, Input, Select, Button, Spin, Empty, message, Modal, Pagination } from 'antd';
import { ArrowLeftOutlined, SearchOutlined, FireOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../../services/api';
import CoverThumb from './CoverThumb';

const { Title, Text } = Typography;

interface TemplateItem {
  id: number; name: string; description: string; category: string;
  tags: string[]; thumbnail: string; cover_url: string; usage_count: number; is_system: boolean;
  created_at: string;
}

export default function ViralTemplateList() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [category, setCategory] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [categories, setCategories] = useState<{ category: string; count: number }[]>([]);

  const loadTemplates = async (p: number) => {
    setLoading(true);
    try {
      const params: any = { page: p, limit: pageSize };
      if (category !== 'all') params.category = category;
      if (keyword) params.keyword = keyword;
      const [tplRes, catRes] = await Promise.all([
        api.get('/api/viral/templates', { params }),
        api.get('/api/viral/categories'),
      ]);
      setTemplates(tplRes.data.items || []);
      setTotal(tplRes.data.total || 0);
      setCategories(catRes.data || []);
    } catch { message.error('模板列表加载失败'); }
    setLoading(false);
  };

  useEffect(() => { loadTemplates(1); setPage(1); }, [category]);

  useEffect(() => { loadTemplates(page); }, [page, pageSize]);

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
          loadTemplates(page);
        } catch (err: any) {
          message.error('删除失败: ' + (err?.response?.data?.message || err.message));
        }
      },
    });
  };

  const cardStyle = { borderRadius: 14, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' };

  return (
    <div style={{ padding: '24px 32px' }}>
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/viral')}
        style={{ marginBottom: 16, color: '#666' }}>返回热门创作</Button>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 3, height: 18, background: '#7c3aed', borderRadius: 2 }} />
        <Title level={4} style={{ margin: 0 }}>模板区域</Title>
        <Text type="secondary" style={{ fontSize: 13 }}>共 {total} 个模板</Text>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12}>
          <Input
            placeholder="搜索模板..."
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onPressEnter={() => loadTemplates(1)}
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
          <Button type="primary" style={{ borderRadius: 10, background: '#7c3aed', borderColor: '#7c3aed' }}
            onClick={() => navigate('/viral/create')}>
            创建模板
          </Button>
        </Col>
      </Row>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}><Spin size="large" /></div>
      ) : templates.length === 0 ? (
        <Empty description="暂无模板" style={{ padding: '60px 0' }} />
      ) : (
        <>
          <Row gutter={[16, 16]}>
            {templates.map(tpl => (
              <Col xs={24} sm={12} md={8} lg={6} key={tpl.id}>
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
          </Row>
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              showSizeChanger={false}
              onChange={setPage}
            />
          </div>
        </>
      )}
    </div>
  );
}
