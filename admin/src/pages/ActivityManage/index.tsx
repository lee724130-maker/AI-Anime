import { useEffect, useState } from 'react';
import { Table, Button, Card, Typography, Tag, Space, Modal, Form, Input, Select, InputNumber, message, Popconfirm, Upload } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../services/api';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface ActivityItem {
  id: number;
  title: string;
  subtitle: string | null;
  cover_url: string | null;
  link_url: string | null;
  button_text: string | null;
  kind: string;
  status: string;
  priority: number;
  starts_at: string | null;
  ends_at: string | null;
  gameplay: string | null;
  config: string | null;
  created_at: string;
}

interface TaskKeyOpt { key: string; title: string; defReward: number }

const STATUS_META: Record<string, { color: string; text: string }> = {
  online: { color: 'green', text: '展示中' },
  offline: { color: 'default', text: '已下线' },
  draft: { color: 'orange', text: '草稿' },
};

const KIND_META: Record<string, { color: string; text: string }> = {
  banner: { color: 'purple', text: '主横幅' },
  card: { color: 'blue', text: '上新活动卡' },
};

const fmtTime = (v: string | null) => {
  if (!v) return '-';
  const d = dayjs(v);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : v;
};

const DEFAULT_TASKS_JSON = JSON.stringify({
  tasks: [
    { key: 'first_generate', title: '完成首次 AI 生成', reward: 50 },
    { key: 'first_drama', title: '创建首个短剧项目', reward: 50 },
    { key: 'first_canvas', title: '完成首次画布创作', reward: 50 },
  ],
}, null, 2);

export default function ActivityManagePage() {
  const [data, setData] = useState<ActivityItem[]>([]);
  const [taskKeys, setTaskKeys] = useState<TaskKeyOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const gameplayValue = Form.useWatch('gameplay', form);

  const fetch = async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get('/api/admin/activities');
      setData(Array.isArray(res?.items) ? res.items : []);
      if (Array.isArray(res?.task_keys)) setTaskKeys(res.task_keys);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 'draft', priority: 0, kind: 'banner', gameplay: '' });
    setModalOpen(true);
  };

  const openEdit = (item: ActivityItem) => {
    setEditing(item);
    form.resetFields();
    form.setFieldsValue({
      ...item,
      gameplay: item.gameplay || '',
      starts_at: item.starts_at ? fmtTime(item.starts_at) : undefined,
      ends_at: item.ends_at ? fmtTime(item.ends_at) : undefined,
    });
    setModalOpen(true);
  };

  const doUpload = async (file: File) => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data: res } = await api.post('/api/media/upload', fd);
      form.setFieldsValue({ cover_url: res.url });
      message.success('上传成功');
    } catch (e: any) {
      message.error(e?.response?.data?.message || '上传失败');
    }
    return false; // 阻止 antd 自动上传（已手动上传）
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload: Record<string, unknown> = { ...values };
    if (!payload.gameplay) payload.gameplay = null; // '' → null（纯展示）
    if (payload.gameplay !== 'newbie_tasks') payload.config = null;
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/api/admin/activities/${editing.id}`, payload);
      } else {
        await api.post('/api/admin/activities', payload);
      }
      message.success(editing ? '已更新' : '已创建');
      setModalOpen(false);
      fetch();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (r: ActivityItem) => {
    const next = r.status === 'online' ? 'offline' : 'online';
    try {
      await api.put(`/api/admin/activities/${r.id}`, { status: next });
      message.success(next === 'online' ? '已上线' : '已下线');
      fetch();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api/admin/activities/${id}`);
      message.success('已删除');
      fetch();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '删除失败');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '封面', dataIndex: 'cover_url', width: 100,
      render: (v: string | null) =>
        v ? (
          <img src={v} alt="cover" style={{ width: 84, height: 48, objectFit: 'cover', borderRadius: 4, display: 'block' }} />
        ) : (
          <div style={{ width: 84, height: 48, borderRadius: 4, background: 'linear-gradient(135deg,#1a1a2e,#08b6dd33)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#999' }}>CSS 占位</div>
        ),
    },
    { title: '标题', dataIndex: 'title', width: 180, ellipsis: true },
    { title: '副标题', dataIndex: 'subtitle', width: 180, ellipsis: true, render: (v: string | null) => v || '-' },
    { title: '类型', dataIndex: 'kind', width: 90, render: (v: string) => <Tag color={KIND_META[v]?.color || 'default'}>{KIND_META[v]?.text || v}</Tag> },
    {
      title: '玩法', dataIndex: 'gameplay', width: 110,
      render: (v: string | null) => (v ? <Tag color="magenta">新手任务</Tag> : <span style={{ color: '#999' }}>纯展示</span>),
    },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v: string) => <Tag color={STATUS_META[v]?.color || 'default'}>{STATUS_META[v]?.text || v}</Tag>,
    },
    { title: '优先级', dataIndex: 'priority', width: 80 },
    {
      title: '起止时间', width: 200,
      render: (_: any, r: ActivityItem) => `${fmtTime(r.starts_at)} ~ ${fmtTime(r.ends_at)}`,
    },
    {
      title: '跳转', dataIndex: 'link_url', width: 140, ellipsis: true,
      render: (v: string | null) => (v ? <a href={v} target="_blank" rel="noreferrer">{v}</a> : '-'),
    },
    {
      title: '操作', width: 180,
      render: (_: any, r: ActivityItem) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} aria-label="编辑" onClick={() => openEdit(r)} />
          <Button type="link" size="small" onClick={() => toggleStatus(r)}>
            {r.status === 'online' ? '下线' : '上线'}
          </Button>
          <Popconfirm title="确定删除该活动?" okText="确定" cancelText="取消" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} aria-label="删除" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>活动管理</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetch}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增活动</Button>
        </Space>
      </div>
      <Card style={{ borderRadius: 8 }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} pagination={false} scroll={{ x: 1300 }} />
      </Card>

      <Modal
        title={editing ? '编辑活动' : '新增活动'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        width={760}
        okText="确定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="活动标题" rules={[{ required: true, message: '请填写标题' }, { max: 120 }]}>
            <Input placeholder="展示在活动横幅上的标题" />
          </Form.Item>
          <Form.Item name="subtitle" label="副标题" rules={[{ max: 200 }]}>
            <Input placeholder="一句话说明（可留空），如：三个小任务，最高 150 积分" />
          </Form.Item>
          <Space style={{ width: '100%' }} size={12} align="start">
            <Form.Item name="kind" label="类型" initialValue="banner" style={{ width: 150 }}>
              <Select options={[
                { label: '主横幅（限时活动区）', value: 'banner' },
                { label: '上新活动卡（上新区）', value: 'card' },
              ]} />
            </Form.Item>
            <Form.Item name="status" label="状态" initialValue="draft" style={{ width: 140 }}>
              <Select options={[
                { label: '草稿', value: 'draft' },
                { label: '展示中', value: 'online' },
                { label: '已下线', value: 'offline' },
              ]} />
            </Form.Item>
            <Form.Item name="priority" label="优先级（大在前）" initialValue={0} style={{ width: 140 }}>
              <InputNumber style={{ width: '100%' }} min={-100000} max={100000} />
            </Form.Item>
            <Form.Item name="button_text" label="按钮文案" style={{ width: 140 }}>
              <Input placeholder="缺省：去参与" maxLength={20} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size={12} align="start">
            <Form.Item name="starts_at" label="开始时间（可留空=不限）" style={{ width: 220 }}>
              <Input placeholder="2026-10-01 12:00:00" />
            </Form.Item>
            <Form.Item name="ends_at" label="结束时间（可留空=不限）" style={{ width: 220 }}>
              <Input placeholder="2026-10-08 12:00:00" />
            </Form.Item>
          </Space>
          <Form.Item label="跳转地址">
            <Space style={{ width: '100%' }} size={8}>
              <Form.Item name="link_url" noStyle>
                <Input style={{ width: 380 }} placeholder="站内路由（如 /generate）或 https://...（玩法活动可留空）" />
              </Form.Item>
            </Space>
          </Form.Item>
          <Form.Item label="封面地址">
            <Space style={{ width: '100%' }} size={8}>
              <Form.Item name="cover_url" noStyle>
                <Input style={{ width: 380 }} placeholder="留空走前端灰阶+青 CSS 占位" />
              </Form.Item>
              <Upload accept="image/*" showUploadList={false} beforeUpload={(f) => { doUpload(f); return false; }}>
                <Button icon={<UploadOutlined />}>上传封面</Button>
              </Upload>
            </Space>
          </Form.Item>
          <Form.Item name="gameplay" label="玩法" initialValue="">
            <Select options={[
              { label: '无（纯展示 + 跳转）', value: '' },
              { label: '新手任务清单', value: 'newbie_tasks' },
            ]} />
          </Form.Item>
          {gameplayValue === 'newbie_tasks' && (
            <Form.Item
              label="任务配置 JSON"
              required
              extra={
                <span>
                  可用任务 key：
                  {taskKeys.map((t) => (
                    <Text key={t.key} code>{t.key}</Text>
                  ))}
                  （进度按用户真实数据实时判定，reward 缺省见各 key 默认值）
                </span>
              }
            >
              <Space style={{ width: '100%' }} size={8} align="start">
                <Form.Item name="config" noStyle>
                  <TextArea
                    rows={7}
                    style={{ fontFamily: 'monospace', width: 440 }}
                    placeholder='{"tasks":[{"key":"first_generate","title":"完成首次 AI 生成","reward":50}]}'
                  />
                </Form.Item>
                <Button size="small" onClick={() => form.setFieldsValue({ config: DEFAULT_TASKS_JSON })}>
                  填入默认任务
                </Button>
              </Space>
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
