import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Tag, Input, Select, Spin, Empty, Button, message, Modal } from 'antd';
import { SearchOutlined, FireOutlined, PlusOutlined, RightOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, VideoCameraAddOutlined, DeleteOutlined, QuestionCircleOutlined, LinkOutlined, RocketOutlined, BulbOutlined } from '@ant-design/icons';
import api from '../../services/api';
import CoverThumb from './CoverThumb';
import CreditRulesAlert from '../../components/CreditRulesAlert';
import './viral.css';   // 本页质感改造样式（作用域 .vir-root，详见文件头注释）

const { Title } = Typography;

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
  const [tplTotal, setTplTotal] = useState(0);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [categories, setCategories] = useState<{ category: string; count: number }[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);

  const fetchData = async () => {
    try {
      const params: any = { page: 1, limit: 8 };
      if (category !== 'all') params.category = category;
      if (keyword) params.keyword = keyword;

      const [tplRes, projRes, catRes] = await Promise.all([
        api.get('/api/viral/templates', { params }),
        api.get('/api/viral/projects'),
        api.get('/api/viral/categories'),
      ]);
      setTemplates(tplRes.data.items || []);
      setTplTotal(tplRes.data.total || 0);
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

  const STEPS = [
    { icon: <LinkOutlined />, title: '提供参考视频', desc: '粘贴抖音/B站视频链接，或直接上传本地视频（仅支持 5 分钟以内）' },
    { icon: <BulbOutlined />, title: 'AI 自动分析', desc: 'AI 解析视频结构、节奏和画面，自动生成专属模板' },
    { icon: <RocketOutlined />, title: '一键生成', desc: '选择模板 → 填写你的内容 → 生成属于你的营销视频' },
  ];

  if (loading) {
    return (
      <div className="vir-root"><div className="vir-loading"><Spin size="large" /></div></div>
    );
  }

  return (
    <div className="vir-root">
      {/* Hero 引导区：写死深色渐变 → 品牌 color-mix 渐变（浅色模式不再像贴了块黑横幅） */}
      <div id="viral-top" className="vir-anchor">
        <div className="vir-hero">
          <div className="vir-hero__lead">
            <div className="vir-hero__title-line">
              <FireOutlined />
              <Title level={3} className="vir-hero__title">热门创作</Title>
            </div>
            <span className="vir-hero__sub">参考爆款模板，替换你的内容，快速生成营销视频</span>
            <div className="vir-steps">
              {STEPS.map((s, i) => (
                <div className="vir-step" key={i}>
                  <div className="vir-step__head">
                    <span className="vir-step__no">{i + 1}</span>
                    <span className="vir-step__title">{s.icon}{s.title}</span>
                  </div>
                  <span className="vir-step__desc">{s.desc}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="vir-hero__cta">
            <Button type="default" size="large" className="vir-btn-hero" icon={<PlusOutlined />}
              onClick={() => navigate('/viral/create')}>
              创建模板
            </Button>
            <Button type="text" className="vir-btn-help" icon={<QuestionCircleOutlined />}
              onClick={() => setHelpOpen(true)}>
              使用教程
            </Button>
          </div>
        </div>

        {/* 积分扣费规则（公共组件，不动） */}
        <CreditRulesAlert apiPath="/api/viral/credit-rules" title="积分扣费规则" />
      </div>

      {/* 模板区域 */}
      <div id="viral-templates" className="vir-anchor">
        <div className="vir-section__head">
          <span className="vir-section__bar" />
          <span className="vir-section__title">模板区域</span>
          <span className="vir-section__count">{tplTotal}</span>
        </div>

        {/* 搜索 + 分类 + 入口：Row/Col 断点 → 弹性工具条 */}
        <div className="vir-toolbar">
          <div className="vir-toolbar__search">
            <Input
              placeholder="搜索模板..."
              prefix={<SearchOutlined />}
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onPressEnter={() => fetchData()}
            />
          </div>
          <div className="vir-toolbar__select">
            <Select
              value={category}
              onChange={setCategory}
              style={{ width: '100%' }}
              options={[
                { value: 'all', label: '全部分类' },
                ...categories.map(c => ({ value: c.category, label: `${c.category} (${c.count})` })),
              ]}
            />
          </div>
          <div className="vir-toolbar__actions">
            <Button icon={<VideoCameraAddOutlined />} onClick={() => navigate('/viral/create')}>
              创建模板
            </Button>
            <Button icon={<PlusOutlined />} onClick={() => navigate('/viral/projects')}>
              我的创作
            </Button>
          </div>
        </div>

        {/* 模板卡：antd Card(cover) → 令牌卡；CoverThumb 组件与传参不动 */}
        <div className="vir-grid">
          {templates.slice(0, 8).map(tpl => (
            <div className="vir-tpl-card" key={tpl.id} onClick={() => navigate(`/viral/templates/${tpl.id}`)}>
              <div className="vir-tpl-card__cover">
                <CoverThumb src={tpl.cover_url || tpl.thumbnail} height={140} />
              </div>
              <div className="vir-tpl-card__body">
                <span className="vir-tpl-card__name">{tpl.name}</span>
                <span className="vir-tpl-card__desc">{tpl.description || '暂无描述'}</span>
                <div className="vir-tpl-card__foot">
                  <span className="vir-tpl-card__meta">
                    <Tag className="vir-tpl-card__cat">{tpl.category}</Tag>
                    <span className="vir-tpl-card__heat"><FireOutlined />{tpl.usage_count}</span>
                  </span>
                  <span className="vir-tpl-card__actions">
                    <Button className="vir-btn-del" danger size="small" type="text" icon={<DeleteOutlined />}
                      aria-label="删除模板"
                      onClick={e => { e.stopPropagation(); handleDelete(tpl); }} />
                    <Button className="vir-btn-use" type="primary" size="small"
                      onClick={e => { e.stopPropagation(); navigate(`/viral/templates/${tpl.id}`); }}>
                      使用此模板
                    </Button>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {templates.length === 0 && (
          <div className="vir-stage">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无模板" />
          </div>
        )}
        {tplTotal > 8 && (
          <div className="vir-more">
            <Button type="link" icon={<RightOutlined />} onClick={() => navigate('/viral/templates')}>
              查看全部 ({tplTotal})
            </Button>
          </div>
        )}
      </div>

      {/* 我的创作 */}
      <div id="viral-projects" className="vir-anchor">
        <div className="vir-section__head">
          <span className="vir-section__bar" />
          <span className="vir-section__title">我的创作</span>
          <span className="vir-section__count">{projects.length}</span>
        </div>
        {projects.length === 0 ? (
          <div className="vir-stage">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有创作项目" />
            <span className="vir-stage__hint">选择一个模板开始创作你的第一个视频</span>
          </div>
        ) : (
          <div className="vir-pgrid">
            {projects.slice(0, 8).map(p => {
              const sm = STATUS_MAP[p.status] || { color: 'default', label: p.status, icon: null };
              return (
                <div className="vir-proj-card" key={p.id} onClick={() => navigate(`/viral/projects/${p.id}`)}>
                  <CoverThumb src={p.cover_url} height={90} />
                  <span className="vir-proj-card__name">{p.name}</span>
                  <span className="vir-proj-card__state">
                    <Tag className="vir-proj-card__status" color={sm.color}>{sm.label}</Tag>
                    {p.status === 'processing' && (
                      <span className="vir-proj-card__progress">进度 {p.progress}%</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {projects.length > 8 && (
          <div className="vir-more">
            <Button type="link" icon={<RightOutlined />} onClick={() => navigate('/viral/projects')}>
              查看全部 ({projects.length})
            </Button>
          </div>
        )}
      </div>

      {/* 使用教程弹窗（文案一字不动，只换容器） */}
      <Modal
        open={helpOpen}
        title="热门创作 · 使用教程"
        onCancel={() => setHelpOpen(false)}
        footer={<Button type="primary" onClick={() => setHelpOpen(false)}>我知道了</Button>}
        width={620}
      >
        <div className="vir-help__section">
          <div className="vir-help__h">操作步骤</div>
          <div className="vir-help__list">
            {STEPS.map((s, i) => (
              <div className="vir-help__item" key={i}>
                <span className="vir-help__no">{i + 1}</span>
                <div>
                  <div className="vir-help__t">{s.title}</div>
                  <div className="vir-help__d">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="vir-help__section">
          <div className="vir-help__h">注意事项</div>
          <ul className="vir-help__notes">
            <li>仅支持抖音、B站视频链接，或上传本地视频（MP4 等格式）</li>
            <li>视频解析仅支持 5 分钟以内，长视频无法解析</li>
            <li>模板分析消耗 50 积分，生成视频按参考图数量扣费，失败自动全额退还</li>
            <li>生成中的项目可在「我的创作」中查看进度</li>
          </ul>
        </div>
      </Modal>
    </div>
  );
}
