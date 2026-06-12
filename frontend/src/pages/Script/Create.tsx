import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title } = Typography;
const { TextArea } = Input;

export default function ScriptCreatePage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values: { title: string; content: string }) => {
    setLoading(true);
    try {
      const { data } = await api.post('/api/script', values);
      message.success('剧本创建成功');
      navigate(`/script/${data.id}`);
    } catch {
      message.error('创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <Title level={2}>新建剧本</Title>
      <Card>
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item name="title" label="剧本标题">
            <Input placeholder="输入剧本标题" />
          </Form.Item>
          <Form.Item name="content" label="剧本内容" rules={[{ required: true, message: '请输入剧本内容' }]}>
            <TextArea rows={12} placeholder="在此输入或粘贴剧本内容..." />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>保存</Button>
            <Button style={{ marginLeft: 12 }} onClick={() => navigate('/script')}>返回</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
