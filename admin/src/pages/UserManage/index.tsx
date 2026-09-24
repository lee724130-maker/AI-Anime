import { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Tag,
  Space,
  Button,
  Input,
  Modal,
  Popconfirm,
  Checkbox,
  InputNumber,
  Typography,
  message,
} from 'antd';
import {
  UserOutlined,
  ReloadOutlined,
  DollarOutlined,
  SafetyCertificateOutlined,
  CrownOutlined,
  StopOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import { useAdminAuthStore } from '../../stores/authStore';

const { Title, Text } = Typography;

// H9 — permission matrix (9 entries, no server/database)
const PERMISSION_MATRIX = [
  { key: 'dashboard', label: '仪表盘', levels: ['view', 'edit'] },
  { key: 'apikeys', label: 'API 密钥', levels: ['view', 'edit'] },
  { key: 'models', label: '模型管理', levels: ['view', 'edit'] },
  { key: 'prompts', label: '提示词模板', levels: ['view', 'edit'] },
  { key: 'users', label: '用户管理', levels: ['view', 'edit', 'recharge'] },
  { key: 'access', label: '访问统计', levels: ['view', 'edit'] },
  { key: 'payments', label: '支付记录', levels: ['view', 'edit'] },
  { key: 'logs', label: '系统日志', levels: ['view', 'edit'] },
  { key: 'config', label: '系统配置', levels: ['view', 'edit'] },
];

// Gbe — user management page
export default function UserManagePage() {
  const user = useAdminAuthStore((s) => s.user);
  const canEdit = useAdminAuthStore((s) => s.canEdit);
  const isSuper = user?.is_super_admin === true;
  // r = actions column gate, i = recharge gate, a = ban gate helper
  const r = isSuper || canEdit('users');
  const i =
    isSuper ||
    canEdit('users') ||
    (() => {
      try {
        const list = JSON.parse(user?.admin_permissions || '[]');
        return Array.isArray(list) && list.some((p: string) => p === 'users:recharge');
      } catch {
        return false;
      }
    })();
  const a = isSuper || canEdit('users');

  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rechargeUser, setRechargeUser] = useState<any>(null);
  const [amount, setAmount] = useState(100);
  const [mode, setMode] = useState<'add' | 'sub'>('add');

  const [permOpen, setPermOpen] = useState(false);
  const [permUser, setPermUser] = useState<any>(null);
  const [permissions, setPermissions] = useState<string[]>([]);

  const fetchUsers = async (p = page, kw = keyword) => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/admin/users', {
        params: { page: p, limit: 20, keyword: kw },
      });
      setUsers(data.items || []);
      setTotal(data.total || 0);
    } catch {
      message.error('获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const banUser = async (id: number, banned: boolean) => {
    try {
      await api.put(`/api/admin/users/${id}/ban`, { banned });
      message.success(banned ? '已封禁' : '已解封');
      fetchUsers();
    } catch {
      message.error('操作失败');
    }
  };

  const deleteUser = async (id: number) => {
    try {
      await api.delete(`/api/admin/users/${id}`);
      message.success('用户已删除');
      fetchUsers();
    } catch (e: any) {
      message.error(e.response?.data?.message || '删除失败');
    }
  };

  const doRecharge = async () => {
    if (!rechargeUser || amount <= 0) return;
    try {
      if (mode === 'add') {
        await api.post(`/api/admin/users/${rechargeUser.id}/recharge`, { amount });
        message.success(`已为用户 ${rechargeUser.username} 充值 ${amount} 积分`);
      } else {
        await api.post(`/api/admin/users/${rechargeUser.id}/deduct`, { amount });
        message.success(`已为用户 ${rechargeUser.username} 扣除 ${amount} 积分`);
      }
      setRechargeOpen(false);
      await fetchUsers();
    } catch (e: any) {
      message.error(e.response?.data?.message || (mode === 'add' ? '充值失败' : '扣除失败'));
    }
  };

  const changeRole = async (id: number, role: string) => {
    try {
      await api.put(`/api/admin/users/${id}/role`, { role });
      message.success(role === 'admin' ? '已提升为管理员' : '已降为普通用户');
      fetchUsers();
    } catch (e: any) {
      message.error(e.response?.data?.message || '操作失败');
    }
  };

  const openPerm = (u: any) => {
    setPermUser(u);
    try {
      const list = u.admin_permissions ? JSON.parse(u.admin_permissions) : [];
      setPermissions(Array.isArray(list) ? list : []);
    } catch {
      setPermissions([]);
    }
    setPermOpen(true);
  };

  const savePerm = async () => {
    if (!permUser) return;
    try {
      await api.put(`/api/admin/users/${permUser.id}/permissions`, {
        permissions: permissions.length > 0 ? permissions : null,
      });
      message.success('权限已更新');
      setPermOpen(false);
      fetchUsers();
    } catch (e: any) {
      message.error(e.response?.data?.message || '操作失败');
    }
  };

  const isChecked = (key: string, level?: string) =>
    level ? permissions.some((p) => p === `${key}:${level}`) : permissions.some((p) => p === key || p.startsWith(key + ':'));

  const togglePerm = (key: string, level: string) => {
    const full = `${key}:${level}`;
    setPermissions((prev) => {
      if (prev.includes(full)) return prev.filter((p) => p !== full);
      if (level === 'edit') {
        const viewKey = `${key}:view`;
        return [...prev.filter((p) => p !== viewKey), full];
      }
      if (level === 'view') return [...prev.filter((p) => p !== `${key}:edit`), full];
      return [...prev, full];
    });
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3}>
          <UserOutlined className="page-header-icon" style={{ color: 'var(--primary)' }} /> 用户管理
        </Title>
        <Text type="secondary">管理所有注册用户，支持封禁/解封和手动充值算力</Text>
      </div>

      <Card styles={{ body: { padding: '16px 24px' } }} style={{ marginBottom: 16 }}>
        <Space>
          <Input.Search
            placeholder="搜索用户名或邮箱"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={() => {
              setPage(1);
              fetchUsers(1, keyword);
            }}
            style={{ width: 280 }}
            allowClear
          />
          <Button icon={<ReloadOutlined />} onClick={() => fetchUsers()} loading={loading}>
            刷新
          </Button>
        </Space>
      </Card>

      <Card styles={{ body: { padding: 0 } }}>
        <Table
          dataSource={users}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 60 },
            { title: '用户名', dataIndex: 'username', width: 140 },
            { title: '电子邮箱', dataIndex: 'email', width: 220, render: (v: any) => v || '-' },
            {
              title: '角色',
              dataIndex: 'role',
              width: 120,
              render: (v: any, rec: any) =>
                rec.is_super_admin ? (
                  <Tag icon={<CrownOutlined />} className="super-admin-tag">
                    超级管理员
                  </Tag>
                ) : (
                  <Tag color={v === 'admin' ? 'purple' : 'blue'}>{v === 'admin' ? '管理员' : '用户'}</Tag>
                ),
            },
            { title: '算力', dataIndex: 'credits', width: 80 },
            {
              title: '状态',
              dataIndex: 'status',
              width: 80,
              render: (v: any) =>
                v === 1 ? (
                  <Tag color="success" icon={<CheckCircleOutlined />}>正常</Tag>
                ) : (
                  <Tag color="error" icon={<StopOutlined />}>封禁</Tag>
                ),
            },
            {
              title: '注册时间',
              dataIndex: 'created_at',
              width: 170,
              render: (v: any) => new Date(v).toLocaleString('zh-CN'),
            },
            {
              title: '操作',
              key: 'actions',
              width: 280,
              render: (_: any, rec: any) => {
                const targetSuper = rec.is_super_admin === true;
                const targetAdmin = rec.role === 'admin';
                return (
                  <Space size="small">
                    {r && (
                      <>
                        {(isSuper ? true : i && !targetSuper) && (
                          <Button
                            size="small"
                            icon={<DollarOutlined />}
                            onClick={() => {
                              setRechargeUser(rec);
                              setAmount(100);
                              setRechargeOpen(true);
                            }}
                          >
                            充值
                          </Button>
                        )}
                        {isSuper && !targetSuper && !targetAdmin && (
                          <Button
                            size="small"
                            icon={<SafetyCertificateOutlined />}
                            onClick={() => changeRole(rec.id, 'admin')}
                          >
                            提为管理
                          </Button>
                        )}
                        {isSuper && !targetSuper && targetAdmin && (
                          <Button
                            size="small"
                            danger
                            icon={<SafetyCertificateOutlined />}
                            onClick={() => changeRole(rec.id, 'user')}
                          >
                            降为用户
                          </Button>
                        )}
                        {isSuper && !targetSuper && targetAdmin && (
                          <Button size="small" icon={<SafetyCertificateOutlined />} onClick={() => openPerm(rec)}>
                            权限
                          </Button>
                        )}
                        {!targetSuper && (isSuper || (a && !targetAdmin)) && (
                          <Popconfirm
                            title={rec.status === 1 ? '确认封禁该用户？' : '确认解封该用户？'}
                            onConfirm={() => banUser(rec.id, rec.status !== 0)}
                          >
                            <Button
                              size="small"
                              danger={rec.status === 1}
                              icon={rec.status === 1 ? <StopOutlined /> : <CheckCircleOutlined />}
                            >
                              {rec.status === 1 ? '封禁' : '解封'}
                            </Button>
                          </Popconfirm>
                        )}
                        {(isSuper || (!targetSuper && !targetAdmin)) && (
                          <Popconfirm
                            title="确定要删除该用户吗？此操作不可恢复！"
                            onConfirm={() => deleteUser(rec.id)}
                          >
                            <Button size="small" danger icon={<DeleteOutlined />}>
                              删除
                            </Button>
                          </Popconfirm>
                        )}
                      </>
                    )}
                  </Space>
                );
              },
            },
          ]}
          rowKey="id"
          loading={loading}
          size="middle"
          pagination={{
            current: page,
            total,
            pageSize: 20,
            showTotal: (t) => `共 ${t} 人`,
            onChange: (p) => {
              setPage(p);
              fetchUsers(p);
            },
          }}
          scroll={{ x: 1000 }}
        />
      </Card>

      {/* recharge / deduct modal */}
      <Modal
        title={mode === 'add' ? '充值积分' : '扣除积分'}
        open={rechargeOpen}
        className="recharge-modal"
        onOk={doRecharge}
        onCancel={() => setRechargeOpen(false)}
        okText={mode === 'add' ? '确认充值' : '确认扣除'}
        okButtonProps={{ danger: mode === 'sub' }}
        cancelText="取消"
        width={420}
        styles={{ body: { paddingBottom: 0 } }}
      >
        <div style={{ marginBottom: 16 }}>
          <Text>
            用户：<strong>{rechargeUser?.username}</strong>
          </Text>
          <br />
          <Text type="secondary">当前算力：{rechargeUser?.credits}</Text>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div
            onClick={() => setMode('add')}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 8,
              cursor: 'pointer',
              textAlign: 'center',
              border:
                mode === 'add'
                  ? '2px solid var(--primary, #1677ff)'
                  : '1px solid var(--border, #d9d9d9)',
              background: mode === 'add' ? 'var(--primary-bg, #e6f4ff)' : 'var(--bg, #fff)',
              color: mode === 'add' ? 'var(--primary, #1677ff)' : 'var(--text-muted, #666)',
            }}
          >
            <div style={{ fontSize: 20, marginBottom: 4 }}>➕</div>
            <div>充值</div>
          </div>
          <div
            onClick={() => setMode('sub')}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 8,
              cursor: 'pointer',
              textAlign: 'center',
              border:
                mode === 'sub'
                  ? '2px solid #ff4d4f'
                  : '1px solid var(--border, #d9d9d9)',
              background: mode === 'sub' ? 'rgba(248,113,113,0.08)' : 'var(--bg, #fff)',
              color: mode === 'sub' ? '#ff4d4f' : 'var(--text-muted, #666)',
            }}
          >
            <div style={{ fontSize: 20, marginBottom: 4 }}>➖</div>
            <div>扣除</div>
          </div>
        </div>
        <div>
          <Text type="secondary">数量：</Text>
          <InputNumber
            min={1}
            max={100000}
            value={amount}
            onChange={(v) => setAmount(v || 0)}
            style={{ width: '100%', marginTop: 8 }}
          />
        </div>
      </Modal>

      {/* permission modal */}
      <Modal
        title={`管理权限 - ${permUser?.username || ''}`}
        open={permOpen}
        onOk={savePerm}
        onCancel={() => setPermOpen(false)}
        okText="保存"
        cancelText="取消"
        width={520}
      >
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary">设置该管理员可以访问的功能模块及操作级别：</Text>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {PERMISSION_MATRIX.map((item) => (
            <div
              key={item.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 12px',
                background: 'var(--bg-secondary, #f5f5f5)',
                borderRadius: 6,
              }}
            >
              <Text style={{ flex: 1, fontWeight: 500 }}>{item.label}</Text>
              {item.levels.includes('view') && (
                <Checkbox checked={isChecked(item.key, 'view')} onChange={() => togglePerm(item.key, 'view')}>
                  查看
                </Checkbox>
              )}
              {item.levels.includes('edit') && (
                <Checkbox checked={isChecked(item.key, 'edit')} onChange={() => togglePerm(item.key, 'edit')}>
                  编辑
                </Checkbox>
              )}
              {item.levels.includes('recharge') && (
                <Checkbox
                  checked={isChecked(item.key, 'recharge')}
                  onChange={() => togglePerm(item.key, 'recharge')}
                >
                  充值
                </Checkbox>
              )}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <Button
            size="small"
            onClick={() => setPermissions(PERMISSION_MATRIX.flatMap((m) => [`${m.key}:view`, `${m.key}:edit`]))}
          >
            全选
          </Button>
          <Button size="small" style={{ marginLeft: 8 }} onClick={() => setPermissions([])}>
            全不选
          </Button>
          <Text type="secondary" style={{ marginLeft: 12, fontSize: 12 }}>
            留空 = 全部权限
          </Text>
        </div>
      </Modal>
    </div>
  );
}
