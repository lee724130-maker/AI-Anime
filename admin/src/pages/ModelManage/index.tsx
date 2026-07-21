import { useEffect, useState } from 'react';
import { Table, Button, Card, Typography, Tag, Space, Modal, Form, Input, Select, InputNumber, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;

const CAPABILITIES = ['video', 'image', 'text', 'audio', 'avatar'];
const PROVIDERS = ['volcengine', 'aliyun', 'openai', 'deepseek', 'runway', 'heygen', 'zhipu'];
const UNITS = ['task', 'second', 'image'];

interface ModelItem {
  id: number;
  provider: string;
  capability: string;
  model_id: string;
  model_name: string;
  priority: number;
  status: string;
  max_width: number | null;
  max_height: number | null;
  min_duration: number | null;
  max_duration: number | null;
  supported_ratios: string | null;
  supported_resolutions: string | null;
  price_per_unit: number;
  unit: string;
}

export default function ModelManagePage() {
  const [data, setData] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ModelItem | null>(null);
  const [form] = Form.useForm();

  const fetch = async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get('/api/admin/models');
      setData(res.items || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (item: ModelItem) => {
    setEditing(item);
    form.setFieldsValue({
      ...item,
      supported_ratios: item.supported_ratios ? JSON.parse(item.supported_ratios).join(', ') : '',
      supported_resolutions: item.supported_resolutions ? JSON.parse(item.supported_resolutions).join(', ') : '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      supported_ratios: values.supported_ratios ? JSON.stringify(values.supported_ratios.split(',').map((s: string) => s.trim())) : null,
      supported_resolutions: values.supported_resolutions ? JSON.stringify(values.supported_resolutions.split(',').map((s: string) => s.trim())) : null,
    };
    if (editing) {
      await api.put(`/api/admin/models/${editing.id}`, payload);
    } else {
      await api.post('/api/admin/models', payload);
    }
    message.success(editing ? '已更新' : '已创建');
    setModalOpen(false);
    fetch();
  };

  const handleDelete = async (id: number) => {
    await api.delete(`/api/admin/models/${id}`);
    message.success('已删除');
    fetch();
  };

  const columns = [
    { title: '供应商', dataIndex: 'provider', width: 100, render: (v: string) => <Tag>{v}</Tag> },
    { title: '能力', dataIndex: 'capability', width: 80, render: (v: string) => <Tag color="blue">{v}</Tag> },
    { title: '模型 ID', dataIndex: 'model_id', width: 180, ellipsis: true },
    { title: '模型名称', dataIndex: 'model_name', width: 160 },
    { title: '优先级', dataIndex: 'priority', width: 70 },
    { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => (
      <Tag color={v === 'active' ? 'green' : v === 'depleted' ? 'orange' : 'default'}>{v}</Tag>
    )},
    { title: '单价', dataIndex: 'price_per_unit', width: 80, render: (v: number, r: ModelItem) => `${v} / ${r.unit}` },
    {
      title: '操作', width: 120,
      render: (_: any, r: ModelItem) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="确定删除?" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>模型配置管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增模型</Button>
      </div>
      <Card style={{ borderRadius: 8 }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} pagination={false} scroll={{ x: 900 }} />
      </Card>

      <Modal title={editing ? '编辑模型' : '新增模型'} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)} width={600}>
        <Form form={form} layout="vertical">
          <Space style={{ width: '100%' }} size={12}>
            <Form.Item name="provider" label="供应商" rules={[{ required: true }]} style={{ width: 140 }}>
              <Select options={PROVIDERS.map((p) => ({ label: p, value: p }))} />
            </Form.Item>
            <Form.Item name="capability" label="能力" rules={[{ required: true }]} style={{ width: 120 }}>
              <Select options={CAPABILITIES.map((c) => ({ label: c, value: c }))} />
            </Form.Item>
            <Form.Item name="priority" label="优先级" initialValue={1} style={{ width: 100 }}>
              <InputNumber min={1} max={99} />
            </Form.Item>
            <Form.Item name="status" label="状态" initialValue="active" style={{ width: 120 }}>
              <Select options={[
                { label: '启用', value: 'active' },
                { label: '禁用', value: 'inactive' },
                { label: '额度耗尽', value: 'depleted' },
              ]} />
            </Form.Item>
          </Space>
          <Form.Item name="model_id" label="模型 ID" rules={[{ required: true }]}>
            <Input placeholder="例如: seedance-2-0" />
          </Form.Item>
          <Form.Item name="model_name" label="模型名称" rules={[{ required: true }]}>
            <Input placeholder="例如: Seedance 2.0" />
          </Form.Item>
          <Space style={{ width: '100%' }} size={12}>
            <Form.Item name="max_width" label="最大宽度"><InputNumber min={0} style={{ width: 120 }} /></Form.Item>
            <Form.Item name="max_height" label="最大高度"><InputNumber min={0} style={{ width: 120 }} /></Form.Item>
            <Form.Item name="min_duration" label="最短时长"><InputNumber min={0} style={{ width: 100 }} /></Form.Item>
            <Form.Item name="max_duration" label="最长时间"><InputNumber min={0} style={{ width: 100 }} /></Form.Item>
          </Space>
          <Form.Item name="supported_ratios" label="支持比例（逗号分隔）">
            <Input placeholder="9:16, 16:9, 1:1" />
          </Form.Item>
          <Form.Item name="supported_resolutions" label="支持分辨率（逗号分隔）">
            <Input placeholder="480p, 720p, 1080p" />
          </Form.Item>
          <Space style={{ width: '100%' }} size={12}>
            <Form.Item name="price_per_unit" label="单价（算力）" initialValue={0}>
              <InputNumber min={0} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="unit" label="计价单位" initialValue="task">
              <Select options={UNITS.map((u) => ({ label: u, value: u }))} style={{ width: 120 }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
