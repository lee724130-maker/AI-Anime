import { useState, useEffect } from 'react';
import { Row, Col, Card, Space, Tag, Table, Select, Typography, message } from 'antd';
import { DollarOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Text } = Typography;

// uxe — order status map
const uxe: Record<string, { label: string; color: string }> = {
  paid: { label: '已支付', color: 'green' },
  pending: { label: '待支付', color: 'orange' },
  cancelled: { label: '已取消', color: 'default' },
};

// dxe — payment provider map
const dxe: Record<string, string> = {
  alipay: '支付宝',
  mock: '模拟支付',
  manual: '手动充值',
};

// fxe — payments page (no page header in prod)
export default function PaymentsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [stats, setStats] = useState({ totalPaid: 0, totalAmount: 0, totalCount: 0 });

  const fetchList = async (p = 1) => {
    setLoading(true);
    try {
      const params: any = { page: p, limit: 20 };
      if (status) params.status = status;
      const { data } = await api.get('/api/admin/payments', { params });
      setRows(data.items);
      setTotal(data.total);
      setStats(data.stats || { totalPaid: 0, totalAmount: 0, totalCount: data.total });
    } catch {
      message.error('加载失败');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchList(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status]);

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card className="stat-card" styles={{ body: { padding: 16 } }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>已支付订单</Text>
                <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--text)' }}>
                  {stats.totalPaid}
                </div>
              </div>
              <DollarOutlined style={{ fontSize: 22, color: 'var(--primary)' }} />
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="stat-card" styles={{ body: { padding: 16 } }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>总收入</Text>
                <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--success, #52c41a)' }}>
                  ¥{stats.totalAmount.toFixed(2)}
                </div>
              </div>
              <DollarOutlined style={{ fontSize: 22, color: 'var(--success, #52c41a)' }} />
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="stat-card" styles={{ body: { padding: 16 } }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>全部订单</Text>
                <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--text)' }}>
                  {stats.totalCount}
                </div>
              </div>
              <DollarOutlined style={{ fontSize: 22, color: 'var(--text-secondary)' }} />
            </div>
          </Card>
        </Col>
      </Row>

      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Space>
          <Text style={{ color: 'var(--text-secondary)' }}>状态筛选：</Text>
          <Select
            allowClear
            placeholder="全部"
            style={{ width: 120 }}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={[
              { label: '已支付', value: 'paid' },
              { label: '待支付', value: 'pending' },
              { label: '已取消', value: 'cancelled' },
            ]}
          />
        </Space>
      </div>

      <Table
        dataSource={rows}
        columns={[
          {
            title: '订单号',
            dataIndex: 'order_no',
            key: 'order_no',
            width: 150,
            render: (v: any) => <Text code>{v}</Text>,
          },
          { title: '用户', dataIndex: 'username', key: 'username', width: 120, render: (v: any) => v || '-' },
          { title: '套餐', dataIndex: 'plan_name', key: 'plan_name', width: 120 },
          {
            title: '金额',
            dataIndex: 'amount',
            key: 'amount',
            width: 100,
            render: (v: any) => (
              <Text strong>
                ¥{Number(v).toFixed(2)}
              </Text>
            ),
          },
          {
            title: '积分',
            dataIndex: 'credits',
            key: 'credits',
            width: 80,
            render: (v: any) => <Text type="success">+{v}</Text>,
          },
          {
            title: '支付方式',
            dataIndex: 'payment_provider',
            key: 'payment_provider',
            width: 100,
            render: (v: any) => dxe[v] || v,
          },
          {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 90,
            render: (v: any) => {
              const s = uxe[v] || { label: v, color: 'default' };
              return <Tag color={s.color}>{s.label}</Tag>;
            },
          },
          {
            title: '支付时间',
            dataIndex: 'paid_at',
            key: 'paid_at',
            width: 170,
            render: (v: any) => (v ? new Date(v).toLocaleString('zh-CN') : '-'),
          },
          {
            title: '创建时间',
            dataIndex: 'created_at',
            key: 'created_at',
            width: 170,
            render: (v: any) => new Date(v).toLocaleString('zh-CN'),
          },
        ]}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          total,
          pageSize: 20,
          onChange: setPage,
          showTotal: (t) => `共 ${t} 条记录`,
        }}
        scroll={{ x: 900 }}
      />
    </div>
  );
}
