import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Form, Input, InputNumber, Select, Button, message, Space } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;
const { TextArea } = Input;

const GENRES = ['热血', '恋爱', '悬疑', '搞笑', '科幻', '奇幻', '古装', '都市'];

export default function DramaCreatePage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const { data } = await api.post('/api/drama', values);
      message.success('短剧项目已创建');
      navigate(`/drama/${data.id}`);
    } catch {
      message.error('创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate('/drama')} style={{ padding: 0, marginBottom: 16 }}>
        返回短剧列表
      </Button>
      <Title level={3} style={{ marginBottom: 4 }}>创建短剧项目</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>填写基本信息和大纲，AI 将自动分析并生成短剧结构</Text>

      <Form form={form} layout="vertical" onFinish={handleSubmit}
        initialValues={{ episodes: 1 }}
        style={{ maxWidth: 700 }}>
        <Form.Item name="title" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
          <Input placeholder="例如：我的第一部 AI 短剧" size="large" />
        </Form.Item>
        <Form.Item name="outline" label="剧本大纲" rules={[{ required: true, message: '请输入剧本大纲' }]}>
          <TextArea rows={6} placeholder="输入剧本大纲，描述故事背景、主要人物和情节走向。AI 将自动分析并生成分集和片段。" />
        </Form.Item>
        <Space style={{ width: '100%' }} size={12}>
          <Form.Item name="genre" label="题材">
            <Select placeholder="选择题材" allowClear style={{ width: 140 }}>
              {GENRES.map((g) => <Select.Option key={g} value={g}>{g}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="episodes" label="集数">
            <InputNumber min={1} max={100} style={{ width: 80 }} />
          </Form.Item>
        </Space>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}
            style={{ background: '#7c3aed', borderColor: '#7c3aed', borderRadius: 10 }} size="large">
            创建项目
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
