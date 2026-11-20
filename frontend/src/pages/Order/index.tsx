import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Empty,
  Modal,
  Result,
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
import './order.css';   // 本页质感改造样式（作用域 .ord-root，详见文件头注释）

const { Title } = Typography;

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
          className="ord-pay"
          icon={<CheckCircleOutlined className="ord-pay__ok" />}
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
          className="ord-pay"
          icon={<CloseCircleOutlined className="ord-pay__no-icon" />}
          title="订单已取消"
          extra={
            <Button onClick={close}>关闭</Button>
          }
        />
      )}
      {status === 'pending' && (
        <div className="ord-pay">
          <div className="ord-pay__head">
            <PayCircleOutlined />
            <span>支付宝支付</span>
          </div>
          <div className="ord-pay__no">订单号：{orderNo}</div>
          <div className="ord-pay__sum">
            <span className="ord-pay__amount">¥{Number(amount).toFixed(2)}</span>
            <span className="ord-pay__credits">得 {credits} 算力</span>
          </div>
          <Button
            type="primary"
            size="large"
            className="ord-pay__go"
            icon={<PayCircleOutlined />}
            onClick={() => {
              if (!payUrl) return;
              const w = window.open(payUrl, '_blank', 'width=800,height=600');
              if (!w || w.closed || w.closed === void 0) {
                window.location.href = payUrl;
              }
            }}
          >
            去支付宝付款
          </Button>
          <Button size="large" className="ord-pay__cancel" onClick={close}>
            取消支付
          </Button>
          <span className="ord-pay__hint">
            <LoadingOutlined />
            支付完成后此窗口会自动更新
          </span>
        </div>
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

  if (remaining <= 0) return <span className="ord-count--timeout">已超时</span>;

  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);
  return (
    <span className="ord-count" data-urgent={remaining < 180 * 1000 ? '1' : '0'}>
      {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
    </span>
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
          <Space size={6}>
            <Button
              size="small"
              type="primary"
              className="ord-btn-pay"
              onClick={() => openPayUrl(record)}
            >
              去支付
            </Button>
            <Button size="small" type="primary" className="ord-btn-cancel" onClick={() => cancelOrder(record)}>
              取消
            </Button>
          </Space>
        ) : null,
    },
  ];

  return (
    <div className="ord-root">
      {/* 顶栏：返回圆钮 + 标题（与 /user /tasks 同范式，取代「居中大标题 + 下面一个返回钮」） */}
      <div className="ord-topbar">
        <div className="ord-topbar__lead">
          <Button shape="circle" icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')} />
          <div className="ord-topbar__titles">
            <Title level={4} className="ord-topbar__title">算力充值</Title>
            <span className="ord-topbar__sub">选择套餐创建订单，支付成功后算力自动到账</span>
          </div>
        </div>
      </div>

      <div className="ord-notice">
        <Alert
          message="当前为测试阶段，视频生成使用免费模型，充值后积分可正常使用但暂无额外算力加成，建议等正式版上线后再充值。"
          type="warning"
          showIcon
          closable
        />
      </div>

      {/* 账户条 */}
      <div className="ord-account">
        <div className="ord-account__titles">
          <Title level={4} className="ord-account__title">套餐选择</Title>
          <span className="ord-account__sub">
            当前账号：{user?.username || '-'}，剩余 <b>{user?.credits ?? 0}</b> 算力
          </span>
        </div>
        <WalletOutlined className="ord-account__icon" />
      </div>

      {loading ? (
        <div className="ord-plans">
          {[1, 2, 3].map((i) => (
            <div className="ord-plan ord-plan--skeleton" key={i}>
              <Skeleton active paragraph={{ rows: 6 }} />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* 套餐卡：antd Card(title/extra) → 令牌卡，字段与下单流程零改动 */}
          <div className="ord-plans">
            {plans.map((plan) => (
              <div className="ord-plan" key={plan.key} data-featured={plan.key === 'creator' ? '1' : '0'}>
                <div className="ord-plan__head">
                  <span className="ord-plan__name"><ThunderboltOutlined />{plan.name}</span>
                  <Tag className="ord-plan__badge" color={plan.key === 'creator' ? 'purple' : 'blue'}>{plan.badge}</Tag>
                </div>
                <div className="ord-plan__price">¥{Number(plan.amount).toFixed(2)}</div>
                <div className="ord-plan__credits">{plan.credits} 算力</div>
                <div className="ord-plan__cta">
                  <Button
                    type="primary"
                    block
                    loading={creatingPlan === plan.key}
                    icon={<CheckCircleOutlined />}
                    onClick={() => requestCreate(plan.key)}
                  >
                    {creatingPlan === plan.key ? '创建中...' : '创建充值订单'}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* 充值记录 */}
          <div className="ord-records">
            <div className="ord-records__head">
              <span>充值记录</span>
              <span className="ord-records__count">{orders.length}</span>
            </div>
            <div className="ord-records__body">
              {orders.length ? (
                <Table rowKey="id" columns={columns} dataSource={orders} pagination={false} scroll={{ x: 640 }} size="middle" />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无充值订单" />
              )}
            </div>
          </div>
        </>
      )}

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
