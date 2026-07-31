import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Row, Col, Card, Tag, List, Space, Button, Progress, Spin, Empty, Tooltip, Badge } from 'antd';
import {
  VideoCameraOutlined, WalletOutlined,
  ThunderboltOutlined, ClockCircleOutlined,
  CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, DatabaseOutlined,
  ExperimentOutlined,
  ReloadOutlined, PlusOutlined,
  AimOutlined, RightOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../stores/authStore';
import UserLayout from '../../components/UserLayout';
import api from '../../services/api';

const { Title, Text } = Typography;

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
    } catch { /* ignore */ }
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

  const hasNoProjects = summary && summary.projects.length === 0;
  const hasNoFailed = summary && summary.failedTasks.length === 0;
  const hasNoQueue = summary && summary.processingCount === 0 && summary.pendingCount === 0;

  const cardStyle = { borderRadius: 14, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' };

  const statCards = summary ? [
    { title: '短剧项目', value: summary.projectStats.total, icon: <VideoCameraOutlined />, color: '#7c3aed', bg: '#f5f0ff', href: '/drama' },
    { title: 'AI 生成', value: summary.totalGenerations, icon: <ThunderboltOutlined />, color: '#ec4899', bg: '#fdf2f8', href: '/generate' },
    { title: '全局资产', value: summary.assetStats.global.total, icon: <DatabaseOutlined />, color: '#0891b2', bg: '#ecfeff', href: '/global-assets' },
    { title: '热门创作', value: viralStats?.templateCount ?? 0, icon: <ExperimentOutlined />, color: '#f59e0b', bg: '#fffbeb', href: '/viral' },
  ] : [];

  const quickLinks = [
    { title: 'AI 生成', icon: <ThunderboltOutlined />, desc: '创作新作品', color: '#7c3aed', bg: '#f5f0ff', href: '/generate' },
    { title: '短剧工作室', icon: <VideoCameraOutlined />, desc: '管理短剧项目', color: '#ec4899', bg: '#fdf2f8', href: '/drama' },
    { title: '大资产库', icon: <DatabaseOutlined />, desc: '全局共享资产', color: '#0891b2', bg: '#ecfeff', href: '/global-assets' },
    { title: '创作台', icon: <ExperimentOutlined />, desc: '进入 Studio', color: '#f59e0b', bg: '#fffbeb', href: '/studio' },
  ];

  if (loading) {
    return (
      <UserLayout>
        <div style={{ textAlign: 'center', padding: '100px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16, color: '#999' }}>加载中...</div>
        </div>
      </UserLayout>
    );
  }

  return (
    <UserLayout>
      {/* ───── Hero ───── */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: 20, padding: '32px 36px', marginBottom: 28,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -60, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ position: 'absolute', bottom: -80, left: '30%', width: 260, height: 260, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <Row align="middle" justify="space-between" wrap>
          <Col>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15 }}>欢迎回来{user?.username ? `，${user.username}` : ''}</Text>
            <Title level={3} style={{ color: '#fff', margin: '4px 0 0', fontSize: 26, fontWeight: 600 }}>创作工作台</Title>
          </Col>
          <Col flex="auto" style={{ textAlign: 'right' }}>
            <Space size={20} wrap>
              <div style={{ display: 'inline-block', textAlign: 'right' }}>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, display: 'block' }}>可用算力</Text>
                <Text style={{ color: '#fff', fontSize: 28, fontWeight: 700 }}>⚡ {user?.credits ?? summary?.credits ?? '-'}</Text>
              </div>
              <Button shape="round" icon={<WalletOutlined />} size="large"
                style={{ borderColor: 'rgba(255,255,255,0.3)', color: '#fff', background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)' }}
                onClick={() => navigate('/order')}>充值</Button>
              {summary && summary.processingCount > 0 && (
                <Tag icon={<SyncOutlined spin />} color="processing" style={{ borderRadius: 20, padding: '2px 14px', margin: 0 }}>
                  {summary.processingCount} 个任务运行中
                </Tag>
              )}
            </Space>
          </Col>
        </Row>
      </div>

      {/* ───── Stats ───── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 28 }}>
        {statCards.map((s) => (
          <Col xs={12} sm={6} key={s.title}>
            <Card hoverable style={{ ...cardStyle }} onClick={() => s.href && navigate(s.href)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: s.color, flexShrink: 0 }}>
                  {s.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', lineHeight: 1.2 }}>{s.title}</Text>
                  <Text style={{ fontSize: 26, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.3 }}>{s.value}</Text>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* ───── Quick Actions ───── */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <AimOutlined style={{ color: '#666', fontSize: 14 }} />
        <Text type="secondary" style={{ fontSize: 14, fontWeight: 500 }}>快捷入口</Text>
      </div>
      <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
        {quickLinks.map((card) => (
          <Col xs={12} sm={6} key={card.title}>
            <Card hoverable style={{ ...cardStyle, textAlign: 'center' }} onClick={() => navigate(card.href)}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', fontSize: 20, color: card.color }}>
                {card.icon}
              </div>
              <Title level={5} style={{ margin: '0 0 2px', fontSize: 14 }}>{card.title}</Title>
              <Text type="secondary" style={{ fontSize: 11 }}>{card.desc}</Text>
            </Card>
          </Col>
        ))}
      </Row>

      {/* ───── Main Content (2-col) ───── */}
      <Row gutter={[24, 24]}>
        {/* Left — Projects */}
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space size={10}>
                <div style={{ width: 3, height: 16, background: '#7c3aed', borderRadius: 2 }} />
                <Text strong style={{ fontSize: 15 }}>我的短剧</Text>
                {summary && summary.projectStats.total > 0 && (
                  <Badge count={summary.projectStats.total} style={{ backgroundColor: '#7c3aed', fontSize: 10, boxShadow: 'none' }} />
                )}
              </Space>
            }
            extra={
              <Space size={10}>
                {summary && summary.pendingCount > 0 && (
                  <Tag icon={<ClockCircleOutlined />} color="default" style={{ borderRadius: 10, fontSize: 11, margin: 0 }}>
                    待处理 {summary.pendingCount}
                  </Tag>
                )}
                <Button type="primary" size="small" icon={<PlusOutlined />}
                  style={{ background: '#7c3aed', borderColor: '#7c3aed', borderRadius: 8, fontWeight: 500 }}
                  onClick={() => navigate('/drama/create')}>新建</Button>
              </Space>
            }
            style={cardStyle}
          >
            {hasNoProjects ? (
              <Empty description="暂无短剧项目" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '24px 0' }}>
                <Button type="primary" style={{ background: '#7c3aed', borderColor: '#7c3aed', borderRadius: 10 }}
                  onClick={() => navigate('/drama/create')}>创建第一个短剧</Button>
              </Empty>
            ) : (
              <List
                dataSource={summary?.projects || []}
                split={false}
                renderItem={(p) => (
                  <List.Item
                    style={{ padding: '12px 0', cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}
                    onClick={() => navigate(`/drama/${p.id}`)}
                    actions={[
                      <Button type="link" size="small"
                        style={{ color: '#bbb', padding: 0, minWidth: 'auto' }}
                        icon={<RightOutlined />}
                        onClick={(e) => { e.stopPropagation(); navigate(`/drama/${p.id}`); }} />,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={
                        <div style={{
                          width: 42, height: 42, borderRadius: 10,
                          background: p.cover_url ? `url(${p.cover_url}) center/cover` : '#f0f0f0',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: '1px solid #f0f0f0',
                        }}>
                          {!p.cover_url && <VideoCameraOutlined style={{ fontSize: 16, color: '#ccc' }} />}
                        </div>
                      }
                      title={
                        <Space size={8}>
                          <Text strong style={{ fontSize: 14 }}>{p.title || `短剧 #${p.id}`}</Text>
                          <Tag color={statusColor(p.status)} style={{ borderRadius: 6, fontSize: 10, lineHeight: '18px', margin: 0 }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Queue */}
            <Card
              title={
                <Space size={10}>
                  <div style={{ width: 3, height: 16, background: '#faad14', borderRadius: 2 }} />
                  <Text strong style={{ fontSize: 15 }}>任务概览</Text>
                </Space>
              }
              style={cardStyle}
            >
              {hasNoQueue ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <CheckCircleOutlined style={{ fontSize: 30, color: '#52c41a', marginBottom: 8 }} />
                  <br />
                  <Text type="secondary" style={{ fontSize: 13 }}>当前无进行中的任务</Text>
                </div>
              ) : (
                <>
                  <Row gutter={[12, 12]}>
                    <Col span={12}>
                      <div style={{ background: '#f6ffed', borderRadius: 12, padding: '14px 8px', textAlign: 'center' }}>
                        <SyncOutlined spin={summary!.processingCount > 0} style={{ fontSize: 18, color: '#52c41a', marginBottom: 4 }} />
                        <div style={{ fontSize: 26, fontWeight: 700, color: '#1a1a1a' }}>{summary!.processingCount}</div>
                        <Text type="secondary" style={{ fontSize: 12 }}>处理中</Text>
                      </div>
                    </Col>
                    <Col span={12}>
                      <div style={{ background: '#fffbe6', borderRadius: 12, padding: '14px 8px', textAlign: 'center' }}>
                        <ClockCircleOutlined style={{ fontSize: 18, color: '#faad14', marginBottom: 4 }} />
                        <div style={{ fontSize: 26, fontWeight: 700, color: '#1a1a1a' }}>{summary!.pendingCount}</div>
                        <Text type="secondary" style={{ fontSize: 12 }}>待处理</Text>
                      </div>
                    </Col>
                  </Row>
                  <Progress
                    percent={Math.round((summary!.processingCount / (summary!.processingCount + summary!.pendingCount)) * 100)}
                    strokeColor="#7c3aed" size="small" style={{ marginTop: 14 }} />
                </>
              )}
            </Card>

            {/* Failed */}
            <Card
              title={
                <Space size={10}>
                  <div style={{ width: 3, height: 16, background: '#ff4d4f', borderRadius: 2 }} />
                  <Text strong style={{ fontSize: 15 }}>失败任务</Text>
                  {summary && summary.failedTasks.length > 0 && (
                    <Badge count={summary.failedTasks.length} style={{ backgroundColor: '#ff4d4f', fontSize: 10, boxShadow: 'none' }} />
                  )}
                </Space>
              }
              extra={
                <Button type="text" size="small" icon={<ReloadOutlined />} style={{ color: '#999' }} onClick={fetchSummary} />
              }
              style={cardStyle}
            >
              {hasNoFailed ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <CheckCircleOutlined style={{ fontSize: 26, color: '#52c41a', marginBottom: 6 }} />
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>最近没有失败任务</Text>
                </div>
              ) : (
                <List
                  size="small"
                  split={false}
                  dataSource={summary!.failedTasks}
                  renderItem={(t) => (
                    <List.Item style={{ padding: '8px 0', borderBottom: '1px solid #fafafa' }}>
                      <List.Item.Meta
                        avatar={<CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 13 }} />}
                        title={
                          <Tooltip title={t.errorRaw || t.error}>
                            <Text style={{ fontSize: 12, color: '#ff4d4f' }} ellipsis>{t.error}</Text>
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
        </Col>
      </Row>
    </UserLayout>
  );
}
