import { useEffect, useState } from 'react';
import { Table, Button, Card, Typography, Tag, Space, Modal, Form, Input, Select, InputNumber, message, Popconfirm, Upload } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined, CameraOutlined, PlayCircleOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title } = Typography;

interface ShowcaseItem {
  id: number;
  title: string;
  category: string;
  video_url: string;
  cover_url: string | null;
  duration: number | null;
  author_name: string | null;
  source_type: string;
  source_id: number | null;
  likes: number;
  views: number;
  status: string;
  sort: number;
  created_at: string;
}

interface CategoryOpt {
  key: string;
  label: string;
}

const STATUS_META: Record<string, { color: string; text: string }> = {
  online: { color: 'green', text: '展示中' },
  offline: { color: 'default', text: '已下线' },
  pending: { color: 'orange', text: '待审核' },
};

const SOURCE_OPTIONS = [
  { label: '上传', value: 'upload' },
  { label: 'AI 生成', value: 'generate' },
  { label: '短剧', value: 'drama' },
  { label: '热门创作', value: 'viral' },
  { label: '剪辑', value: 'editor' },
];

export default function ShowcaseManagePage() {
  const [data, setData] = useState<ShowcaseItem[]>([]);
  const [categories, setCategories] = useState<CategoryOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ShowcaseItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetch = async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get('/api/admin/showcase');
      setData(Array.isArray(res?.items) ? res.items : []);
      if (Array.isArray(res?.categories)) setCategories(res.categories);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const catLabel = (key: string) => categories.find((c) => c.key === key)?.label || key;

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 'online', sort: 0, source_type: 'upload' });
    setModalOpen(true);
  };

  const openEdit = (item: ShowcaseItem) => {
    setEditing(item);
    form.resetFields();
    form.setFieldsValue({ ...item, duration: item.duration ?? undefined, sort: item.sort ?? 0 });
    setModalOpen(true);
  };

  const doUpload = async (file: File, field: 'video_url' | 'cover_url') => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data: res } = await api.post('/api/media/upload', fd);
      form.setFieldsValue({ [field]: res.url });
      message.success('上传成功');
    } catch (e: any) {
      message.error(e?.response?.data?.message || '上传失败');
    }
    return false; // 阻止 antd 自动上传（已手动上传）
  };

  const grabCover = async () => {
    const v = form.getFieldValue('video_url');
    if (!v) {
      message.warning('请先填写视频地址');
      return;
    }
    try {
      const { data: res } = await api.post('/api/admin/showcase/cover-from-video', { video_url: v });
      form.setFieldsValue({ cover_url: res.cover_url });
      message.success('封面已从视频抽帧生成');
    } catch (e: any) {
      message.error(e?.response?.data?.message || '抽帧失败（仅支持站内 /static/ 视频）');
    }
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/api/admin/showcase/${editing.id}`, values);
      } else {
        await api.post('/api/admin/showcase', values);
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

  const toggleStatus = async (r: ShowcaseItem) => {
    const next = r.status === 'online' ? 'offline' : 'online';
    try {
      await api.put(`/api/admin/showcase/${r.id}`, { status: next });
      message.success(next === 'online' ? '已上线展示' : '已下线');
      fetch();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api/admin/showcase/${id}`);
      message.success('已删除');
      fetch();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '删除失败');
    }
  };

  const columns = [
    {
      title: '封面', dataIndex: 'cover_url', width: 100,
      render: (v: string | null) =>
        v ? (
          <img src={v} alt="cover" style={{ width: 84, height: 48, objectFit: 'cover', borderRadius: 4, display: 'block' }} />
        ) : (
          <div style={{ width: 84, height: 48, borderRadius: 4, background: 'linear-gradient(135deg,#7c3aed20,#ec489920)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#999' }}>无封面</div>
        ),
    },
    { title: '标题', dataIndex: 'title', width: 200, ellipsis: true },
    { title: '分类', dataIndex: 'category', width: 100, render: (v: string) => <Tag color="blue">{catLabel(v)}</Tag> },
    {
      title: '视频', dataIndex: 'video_url', width: 80,
      render: (v: string) => <a href={v} target="_blank" rel="noreferrer">预览</a>,
    },
    { title: '时长', dataIndex: 'duration', width: 70, render: (v: number | null) => (v ? `${v}s` : '-') },
    { title: '作者', dataIndex: 'author_name', width: 110, ellipsis: true, render: (v: string | null) => v || '-' },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v: string) => <Tag color={STATUS_META[v]?.color || 'default'}>{STATUS_META[v]?.text || v}</Tag>,
    },
    { title: '排序', dataIndex: 'sort', width: 70 },
    { title: '喜欢/浏览', width: 100, render: (_: any, r: ShowcaseItem) => `${r.likes} / ${r.views}` },
    {
      title: '创建时间', dataIndex: 'created_at', width: 150,
      render: (v: string) => (v ? new Date(v).toLocaleString('zh-CN', { hour12: false }) : '-'),
    },
    {
      title: '操作', width: 180,
      render: (_: any, r: ShowcaseItem) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} aria-label="编辑" onClick={() => openEdit(r)} />
          <Button type="link" size="small" onClick={() => toggleStatus(r)}>
            {r.status === 'online' ? '下线' : '上线'}
          </Button>
          <Popconfirm title="确定删除该作品?" okText="确定" cancelText="取消" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} aria-label="删除" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>作品展管理</Title>
        <Space>
          <Button icon={<PlayCircleOutlined />} onClick={fetch}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增作品</Button>
        </Space>
      </div>
      <Card style={{ borderRadius: 8 }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} pagination={false} scroll={{ x: 1180 }} />
      </Card>

      <Modal
        title={editing ? '编辑作品' : '新增作品'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        width={720}
        okText="确定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="作品标题" rules={[{ required: true, message: '请填写标题' }, { max: 120 }]}>
            <Input placeholder="展示在作品卡上的标题" />
          </Form.Item>
          <Space style={{ width: '100%' }} size={12} align="start">
            <Form.Item name="category" label="分类" rules={[{ required: true, message: '请选择分类' }]} style={{ width: 160 }}>
              <Select options={categories.map((c) => ({ label: c.label, value: c.key }))} placeholder="选择分类" />
            </Form.Item>
            <Form.Item name="status" label="状态" initialValue="online" style={{ width: 140 }}>
              <Select options={[
                { label: '展示中', value: 'online' },
                { label: '已下线', value: 'offline' },
                { label: '待审核', value: 'pending' },
              ]} />
            </Form.Item>
            <Form.Item name="sort" label="排序（小在前）" initialValue={0} style={{ width: 140 }}>
              <InputNumber style={{ width: '100%' }} min={-100000} max={100000} />
            </Form.Item>
            <Form.Item name="duration" label="时长（秒）" style={{ width: 140 }}>
              <InputNumber style={{ width: '100%' }} min={0} max={86400} placeholder="留空自动读" />
            </Form.Item>
          </Space>
          <Form.Item label="视频地址" required>
            <Space style={{ width: '100%' }} size={8}>
              <Form.Item name="video_url" rules={[{ required: true, message: '请填写或上传视频' }]} noStyle>
                <Input style={{ width: 380 }} placeholder="/static/xxx.mp4 或 https://..." />
              </Form.Item>
              <Upload accept="video/*" showUploadList={false} beforeUpload={(f) => { doUpload(f, 'video_url'); return false; }}>
                <Button icon={<UploadOutlined />}>上传视频</Button>
              </Upload>
              <Button icon={<CameraOutlined />} onClick={grabCover}>抽帧封面</Button>
            </Space>
          </Form.Item>
          <Form.Item label="封面地址">
            <Space style={{ width: '100%' }} size={8}>
              <Form.Item name="cover_url" noStyle>
                <Input style={{ width: 380 }} placeholder="留空自动抽帧 / 无封面走占位" />
              </Form.Item>
              <Upload accept="image/*" showUploadList={false} beforeUpload={(f) => { doUpload(f, 'cover_url'); return false; }}>
                <Button icon={<UploadOutlined />}>上传封面</Button>
              </Upload>
            </Space>
          </Form.Item>
          <Space style={{ width: '100%' }} size={12} align="start">
            <Form.Item name="author_name" label="作者昵称" style={{ width: 160 }}>
              <Input placeholder="可留空" maxLength={50} />
            </Form.Item>
            <Form.Item name="source_type" label="来源" initialValue="upload" style={{ width: 140 }}>
              <Select options={SOURCE_OPTIONS} />
            </Form.Item>
            <Form.Item name="likes" label="喜欢数" initialValue={0} style={{ width: 120 }}>
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
            <Form.Item name="views" label="浏览数" initialValue={0} style={{ width: 120 }}>
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
