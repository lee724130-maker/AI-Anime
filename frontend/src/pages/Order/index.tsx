import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Modal,
  Result,
  Row,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  PayCircleOutlined,
  ThunderboltOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api from '../../services/api';
import { formatDateSafe } from '../../utils/date';
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

// 生产 bundle L：支付宝收银台弹窗（3s 轮询支付状态）
function PayModal({
  open,
  orderId,
  orderNo,
  amount,
  credits,
  payUrl,
  onClose,
  onSuccess,
}: {
  open: boolean;
  orderId: number | null;
  orderNo: string;
  amount: number;
  credits: number;
  payUrl: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [status, setStatus] = useState<'pending' | 'paid' | 'cancelled'>('pending');
  const statusRef = useRef<'pending' | 'paid' | 'cancelled'>('pending');
  const timerRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    if (!open || !orderId) {
      stopPolling();
      return;
    }
    if (statusRef.current !== 'pending') {
      stopPolling();
      return;
    }
    timerRef.current = window.setInterval(async () => {
      if (statusRef.current !== 'pending') {
        stopPolling();
        return;
      }
      try {
        const { data } = await api.get(`/api/payment/status/${orderId}`);
        if (data.status === 'paid') {
          statusRef.current = 'paid';
          setStatus('paid');
          stopPolling();
          onSuccess();
        } else if (data.status === 'cancelled') {
          statusRef.current = 'cancelled';
          setStatus('cancelled');
          stopPolling();
        }
      } catch {
        /* 轮询失败静默重试 */
      }
    }, 3000);
    return () => stopPolling();
  }, [open, orderId]);

  const close = () => {
    stopPolling();
    statusRef.current = 'pending';
    setStatus('pending');
    onClose();
  };

  return (
    <Modal
      open={open}
      onCancel={close}
      footer={null}
      width={400}
      centered
      maskClosable={status !== 'pending'}
      closable={status !== 'pending'}
      styles={{ body: { padding: '24px 24px 16px', textAlign: 'center' } }}
    >
      {status === 'paid' && (
        <Result
          icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
          title="支付成功"
          subTitle={`已到账 ${credits} 算力`}
          extra={
            <Button type="primary" onClick={close}>
              完成
            </Button>
          }
        />
      )}
      {status === 'cancelled' && (
        <Result
          icon={<CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
          title="订单已取消"
          extra={
            <Button onClick={close}>关闭</Button>
          }
        />
      )}
      {status === 'pending' && (
        <>
          <div style={{ marginBottom: 16 }}>
            <PayCircleOutlined style={{ fontSize: 20, color: 'var(--primary)', marginRight: 8 }} />
            <Text strong style={{ fontSize: 16 }}>
              支付宝支付
            </Text>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary">订单号：{orderNo}</Text>
          </div>
          <div style={{ marginBottom: 20 }}>
            <Text strong style={{ fontSize: 28, color: 'var(--primary)' }}>
              ¥{Number(amount).toFixed(2)}
            </Text>
            <Text type="secondary" style={{ marginLeft: 8 }}>
              得 {credits} 算力
            </Text>
          </div>
          <Button
            type="primary"
            size="large"
            block
            icon={<PayCircleOutlined />}
            onClick={() => {
              if (!payUrl) return;
              const w = window.open(payUrl, '_blank', 'width=800,height=600');
              if (!w || w.closed || w.closed === void 0) {
                window.location.href = payUrl;
              }
            }}
            style={{ marginBottom: 12, background: 'var(--primary)', borderColor: 'var(--primary)' }}
          >
            去支付宝付款
          </Button>
          <Button size="large" block onClick={close} style={{ marginBottom: 12 }}>
            取消支付
          </Button>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <LoadingOutlined style={{ marginRight: 4 }} />
              支付完成后此窗口会自动更新
            </Text>
          </div>
        </>
      )}
    </Modal>
  );
}

// 生产 bundle V：15 分钟支付倒计时（900s，最后 3 分钟标红）
const COUNTDOWN_MS = 900 * 1000;

function Countdown({ createdAt }: { createdAt: string }) {
  const [remaining, setRemaining] = useState(() => {
    const elapsed = Date.now() - new Date(createdAt).getTime();
    return Math.max(0, COUNTDOWN_MS - elapsed);
  });

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setInterval(() => {
      const elapsed = Date.now() - new Date(createdAt).getTime();
      setRemaining(Math.max(0, COUNTDOWN_MS - elapsed));
    }, 1000);
    return () => clearInterval(timer);
  }, [createdAt]);

  if (remaining <= 0) return <Text type="danger">已超时</Text>;

  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);
  return (
    <Text
      style={{
        color: remaining < 180 * 1000 ? '#ff4d4f' : 'var(--text)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
    </Text>
  );
}

// 生产 bundle U：订单/充值页主组件
export default function OrderPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingPlan, setCreatingPlan] = useState<string | null>(null);
  const [rechargeEnabled, setRechargeEnabled] = useState(true);
  const [payModal, setPayModal] = useState({
    open: false,
    orderId: null as number | null,
    orderNo: '',
    amount: 0,
    credits: 0,
    payUrl: '',
  });
  const navigate = useNavigate();
  const { user, refreshUser } = useAuthStore();
  const pendingSeenRef = useRef(new Set<string>());

  // 充值开关：未开放则提示并返回工作台
  useEffect(() => {
    api
      .get('/api/admin/site/config')
      .then(({ data }) => {
        const enabled = data.recharge_enabled === '1';
        setRechargeEnabled(enabled);
        if (!enabled) {
          message.warning('充值功能暂未开放，正在返回工作台');
          setTimeout(() => navigate('/dashboard'), 1500);
        }
      })
      .catch(() => {});
  }, [navigate]);

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

  // 已消失的待支付订单（已支付/取消）从「已提示过」集合中剔除
  useEffect(() => {
    const pendingNames = new Set(
      orders.filter((o) => o.status === 'pending').map((o) => o.plan_name),
    );
    for (const key of pendingSeenRef.current) {
      if (!pendingNames.has(key)) pendingSeenRef.current.delete(key);
    }
  }, [orders]);

  const openPayUrl = async (order: Order) => {
    try {
      const { data } = await api.get(`/api/payment/payUrl/${order.id}`);
      if (data.payUrl) {
        setPayModal({
          open: true,
          orderId: order.id,
          orderNo: order.order_no,
          amount: order.amount,
          credits: order.credits,
          payUrl: data.payUrl,
        });
      } else {
        message.error(data.message || '无法获取支付链接');
      }
    } catch {
      message.error('获取支付链接失败');
    }
  };

  // 同套餐已有待支付订单 → 确认弹窗（继续创建 / 去支付旧订单）
  const requestCreate = async (planKey: string) => {
    const existing = orders.find(
      (o) =>
        o.status === 'pending' &&
        plans.find((p) => p.key === planKey)?.name === o.plan_name,
    );
    if (existing && !pendingSeenRef.current.has(planKey)) {
      pendingSeenRef.current.add(planKey);
      Modal.confirm({
        title: '已有待支付订单',
        content: `您刚刚已创建了一个 ${existing.plan_name}（¥${Number(existing.amount).toFixed(2)}）的订单，确定还要重新创建新的订单吗？`,
        okText: '继续创建',
        okButtonProps: { style: { width: 100, height: 32 } },
        cancelText: '去支付旧订单',
        cancelButtonProps: { style: { width: 100, height: 32 } },
        onOk: () => createOrder(planKey),
        onCancel: async () => {
          await openPayUrl(existing);
        },
      });
      return;
    }
    await createOrder(planKey);
  };

  const createOrder = async (planKey: string) => {
    if (!rechargeEnabled) {
      message.warning('充值功能暂未开放');
      return;
    }
    setCreatingPlan(planKey);
    try {
      const { data } = await api.post('/api/payment/create', { plan: planKey });
      setOrders((prev) => [
        {
          id: data.orderId,
          ...data,
          status: 'pending',
          order_no: data.orderNo,
          plan_name: plans.find((p) => p.key === planKey)?.name || planKey,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setPayModal({
        open: true,
        orderId: data.orderId,
        orderNo: data.orderNo,
        amount: data.amount,
        credits: data.credits,
        payUrl: data.payUrl,
      });
    } catch (err: any) {
      message.error(err.response?.data?.message || '创建订单失败');
    } finally {
      setCreatingPlan(null);
    }
  };

  const handlePaySuccess = async () => {
    await Promise.all([loadData(), refreshUser()]);
    message.success('支付成功，算力已到账');
  };

  const cancelOrder = (order: Order) => {
    Modal.confirm({
      title: '确认取消订单',
      content: `确定要取消订单 ${order.order_no} 吗？取消后无法恢复。`,
      okText: '确认取消',
      okButtonProps: { danger: true, style: { width: 80, height: 32 } },
      cancelText: '再想想',
      cancelButtonProps: { style: { width: 80, height: 32 } },
      onOk: async () => {
        try {
          await api.post(`/api/order/${order.id}/cancel`);
          message.success('订单已取消');
          await loadData();
        } catch (err: any) {
          message.error(err.response?.data?.message || '取消失败');
        }
      },
    });
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
      title: '剩余时间',
      key: 'countdown',
      width: 90,
      render: (_, record) =>
        record.status === 'pending' ? <Countdown createdAt={record.created_at} /> : '-',
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 170,
      render: (v) => formatDateSafe(v),
    },
    {
      title: '操作',
      width: 150,
      render: (_, record) =>
        record.status === 'pending' ? (
          <Space>
            <Button
              size="small"
              type="primary"
              onClick={() => openPayUrl(record)}
              style={{ background: 'var(--primary)', borderColor: 'var(--primary)' }}
            >
              去支付
            </Button>
            <Button size="small" type="primary" className="btn-danger" onClick={() => cancelOrder(record)}>
              取消
            </Button>
          </Space>
        ) : null,
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(16px, 3vw, 24px) 0 0' }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <Title level={3} style={{ margin: 0 }}>
            算力充值
          </Title>
        </div>
        <Button
          className="back-btn"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/dashboard')}
          style={{ marginBottom: 16 }}
        >
          返回
        </Button>
        <Alert
          message="当前为测试阶段，视频生成使用免费模型，充值后积分可正常使用但暂无额外算力加成，建议等正式版上线后再充值。"
          type="warning"
          showIcon
          closable
          style={{ marginBottom: 20, borderRadius: 8 }}
        />
      </div>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 clamp(16px, 3vw, 24px) 32px' }}>
        <Card style={{ marginBottom: 20, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <div>
              <Title level={3} style={{ marginBottom: 4 }}>
                套餐选择
              </Title>
              <Text type="secondary">
                当前账号：{user?.username || '-'}，剩余 {user?.credits ?? 0} 算力
              </Text>
            </div>
            <WalletOutlined style={{ fontSize: 34, color: 'var(--primary)' }} />
          </Space>
        </Card>

        {loading ? (
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            {[1, 2, 3].map((i) => (
              <Col xs={24} md={8} key={i}>
                <Card style={{ borderRadius: 12, height: 320, border: '1px solid var(--border)' }}>
                  <Skeleton active paragraph={{ rows: 6 }} />
                </Card>
              </Col>
            ))}
          </Row>
        ) : (
          <>
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
              {plans.map((plan) => (
                <Col xs={24} md={8} key={plan.key}>
                  <Card
                    hoverable
                    style={{ borderRadius: 12, height: '100%', border: '1px solid var(--border)' }}
                    title={
                      <Space>
                        <ThunderboltOutlined style={{ color: 'var(--warning)' }} />
                        {plan.name}
                      </Space>
                    }
                    extra={<Tag color={plan.key === 'creator' ? 'purple' : 'blue'}>{plan.badge}</Tag>}
                  >
                    <Title level={2} style={{ margin: '0 0 6px' }}>
                      ¥{Number(plan.amount).toFixed(2)}
                    </Title>
                    <Text strong style={{ fontSize: 18 }}>
                      {plan.credits} 算力
                    </Text>
                    <Button
                      type="primary"
                      block
                      loading={creatingPlan === plan.key}
                      icon={<CheckCircleOutlined />}
                      style={{ marginTop: 20, background: 'var(--primary)', borderColor: 'var(--primary)' }}
                      onClick={() => requestCreate(plan.key)}
                    >
                      {creatingPlan === plan.key ? '创建中...' : '创建充值订单'}
                    </Button>
                  </Card>
                </Col>
              ))}
            </Row>

            <Card title="充值记录" style={{ borderRadius: 12, border: '1px solid var(--border)' }}>
              {orders.length ? (
                <Table rowKey="id" columns={columns} dataSource={orders} pagination={false} scroll={{ x: 640 }} />
              ) : (
                <Empty description="暂无充值订单" />
              )}
            </Card>
          </>
        )}
      </div>

      <PayModal
        open={payModal.open}
        orderId={payModal.orderId}
        orderNo={payModal.orderNo}
        amount={payModal.amount}
        credits={payModal.credits}
        payUrl={payModal.payUrl}
        onClose={() => setPayModal((s) => ({ ...s, open: false }))}
        onSuccess={handlePaySuccess}
      />
    </div>
  );
}
