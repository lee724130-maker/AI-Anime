import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Row, Col, Card, Tag, Space, Input, Select, Spin, Empty, Button, message, Modal, Tabs, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, PlayCircleOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, LayoutOutlined, CopyOutlined, FormOutlined } from '@ant-design/icons';
import api from '../../services/api';
import CoverThumb from '../Viral/CoverThumb';

const { Title, Text } = Typography;

const templateCover = (t: CanvasTemplate): string | null => {
  const n = (t.nodes || []).find((x: any) => x.source?.url || x.url);
  return n ? (n.source?.url || n.url) : null;
};

const STATUS_MAP: Record<string, { color: string; label: string; icon: any }> = {
  pending: { color: 'default', label: '未渲染', icon: <ClockCircleOutlined /> },
  rendering: { color: 'processing', label: '渲染中', icon: <SyncOutlined spin /> },
  completed: { color: 'success', label: '已完成', icon: <CheckCircleOutlined /> },
  failed: { color: 'error', label: '失败', icon: <CloseCircleOutlined /> },
};

interface CanvasProject {
  id: number; name: string; ratio: string; resolution: string;
  nodes: any[]; bgm_url: string | null; status: string; progress: number;
  result_url: string | null; error_msg: string | null; cover_url: string | null;
  created_at: string; updated_at: string;
}

interface CanvasTemplate {
  id: number; name: string; description: string | null; category: string;
  ratio: string; resolution: string; nodes: any[]; variables: any[];
  usage_count: number; is_system: boolean; created_at: string;
}

export default function CanvasIndex() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('projects');
  const [projects, setProjects] = useState<CanvasProject[]>([]);
  const [templates, setTemplates] = useState<CanvasTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  const fetchData = async () => {
    try {
      const params: any = {};
      if (category !== 'all') params.category = category;
      if (keyword) params.keyword = keyword;
      const [projRes, tplRes] = await Promise.all([
        api.get('/api/canvas/projects'),
        api.get('/api/canvas/templates', { params }),
      ]);
      setProjects(projRes.data || []);
      setTemplates(tplRes.data || []);
      setCategories([...(new Set(((tplRes.data as any[]) || []).map((t: any) => String(t.category)).filter(Boolean)) as Set<string>)]);
    } catch { message.error('数据加载失败'); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [category, keyword]);

  // Poll rendering projects for progress
  useEffect(() => {
    const rendering = projects.filter(p => p.status === 'rendering');
    if (rendering.length === 0) return;
    const timer = setInterval(async () => {
      const updated = await Promise.all(rendering.map(async (p) => {
        try {
          const res = await api.get(`/api/canvas/projects/${p.id}/export`);
          return res.data;
        } catch { return null; }
      }));
      let changed = false;
      const next = [...projects];
      updated.forEach((u, i) => {
        if (u && (u.progress !== rendering[i].progress || u.status !== rendering[i].status)) {
          const idx = next.findIndex(x => x.id === u.id);
          if (idx >= 0) {
            next[idx] = { ...next[idx], ...u };
            changed = true;
          }
        }
      });
      if (changed) {
        setProjects(next);
        if (!next.some(x => x.status === 'rendering')) {
          fetchData();
        }
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [projects]);

  const handleDelete = (p: CanvasProject) => {
    Modal.confirm({
      title: '确认删除画布项目',
      content: `确定要删除「${p.name}」吗？删除后无法恢复。`,
      okText: '删除', okType: 'danger', cancelText: '取消',
      onOk: async () => {
        try {
          await api.delete(`/api/canvas/projects/${p.id}`);
          message.success('已删除');
          fetchData();
        } catch (err: any) { message.error('删除失败: ' + (err?.response?.data?.message || err.message)); }
      },
    });
  };

  const handleDeleteTemplate = (t: CanvasTemplate) => {
    Modal.confirm({
      title: '确认删除画布模板',
      content: `确定要删除模板「${t.name}」吗？`,
      okText: '删除', okType: 'danger', cancelText: '取消',
      onOk: async () => {
        try {
          await api.delete(`/api/canvas/templates/${t.id}`);
          message.success('已删除');
          fetchData();
        } catch (err: any) { message.error('删除失败: ' + (err?.response?.data?.message || err.message)); }
      },
    });
  };

  const useTemplate = async (t: CanvasTemplate) => {
    // If template has variables, ask user to fill them
    const vars = t.variables || [];
    if (vars.length > 0) {
      let values: Record<string, string> = {};
      const inputs: any[] = [];
      for (const v of vars) {
        inputs.push({
          label: `${v.label || v.key}${v.required ? ' *' : ''}`,
          key: v.key,
          defaultValue: v.default_value || '',
          required: !!v.required,
        });
      }
      Modal.confirm({
        title: `使用模板「${t.name}」`,
        width: 480,
        content: (
          <div style={{ marginTop: 16 }}>
            {inputs.map((inp) => (
              <div key={inp.key} style={{ marginBottom: 12 }}>
                <Text style={{ display: 'block', marginBottom: 4 }}>{inp.label}</Text>
                <input
                  id={`tpl-var-${inp.key}`}
                  defaultValue={inp.defaultValue}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid #d9d9d9' }}
                />
              </div>
            ))}
          </div>
        ),
        okText: '创建项目', cancelText: '取消',
        onOk: async () => {
          for (const inp of inputs) {
            const el = document.getElementById(`tpl-var-${inp.key}`) as HTMLInputElement;
            if (inp.required && el && !el.value.trim()) {
              message.warning(`请填写「${inp.label}」`);
              throw new Error('missing');
            }
            values[inp.key] = el?.value || '';
          }
          return doCreateFromTemplate(t, values);
        },
      });
    } else {
      await doCreateFromTemplate(t, {});
    }
  };

  const doCreateFromTemplate = async (t: CanvasTemplate, values: Record<string, string>) => {
    try {
      const res = await api.post('/api/canvas/projects', {
        name: `「${t.name}」的创作`,
        template_id: t.id,
        variable_values: values,
      });
      message.success('已从模板创建项目');
      navigate(`/canvas/editor/${res.data.id}`);
    } catch (err: any) { message.error('创建失败: ' + (err?.response?.data?.message || err.message)); }
  };

  const duplicateTemplate = async (t: CanvasTemplate) => {
    try {
      await api.post(`/api/canvas/templates/${t.id}/duplicate`);
      message.success('已复制模板');
      fetchData();
    } catch (err: any) { message.error('复制失败: ' + (err?.response?.data?.message || err.message)); }
  };

  const cardStyle = { borderRadius: 14, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '100px 0' }}><Spin size="large" /></div>;
  }

  return (
    <div style={{ padding: '24px 32px' }}>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>画布</Title>
          <Text type="secondary">把素材按顺序摆成一排，加文字、BGM 和转场，一键渲染成片</Text>
        </div>
        <Space>
          <Button icon={<FormOutlined />} style={{ borderRadius: 10 }} onClick={() => navigate('/canvas/editor/new')}>
            新建空白画布
          </Button>
        </Space>
      </div>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'projects',
            label: `我的画布 (${projects.length})`,
            children: (
              <>
                {projects.length === 0 ? (
                  <Card style={cardStyle}>
                    <Empty description="还没有画布项目" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                        新建一个空白画布，或从模板库挑一个开始
                      </Text>
                      <Button type="primary" icon={<PlusOutlined />} style={{ borderRadius: 10, background: '#7c3aed', borderColor: '#7c3aed' }}
                        onClick={() => navigate('/canvas/editor/new')}>
                        新建画布
                      </Button>
                    </Empty>
                  </Card>
                ) : (
                  <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12} md={8} lg={6}>
                      <Card
                        hoverable style={{ ...cardStyle, height: '100%', minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed' }}
                        onClick={() => navigate('/canvas/editor/new')}
                      >
                        <div style={{ textAlign: 'center' }}>
                          <PlusOutlined style={{ fontSize: 28, color: '#7c3aed' }} />
                          <div style={{ marginTop: 8 }}><Text type="secondary">新建空白画布</Text></div>
                        </div>
                      </Card>
                    </Col>
                    {projects.map(p => {
                      const sm = STATUS_MAP[p.status] || { color: 'default', label: p.status, icon: null };
                      return (
                        <Col xs={24} sm={12} md={8} lg={6} key={p.id}>
                          <Card
                            hoverable style={cardStyle}
                            cover={
                              <div onClick={() => navigate(`/canvas/editor/${p.id}`)}>
                                <CoverThumb src={p.cover_url} height={130} radius={0} />
                              </div>
                            }
                            actions={[
                              <Tooltip title="编辑" key="edit">
                                <EditOutlined onClick={() => navigate(`/canvas/editor/${p.id}`)} />
                              </Tooltip>,
                              <Tooltip title="删除" key="del">
                                <DeleteOutlined style={{ color: '#f5222d' }} onClick={() => handleDelete(p)} />
                              </Tooltip>,
                            ]}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                              <Text strong style={{ fontSize: 14 }} ellipsis>{p.name}</Text>
                            </div>
                            <Space size={6} style={{ marginBottom: 4 }}>
                              <Tag style={{ borderRadius: 6, fontSize: 10 }}>{p.ratio}</Tag>
                              <Tag style={{ borderRadius: 6, fontSize: 10 }}>{p.resolution}</Tag>
                            </Space>
                            <Space>
                              <Tag color={sm.color} style={{ borderRadius: 6, fontSize: 10 }}>{sm.label}</Tag>
                              {p.status === 'rendering' && (
                                <Text type="secondary" style={{ fontSize: 11 }}>{p.progress}%</Text>
                              )}
                            </Space>
                            {p.status === 'completed' && p.result_url && (
                              <Button type="link" size="small" icon={<PlayCircleOutlined />} style={{ padding: 0, fontSize: 12 }}
                                onClick={() => { Modal.info({ title: p.name, width: 480, content: <video src={p.result_url!} controls style={{ width: '100%', borderRadius: 10 }} /> }); }}>
                                查看成片
                              </Button>
                            )}
                          </Card>
                        </Col>
                      );
                    })}
                  </Row>
                )}
              </>
            ),
          },
          {
            key: 'templates',
            label: `画布模板库 (${templates.length})`,
            children: (
              <>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <Input
                    placeholder="搜索模板..." value={keyword}
                    onChange={e => setKeyword(e.target.value)}
                    style={{ maxWidth: 280, borderRadius: 10 }}
                  />
                  <Select value={category} onChange={setCategory} style={{ width: 160, borderRadius: 10 }}
                    options={[{ value: 'all', label: '全部分类' }, ...categories.map(c => ({ value: c, label: c }))]} />
                </div>
                {templates.length === 0 ? (
                  <Card style={cardStyle}>
                    <Empty description="暂无模板" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                      <Text type="secondary" style={{ fontSize: 12 }}>在画布编辑器中可将项目另存为模板</Text>
                    </Empty>
                  </Card>
                ) : (
                  <Row gutter={[16, 16]}>
                    {templates.map(t => (
                      <Col xs={24} sm={12} md={8} lg={6} key={t.id}>
                        <Card hoverable style={cardStyle}>
                          <div style={{ marginBottom: 10 }}>
                            <CoverThumb src={templateCover(t)} height={110} />
                          </div>
                          <Title level={5} style={{ margin: '0 0 4px', fontSize: 14 }}>{t.name}</Title>
                          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8, lineHeight: 1.4 }}>
                            {t.description || '暂无描述'}
                          </Text>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Space size={4}>
                              <Tag style={{ borderRadius: 6, fontSize: 10 }}>{t.category}</Tag>
                              <Tag style={{ borderRadius: 6, fontSize: 10 }}>{t.ratio}</Tag>
                              {t.variables?.length > 0 && (
                                <Tag color="purple" style={{ borderRadius: 6, fontSize: 10 }}>{t.variables.length} 变量</Tag>
                              )}
                            </Space>
                            <Space size={2}>
                              <Tooltip title="复制模板">
                                <Button type="text" size="small" icon={<CopyOutlined />} style={{ fontSize: 14, padding: '4px 6px' }}
                                  onClick={() => duplicateTemplate(t)} />
                              </Tooltip>
                              <Tooltip title="删除">
                                <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ fontSize: 14, padding: '4px 6px' }}
                                  onClick={() => handleDeleteTemplate(t)} />
                              </Tooltip>
                              <Button type="primary" size="small" icon={<LayoutOutlined />} style={{ borderRadius: 8, background: '#7c3aed', borderColor: '#7c3aed', fontSize: 11 }}
                                onClick={() => useTemplate(t)}>
                                使用
                              </Button>
                            </Space>
                          </div>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                )}
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
