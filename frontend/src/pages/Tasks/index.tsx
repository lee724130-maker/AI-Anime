import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Typography, Card, Row, Col, Table, Tag, Button, Empty, Space, Segmented } from 'antd';
import { ArrowLeftOutlined, SyncOutlined, ClockCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;

const SOURCE_META: Record<string, { label: string; color: string }> = {
  generation: { label: 'AI 生成', color: 'purple' },
  video: { label: '创作视频', color: 'blue' },
  segment: { label: '短剧片段', color: 'orange' },
};

const TYPE_LABEL: Record<string, string> = {
  'text-to-image': '文生图',
  'image-to-video': '图片生视频',
  'text-to-video': '文生视频',
  'video-to-video': '视频生视频',
  video: '视频合成',
  unknown: '未知任务',
};

interface TaskItem {
  id: number;
  source: string;
  type: string;
  status: 'processing' | 'pending';
  title: string;
  projectId: number | null;
  time: string;
}

const sourceLabel = (s: string) => SOURCE_META[s]?.label || s;
const sourceColor = (s: string) => SOURCE_META[s]?.color || 'default';

const timeText = (t: string) => {
  if (!t) return '-';
  const d = new Date(t);
  const diff = Date.now() - d.getTime();
  if (diff < 0) return d.toLocaleString('zh-CN', { hour12: false });
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return d.toLocaleString('zh-CN', { hour12: false });
};

export default function TasksPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = (searchParams.get('status') || 'processing') as 'processing' | 'pending';
  const [items, setItems] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/api/workbench/tasks', { params: { status } });
      setItems(data.items || []);
    } catch { /* ignore */ }
    if (!silent) setLoading(false);
  }, [status]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const hasActive = items.some(t => t.status === 'processing');
  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(() => fetchTasks(true), 3000);
    return () => clearInterval(timer);
  }, [hasActive, fetchTasks]);

  const switchTab = (v: string) => {
    setSearchParams({ status: v }, { replace: true });
  };

  const countBySource = (src: string) => items.filter(i => i.source === src).length;

  const goDetail = (t: TaskItem) => {
    if (t.source === 'segment' && t.projectId) {
      navigate(`/drama/${t.projectId}/episodes`);
    } else if (t.source === 'generation') {
      navigate('/generate/history');
    } else if (t.source === 'video') {
      navigate('/video');
    }
  };

  const columns = [
    {
      title: '来源',
      dataIndex: 'source',
      width: 110,
      render: (s: string) => <Tag color={sourceColor(s)} style={{ borderRadius: 6, marginInlineEnd: 0 }}>{sourceLabel(s)}</Tag>,
    },
    {
      title: '任务描述',
      dataIndex: 'title',
      render: (t: string, row: TaskItem) => (
        <Space size={8}>
          {row.type && <Text type="secondary" style={{ fontSize: 12 }}>{TYPE_LABEL[row.type] || row.type}</Text>}
          <Text style={{ fontSize: 13 }}>{t}</Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: string) =>
        s === 'processing'
          ? <Tag color="processing" icon={<SyncOutlined spin />} style={{ borderRadius: 6, marginInlineEnd: 0 }}>处理中</Tag>
          : <Tag icon={<ClockCircleOutlined />} color="warning" style={{ borderRadius: 6, marginInlineEnd: 0 }}>待处理</Tag>,
    },
    {
      title: '时间',
      dataIndex: 'time',
      width: 110,
      render: (t: string) => <Text type="secondary" style={{ fontSize: 12 }}>{timeText(t)}</Text>,
    },
    {
      title: '',
      key: 'action',
      width: 80,
      render: (_: any, row: TaskItem) => (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => goDetail(row)}>查看</Button>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Space size={12}>
            <Button shape="circle" icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')} />
            <Title level={4} style={{ margin: 0 }}>任务中心</Title>
          </Space>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={() => fetchTasks()} loading={loading}>刷新</Button>
        </Col>
      </Row>

      <Segmented
        size="large"
        value={status}
        onChange={(v) => switchTab(v as string)}
        style={{ marginBottom: 16 }}
        options={[
          { label: '处理中', value: 'processing' },
          { label: '待处理', value: 'pending' },
        ]}
      />
      <Text type="secondary" style={{ marginLeft: 12, fontSize: 13 }}>
        共 {items.length} 个任务
      </Text>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {Object.entries(SOURCE_META).map(([key, meta]) => (
          <Col span={8} key={key}>
            <Card size="small" style={{ borderRadius: 12 }} styles={{ body: { padding: '12px 16px' } }}>
              <Space orientation="vertical" size={0} style={{ width: '100%' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>{meta.label}</Text>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a' }}>{countBySource(key)}</div>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        {items.length === 0 ? (
          <Empty
            style={{ padding: '48px 0' }}
            description={status === 'processing' ? '当前没有处理中的任务' : '当前没有待处理的任务'}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <Table
            rowKey={(r) => `${r.source}_${r.id}`}
            columns={columns}
            dataSource={items}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            size="middle"
            rowClassName={() => 'cursor-pointer'}
            onRow={(r) => ({ onClick: () => goDetail(r), style: { cursor: 'pointer' } })}
          />
        )}
      </Card>
    </div>
  );
}