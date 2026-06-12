import { useEffect, useState } from 'react';
import { Card, Table, Typography, Tag, Space, Input, Button, message, Popconfirm, Modal, InputNumber } from 'antd';
import {
  UserOutlined, ReloadOutlined,
  StopOutlined, CheckCircleOutlined, DollarOutlined,
} from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;

export default function UserManagePage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rechargeUser, setRechargeUser] = useState<any>(null);
  const [rechargeAmount, setRechargeAmount] = useState(100);

  const fetchUsers = async (p = page, kw = keyword) => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/admin/users', { params: { page: p, limit: 20, keyword: kw } });
      setUsers(data.items || []);
      setTotal(data.total || 0);
    } catch { message.error('获取用户列表失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleBan = async (id: number, banned: boolean) => {
    try {
      await api.put(`/api/admin/users/${id}/ban`, { banned });
      message.success(banned ? '已封禁' : '已解封');
      fetchUsers();
    } catch { message.error('操作失败'); }
  };

  const handleRecharge = async () => {
    if (!rechargeUser || rechargeAmount <= 0) return;
    try {
      await api.post(`/api/admin/users/${rechargeUser.id}/recharge`, { amount: rechargeAmount });
      message.success(`已为用户 ${rechargeUser.username} 充值 ${rechargeAmount} 算力`);
      setRechargeOpen(false);
      await fetchUsers();
    } catch { message.error('充值失败'); }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '用户名', dataIndex: 'username', width: 140 },
    { title: '手机号', dataIndex: 'phone', width: 140, render: (v: string) => v || '-' },
    {
      title: '角色', dataIndex: 'role', width: 80,
      render: (v: string) => <Tag color={v === 'admin' ? 'purple' : 'blue'}>{v === 'admin' ? '管理员' : '用户'}</Tag>,
    },
    { title: '算力', dataIndex: 'credits', width: 80 },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (v: number) => v === 1
        ? <Tag color="success" icon={<CheckCircleOutlined />}>正常</Tag>
        : <Tag color="error" icon={<StopOutlined />}>封禁</Tag>,
    },
    {
      title: '注册时间', dataIndex: 'created_at', width: 170,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '操作', key: 'actions', width: 180,
      render: (_: any, record: any) => (
        <Space size="small">
          <Button size="small" icon={<DollarOutlined />} onClick={() => { setRechargeUser(record); setRechargeAmount(100); setRechargeOpen(true); }}>
            充值
          </Button>
          <Popconfirm
            title={record.status === 1 ? '确认封禁该用户？' : '确认解封该用户？'}
            onConfirm={() => handleBan(record.id, record.status !== 0)}
          >
            <Button size="small" danger={record.status === 1} icon={record.status === 1 ? <StopOutlined /> : <CheckCircleOutlined />}>
              {record.status === 1 ? '封禁' : '解封'}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3}><UserOutlined style={{ marginRight: 8, color: '#1890ff' }} />用户管理</Title>
        <Text type="secondary">管理所有注册用户，支持封禁/解封和手动充值算力</Text>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Space>
          <Input.Search placeholder="搜索用户名或手机号" value={keyword}
            onChange={e => setKeyword(e.target.value)} onSearch={() => { setPage(1); fetchUsers(1, keyword); }}
            style={{ width: 280 }} allowClear />
          <Button icon={<ReloadOutlined />} onClick={() => fetchUsers()} loading={loading}>刷新</Button>
        </Space>
      </Card>

      <Card>
        <Table dataSource={users} columns={columns} rowKey="id" loading={loading} size="middle"
          pagination={{ current: page, total, pageSize: 20, showTotal: t => `共 ${t} 人`, onChange: (p) => { setPage(p); fetchUsers(p); } }}
          scroll={{ x: 1000 }} />
      </Card>

      <Modal title="手动充值" open={rechargeOpen} onOk={handleRecharge} onCancel={() => setRechargeOpen(false)}
        okText="确认充值" cancelText="取消">
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Text>用户：<strong>{rechargeUser?.username}</strong>（当前算力：{rechargeUser?.credits}）</Text>
          <Text type="secondary">充值数量：</Text>
          <Space.Compact style={{ width: '100%' }}>
            <InputNumber min={1} max={100000} value={rechargeAmount} onChange={v => setRechargeAmount(v || 0)}
              style={{ flex: 1 }} />
            <Button disabled>算力</Button>
          </Space.Compact>
        </Space>
      </Modal>
    </div>
  );
}
