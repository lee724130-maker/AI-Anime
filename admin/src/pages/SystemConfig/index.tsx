import { useEffect, useState } from 'react';
import { Card, Form, Input, InputNumber, Select, Button, Typography, Space, message, Spin } from 'antd';
import { SettingOutlined, SaveOutlined, ReloadOutlined, CloudServerOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text, Paragraph } = Typography;

const PROVIDER_OPTIONS = {
  image: [
    { value: 'auto', label: '自动（按优先级依次尝试）' },
    { value: 'volcengine', label: '火山引擎 Seedream' },
    { value: 'aliyun', label: '阿里云通义万相' },
    { value: 'openai', label: 'OpenAI DALL·E' },
  ],
  video: [
    { value: 'auto', label: '自动（按优先级依次尝试）' },
    { value: 'volcengine', label: '火山引擎 Seedance' },
    { value: 'aliyun', label: '阿里云通义万相视频' },
    { value: 'runway', label: 'Runway Gen-3' },
  ],
  llm: [
    { value: 'auto', label: '自动（OpenAI → DeepSeek）' },
    { value: 'aliyun', label: '阿里云 Qwen' },
    { value: 'volcengine', label: '火山引擎 Doubao' },
    { value: 'openai', label: 'OpenAI GPT-4o' },
    { value: 'deepseek', label: 'DeepSeek' },
  ],
};

export default function SystemConfigPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/admin/system/config');
      form.setFieldsValue({
        site_name: data.site_name || 'AI 动漫短剧',
        site_notice: data.site_notice || '',
        daily_generation_limit: Number(data.daily_generation_limit) || 50,
        credit_cost_480p: Number(data.credit_cost_480p) || 5,
        credit_cost_720p: Number(data.credit_cost_720p) || 10,
        credit_cost_1080p: Number(data.credit_cost_1080p) || 20,
        max_retry_count: Number(data.max_retry_count) || 3,
        image_provider: data.image_provider || 'auto',
        video_provider: data.video_provider || 'auto',
        llm_provider: data.llm_provider || 'auto',
      });
    } catch { message.error('获取配置失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchConfig(); }, []);

  const handleSave = async (values: any) => {
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      Object.entries(values).forEach(([k, v]) => { payload[k] = String(v ?? ''); });
      await api.put('/api/admin/system/config', payload);
      message.success('配置已保存');
    } catch { message.error('保存失败'); }
    finally { setSaving(false); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3}><SettingOutlined style={{ marginRight: 8, color: '#722ed1' }} />系统配置</Title>
        <Text type="secondary">全局参数管理与 AI 供应商切换</Text>
      </div>

      <Form form={form} onFinish={handleSave} layout="vertical" style={{ maxWidth: 700 }}>

        <Card title="🌐 站点设置" style={{ marginBottom: 20, borderRadius: 12 }}>
          <Form.Item name="site_name" label="站点名称">
            <Input placeholder="AI 动漫短剧" />
          </Form.Item>
          <Form.Item name="site_notice" label="站点公告">
            <Input.TextArea rows={2} placeholder="显示在首页的公告内容" />
          </Form.Item>
        </Card>

        <Card title="☁️ AI 供应商切换" style={{ marginBottom: 20, borderRadius: 12 }}
          extra={<CloudServerOutlined style={{ fontSize: 20, color: '#722ed1' }} />}>
          <Paragraph type="secondary" style={{ marginBottom: 16 }}>
            选择使用的 AI 服务供应商，设置后即刻生效。需先在「API 密钥配置」中填写对应密钥。
          </Paragraph>
          <Form.Item name="image_provider" label="图片生成">
            <Select options={PROVIDER_OPTIONS.image} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="video_provider" label="视频生成">
            <Select options={PROVIDER_OPTIONS.video} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="llm_provider" label="文本对话 (LLM)">
            <Select options={PROVIDER_OPTIONS.llm} style={{ width: '100%' }} />
          </Form.Item>
        </Card>

        <Card title="💰 算力定价" style={{ marginBottom: 20, borderRadius: 12 }}>
          <Paragraph type="secondary" style={{ marginBottom: 16 }}>各分辨率视频生成消耗的算力数量</Paragraph>
          <Form.Item name="credit_cost_480p" label="480p 消耗算力">
            <InputNumber min={1} max={1000} style={{ width: '100%' }} addonAfter="算力/次" />
          </Form.Item>
          <Form.Item name="credit_cost_720p" label="720p 消耗算力">
            <InputNumber min={1} max={1000} style={{ width: '100%' }} addonAfter="算力/次" />
          </Form.Item>
          <Form.Item name="credit_cost_1080p" label="1080p 消耗算力">
            <InputNumber min={1} max={1000} style={{ width: '100%' }} addonAfter="算力/次" />
          </Form.Item>
        </Card>

        <Card title="🛡️ 限制策略" style={{ marginBottom: 20, borderRadius: 12 }}>
          <Form.Item name="daily_generation_limit" label="每用户每日生成上限">
            <InputNumber min={0} max={9999} style={{ width: '100%' }} addonAfter="次" />
          </Form.Item>
          <Form.Item name="max_retry_count" label="视频生成最大重试次数">
            <InputNumber min={0} max={10} style={{ width: '100%' }} addonAfter="次" />
          </Form.Item>
        </Card>

        <Space>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving} size="large"
            style={{ background: '#001529', borderColor: '#001529', borderRadius: 8 }}>
            保存全部配置
          </Button>
          <Button icon={<ReloadOutlined />} onClick={fetchConfig} size="large">重置</Button>
        </Space>
      </Form>
    </div>
  );
}
