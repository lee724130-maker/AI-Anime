import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Tag, Input, Select, Spin, Empty, Button, message, Modal, Tabs, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, PlayCircleOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, LayoutOutlined, CopyOutlined, FormOutlined } from '@ant-design/icons';
import api from '../../services/api';
import CoverThumb from '../Viral/CoverThumb';
import './canvas.css';   // 本页质感改造样式（作用域 .cnv-root，详见文件头注释）

const { Title, Text } = Typography;

const templateCover = (t: CanvasTemplate): string | null => {
  const nodes = Array.isArray(t.nodes) ? t.nodes : [];
  const n = nodes.find((x: any) => x && (x.source?.url || x.url));
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
          <div className="cnv-varform">
            {inputs.map((inp) => (
              <div key={inp.key}>
                <Text className="cnv-varform__label">{inp.label}</Text>
                <input
                  id={`tpl-var-${inp.key}`}
                  className="cnv-varform__input"
                  defaultValue={inp.defaultValue}
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

  if (loading) {
    return <div className="cnv-root"><div className="cnv-loading"><Spin size="large" /></div></div>;
  }

  return (
    <div className="cnv-root">
      <div className="cnv-topbar">
        <div className="cnv-topbar__titles">
          <Title level={4} className="cnv-topbar__title">画布</Title>
          <span className="cnv-topbar__sub">把素材按顺序摆成一排，加文字、BGM 和转场，一键渲染成片</span>
        </div>
        <Button className="cnv-btn-new" icon={<FormOutlined />} onClick={() => navigate('/canvas/editor/new')}>
          新建空白画布
        </Button>
      </div>

      <div className="cnv-panel">
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
                    <div className="cnv-stage">
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有画布项目" />
                      <span className="cnv-stage__hint">新建一个空白画布，或从模板库挑一个开始</span>
                      <Button className="cnv-btn-primary" type="primary" icon={<PlusOutlined />}
                        onClick={() => navigate('/canvas/editor/new')}>
                        新建画布
                      </Button>
                    </div>
                  ) : (
                    <div className="cnv-grid">
                      <div className="cnv-new" onClick={() => navigate('/canvas/editor/new')}>
                        <PlusOutlined className="cnv-new__icon" />
                        <span className="cnv-new__text">新建空白画布</span>
                      </div>
                      {projects.map(p => {
                        const sm = STATUS_MAP[p.status] || { color: 'default', label: p.status, icon: null };
                        return (
                          <div className="cnv-card" key={p.id}>
                            <div className="cnv-card__cover" onClick={() => navigate(`/canvas/editor/${p.id}`)}>
                              <CoverThumb src={p.cover_url} height={130} radius={0} />
                            </div>
                            <div className="cnv-card__body">
                              <span className="cnv-card__name">{p.name}</span>
                              <div className="cnv-card__tags">
                                <Tag className="cnv-chip" style={{ marginInlineEnd: 0 }}>{p.ratio}</Tag>
                                <Tag className="cnv-chip" style={{ marginInlineEnd: 0 }}>{p.resolution}</Tag>
                              </div>
                              <div className="cnv-card__tags">
                                <Tag className="cnv-chip cnv-chip--state" color={sm.color} style={{ marginInlineEnd: 0 }}>{sm.label}</Tag>
                                {p.status === 'rendering' && <span className="cnv-card__progress">{p.progress}%</span>}
                                {p.status === 'completed' && p.result_url && (
                                  <Button className="cnv-link" type="link" size="small" icon={<PlayCircleOutlined />}
                                    onClick={() => { Modal.info({ title: p.name, width: 480, content: <video src={p.result_url!} controls className="cnv-video" /> }); }}>
                                    查看成片
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="cnv-card__foot">
                              <Tooltip title="编辑">
                                <Button className="cnv-iconbtn" type="text" size="small" icon={<EditOutlined />}
                                  aria-label="编辑" onClick={() => navigate(`/canvas/editor/${p.id}`)} />
                              </Tooltip>
                              <Tooltip title="删除">
                                <Button className="cnv-iconbtn cnv-iconbtn--del" type="text" size="small" danger
                                  icon={<DeleteOutlined />} aria-label="删除" onClick={() => handleDelete(p)} />
                              </Tooltip>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ),
            },
            {
              key: 'templates',
              label: `画布模板库 (${templates.length})`,
              children: (
                <>
                  <div className="cnv-toolbar">
                    <Input
                      placeholder="搜索模板..." value={keyword}
                      onChange={e => setKeyword(e.target.value)}
                    />
                    <Select value={category} onChange={setCategory} style={{ width: 160 }}
                      options={[{ value: 'all', label: '全部分类' }, ...categories.map(c => ({ value: c, label: c }))]} />
                  </div>
                  {templates.length === 0 ? (
                    <div className="cnv-stage">
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无模板" />
                      <span className="cnv-stage__hint">在画布编辑器中可将项目另存为模板</span>
                    </div>
                  ) : (
                    <div className="cnv-grid">
                      {templates.map(t => (
                        <div className="cnv-card" key={t.id}>
                          <div className="cnv-card__cover">
                            <CoverThumb src={templateCover(t)} height={110} />
                          </div>
                          <div className="cnv-card__body">
                            <span className="cnv-card__name">{t.name}</span>
                            <span className="cnv-card__desc">{t.description || '暂无描述'}</span>
                            <div className="cnv-card__tags">
                              <Tag className="cnv-chip" style={{ marginInlineEnd: 0 }}>{t.category}</Tag>
                              <Tag className="cnv-chip" style={{ marginInlineEnd: 0 }}>{t.ratio}</Tag>
                              {t.variables?.length > 0 && (
                                <Tag className="cnv-chip" color="purple" style={{ marginInlineEnd: 0 }}>{t.variables.length} 变量</Tag>
                              )}
                            </div>
                          </div>
                          <div className="cnv-card__foot">
                            <Tooltip title="复制模板">
                              <Button className="cnv-iconbtn" type="text" size="small" icon={<CopyOutlined />}
                                aria-label="复制模板" onClick={() => duplicateTemplate(t)} />
                            </Tooltip>
                            <Tooltip title="删除">
                              <Button className="cnv-iconbtn cnv-iconbtn--del" type="text" size="small" danger
                                icon={<DeleteOutlined />} aria-label="删除" onClick={() => handleDeleteTemplate(t)} />
                            </Tooltip>
                            <Button className="cnv-btn-use" type="primary" size="small" icon={<LayoutOutlined />}
                              onClick={() => useTemplate(t)}>
                              使用
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
