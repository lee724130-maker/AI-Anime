import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Tag, Input, Select, Button, Spin, Empty, message, Modal, Pagination } from 'antd';
import { ArrowLeftOutlined, SearchOutlined, FireOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../../services/api';
import CoverThumb from './CoverThumb';
import './template-list.css';   // 本页质感改造样式（作用域 .vtl-）

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

  return (
    <div className="vtl-root">
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/viral')}
        className="vtl-back">返回热门创作</Button>
      <div className="vtl-head">
        <div className="vtl-head__bar" />
        <Title level={4} className="vtl-head__title">模板区域</Title>
        <Text className="vtl-head__count">共 {total} 个模板</Text>
      </div>

      <div className="vtl-tools">
        <Input
          className="vtl-search"
          placeholder="搜索模板..."
          prefix={<SearchOutlined />}
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          onPressEnter={() => loadTemplates(1)}
        />
        <Select
          className="vtl-cat"
          value={category}
          onChange={setCategory}
          options={[
            { value: 'all', label: '全部分类' },
            ...categories.map(c => ({ value: c.category, label: `${c.category} (${c.count})` })),
          ]}
        />
        <div className="vtl-tools__end">
          <Button type="primary" className="vtl-btn-brand"
            onClick={() => navigate('/viral/create')}>
            创建模板
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="vtl-loading"><Spin size="large" /></div>
      ) : templates.length === 0 ? (
        <div className="vtl-empty"><Empty description="暂无模板" /></div>
      ) : (
        <>
          <div className="vtl-grid">
            {templates.map(tpl => (
              <div key={tpl.id} className="vtl-card"
                onClick={() => navigate(`/viral/templates/${tpl.id}`)}>
                <div className="vtl-card__cover">
                  <CoverThumb src={tpl.cover_url || tpl.thumbnail} height={140} />
                </div>
                <Title level={5} className="vtl-card__name">{tpl.name}</Title>
                <Text className="vtl-card__desc">{tpl.description || '暂无描述'}</Text>
                <div className="vtl-card__foot">
                  <div className="vtl-card__meta">
                    <Tag style={{ borderRadius: 6, fontSize: 10 }}>{tpl.category}</Tag>
                    <Text className="vtl-card__usage"><FireOutlined /> {tpl.usage_count}</Text>
                  </div>
                  <div className="vtl-card__acts">
                    <Button danger size="middle" type="text" icon={<DeleteOutlined />} className="vtl-card__del"
                      onClick={e => { e.stopPropagation(); handleDelete(tpl); }} />
                    <Button type="primary" size="small" className="vtl-card__use"
                      onClick={e => { e.stopPropagation(); navigate(`/viral/templates/${tpl.id}`); }}>
                      使用此模板
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="vtl-pager">
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
