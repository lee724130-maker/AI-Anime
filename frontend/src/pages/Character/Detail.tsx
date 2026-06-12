import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Form, Input, Typography, message, Spin, Avatar } from 'antd';
import { SaveOutlined, ArrowLeftOutlined, UserOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title } = Typography;
const { TextArea } = Input;

export default function CharacterDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [character, setCharacter] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/api/character/${id}`);
        setCharacter(data);
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
      await api.put(`/api/character/${id}`, values);
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
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/character')}>返回</Button>
        <Title level={2} style={{ margin: 0 }}>角色详情</Title>
      </div>
      <Card>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Avatar size={80} icon={<UserOutlined />} src={character?.avatar_url} />
        </div>
        <Form form={form} onFinish={onFinish} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={6} />
          </Form.Item>
          <Form.Item name="avatar_url" label="头像URL">
            <Input placeholder="角色头像地址" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存修改</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
