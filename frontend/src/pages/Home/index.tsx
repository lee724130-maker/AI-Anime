import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Tag, Button, Spin, Empty, Tooltip } from 'antd';
import {
  VideoCameraOutlined, ThunderboltOutlined, DatabaseOutlined, ExperimentOutlined,
  AppstoreOutlined, UnorderedListOutlined, HistoryOutlined, UserOutlined,
  SketchOutlined, FireOutlined, FileTextOutlined,
  PlusOutlined, SearchOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../stores/authStore';
import UserLayout from '../../components/UserLayout';
import api from '../../services/api';

const { Text } = Typography;

const PROJECT_STATUS_MAP: Record<string, { color: string; label: string }> = {
  draft:            { color: 'default',    label: '草稿' },
  outline_pending:  { color: 'processing', label: '分析中' },
  analysis_done:    { color: 'blue',       label: '待生成资产' },
  generating:       { color: 'orange',     label: '片段生成中' },
  completed:        { color: 'success',    label: '已完成' },
  failed:           { color: 'error',      label: '失败' },
};

interface WorkbenchProject {
  id: number; title: string; status: string; genre: string;
  episodes: number; cover_url: string; nextStep: string; updated_at: string;
}

interface FailedTask {
  id: number; source: string; type: string; status: string;
  error: string; errorRaw: string; time: string;
}

interface WorkbenchSummary {
  credits: number;
  projectStats: { total: number; byStatus: Record<string, number> };
  assetStats: { drama: { total: number; byType: Record<string, number> }; global: { total: number } };
  segmentStats: { total: number; byStatus: Record<string, number> };
  projects: WorkbenchProject[];
  failedTasks: FailedTask[];
  processingCount: number;
  pendingCount: number;
  totalGenerations: number;
}

// ───── LibTV「最近上新」式快捷入口宽卡（黑白中性封面 + 标题 + 数值徽章） ─────
// 封面不用彩色渐变（AI 感重），改黑白灰阶、随主题在 index.css 翻转
interface WideEntry {
  title: string; tag: string; icon: React.ReactNode;
  href: string;
}
const WIDE_ENTRIES: WideEntry[] = [
  { title: 'AI 生成', tag: '生成', icon: <ThunderboltOutlined />, href: '/generate' },
  { title: '短剧工作室', tag: '短剧', icon: <VideoCameraOutlined />, href: '/drama' },
  { title: '大资产库', tag: '资产', icon: <DatabaseOutlined />, href: '/global-assets' },
  { title: '创作台', tag: 'Studio', icon: <SketchOutlined />, href: '/studio' },
  { title: '热门创作', tag: '爆款', icon: <FireOutlined />, href: '/viral' },
];

// ───── TV Show 区块状态 tab ─────
const PROJECT_TABS = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '创作中' },
  { key: 'done', label: '已完成' },
  { key: 'failed', label: '失败' },
];

// 无封面占位 = drama 列表页 ant-card-body 同款（浅紫 tint 渐变 + 紫色文档图标）
const COVER_FALLBACK = 'linear-gradient(135deg, #7c3aed20, #ec489920)';

interface FeatureEntry {
  label: string; href: string; icon: React.ReactNode;
}

export default function HomePage() {
  const { refreshUser } = useAuthStore();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<WorkbenchSummary | null>(null);
  const [viralStats, setViralStats] = useState<{ templateCount: number; projectCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef<number | null>(null);
  const [tab, setTab] = useState('all');
  const [kw, setKw] = useState('');

  const fetchSummary = async () => {
    try {
      const [summaryRes, viralRes] = await Promise.all([
        api.get('/api/workbench/summary'),
        api.get('/api/viral/stats').catch(() => null),
      ]);
      setSummary(summaryRes.data);
      if (viralRes) setViralStats(viralRes.data);
    } catch {
      // 轮询失败保留旧数据；仅当从未成功过（summary 仍为 null）时保持 null
      setSummary((prev) => prev);
    }
    setLoading(false);
  };

  useEffect(() => {
    refreshUser();
    fetchSummary();
    pollingRef.current = window.setInterval(fetchSummary, 10000);
    return () => {
      if (pollingRef.current !== null) clearInterval(pollingRef.current);
    };
  }, []);

  // TV Show 网格过滤：状态 tab + 标题搜索（客户端过滤，不新增接口）
  const filteredProjects = useMemo(() => {
    const list = summary?.projects || [];
    const k = kw.trim().toLowerCase();
    return list.filter((p) => {
      const okTab =
        tab === 'all' ||
        (tab === 'active' && p.status !== 'completed' && p.status !== 'failed') ||
        (tab === 'done' && p.status === 'completed') ||
        (tab === 'failed' && p.status === 'failed');
      const okKw = !k || (p.title || '').toLowerCase().includes(k);
      return okTab && okKw;
    });
  }, [summary, tab, kw]);

  const statusColor = (s: string) => PROJECT_STATUS_MAP[s]?.color || 'default';
  const statusLabel = (s: string) => PROJECT_STATUS_MAP[s]?.label || s;

  const hasNoProjects = summary && summary.projects.length === 0;

  // LibTV 工具小卡行：4 个统计入口 + 4 个功能入口
  const features: FeatureEntry[] = summary ? [
    { label: '短剧项目', href: '/drama', icon: <VideoCameraOutlined /> },
    { label: 'AI 生成', href: '/generate', icon: <ThunderboltOutlined /> },
    { label: '全局资产', href: '/global-assets', icon: <DatabaseOutlined /> },
    { label: '热门创作', href: '/viral', icon: <ExperimentOutlined /> },
    { label: '画布', href: '/canvas', icon: <AppstoreOutlined /> },
    { label: '任务中心', href: '/tasks', icon: <UnorderedListOutlined /> },
    { label: '生成历史', href: '/generate/history', icon: <HistoryOutlined /> },
    { label: '个人中心', href: '/user', icon: <UserOutlined /> },
  ] : [];

  // 宽卡徽章：有统计值的显示数值（保留原统计卡信息），创作台显示 Studio
  const wideBadge = (title: string): string => {
    if (title === 'AI 生成') return String(summary?.totalGenerations ?? 0);
    if (title === '短剧工作室') return String(summary?.projectStats.total ?? 0);
    if (title === '大资产库') return String(summary?.assetStats.global.total ?? 0);
    if (title === '热门创作') return String(viralStats?.templateCount ?? 0);
    return 'Studio';
  };

  if (loading) {
    return (
      <UserLayout>
        <div style={{ textAlign: 'center', padding: '100px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16, color: 'var(--text-secondary)' }}>加载中...</div>
        </div>
      </UserLayout>
    );
  }

  if (!summary) {
    return (
      <UserLayout>
        <div style={{ textAlign: 'center', padding: '100px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <Text strong style={{ fontSize: 16 }}>工作台数据加载失败</Text>
          <div style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 13 }}>请检查网络连接后重试</div>
          <Button type="primary" className="btn-dark" style={{ marginTop: 20 }} onClick={() => { setLoading(true); fetchSummary(); }}>
            重新加载
          </Button>
        </div>
      </UserLayout>
    );
  }

  return (
    <UserLayout>
      <div className="ltv-page">
        {/* ───── ① LibTV 创建卡：点阵底 + 居中加号按钮 ───── */}
        <section className="ltv-hero">
          <button type="button" className="ltv-create" onClick={() => navigate('/generate')}>
            <span className="ltv-create-plus">
              <svg width="19" height="19" viewBox="0 0 20.13 20.13" aria-hidden="true" focusable="false">
                <path
                  d="M8.75 18.81v-7.43H1.31a1.31 1.31 0 1 1 0-2.63h7.44V1.31a1.31 1.31 0 0 1 2.63 0v7.44h7.43a1.31 1.31 0 1 1 0 2.63h-7.43v7.43a1.31 1.31 0 1 1-2.63 0"
                  fill="currentColor"
                />
              </svg>
            </span>
            <span className="ltv-create-label">开始创作</span>
          </button>

          {/* ───── ② LibTV HomeFeatureGrid：小工具卡横排（移动端 3 列网格） ───── */}
          <div className="ltv-features">
            {features.map((f) => (
              <button key={f.label} type="button" className="ltv-feature" onClick={() => navigate(f.href)}>
                <span className="ltv-feature-box">{f.icon}</span>
                <span className="ltv-feature-label">{f.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ───── ③ LibTV「最近上新」：快捷入口宽卡 ───── */}
        <section>
          <div className="ltv-section-title">快捷入口</div>
          <div className="ltv-row5">
            {WIDE_ENTRIES.map((e) => (
              <button key={e.title} type="button" className="ltv-wide" onClick={() => navigate(e.href)}>
                <span className="ltv-wide-cover">
                  <span className="ltv-wide-icon">{e.icon}</span>
                </span>
                <span className="ltv-wide-meta">
                  <span className="ltv-wide-title">{e.title}</span>
                  <span className="ltv-badge">{wideBadge(e.title)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ───── ④ LibTV「TV Show」：粘性标题 + 状态 tab + 搜索 + 封面网格（我的短剧） ───── */}
        <section>
          <div className="ltv-tv-head">
            <div className="ltv-section-title">我的短剧</div>
            <div className="ltv-tv-bar">
              <div className="ltv-tabs">
                {PROJECT_TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={`ltv-tab${tab === t.key ? ' active' : ''}`}
                    onClick={() => setTab(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="ltv-tv-tools">
                <span className="ltv-search-box">
                  <input
                    className="ltv-search"
                    placeholder="搜索短剧"
                    value={kw}
                    onChange={(e) => setKw(e.target.value)}
                  />
                  <SearchOutlined className="ltv-search-icon" />
                </span>
                <Button
                  type="primary"
                  size="small"
                  className="btn-dark"
                  icon={<PlusOutlined />}
                  style={{ borderRadius: 8 }}
                  onClick={() => navigate('/drama/create')}
                >
                  新建
                </Button>
              </div>
            </div>
          </div>

          {filteredProjects.length > 0 ? (
            <div className="ltv-grid4">
              {filteredProjects.map((p) => (
                <button key={p.id} type="button" className="ltv-show" onClick={() => navigate(`/drama/${p.id}`)}>
                  <span
                    className="ltv-show-cover"
                    style={{ background: COVER_FALLBACK }}
                  >
                    {p.cover_url ? (
                      <img
                        src={p.cover_url}
                        alt=""
                        loading="lazy"
                        onError={(ev) => { ev.currentTarget.style.display = 'none'; }}
                      />
                    ) : (
                      <FileTextOutlined style={{ fontSize: 40, color: '#7c3aed40' }} />
                    )}
                  </span>
                  <span className="ltv-show-info">
                    <span className="ltv-show-avatar"><VideoCameraOutlined /></span>
                    <span className="ltv-show-text">
                      <Tooltip title={p.nextStep ? `下一步：${p.nextStep}` : ''}>
                        <span className="ltv-show-title">{p.title || `短剧 #${p.id}`}</span>
                      </Tooltip>
                      <span className="ltv-show-meta">
                        <Tag color={statusColor(p.status)} className="ltv-chip">
                          {statusLabel(p.status)}
                        </Tag>
                        <span className="ltv-show-sub">{p.genre || '短剧'} · {p.episodes} 集</span>
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : hasNoProjects ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<span style={{ color: 'var(--text-secondary)' }}>暂无短剧项目</span>}
              style={{ margin: '32px 0' }}
            >
              <Button type="primary" className="btn-dark" style={{ borderRadius: 10 }} onClick={() => navigate('/drama/create')}>
                创建第一个短剧
              </Button>
            </Empty>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<span style={{ color: 'var(--text-secondary)' }}>没有匹配的短剧</span>}
              style={{ margin: '32px 0' }}
            />
          )}
        </section>

      </div>
    </UserLayout>
  );
}
