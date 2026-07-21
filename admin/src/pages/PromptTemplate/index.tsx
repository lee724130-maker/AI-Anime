import { useEffect, useState } from 'react';
import { Table, Button, Card, Typography, Tag, Space, Modal, Form, Input, Select, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title } = Typography;

const CAPABILITIES = ['video', 'image', 'text', 'audio', 'avatar'];
const PROVIDERS = ['volcengine', 'aliyun', 'openai', 'deepseek', 'runway', 'heygen', 'zhipu'];

interface Template {
  id: number;
  name: string;
  provider: string | null;
  capability: string | null;
  template: string;
  variables: string | null;
  description: string | null;
  status: string;
}

export default function PromptTemplatePage() {
  const [data, setData] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form] = Form.useForm();

  const fetch = async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get('/api/admin/prompt-templates');
      setData(Array.isArray(res) ? res : res.items || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (item: Template) => {
    setEditing(item);
    form.setFieldsValue(item);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    if (editing) {
      await api.put(`/api/admin/prompt-templates/${editing.id}`, values);
    } else {
      await api.post('/api/admin/prompt-templates', values);
    }
    message.success(editing ? '已更新' : '已创建');
    setModalOpen(false);
    fetch();
  };

  const handleDelete = async (id: number) => {
    await api.delete(`/api/admin/prompt-templates/${id}`);
    message.success('已删除');
    fetch();
  };

  const columns = [
    { title: '名称', dataIndex: 'name', width: 140 },
    { title: '供应商', dataIndex: 'provider', width: 100, render: (v: string | null) => v ? <Tag>{v}</Tag> : <Tag color="default">通用</Tag> },
    { title: '能力', dataIndex: 'capability', width: 80, render: (v: string | null) => v ? <Tag color="blue">{v}</Tag> : '-' },
    { title: '模板预览', dataIndex: 'template', ellipsis: true, width: 300 },
    { title: '变量', dataIndex: 'variables', width: 120, render: (v: string | null) => v || '-' },
    { title: '状态', dataIndex: 'status', width: 70, render: (v: string) => (
      <Tag color={v === 'active' ? 'green' : 'default'}>{v}</Tag>
    )},
    {
      title: '操作', width: 100,
      render: (_: any, r: Template) => (
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
        <Title level={3} style={{ margin: 0 }}>提示词模板管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增模板</Button>
      </div>
      <Card style={{ borderRadius: 8 }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} pagination={false} scroll={{ x: 900 }} />
      </Card>

      <Modal title={editing ? '编辑模板' : '新增模板'} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)} width={700}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="模板名称" rules={[{ required: true }]}>
            <Input placeholder="例如: 剧本分析模板" />
          </Form.Item>
          <Space style={{ width: '100%' }} size={12}>
            <Form.Item name="provider" label="供应商" style={{ width: 140 }}>
              <Select allowClear placeholder="通用" options={PROVIDERS.map((p) => ({ label: p, value: p }))} />
            </Form.Item>
            <Form.Item name="capability" label="能力" style={{ width: 120 }}>
              <Select allowClear placeholder="通用" options={CAPABILITIES.map((c) => ({ label: c, value: c }))} />
            </Form.Item>
            <Form.Item name="status" label="状态" initialValue="active" style={{ width: 100 }}>
              <Select options={[{ label: '启用', value: 'active' }, { label: '禁用', value: 'inactive' }]} />
            </Form.Item>
          </Space>
          <Form.Item name="template" label="模板内容" rules={[{ required: true }]}>
            <Input.TextArea rows={6} placeholder="使用 {{变量名}} 表示占位符" />
          </Form.Item>
          <Form.Item name="variables" label="变量列表（逗号分隔）">
            <Input placeholder="title, description, genre" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="模板用途说明" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
