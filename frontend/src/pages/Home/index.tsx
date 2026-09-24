import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Row, Col, Card, Tag, List, Space, Button, Progress, Spin, Empty, Tooltip, Modal, message } from 'antd';
import {
  VideoCameraOutlined, WalletOutlined,
  ThunderboltOutlined, ClockCircleOutlined,
  CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, DatabaseOutlined,
  ExperimentOutlined,
  ReloadOutlined, PlusOutlined,
  RightOutlined, ClearOutlined,
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

// ───── LibTV 风格设计令牌（浅灰画布 / 白卡片 / 细描边 / 中性小圆标签） ─────
const cardStyle = {
  borderRadius: 14,
  border: '1px solid var(--border)',
  boxShadow: 'none',
  background: 'var(--bg)',
};

const chipNeutral: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '1px 9px', borderRadius: 999,
  background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
  fontSize: 11, fontWeight: 500, lineHeight: '18px', whiteSpace: 'nowrap',
};

const chipDanger: React.CSSProperties = {
  ...chipNeutral, background: 'var(--danger-bg)', color: 'var(--danger)',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.2px',
};

export default function HomePage() {
  const { refreshUser, user } = useAuthStore();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<WorkbenchSummary | null>(null);
  const [viralStats, setViralStats] = useState<{ templateCount: number; projectCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef<number | null>(null);

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

  const statusColor = (s: string) => PROJECT_STATUS_MAP[s]?.color || 'default';
  const statusLabel = (s: string) => PROJECT_STATUS_MAP[s]?.label || s;

  const [clearing, setClearing] = useState(false);

  const handleClearFailed = () => {
    Modal.confirm({
      title: '清空失败任务',
      content: '将清除列表中的全部失败任务记录（失败生成的产物文件也会一并删除），确定继续吗？',
      okText: '清空', okType: 'danger', cancelText: '取消',
      okButtonProps: { loading: clearing },
      onOk: async () => {
        setClearing(true);
        try {
          await api.delete('/api/workbench/failed-tasks');
          message.success('已清空失败记录');
          fetchSummary();
        } catch (err: any) {
          message.error('清空失败: ' + (err?.response?.data?.message || err.message));
        } finally {
          setClearing(false);
        }
      },
    });
  };

  const hasNoProjects = summary && summary.projects.length === 0;
  const hasNoFailed = summary && summary.failedTasks.length === 0;
  const hasNoQueue = summary && summary.processingCount === 0 && summary.pendingCount === 0;
  const pc = summary?.processingCount ?? 0;
  const pend = summary?.pendingCount ?? 0;

  const statCards = summary ? [
    { title: '短剧项目', value: summary.projectStats.total, icon: <VideoCameraOutlined />, href: '/drama' },
    { title: 'AI 生成', value: summary.totalGenerations, icon: <ThunderboltOutlined />, href: '/generate' },
    { title: '全局资产', value: summary.assetStats.global.total, icon: <DatabaseOutlined />, href: '/global-assets' },
    { title: '热门创作', value: viralStats?.templateCount ?? 0, icon: <ExperimentOutlined />, href: '/viral' },
  ] : [];

  const quickLinks = [
    { title: 'AI 生成', icon: <ThunderboltOutlined />, desc: '创作新作品', href: '/generate' },
    { title: '短剧工作室', icon: <VideoCameraOutlined />, desc: '管理短剧项目', href: '/drama' },
    { title: '大资产库', icon: <DatabaseOutlined />, desc: '全局共享资产', href: '/global-assets' },
    { title: '创作台', icon: <ExperimentOutlined />, desc: '进入 Studio', href: '/studio' },
  ];

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
      {/* ───── Hero：LibTV 点阵虚线大卡 ───── */}
      <div style={{
        borderRadius: 16,
        border: '1px dashed var(--border)',
        backgroundColor: 'var(--bg)',
        backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)',
        backgroundSize: '14px 14px',
        padding: '30px 32px',
        marginBottom: 26,
      }}>
        <Row align="middle" justify="space-between" wrap>
          <Col>
            <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              欢迎回来{user?.username ? `，${user.username}` : ''}
            </div>
            <div style={{ color: 'var(--text)', fontSize: 26, fontWeight: 700, marginTop: 4, lineHeight: 1.3, letterSpacing: '-0.4px' }}>
              创作工作台
            </div>
          </Col>
          <Col flex="auto" style={{ textAlign: 'right' }}>
            <Space size={20} wrap>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, display: 'block' }}>可用算力</div>
                <div style={{ color: 'var(--text)', fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>
                  ⚡ {user?.credits ?? summary?.credits ?? '-'}
                </div>
              </div>
              <Button
                icon={<WalletOutlined />}
                size="large"
                className="btn-dark"
                style={{ borderRadius: 8 }}
                onClick={() => navigate('/order')}
              >
                充值
              </Button>
              {summary && summary.processingCount > 0 && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 14px', borderRadius: 999,
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  color: 'var(--text-secondary)', fontSize: 12,
                }}>
                  <SyncOutlined spin /> {summary.processingCount} 个任务运行中
                </span>
              )}
            </Space>
          </Col>
        </Row>
      </div>

      {/* ───── Stats ───── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 26 }}>
        {statCards.map((s) => (
          <Col xs={12} sm={6} key={s.title}>
            <Card hoverable style={cardStyle} onClick={() => navigate(s.href)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: 'var(--text)', flexShrink: 0 }}>
                  {s.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, display: 'block', lineHeight: 1.2, color: 'var(--text-secondary)' }}>{s.title}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>{s.value}</div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* ───── 快捷入口：LibTV 方块入口行 ───── */}
      <div style={{ ...sectionTitle, marginBottom: 12 }}>快捷入口</div>
      <Row gutter={[16, 16]} style={{ marginBottom: 30 }}>
        {quickLinks.map((card) => (
          <Col xs={12} sm={6} key={card.title}>
            <div className="libtv-tile" onClick={() => navigate(card.href)}>
              <div
                className="libtv-tile-box"
                style={{
                  height: 76, borderRadius: 12,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, color: 'var(--text)',
                }}
              >
                {card.icon}
              </div>
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: 'var(--text)', textAlign: 'center' }}>{card.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center' }}>{card.desc}</div>
            </div>
          </Col>
        ))}
      </Row>

      {/* ───── Main Content (2-col) ───── */}
      <Row gutter={[24, 24]}>
        {/* Left — Projects */}
        <Col xs={24} lg={16}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 12px' }}>
            <span style={sectionTitle}>我的短剧</span>
            {summary && summary.projectStats.total > 0 && (
              <span style={chipNeutral}>{summary.projectStats.total}</span>
            )}
            <div style={{ flex: 1 }} />
            {summary && summary.pendingCount > 0 && (
              <span style={chipNeutral}>
                <ClockCircleOutlined style={{ fontSize: 11 }} /> 待处理 {summary.pendingCount}
              </span>
            )}
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
          <Card style={cardStyle}>
            {hasNoProjects ? (
              <Empty description={<span style={{ color: 'var(--text-secondary)' }}>暂无短剧项目</span>} image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '24px 0' }}>
                <Button type="primary" className="btn-dark" style={{ borderRadius: 10 }}
                  onClick={() => navigate('/drama/create')}>创建第一个短剧</Button>
              </Empty>
            ) : (
              <List
                dataSource={summary?.projects || []}
                split={false}
                renderItem={(p) => (
                  <List.Item
                    style={{ padding: '12px 0', cursor: 'pointer', borderBottom: '1px solid var(--border-light)' }}
                    onClick={() => navigate(`/drama/${p.id}`)}
                    actions={[
                      <Button type="link" size="small"
                        style={{ color: 'var(--text-muted)', padding: 0, minWidth: 'auto' }}
                        icon={<RightOutlined />}
                        onClick={(e) => { e.stopPropagation(); navigate(`/drama/${p.id}`); }} />,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={
                        <div style={{
                          width: 42, height: 42, borderRadius: 10,
                          background: p.cover_url ? `url(${p.cover_url}) center/cover` : 'var(--bg-tertiary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: '1px solid var(--border-light)',
                        }}>
                          {!p.cover_url && <VideoCameraOutlined style={{ fontSize: 16, color: 'var(--text-muted)' }} />}
                        </div>
                      }
                      title={
                        <Space size={8}>
                          <Text strong style={{ fontSize: 14, color: 'var(--text)' }}>{p.title || `短剧 #${p.id}`}</Text>
                          <Tag color={statusColor(p.status)} style={{ borderRadius: 999, fontSize: 10, lineHeight: '18px', margin: 0, border: 'none' }}>
                            {statusLabel(p.status)}
                          </Tag>
                        </Space>
                      }
                      description={
                        <Space size={12}>
                          {p.genre && <Text type="secondary" style={{ fontSize: 12 }}>{p.genre}</Text>}
                          <Text type="secondary" style={{ fontSize: 12 }}>{p.episodes} 集</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>→ {p.nextStep}</Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        {/* Right — Queue + Failed */}
        <Col xs={24} lg={8}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {/* Queue */}
            <div>
              <div style={{ ...sectionTitle, marginBottom: 12 }}>任务概览</div>
              <Card style={cardStyle}>
                {hasNoQueue ? (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <CheckCircleOutlined style={{ fontSize: 30, color: 'var(--success)', marginBottom: 8 }} />
                    <br />
                    <Text type="secondary" style={{ fontSize: 13 }}>当前无进行中的任务</Text>
                  </div>
                ) : (
                  <>
                    <Row gutter={[12, 12]}>
                      <Col span={12}>
                        <div
                          onClick={() => navigate('/tasks?status=processing')}
                          style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: '14px 8px', textAlign: 'center', cursor: 'pointer', transition: 'box-shadow .2s' }}
                          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
                        >
                          <SyncOutlined spin={(summary?.processingCount ?? 0) > 0} style={{ fontSize: 18, color: 'var(--success)', marginBottom: 4 }} />
                          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)' }}>{summary?.processingCount ?? 0}</div>
                          <Text type="secondary" style={{ fontSize: 12 }}>处理中</Text>
                        </div>
                      </Col>
                      <Col span={12}>
                        <div
                          onClick={() => navigate('/tasks?status=pending')}
                          style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: '14px 8px', textAlign: 'center', cursor: 'pointer', transition: 'box-shadow .2s' }}
                          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
                        >
                          <ClockCircleOutlined style={{ fontSize: 18, color: 'var(--warning)', marginBottom: 4 }} />
                          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)' }}>{summary?.pendingCount ?? 0}</div>
                          <Text type="secondary" style={{ fontSize: 12 }}>待处理</Text>
                        </div>
                      </Col>
                    </Row>
                    <Progress
                      percent={pc + pend > 0 ? Math.round((pc / (pc + pend)) * 100) : 0}
                      strokeColor="var(--text)" size="small" style={{ marginTop: 14 }} />
                  </>
                )}
              </Card>
            </div>

            {/* Failed */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={sectionTitle}>失败任务</span>
                {summary && summary.failedTasks.length > 0 && (
                  <span style={chipDanger}>{summary.failedTasks.length}</span>
                )}
                <div style={{ flex: 1 }} />
                <Space size={4}>
                  {summary && summary.failedTasks.length > 0 && (
                    <Button size="small" danger type="text" icon={<ClearOutlined />} style={{ color: 'var(--danger)' }} onClick={handleClearFailed}>
                      清空
                    </Button>
                  )}
                  <Button type="text" size="small" icon={<ReloadOutlined />} style={{ color: 'var(--text-muted)' }} onClick={fetchSummary} />
                </Space>
              </div>
              <Card style={cardStyle}>
                {hasNoFailed ? (
                  <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <CheckCircleOutlined style={{ fontSize: 26, color: 'var(--success)', marginBottom: 6 }} />
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>最近没有失败任务</Text>
                  </div>
                ) : (
                  <List
                    size="small"
                    split={false}
                    dataSource={summary?.failedTasks ?? []}
                    renderItem={(t) => (
                      <List.Item style={{ padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                        <List.Item.Meta
                          avatar={<CloseCircleOutlined style={{ color: 'var(--danger)', fontSize: 13 }} />}
                          title={
                            <Tooltip title={t.errorRaw || t.error}>
                              <Text style={{ fontSize: 12, color: 'var(--danger)' }} ellipsis>{t.error}</Text>
                            </Tooltip>
                          }
                          description={
                            <Text type="secondary" style={{ fontSize: 10 }}>
                              [{t.source}] {t.type} · {new Date(t.time).toLocaleString('zh-CN')}
                            </Text>
                          }
                        />
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            </div>
          </div>
        </Col>
      </Row>
    </UserLayout>
  );
}
