import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title } = Typography;
const { TextArea } = Input;

export default function CharacterCreatePage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values: { name: string; description?: string; avatar_url?: string }) => {
    setLoading(true);
    try {
      const { data } = await api.post('/api/character', values);
      message.success('角色创建成功');
      navigate(`/character/${data.id}`);
    } catch {
      message.error('创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <Title level={2}>创建角色</Title>
      <Card>
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item name="name" label="角色名称" rules={[{ required: true, message: '请输入角色名称' }]}>
            <Input placeholder="例如：18岁黑长直古风少女" />
          </Form.Item>
          <Form.Item name="description" label="角色描述">
            <TextArea rows={4} placeholder="描述角色的外貌、性格特点等..." />
          </Form.Item>
          <Form.Item name="avatar_url" label="头像URL">
            <Input placeholder="可选，输入角色头像图片地址" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>保存</Button>
            <Button style={{ marginLeft: 12 }} onClick={() => navigate('/character')}>返回</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
