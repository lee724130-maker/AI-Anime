import { useState, useEffect } from 'react';
import { Row, Col, Card, List, Avatar, Progress, Typography, Space, Button } from 'antd';
import {
  UserOutlined,
  FormOutlined,
  BarChartOutlined,
  KeyOutlined,
  CheckCircleOutlined,
  ApiOutlined,
  DatabaseOutlined,
  CloudSyncOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAdminAuthStore } from '../../stores/authStore';
import TrendCard from './TrendCard';

const { Title, Text } = Typography;

// xxe — Dashboard home
export default function DashboardHome() {
  const nav = useNavigate();
  const user = useAdminAuthStore((s) => s.user);
  const [stats, setStats] = useState<any>({
    userCount: 0,
    todayGenerations: 0,
    todayNewUsers: 0,
    todayCalls: 0,
    apiKeyCount: 0,
    recentUsers: [],
    systemHealth: { api: 'ok', db: 'ok', redis: 'ok' },
  });
  const [quota, setQuota] = useState<any>(null);

  useEffect(() => {
    fetchStats();
    fetchQuota();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchQuota = () => {
    api
      .get('/api/generate/quota')
      .then(({ data }) => setQuota(data))
      .catch(() => {});
  };

  const fetchStats = async () => {
    try {
      const { data } = await api.get('/api/admin/dashboard');
      setStats({
        userCount: data.userCount ?? 0,
        todayGenerations: data.todayGenerations ?? 0,
        todayNewUsers: data.todayNewUsers ?? 0,
        todayCalls: data.todayCalls ?? 0,
        apiKeyCount: data.apiKeyCount ?? 0,
        recentUsers: data.recentUsers ?? [],
        systemHealth: data.systemHealth ?? { api: 'ok', db: 'ok', redis: 'ok' },
      });
    } catch (e: any) {
      console.error('[Dashboard] fetchStats error:', e?.response?.status, e?.message);
    }
  };

  const cards = [
    { title: '用户总数', value: stats.userCount, icon: <UserOutlined />, color: 'var(--primary)', sub: '全部注册用户' },
    { title: '今日生成', value: stats.todayGenerations, icon: <FormOutlined />, color: '#34D399', sub: 'AI 生成任务数' },
    { title: '今日调用', value: stats.todayCalls, icon: <BarChartOutlined />, color: '#FBBF24', sub: '视频合成任务数' },
    { title: 'API 密钥', value: stats.apiKeyCount, icon: <KeyOutlined />, color: '#F87171', sub: '已配置密钥' },
  ];

  const systemList = [
    { label: '后端 API', status: stats.systemHealth.api === 'ok', icon: <ApiOutlined /> },
    { label: '数据库', status: stats.systemHealth.db === 'ok', icon: <DatabaseOutlined /> },
    { label: 'Redis', status: stats.systemHealth.redis === 'ok', icon: <CloudSyncOutlined /> },
  ];

  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <Title level={3} style={{ color: 'var(--text)', marginBottom: 4, fontWeight: 700 }}>
          Dashboard
        </Title>
        <Text style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          欢迎回来，{user?.username ?? '管理员'}。这是你的管理控制台概览。
        </Text>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {cards.map((c) => (
          <Col key={c.title} xs={24} sm={12} lg={6}>
            <Card className="stat-card" styles={{ body: { padding: '20px 20px 16px' } }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: `${c.color}18`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    color: c.color,
                  }}
                >
                  {c.icon}
                </div>
                <div>
                  <Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{c.title}</Text>
                  <Title level={3} style={{ margin: 0, color: 'var(--text)', fontWeight: 700 }}>
                    {c.value}
                  </Title>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: 'var(--text-muted)', fontSize: 12 }}>{c.sub}</Text>
                <Text
                  style={{ color: 'var(--primary)', fontSize: 12, cursor: 'pointer' }}
                  onClick={() => {
                    if (c.title === '用户总数') nav('/users');
                    else if (c.title === 'API 密钥') nav('/apikeys');
                  }}
                >
                  See in details →
                </Text>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={8}>
          <Card title="今日概览" styles={{ body: { padding: '12px 20px 4px' } }} style={{ height: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <Space>
                  <CheckCircleOutlined style={{ color: '#FBBF24', fontSize: 16 }} />
                  <Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>视频合成</Text>
                </Space>
                <Text strong style={{ color: 'var(--text)' }}>{stats.todayCalls}</Text>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <Space>
                  <FormOutlined style={{ color: '#34D399', fontSize: 16 }} />
                  <Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>今日生成</Text>
                </Space>
                <Text strong style={{ color: 'var(--text)' }}>{stats.todayGenerations}</Text>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 0',
                }}
              >
                <Space>
                  <UserOutlined style={{ color: 'var(--primary)', fontSize: 16 }} />
                  <Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>今日新增</Text>
                </Space>
                <Text strong style={{ color: 'var(--text)' }}>{stats.todayNewUsers}</Text>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={16}>
          <TrendCard />
        </Col>
      </Row>

      {quota && Object.keys(quota).length > 0 && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24}>
            <Card
              title="视频模型额度"
              extra={
                <Button size="small" onClick={fetchQuota} style={{ fontSize: 12 }}>
                  刷新额度
                </Button>
              }
              styles={{ body: { padding: '16px 20px' } }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
                {Object.entries(quota).map(([name, q]: [string, any]) => {
                  const pct = Math.round((q.remaining / q.total) * 100);
                  const color = q.remaining <= 0 ? '#F87171' : q.remaining <= 5 ? '#FBBF24' : '#34D399';
                  return (
                    <div key={name} style={{ flex: '1 1 240px', minWidth: 200 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 6,
                        }}
                      >
                        <Text style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500 }}>
                          {name === 'wan3.0-video-prime' ? '🥇 wan3.0-video-prime' : '🥈 wan3.0-video'}
                        </Text>
                        <Text style={{ color, fontSize: 13, fontWeight: 600 }}>
                          {q.remaining}/{q.total} 剩余
                        </Text>
                      </div>
                      <Progress
                        percent={pct}
                        strokeColor={color}
                        railColor="var(--border)"
                        showInfo={false}
                        size="small"
                      />
                      <Text style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        今日已用 {q.todayUsed} 次
                      </Text>
                    </div>
                  );
                })}
              </div>
            </Card>
          </Col>
        </Row>
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card
            title="最近注册用户"
            styles={{ body: { padding: 0 } }}
            extra={
              <Text
                style={{ color: 'var(--primary)', fontSize: 13, cursor: 'pointer' }}
                onClick={() => nav('/users')}
              >
                查看全部 →
              </Text>
            }
          >
            {stats.recentUsers.length > 0 ? (
              <List
                dataSource={stats.recentUsers.slice(0, 5)}
                renderItem={(u: any) => (
                  <List.Item key={u.id} style={{ padding: '12px 20px' }}>
                    <List.Item.Meta
                      avatar={
                        <Avatar
                          size={36}
                          icon={<UserOutlined />}
                          style={{ background: 'var(--primary-bg)' }}
                        />
                      }
                      title={<Text style={{ color: 'var(--text)', fontSize: 14 }}>{u.username}</Text>}
                      description={
                        <Text style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          {u.email || '未绑定邮箱'}
                        </Text>
                      }
                    />
                    <Text style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('zh-CN') : '-'}
                    </Text>
                  </List.Item>
                )}
              />
            ) : (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                暂无数据
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="系统状态" styles={{ body: { padding: '16px 20px' } }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {systemList.map((s) => (
                <div
                  key={s.label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Space>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: s.status ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: s.status ? '#34D399' : '#F87171',
                        fontSize: 16,
                      }}
                    >
                      {s.icon}
                    </div>
                    <div>
                      <Text style={{ color: 'var(--text)', fontSize: 14, fontWeight: 500 }}>{s.label}</Text>
                      <div>
                        <Text style={{ color: s.status ? '#34D399' : '#F87171', fontSize: 12 }}>
                          {s.status ? 'Online' : 'Offline'}
                        </Text>
                      </div>
                    </div>
                  </Space>
                  <Progress
                    percent={s.status ? 100 : 0}
                    size="small"
                    strokeColor={s.status ? '#34D399' : '#F87171'}
                    railColor="var(--border)"
                    showInfo={false}
                    style={{ width: 80 }}
                  />
                </div>
              ))}
            </div>
          </Card>
        </Col>
      </Row>
    </>
  );
}

