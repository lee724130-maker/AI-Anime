import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Tag, Button, Spin, Empty, Tooltip, Modal, message } from 'antd';
import {
  VideoCameraOutlined, ThunderboltOutlined, DatabaseOutlined, ExperimentOutlined,
  AppstoreOutlined, UnorderedListOutlined, HistoryOutlined, UserOutlined,
  SketchOutlined, FireOutlined, FileTextOutlined,
  PlusOutlined, SearchOutlined, PlayCircleOutlined, TrophyOutlined,
  GiftOutlined, RocketOutlined, CheckOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../stores/authStore';
import UserLayout from '../../components/UserLayout';
import api from '../../services/api';

const { Text } = Typography;

// ───── 我的作品：状态 tag（各模块视频任务状态 → 颜色/文案） ─────
const WORK_STATUS_MAP: Record<string, { color: string; label: string }> = {
  pending:    { color: 'default', label: '待处理' },
  processing: { color: 'blue',    label: '生成中' },
  generating: { color: 'orange',  label: '生成中' },
  rendering:  { color: 'blue',    label: '渲染中' },
  completed:  { color: 'success', label: '已完成' },
  failed:     { color: 'error',   label: '失败' },
};

// ───── 我的作品：GET /api/workbench/works（模块入口 tab 客户端过滤） ─────
interface WorkItem {
  id: string; module: string; title: string;
  video_url: string | null; cover_url: string | null;
  status: string; time: string; link: string;
}
interface WorksData {
  modules: { key: string; label: string }[];
  items: WorkItem[];
}
const WORK_TAB_ALL = { key: 'all', label: '全部' };

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

// ───── D-A1：快捷入口窄条（原 5 张黑白宽卡 → 图标+文字行，导航功能不丢） ─────
interface QuickEntry {
  title: string; icon: React.ReactNode; href: string;
}
const QUICK_ENTRIES: QuickEntry[] = [
  { title: 'AI 生成', icon: <ThunderboltOutlined />, href: '/generate' },
  { title: '短剧工作室', icon: <VideoCameraOutlined />, href: '/drama' },
  { title: '大资产库', icon: <DatabaseOutlined />, href: '/global-assets' },
  { title: '创作台', icon: <SketchOutlined />, href: '/studio' },
  { title: '热门创作', icon: <FireOutlined />, href: '/viral' },
];

// ───── A：活动栏 + 新功能上新（GET /api/workbench/promo，失败整块隐藏不留空洞） ─────
interface PromoActivity {
  id: number; title: string; subtitle: string | null; cover_url: string | null;
  link_url: string | null; button_text: string | null; kind: string;
  starts_at: string | null; ends_at: string | null; gameplay: string | null;
}
interface PromoRelease {
  id: number; title: string; summary: string | null; cover_url: string | null;
  link_url: string | null; tag: string;
}
interface TaskView {
  key: string; title: string; reward: number;
  done: boolean; claimed: boolean; claimable: boolean;
}
/** 新手任务未完成 → 「去完成」目标页（后端白名单 6 个 key 同步） */
const TASK_ROUTES: Record<string, string> = {
  first_generate: '/generate',
  first_drama: '/drama/create',
  first_canvas: '/canvas',
  first_viral: '/viral',
  first_editor: '/editor',
  first_asset: '/global-assets',
};

/** 倒计时：>1 天「N天 HH:mm:ss」，否则「HH:mm:ss」；过期「已结束」 */
const fmtRemain = (endsAt: string, now: number): string => {
  const diff = new Date(endsAt).getTime() - now;
  if (!Number.isFinite(diff)) return '';
  if (diff <= 0) return '已结束';
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400);
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return d > 0 ? `${d}天 ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
};

// ───── B：优秀作品展（分类字典由接口返回，此为缺省回退） ─────
interface ShowcaseWork {
  id: number; title: string; category: string; video_url: string;
  cover_url: string | null; duration: number | null; author_name: string | null;
  likes: number;
}
const DEFAULT_SHOWCASE_TABS = [
  { key: 'event', label: '活动制作' },
  { key: 'short_video', label: '视频短片' },
  { key: 'series', label: '长篇漫剧' },
  { key: 'ad', label: '广告' },
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
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef<number | null>(null);
  const [kw, setKw] = useState('');
  // ───── 我的作品（模块入口 tab） ─────
  const [works, setWorks] = useState<WorksData | null>(null);
  const [workTab, setWorkTab] = useState('all');
  // ───── B：优秀作品展 ─────
  const [showcase, setShowcase] = useState<{ categories: { key: string; label: string }[]; items: ShowcaseWork[] } | null>(null);
  const [showcaseTab, setShowcaseTab] = useState('all');
  const [playing, setPlaying] = useState<{ title: string; video_url: string } | null>(null);
  // ───── A：活动栏 + 新功能上新 + 新手任务 ─────
  const [promo, setPromo] = useState<{ activities: PromoActivity[]; releases: PromoRelease[] } | null>(null);
  const [taskPanel, setTaskPanel] = useState<{
    open: boolean; loading: boolean; claiming: string | null;
    data: { activity: PromoActivity | null; tasks: TaskView[] } | null;
  }>({ open: false, loading: false, claiming: null, data: null });
  const [now, setNow] = useState(() => Date.now());

  const fetchSummary = async () => {
    try {
      const summaryRes = await api.get('/api/workbench/summary');
      setSummary(summaryRes.data);
    } catch {
      // 轮询失败保留旧数据；仅当从未成功过（summary 仍为 null）时保持 null
      setSummary((prev) => prev);
    }
    setLoading(false);
  };

  // 作品展一次性拉取（策展数据变化不频繁，不轮询）
  const fetchShowcase = async () => {
    try {
      const res = await api.get('/api/workbench/showcase');
      setShowcase(res.data);
    } catch { /* 失败隐藏区块，不留空洞 */ }
  };

  // 活动/上新一次性拉取（运营内容变化不频繁，不轮询；失败整块隐藏）
  const fetchPromo = async () => {
    try {
      const res = await api.get('/api/workbench/promo');
      setPromo(res.data);
    } catch { /* 失败隐藏活动/上新区，快捷入口窄条不受影响 */ }
  };

  // 我的作品一次性拉取（生成记录变化稍频繁，与 summary 同节奏静默刷新）
  const fetchWorks = async () => {
    try {
      const res = await api.get('/api/workbench/works');
      setWorks(res.data);
    } catch { /* 失败隐藏区块，不留空洞 */ }
  };

  useEffect(() => {
    refreshUser();
    fetchSummary();
    fetchShowcase();
    fetchPromo();
    fetchWorks();
    pollingRef.current = window.setInterval(() => {
      fetchSummary();
      fetchWorks();
    }, 10000);
    return () => {
      if (pollingRef.current !== null) clearInterval(pollingRef.current);
    };
  }, []);

  // 有带截止时间的活动时开启 1s 倒计时刷新（无则不跑）
  useEffect(() => {
    if (!promo?.activities?.some((a) => a.ends_at)) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [promo]);

  // 我的作品网格过滤：模块入口 tab + 标题搜索（客户端过滤）
  const myWorks = useMemo(() => {
    const list = works?.items || [];
    const k = kw.trim().toLowerCase();
    return list.filter((w) => {
      const okTab = workTab === 'all' || w.module === workTab;
      const okKw = !k || (w.title || '').toLowerCase().includes(k);
      return okTab && okKw;
    });
  }, [works, workTab, kw]);
  const workLabel = (key: string) =>
    WORK_TAB_ALL.key === key ? WORK_TAB_ALL.label : works?.modules?.find((m) => m.key === key)?.label || key;

  const statusColor = (s: string) => WORK_STATUS_MAP[s]?.color || 'default';
  const statusLabel = (s: string) => WORK_STATUS_MAP[s]?.label || s;

  // 作品展过滤：客户端 tab 过滤（数据 take:100 上限）
  const showcaseTabs = showcase?.categories?.length ? showcase.categories : DEFAULT_SHOWCASE_TABS;
  const filteredWorks = useMemo(() => {
    const list = showcase?.items || [];
    return showcaseTab === 'all' ? list : list.filter((w) => w.category === showcaseTab);
  }, [showcase, showcaseTab]);
  const showcaseLabel = (key: string) => showcaseTabs.find((t) => t.key === key)?.label || key;

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

  // ───── A：活动/上新跳转与新手任务领取 ─────
  const go = (url?: string | null) => {
    if (!url) return;
    if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener');
    else navigate(url);
  };

  const enterActivity = (a: PromoActivity) => {
    if (a.gameplay === 'newbie_tasks') { void openTasks(); return; }
    go(a.link_url);
  };

  const openTasks = async () => {
    setTaskPanel({ open: true, loading: true, claiming: null, data: null });
    try {
      const res = await api.get('/api/workbench/gameplay/tasks');
      setTaskPanel((p) => ({ ...p, loading: false, data: res.data }));
    } catch {
      setTaskPanel((p) => ({ ...p, loading: false, data: null }));
    }
  };

  const claimTask = async (key: string) => {
    setTaskPanel((p) => ({ ...p, claiming: key }));
    try {
      const res = await api.post('/api/workbench/gameplay/claim', { task_key: key });
      message.success(`领取成功，积分 +${res.data?.reward ?? 0}`);
      const r2 = await api.get('/api/workbench/gameplay/tasks');
      setTaskPanel((p) => ({ ...p, data: r2.data }));
      refreshUser();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '领取失败，请稍后再试');
    } finally {
      setTaskPanel((p) => ({ ...p, claiming: null }));
    }
  };

  const taskDoneCount = taskPanel.data?.tasks?.filter((t) => t.done).length ?? 0;

  // 活动栏派生：限时活动区只放首个 banner 满宽大图；其余活动（card 型/多余 banner）并入「新功能上新」网格
  const activities = promo?.activities ?? [];
  const releases = promo?.releases ?? [];
  const mainAct = activities.find((a) => a.kind === 'banner') || null;
  const actCards = activities.filter((a) => a !== mainAct);

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

        {/* ───── ③ A：限时活动（单个满宽 banner；接口失败/无 banner 活动整块隐藏） ───── */}
        {mainAct && (
          <section className="ltv-promo" aria-label="限时活动">
            <div className="ltv-section-title">
              <ThunderboltOutlined style={{ marginRight: 2, color: '#08b6dd' }} />
              限时活动
            </div>
            <div className="ltv-promo-grid">
              <button
                type="button"
                className="ltv-banner"
                style={mainAct.cover_url ? { backgroundImage: `url(${mainAct.cover_url})` } : undefined}
                onClick={() => enterActivity(mainAct)}
              >
                {!mainAct.cover_url && <span className="ltv-banner-ph" aria-hidden="true" />}
                <span className="ltv-banner-body">
                  <span className="ltv-banner-title">{mainAct.title}</span>
                  {mainAct.subtitle && <span className="ltv-banner-sub">{mainAct.subtitle}</span>}
                  <span className="ltv-banner-foot">
                    {mainAct.ends_at && (
                      <span className="ltv-countdown">
                        {fmtRemain(mainAct.ends_at, now) === '已结束' ? '已结束' : `剩余 ${fmtRemain(mainAct.ends_at, now)}`}
                      </span>
                    )}
                    <span className="ltv-banner-cta">{mainAct.button_text || '去参与'}</span>
                  </span>
                </span>
              </button>
            </div>
          </section>
        )}

        {/* ───── ④ A：新功能上新（NEW/BETA/HOT 角标卡 + card 型活动卡；无数据整块隐藏） ───── */}
        {(releases.length > 0 || actCards.length > 0) && (
          <section className="ltv-releases" aria-label="新功能上新">
            <div className="ltv-section-title">
              <RocketOutlined style={{ marginRight: 2, color: '#08b6dd' }} />
              新功能上新
            </div>
            <div className="ltv-rel-grid">
              {releases.map((r) => (
                <button key={`rel-${r.id}`} type="button" className="ltv-rel" onClick={() => go(r.link_url)}>
                  <span
                    className={`ltv-rel-cover${r.cover_url ? '' : ' ltv-rel-cover-ph'}`}
                    style={r.cover_url ? { backgroundImage: `url(${r.cover_url})` } : undefined}
                  >
                    <span className={`ltv-rel-tag ltv-rel-tag-${(r.tag || 'new').toLowerCase()}`}>
                      {r.tag || 'NEW'}
                    </span>
                    {!r.cover_url && <FileTextOutlined className="ltv-rel-ph" aria-hidden="true" />}
                  </span>
                  <span className="ltv-rel-title">{r.title}</span>
                  {r.summary && <span className="ltv-rel-sum">{r.summary}</span>}
                  <span className="ltv-rel-cta">立即体验</span>
                </button>
              ))}
              {actCards.map((a) => (
                <button key={`act-${a.id}`} type="button" className="ltv-rel" onClick={() => enterActivity(a)}>
                  <span
                    className={`ltv-rel-cover${a.cover_url ? '' : ' ltv-rel-cover-ph'}`}
                    style={a.cover_url ? { backgroundImage: `url(${a.cover_url})` } : undefined}
                  >
                    <span className="ltv-rel-tag ltv-rel-tag-act">{a.gameplay ? '任务' : '活动'}</span>
                    {!a.cover_url && (a.gameplay
                      ? <TrophyOutlined className="ltv-rel-ph" aria-hidden="true" />
                      : <GiftOutlined className="ltv-rel-ph" aria-hidden="true" />)}
                  </span>
                  <span className="ltv-rel-title">{a.title}</span>
                  {a.subtitle && <span className="ltv-rel-sum">{a.subtitle}</span>}
                  <span className="ltv-rel-foot">
                    {a.ends_at && fmtRemain(a.ends_at, now) !== '已结束' && (
                      <span className="ltv-rel-remain">剩余 {fmtRemain(a.ends_at, now)}</span>
                    )}
                    <span className="ltv-rel-cta">{a.button_text || (a.gameplay ? '做任务' : '去参与')}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ───── ⑤ D-A1：快捷入口窄条（原 5 宽卡改图标+文字，导航功能不丢） ───── */}
        <section>
          <div className="ltv-section-title">快捷入口</div>
          <div className="ltv-quickrow">
            {QUICK_ENTRIES.map((e) => (
              <button key={e.title} type="button" className="ltv-quick" onClick={() => navigate(e.href)}>
                <span className="ltv-quick-icon">{e.icon}</span>
                <span className="ltv-quick-text">{e.title}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ───── ⑥ 我的作品：模块入口 tab + 搜索 + 各模块生成的视频网格 ───── */}
        {works && (
        <section>
          <div className="ltv-tv-head">
            <div className="ltv-section-title">我的作品</div>
            <div className="ltv-tv-bar">
              <div className="ltv-tabs">
                {[WORK_TAB_ALL, ...works.modules].map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={`ltv-tab${workTab === t.key ? ' active' : ''}`}
                    onClick={() => setWorkTab(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="ltv-tv-tools">
                <span className="ltv-search-box">
                  <input
                    className="ltv-search"
                    placeholder="搜索作品"
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
                  onClick={() => navigate('/generate')}
                >
                  去创作
                </Button>
              </div>
            </div>
          </div>

          {myWorks.length > 0 ? (
            <div className="ltv-grid4">
              {myWorks.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className="ltv-show"
                  onClick={() => {
                    if (w.video_url) setPlaying({ title: w.title, video_url: w.video_url });
                    else navigate(w.link);
                  }}
                >
                  <span
                    className="ltv-show-cover"
                    style={{ background: COVER_FALLBACK }}
                  >
                    {w.cover_url ? (
                      <img
                        src={w.cover_url}
                        alt=""
                        loading="lazy"
                        onError={(ev) => { ev.currentTarget.style.display = 'none'; }}
                      />
                    ) : w.video_url ? (
                      <video src={w.video_url} preload="metadata" muted playsInline />
                    ) : (
                      <FileTextOutlined style={{ fontSize: 40, color: '#7c3aed40' }} />
                    )}
                    {w.video_url && <span className="ltv-show-play"><PlayCircleOutlined /></span>}
                  </span>
                  <span className="ltv-show-info">
                    <span className="ltv-show-avatar"><PlayCircleOutlined /></span>
                    <span className="ltv-show-text">
                      <Tooltip title={w.title}>
                        <span className="ltv-show-title">{w.title}</span>
                      </Tooltip>
                      <span className="ltv-show-meta">
                        <Tag color={statusColor(w.status)} className="ltv-chip">
                          {statusLabel(w.status)}
                        </Tag>
                        <span className="ltv-show-sub">{workLabel(w.module)}</span>
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : works.items.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<span style={{ color: 'var(--text-secondary)' }}>暂无作品</span>}
              style={{ margin: '32px 0' }}
            >
              <Button type="primary" className="btn-dark" style={{ borderRadius: 10 }} onClick={() => navigate('/generate')}>
                去创作
              </Button>
            </Empty>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<span style={{ color: 'var(--text-secondary)' }}>没有匹配的作品</span>}
              style={{ margin: '32px 0' }}
            />
          )}
        </section>
        )}

        {/* ───── ⑦ B：优秀作品展（仿「我的短剧」结构，D-B1 不吸顶 / D-B2 只 tab+最新） ───── */}
        {showcase && showcase.items.length > 0 && (
          <section className="ltv-showcase">
            <div className="ltv-section-title">
              <TrophyOutlined style={{ marginRight: 6, color: '#08b6dd' }} />
              优秀作品展
            </div>
            <div className="ltv-tabs ltv-showcase-tabs">
              <button
                type="button"
                className={`ltv-tab ltv-showcase-tab${showcaseTab === 'all' ? ' active' : ''}`}
                onClick={() => setShowcaseTab('all')}
              >
                全部
              </button>
              {showcaseTabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`ltv-tab ltv-showcase-tab${showcaseTab === t.key ? ' active' : ''}`}
                  onClick={() => setShowcaseTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {filteredWorks.length > 0 ? (
              <div className="ltv-grid4 ltv-showcase-grid">
                {filteredWorks.map((w) => (
                  <button key={w.id} type="button" className="ltv-show" onClick={() => setPlaying(w)}>
                    <span className="ltv-show-cover" style={{ background: COVER_FALLBACK }}>
                      {w.cover_url ? (
                        <img
                          src={w.cover_url}
                          alt=""
                          loading="lazy"
                          onError={(ev) => { ev.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <FileTextOutlined style={{ fontSize: 40, color: '#7c3aed40' }} />
                      )}
                      <span className="ltv-show-play">
                        <PlayCircleOutlined />
                      </span>
                    </span>
                    <span className="ltv-show-info">
                      <span className="ltv-show-avatar"><PlayCircleOutlined /></span>
                      <span className="ltv-show-text">
                        <span className="ltv-show-title">{w.title}</span>
                        <span className="ltv-show-meta">
                          <Tag color="cyan" className="ltv-chip">{showcaseLabel(w.category)}</Tag>
                          <span className="ltv-show-sub">
                            {w.author_name || '匿名创作者'}
                            {w.duration ? ` · ${w.duration}s` : ''}
                          </span>
                        </span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<span style={{ color: 'var(--text-secondary)' }}>该分类暂无作品，快去创作吧</span>}
                style={{ margin: '32px 0' }}
              >
                <Button type="primary" className="btn-dark" style={{ borderRadius: 10 }} onClick={() => navigate('/generate')}>
                  去创作
                </Button>
              </Empty>
            )}
          </section>
        )}

        {/* 作品展播放弹窗 */}
        <Modal
          open={!!playing}
          title={playing?.title}
          footer={null}
          width={800}
          centered
          onCancel={() => setPlaying(null)}
          destroyOnHidden
        >
          {playing && (
            <video
              src={playing.video_url}
              controls
              autoPlay
              style={{ width: '100%', maxHeight: '70vh', borderRadius: 10, background: '#000' }}
            />
          )}
        </Modal>

        {/* 新手任务清单弹窗（gameplay=newbie_tasks 活动） */}
        <Modal
          open={taskPanel.open}
          title={
            <span>
              <TrophyOutlined style={{ marginRight: 6, color: '#08b6dd' }} />
              {taskPanel.data?.activity?.title || '新手任务'}
            </span>
          }
          footer={null}
          width={560}
          centered
          onCancel={() => setTaskPanel((p) => ({ ...p, open: false }))}
          destroyOnHidden
        >
          {taskPanel.loading ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <Spin />
            </div>
          ) : (taskPanel.data?.tasks?.length ?? 0) > 0 ? (
            <>
              <div className="ltv-task-progress">
                <span>已完成 {taskDoneCount} / {taskPanel.data!.tasks.length}</span>
                {taskPanel.data?.activity?.ends_at && (
                  <span className="ltv-countdown">
                    剩余 {fmtRemain(taskPanel.data.activity.ends_at, now)}
                  </span>
                )}
              </div>
              <div className="ltv-task-list">
                {taskPanel.data!.tasks.map((t) => (
                  <div key={t.key} className={`ltv-task${t.done ? ' done' : ''}`}>
                    <span className="ltv-task-dot">{t.done ? <CheckOutlined /> : null}</span>
                    <span className="ltv-task-text">
                      <span className="ltv-task-title">{t.title}</span>
                      <span className="ltv-task-reward">+{t.reward} 积分</span>
                    </span>
                    {t.claimed ? (
                      <Tag className="ltv-chip">已领取</Tag>
                    ) : t.claimable ? (
                      <Button
                        type="primary"
                        size="small"
                        className="btn-dark"
                        loading={taskPanel.claiming === t.key}
                        onClick={() => claimTask(t.key)}
                      >
                        领取
                      </Button>
                    ) : (
                      <Button size="small" onClick={() => { setTaskPanel((p) => ({ ...p, open: false })); go(TASK_ROUTES[t.key] || '/generate'); }}>
                        去完成
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<span style={{ color: 'var(--text-secondary)' }}>当前暂无可完成的任务</span>}
              style={{ margin: '24px 0' }}
            />
          )}
        </Modal>

      </div>
    </UserLayout>
  );
}
