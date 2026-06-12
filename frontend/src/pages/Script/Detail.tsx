import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Form, Input, Typography, message, Spin } from 'antd';
import { SaveOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title } = Typography;
const { TextArea } = Input;

export default function ScriptDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/api/script/${id}`);
        form.setFieldsValue(data);
      } catch {
        message.error('加载失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, form]);

  const onFinish = async (values: any) => {
    setSaving(true);
    try {
      await api.put(`/api/script/${id}`, values);
      message.success('保存成功');
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spin style={{ display: 'block', marginTop: 100 }} />;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/script')}>返回</Button>
        <Title level={2} style={{ margin: 0 }}>剧本详情</Title>
      </div>
      <Card>
        <Form form={form} onFinish={onFinish} layout="vertical">
          <Form.Item name="title" label="标题">
            <Input placeholder="剧本标题" />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true }]}>
            <TextArea rows={15} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存修改</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
