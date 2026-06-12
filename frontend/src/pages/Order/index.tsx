import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Col,
  Empty,
  message,
  Row,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

const { Title, Text } = Typography;

interface Plan {
  key: string;
  name: string;
  amount: number;
  credits: number;
  badge: string;
}

interface Order {
  id: number;
  order_no: string;
  plan_name: string;
  amount: number;
  credits: number;
  status: string;
  created_at: string;
  paid_at?: string;
}

const statusMap: Record<string, { text: string; color: string }> = {
  pending: { text: '待支付', color: 'gold' },
  paid: { text: '已支付', color: 'green' },
  cancelled: { text: '已取消', color: 'default' },
};

export default function OrderPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<number | null>(null);
  const navigate = useNavigate();
  const { user, refreshUser } = useAuthStore();

  const loadData = async () => {
    setLoading(true);
    try {
      const [planRes, orderRes] = await Promise.all([
        api.get('/api/order/plans'),
        api.get('/api/order/list'),
      ]);
      setPlans(planRes.data);
      setOrders(orderRes.data.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData().catch(() => message.error('加载订单信息失败'));
  }, []);

  const createOrder = async (planKey: string) => {
    try {
      const { data } = await api.post('/api/order/create', { plan: planKey, provider: 'manual' });
      setOrders((prev) => [data, ...prev]);
      message.success('订单已创建');
    } catch (err: any) {
      message.error(err.response?.data?.message || '创建订单失败');
    }
  };

  const mockPay = async (id: number) => {
    setPayingId(id);
    try {
      await api.post(`/api/order/${id}/mock-pay`);
      await Promise.all([loadData(), refreshUser()]);
      message.success('充值成功，算力已到账');
    } catch (err: any) {
      message.error(err.response?.data?.message || '支付失败');
    } finally {
      setPayingId(null);
    }
  };

  const columns: ColumnsType<Order> = [
    { title: '订单号', dataIndex: 'order_no', ellipsis: true },
    { title: '套餐', dataIndex: 'plan_name', width: 110 },
    { title: '金额', dataIndex: 'amount', width: 90, render: (v) => `¥${Number(v).toFixed(2)}` },
    { title: '算力', dataIndex: 'credits', width: 90 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status) => {
        const item = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={item.color}>{item.text}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 170,
      render: (v) => new Date(v).toLocaleString(),
    },
    {
      title: '操作',
      width: 110,
      render: (_, record) =>
        record.status === 'pending' ? (
          <Button
            size="small"
            type="primary"
            loading={payingId === record.id}
            onClick={() => mockPay(record.id)}
          >
            模拟支付
          </Button>
        ) : null,
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fb', padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Space style={{ marginBottom: 20 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>返回首页</Button>
        </Space>

        <Card style={{ marginBottom: 20, borderRadius: 8 }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <div>
              <Title level={3} style={{ marginBottom: 4 }}>算力充值</Title>
              <Text type="secondary">当前账号：{user?.username || '-'}，剩余 {user?.credits ?? 0} 算力</Text>
            </div>
            <WalletOutlined style={{ fontSize: 34, color: '#7c3aed' }} />
          </Space>
        </Card>

        <Spin spinning={loading}>
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            {plans.map((plan) => (
              <Col xs={24} md={8} key={plan.key}>
                <Card
                  hoverable
                  style={{ borderRadius: 8, height: '100%' }}
                  title={
                    <Space>
                      <ThunderboltOutlined style={{ color: '#f59e0b' }} />
                      {plan.name}
                    </Space>
                  }
                  extra={<Tag color={plan.key === 'creator' ? 'purple' : 'blue'}>{plan.badge}</Tag>}
                >
                  <Title level={2} style={{ margin: '0 0 6px' }}>¥{Number(plan.amount).toFixed(2)}</Title>
                  <Text strong style={{ fontSize: 18 }}>{plan.credits} 算力</Text>
                  <Button
                    type="primary"
                    block
                    icon={<CheckCircleOutlined />}
                    style={{ marginTop: 20 }}
                    onClick={() => createOrder(plan.key)}
                  >
                    创建充值订单
                  </Button>
                </Card>
              </Col>
            ))}
          </Row>

          <Card title="充值记录" style={{ borderRadius: 8 }}>
            {orders.length ? (
              <Table rowKey="id" columns={columns} dataSource={orders} pagination={false} />
            ) : (
              <Empty description="暂无充值订单" />
            )}
          </Card>
        </Spin>
      </div>
    </div>
  );
}
