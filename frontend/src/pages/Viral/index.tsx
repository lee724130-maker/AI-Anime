import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Row, Col, Card, Tag, Space, Input, Select, Spin, Empty, Button, Badge, message, Modal } from 'antd';
import { SearchOutlined, FireOutlined, PlusOutlined, RightOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, VideoCameraAddOutlined, DeleteOutlined, QuestionCircleOutlined, LinkOutlined, RocketOutlined, BulbOutlined, UpOutlined, AppstoreOutlined, FolderOpenOutlined, MenuOutlined } from '@ant-design/icons';
import api from '../../services/api';
import CoverThumb from './CoverThumb';
import CreditRulesAlert from '../../components/CreditRulesAlert';

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
  const [tplTotal, setTplTotal] = useState(0);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [categories, setCategories] = useState<{ category: string; count: number }[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

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

  const cardStyle = { borderRadius: 14, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' };

  const STEPS = [
    { icon: <LinkOutlined />, title: '提供参考视频', desc: '粘贴抖音/B站视频链接，或直接上传本地视频（仅支持 5 分钟以内）' },
    { icon: <BulbOutlined />, title: 'AI 自动分析', desc: 'AI 解析视频结构、节奏和画面，自动生成专属模板' },
    { icon: <RocketOutlined />, title: '一键生成', desc: '选择模板 → 填写你的内容 → 生成属于你的营销视频' },
  ];

  const NAV_ITEMS = [
    { id: 'viral-top', label: '顶部', icon: <UpOutlined /> },
    { id: 'viral-templates', label: '模板区域', icon: <AppstoreOutlined /> },
    { id: 'viral-projects', label: '我的创作', icon: <FolderOpenOutlined /> },
  ];

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setNavOpen(false);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <style>{`@media (max-width: 1400px){ .viral-side-nav{ display:none!important; } }`}</style>
      {/* 左侧悬浮导航（不占内容区，仅 >768px 渲染） */}
      {!isMobile && (
      <div className="viral-side-nav" style={{
        position: 'fixed', left: 24, top: '50%', transform: 'translateY(-50%)', zIndex: 100,
        width: 96, background: '#fff', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        {NAV_ITEMS.map(item => (
          <Button
            key={item.id}
            type="text"
            onClick={() => scrollToSection(item.id)}
            style={{
              height: 52, borderRadius: 0, color: '#555', fontSize: 13,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              borderLeft: '3px solid transparent',
            }}
          >
            <span style={{ fontSize: 17, lineHeight: 1 }}>{item.icon}</span>
            <span>{item.label}</span>
          </Button>
        ))}
      </div>
      )}

      {/* 移动端折叠导航（点箭头展开/收起） */}
      {isMobile && (
        <>
          <div
            onClick={() => setNavOpen(v => !v)}
            style={{
              position: 'fixed', left: 0, top: '50%', transform: 'translateY(-50%)',
              zIndex: 120, width: 30, height: 92,
              background: navOpen ? '#6d28d9' : '#7c3aed', color: '#fff',
              borderRadius: '0 14px 14px 0', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
              boxShadow: '0 2px 10px rgba(124,58,237,0.45)',
              transition: 'background 0.2s',
            }}
          >
            {navOpen ? <RightOutlined style={{ fontSize: 16 }} /> : <MenuOutlined style={{ fontSize: 16 }} />}
            <span style={{ fontSize: 10, lineHeight: 1.2, textAlign: 'center' }}>
              {navOpen ? '收起' : '导航'}
            </span>
          </div>
          {navOpen && (
            <div style={{
              position: 'fixed', left: 30, top: '50%', transform: 'translateY(-50%)',
              zIndex: 110, width: 124, background: '#fff', borderRadius: 14,
              boxShadow: '0 6px 24px rgba(0,0,0,0.16)', padding: '8px 0',
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              {NAV_ITEMS.map(item => (
                <Button
                  key={item.id}
                  type="text"
                  onClick={() => scrollToSection(item.id)}
                  style={{
                    height: 52, borderRadius: 0, color: '#555', fontSize: 13,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <span style={{ fontSize: 17, lineHeight: 1 }}>{item.icon}</span>
                  <span>{item.label}</span>
                </Button>
              ))}
            </div>
          )}
        </>
      )}

      <div>
        {/* Hero 引导区 */}
        <div id="viral-top" style={{ scrollMarginTop: 80 }}>
          <div style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #4c1d95 100%)',
            borderRadius: 16, padding: '28px 32px', marginBottom: 16,
            color: '#fff', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 24,
            boxShadow: '0 4px 16px rgba(30, 41, 59, 0.35)',
          }}>
            <div style={{ flex: '1 1 360px', minWidth: 280 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <FireOutlined style={{ fontSize: 26 }} />
                <Title level={3} style={{ color: '#fff', margin: 0, fontWeight: 700 }}>热门创作</Title>
              </div>
              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, display: 'block', marginBottom: 16 }}>
                参考爆款模板，替换你的内容，快速生成营销视频
              </Text>
              <Row gutter={[12, 12]}>
                {STEPS.map((s, i) => (
                  <Col xs={24} sm={8} key={i}>
                    <div style={{
                      background: 'rgba(255,255,255,0.12)', borderRadius: 10,
                      padding: '12px 14px', height: '100%', backdropFilter: 'blur(4px)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{
                          width: 20, height: 20, borderRadius: '50%', background: '#fff',
                          color: '#7c3aed', fontSize: 12, fontWeight: 700, lineHeight: '20px', textAlign: 'center',
                        }}>{i + 1}</span>
                        <Text strong style={{ color: '#fff', fontSize: 14 }}>{s.icon} {s.title}</Text>
                      </div>
                      <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, lineHeight: 1.5, display: 'block' }}>
                        {s.desc}
                      </Text>
                    </div>
                  </Col>
                ))}
              </Row>
            </div>
            <div style={{ textAlign: 'center', flexShrink: 0, margin: '0 auto' }}>
              <Button
                type="default" size="large"
                icon={<PlusOutlined />}
                onClick={() => navigate('/viral/create')}
                style={{
                  height: 52, padding: '0 36px', borderRadius: 26, fontSize: 17, fontWeight: 600,
                  background: '#8b5cf6', backgroundImage: 'none', color: '#fff',
                  border: '1px solid rgba(255,255,255,0.35)',
                  boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
                }}
              >
                创建模板
              </Button>
              <div style={{ marginTop: 10 }}>
                <Button type="text" icon={<QuestionCircleOutlined />} style={{ color: 'rgba(255,255,255,0.9)' }}
                  onClick={() => setHelpOpen(true)}>
                  使用教程
                </Button>
              </div>
            </div>
          </div>

          {/* 积分扣费规则 */}
          <CreditRulesAlert apiPath="/api/viral/credit-rules" title="积分扣费规则" />
        </div>

        {/* 模板区域 */}
        <div id="viral-templates" style={{ scrollMarginTop: 80 }}>
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 3, height: 16, background: '#7c3aed', borderRadius: 2 }} />
            <Text strong style={{ fontSize: 15 }}>模板区域</Text>
            <Badge count={tplTotal} style={{ backgroundColor: '#7c3aed', fontSize: 10, boxShadow: 'none' }} />
          </div>

          {/* Search + Filter */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
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
            <Col xs={24} sm={6} style={{ textAlign: 'right' }}>
              <Space wrap>
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
            {templates.slice(0, 8).map(tpl => (
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
          {tplTotal > 8 && (
            <div style={{ textAlign: 'center', marginTop: -8, marginBottom: 24 }}>
              <Button type="link" icon={<RightOutlined />} onClick={() => navigate('/viral/templates')}>
                查看全部 ({tplTotal})
              </Button>
            </div>
          )}
        </div>

        {/* 我的创作 */}
        <div id="viral-projects" style={{ scrollMarginTop: 80 }}>
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 3, height: 16, background: '#7c3aed', borderRadius: 2 }} />
            <Text strong style={{ fontSize: 15 }}>我的创作</Text>
            <Badge count={projects.length} style={{ backgroundColor: '#7c3aed', fontSize: 10, boxShadow: 'none' }} />
          </div>
          {projects.length === 0 ? (
            <Card style={cardStyle}>
              <Empty description="还没有创作项目" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>选择一个模板开始创作你的第一个视频</Text>
              </Empty>
            </Card>
          ) : (
            <Row gutter={[16, 16]}>
              {projects.slice(0, 8).map(p => {
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
            </Row>
          )}
          {projects.length > 8 && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Button type="link" icon={<RightOutlined />} onClick={() => navigate('/viral/projects')}>
                查看全部 ({projects.length})
              </Button>
            </div>
          )}
        </div>

        {/* 使用教程弹窗 */}
        <Modal
          open={helpOpen}
          title="热门创作 · 使用教程"
          onCancel={() => setHelpOpen(false)}
          footer={<Button type="primary" onClick={() => setHelpOpen(false)}>我知道了</Button>}
          width={620}
        >
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ fontSize: 15 }}>操作步骤</Text>
            <div style={{ marginTop: 8 }}>
              {STEPS.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', background: '#7c3aed', color: '#fff',
                    fontSize: 13, fontWeight: 700, lineHeight: '22px', textAlign: 'center', flexShrink: 0,
                  }}>{i + 1}</span>
                  <div>
                    <Text strong>{s.title}</Text>
                    <Text type="secondary" style={{ display: 'block', fontSize: 13 }}>{s.desc}</Text>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ fontSize: 15 }}>注意事项</Text>
            <ul style={{ margin: '8px 0 0', paddingLeft: 20, color: '#666', fontSize: 13, lineHeight: 1.8 }}>
              <li>仅支持抖音、B站视频链接，或上传本地视频（MP4 等格式）</li>
              <li>视频解析仅支持 5 分钟以内，长视频无法解析</li>
              <li>模板分析消耗 50 积分，生成视频按参考图数量扣费，失败自动全额退还</li>
              <li>生成中的项目可在「我的创作」中查看进度</li>
            </ul>
          </div>
        </Modal>
      </div>
    </div>
  );
}
