import { useEffect, useState } from 'react';
import { Table, Button, Card, Typography, Tag, Space, Modal, Form, Input, Select, InputNumber, message, Popconfirm, Upload } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../services/api';

const { Title, Text } = Typography;

interface ReleaseItem {
  id: number;
  title: string;
  summary: string | null;
  cover_url: string | null;
  link_url: string | null;
  tag: string;
  priority: number;
  status: string;
  released_at: string | null;
  created_at: string;
}

const STATUS_META: Record<string, { color: string; text: string }> = {
  online: { color: 'green', text: '展示中' },
  offline: { color: 'default', text: '已下线' },
  draft: { color: 'orange', text: '草稿' },
};

const TAG_META: Record<string, { color: string; text: string }> = {
  NEW: { color: 'cyan', text: 'NEW' },
  BETA: { color: 'gold', text: 'BETA' },
  HOT: { color: 'red', text: 'HOT' },
};

const fmtTime = (v: string | null) => {
  if (!v) return '-';
  const d = dayjs(v);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : v;
};

export default function ReleaseManagePage() {
  const [data, setData] = useState<ReleaseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ReleaseItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetch = async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get('/api/admin/releases');
      setData(Array.isArray(res?.items) ? res.items : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 'draft', priority: 0, tag: 'NEW' });
    setModalOpen(true);
  };

  const openEdit = (item: ReleaseItem) => {
    setEditing(item);
    form.resetFields();
    form.setFieldsValue({
      ...item,
      released_at: item.released_at ? fmtTime(item.released_at) : undefined,
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
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/api/admin/releases/${editing.id}`, values);
      } else {
        await api.post('/api/admin/releases', values);
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

  const toggleStatus = async (r: ReleaseItem) => {
    const next = r.status === 'online' ? 'offline' : 'online';
    try {
      await api.put(`/api/admin/releases/${r.id}`, { status: next });
      message.success(next === 'online' ? '已上线' : '已下线');
      fetch();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api/admin/releases/${id}`);
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
    { title: '标题', dataIndex: 'title', width: 200, ellipsis: true },
    { title: '说明', dataIndex: 'summary', width: 260, ellipsis: true, render: (v: string | null) => v || '-' },
    { title: '角标', dataIndex: 'tag', width: 80, render: (v: string) => <Tag color={TAG_META[v]?.color || 'default'}>{TAG_META[v]?.text || v}</Tag> },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v: string) => <Tag color={STATUS_META[v]?.color || 'default'}>{STATUS_META[v]?.text || v}</Tag>,
    },
    { title: '优先级', dataIndex: 'priority', width: 80 },
    {
      title: '上架时间', dataIndex: 'released_at', width: 150,
      render: (v: string | null) => fmtTime(v),
    },
    {
      title: '跳转', dataIndex: 'link_url', width: 160, ellipsis: true,
      render: (v: string | null) => (v ? <a href={v} target="_blank" rel="noreferrer">{v}</a> : '-'),
    },
    {
      title: '操作', width: 180,
      render: (_: any, r: ReleaseItem) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} aria-label="编辑" onClick={() => openEdit(r)} />
          <Button type="link" size="small" onClick={() => toggleStatus(r)}>
            {r.status === 'online' ? '下线' : '上线'}
          </Button>
          <Popconfirm title="确定删除该上新?" okText="确定" cancelText="取消" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} aria-label="删除" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>上新管理</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetch}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增上新</Button>
        </Space>
      </div>
      <Card style={{ borderRadius: 8 }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} pagination={false} scroll={{ x: 1200 }} />
      </Card>

      <Modal
        title={editing ? '编辑上新' : '新增上新'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        width={720}
        okText="确定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请填写标题' }, { max: 120 }]}>
            <Input placeholder="如：视频自动生成封面" />
          </Form.Item>
          <Form.Item name="summary" label="一句话说明" rules={[{ max: 300 }]}>
            <Input placeholder="如：文生视频完成后，AI 自动生成内容封面（可留空）" />
          </Form.Item>
          <Space style={{ width: '100%' }} size={12} align="start">
            <Form.Item name="tag" label="角标" initialValue="NEW" style={{ width: 130 }}>
              <Select options={[
                { label: 'NEW', value: 'NEW' },
                { label: 'BETA', value: 'BETA' },
                { label: 'HOT', value: 'HOT' },
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
            <Form.Item name="released_at" label="上架时间（可留空）" style={{ width: 200 }}>
              <Input placeholder="2026-10-01 12:00:00" />
            </Form.Item>
          </Space>
          <Form.Item label="跳转地址">
            <Form.Item name="link_url" noStyle>
              <Input style={{ width: 420 }} placeholder="站内路由（如 /generate/history）或 https://..." />
            </Form.Item>
          </Form.Item>
          <Form.Item label="封面地址" extra={<Text type="secondary">留空走前端灰阶+青 CSS 占位；封面提示词见 dev-checklist A.5</Text>}>
            <Space style={{ width: '100%' }} size={8}>
              <Form.Item name="cover_url" noStyle>
                <Input style={{ width: 380 }} placeholder="/static/xxx.jpg 或 https://..." />
              </Form.Item>
              <Upload accept="image/*" showUploadList={false} beforeUpload={(f) => { doUpload(f); return false; }}>
                <Button icon={<UploadOutlined />}>上传封面</Button>
              </Upload>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
