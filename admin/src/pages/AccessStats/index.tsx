import { useState, useEffect, useCallback } from 'react';
import { Card, Table, Tag, Button, Space, Typography, Row, Col, Input, message, Modal, Popconfirm } from 'antd';
import { EyeOutlined, BlockOutlined, UnlockOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;

interface IpRow {
  ip: string;
  count: number;
  last_at: number;
  banned: boolean;
}

export default function AccessStatsPage() {
  const [summary, setSummary] = useState<{ today_visits: number; today_ips: number; ips: IpRow[]; banned: string[] }>({ today_visits: 0, today_ips: 0, ips: [], banned: [] });
  const [loading, setLoading] = useState(false);
  const [banInput, setBanInput] = useState('');

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/admin/access/summary');
      setSummary(data);
    } catch { message.error('获取访问统计失败'); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const doBan = async (ip: string) => {
    try {
      await api.post('/api/admin/access/ban', { ip });
      message.success(`已封禁 ${ip}`);
      fetchSummary();
    } catch (err: any) { message.error(err.response?.data?.message || '封禁失败'); }
  };

  const doUnban = async (ip: string) => {
    try {
      await api.post('/api/admin/access/unban', { ip });
      message.success(`已解封 ${ip}`);
      fetchSummary();
    } catch (err: any) { message.error(err.response?.data?.message || '解封失败'); }
  };

  const columns = [
    { title: 'IP 地址', dataIndex: 'ip', width: 180 },
    {
      title: '访问次数', dataIndex: 'count', width: 110,
      sorter: (a: IpRow, b: IpRow) => b.count - a.count,
      render: (v: number) => <Text strong>{v}</Text>,
    },
    {
      title: '最后访问', dataIndex: 'last_at', width: 180,
      render: (v: number) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
    {
      title: '状态', dataIndex: 'banned', width: 100,
      render: (banned: boolean) => banned
        ? <Tag color="red">已封禁</Tag>
        : <Tag color="green">正常</Tag>,
    },
    {
      title: '操作', key: 'actions', width: 140,
      render: (_: any, row: IpRow) => row.banned
        ? <Button size="small" icon={<UnlockOutlined />} onClick={() => doUnban(row.ip)}>解封</Button>
        : <Popconfirm title={`确认封禁 ${row.ip}？封禁后该 IP 无法访问本站`} okText="封禁" okType="danger" cancelText="取消"
            onConfirm={() => doBan(row.ip)}>
            <Button size="small" danger icon={<BlockOutlined />}>封禁</Button>
          </Popconfirm>,
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>访问统计</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
        基于 API 调用记录的今日访问量与来源 IP（每 7 天自动过期），可封禁恶意 IP
      </Text>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card className="stat-card" styles={{ body: { padding: 20 } }}>
            <Text type="secondary" style={{ fontSize: 13 }}>今日 API 访问量</Text>
            <Title level={2} style={{ margin: '4px 0 0', color: '#1890ff' }}>{summary.today_visits}</Title>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="stat-card" styles={{ body: { padding: 20 } }}>
            <Text type="secondary" style={{ fontSize: 13 }}>今日活跃 IP</Text>
            <Title level={2} style={{ margin: '4px 0 0', color: '#52c41a' }}>{summary.today_ips}</Title>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="stat-card" styles={{ body: { padding: 20 } }}>
            <Text type="secondary" style={{ fontSize: 13 }}>已封禁 IP</Text>
            <Title level={2} style={{ margin: '4px 0 0', color: '#f5222d' }}>{summary.banned.length}</Title>
          </Card>
        </Col>
      </Row>

      <Card title="手动封禁 IP" style={{ marginBottom: 24 }}>
        <Space.Compact style={{ width: 360 }}>
          <Input placeholder="输入要封禁的 IP，如 1.2.3.4"
            value={banInput} onChange={(e) => setBanInput(e.target.value)}
            onPressEnter={() => {
              if (banInput.trim()) {
                Modal.confirm({
                  title: `确认封禁 ${banInput.trim()}？`,
                  content: '封禁后该 IP 无法访问本站（立即生效）',
                  okText: '封禁', okType: 'danger', cancelText: '取消',
                  onOk: () => { doBan(banInput.trim()); setBanInput(''); },
                });
              }
            }} />
          <Button type="primary" danger icon={<BlockOutlined />}
            disabled={!banInput.trim()}
            onClick={() => {
              Modal.confirm({
                title: `确认封禁 ${banInput.trim()}？`,
                content: '封禁后该 IP 无法访问本站（立即生效）',
                okText: '封禁', okType: 'danger', cancelText: '取消',
                onOk: () => { doBan(banInput.trim()); setBanInput(''); },
              });
            }}>
            封禁
          </Button>
        </Space.Compact>
        <Text type="secondary" style={{ marginLeft: 16, fontSize: 12 }}>提示：封禁后即时生效，被禁 IP 访问全站返回 403</Text>
      </Card>

      <Card
        title="今日访问 IP 明细"
        extra={<Button size="small" icon={<EyeOutlined />} onClick={fetchSummary} loading={loading}>刷新</Button>}
      >
        <Table
          rowKey="ip" size="middle" loading={loading}
          columns={columns}
          dataSource={summary.ips}
          pagination={{ pageSize: 20, showSizeChanger: false }}
        />
      </Card>
    </div>
  );
}
