import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Form, Select, Typography, message, Alert, Space } from 'antd';
import { SendOutlined, ThunderboltOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title } = Typography;

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

function estimateCredits(resolution = '720p', duration = 5) {
  const costs: Record<string, number> = { '480p': 5, '720p': 10, '1080p': 20 };
  return (costs[resolution] || 10) * Math.max(1, Math.ceil(duration / 5));
}

export default function VideoCreatePage() {
  const [loading, setLoading] = useState(false);
  const [scripts, setScripts] = useState<any[]>([]);
  const [characters, setCharacters] = useState<any[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelItem | null>(null);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const resolutions = selectedModel?.supported_resolutions
    ? JSON.parse(selectedModel.supported_resolutions)
    : ['480p', '720p', '1080p'];

  const ratios = selectedModel?.supported_ratios
    ? JSON.parse(selectedModel.supported_ratios)
    : ['9:16', '16:9', '1:1', '4:3', '3:4', '21:9'];

  const durationOptions = [];
  const minDur = selectedModel?.min_duration || 5;
  const maxDur = selectedModel?.max_duration || 15;
  for (let d = minDur; d <= maxDur; d += 5) durationOptions.push(d);
  if (!durationOptions.includes(maxDur)) durationOptions.push(maxDur);

  const ratioLabels: Record<string, string> = {
    '9:16': '竖屏', '16:9': '横屏', '1:1': '方屏',
    '4:3': '传统', '3:4': '海报', '21:9': '超宽',
  };

  useEffect(() => {
    Promise.all([
      api.get('/api/script/list'),
      api.get('/api/character/list'),
      api.get('/api/video/defaults'),
      api.get('/api/admin/models', { params: { capability: 'video' } }),
    ]).then(([scriptRes, charRes, defaultsRes, modelRes]) => {
      setScripts(scriptRes.data || []);
      setCharacters(charRes.data || []);
      setModels(modelRes.data || []);
      const d = defaultsRes.data;
      if (d) {
        form.setFieldsValue({
          resolution: d.resolution || '720p',
          ratio: d.ratio || '9:16',
          duration: d.duration || 5,
          style: d.style || 'anime',
          model: d.model || undefined,
        });
        if (d.model) {
          const match = (modelRes.data || []).find((m: ModelItem) => m.model_id === d.model);
          setSelectedModel(match || null);
        }
      }
    }).catch(() => {
      message.error('获取数据失败');
    });
  }, [form]);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const { data } = await api.post('/api/video/generate', values);
      message.success('视频生成任务已创建');
      navigate(`/video/${data.id}`);
    } catch (err: any) {
      message.error(err.response?.data?.message || '创建任务失败');
    } finally {
      setLoading(false);
    }
  };

  const providerLabels: Record<string, string> = {
    volcengine: '火山引擎',
    aliyun: '阿里云',
    openai: 'OpenAI',
    runway: 'Runway',
    deepseek: 'DeepSeek',
  };

  const modelOptions = Object.entries(
    models.reduce((acc: Record<string, ModelItem[]>, m) => {
      const label = providerLabels[m.provider] || m.provider;
      (acc[label] = acc[label] || []).push(m);
      return acc;
    }, {})
  ).map(([provider, items]) => ({
    label: provider,
    options: items.map((m: ModelItem) => ({
      value: m.model_id,
      label: m.model_name,
    })),
  }));

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 24 }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<span>←</span>} onClick={() => navigate(-1)}>返回</Button>
      </Space>
      <Title level={2}>
        <VideoCameraIcon /> 新建视频生成任务
      </Title>

      <Alert
        title="视频生成流程"
        description={
          <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            <li>选择一个已完成的剧本</li>
            <li>选择要使用的角色（可选）</li>
            <li>提交任务后，系统将异步处理视频生成</li>
            <li>您可以在视频列表页实时查看生成进度</li>
          </ol>
        }
        type="info" showIcon
        style={{ marginBottom: 24, borderRadius: 12 }}
      />

      <Card style={{ borderRadius: 12 }}>
        <Form form={form} onFinish={onFinish} layout="vertical">
          <Form.Item name="model" label="模型">
            <Select
              allowClear placeholder="自动（按优先级）"
              size="large"
              options={modelOptions}
              onChange={(value) => {
                const match = models.find((m) => m.model_id === value);
                setSelectedModel(match || null);
                if (match) {
                  const current = form.getFieldsValue();
                  const updates: any = {};
                  const res = match.supported_resolutions ? JSON.parse(match.supported_resolutions) : null;
                  const rat = match.supported_ratios ? JSON.parse(match.supported_ratios) : null;
                  if (res && !res.includes(current.resolution)) updates.resolution = res[0];
                  if (rat && !rat.includes(current.ratio)) updates.ratio = rat[0];
                  const minD = match.min_duration || 5;
                  const maxD = match.max_duration || 15;
                  if (current.duration < minD || current.duration > maxD) updates.duration = minD;
                  if (Object.keys(updates).length) form.setFieldsValue(updates);
                }
              }}
            />
          </Form.Item>

          <Form.Item name="resolution" label="分辨率" initialValue="720p">
            <Select style={{ width: '100%' }}
              options={resolutions.map((r: string) => ({ label: r, value: r }))}
            />
          </Form.Item>

          <Form.Item name="ratio" label="宽高比" initialValue="9:16">
            <Select style={{ width: '100%' }}
              options={ratios.map((r: string) => ({
                label: `${r} ${ratioLabels[r] || ''}`,
                value: r,
              }))}
            />
          </Form.Item>

          <Form.Item name="duration" label="时长（秒）" initialValue={5}>
            <Select style={{ width: '100%' }}
              options={durationOptions.map((d: number) => ({ label: `${d} 秒`, value: d }))}
            />
          </Form.Item>

          <Form.Item name="style" label="风格" initialValue="anime">
            <Select style={{ width: '100%' }}
              options={[
                { label: '🎨 动漫', value: 'anime' },
                { label: '📷 真人', value: 'realistic' },
              ]}
            />
          </Form.Item>

          <Form.Item name="script_id" label="选择剧本"
            rules={[{ required: true, message: '请选择剧本' }]}>
            <Select placeholder="选择要生成视频的剧本" size="large" showSearch optionFilterProp="label"
              options={scripts.map((s: any) => ({ value: s.id, label: s.title || '未命名剧本' }))}
              notFoundContent="暂无剧本，请先去剧本模块创建" />
          </Form.Item>

          <Form.Item name="character_id" label="选择角色（可选）">
            <Select placeholder="选择要使用的角色" size="large" allowClear showSearch optionFilterProp="label"
              options={characters.map((c: any) => ({ value: c.id, label: c.name }))}
              notFoundContent="暂无角色，请先去角色模块创建" />
          </Form.Item>

          <Form.Item shouldUpdate noStyle>
            {({ getFieldValue }) => (
              <Alert type="warning" showIcon icon={<ThunderboltOutlined />}
                title={`预计消耗 ${estimateCredits(getFieldValue('resolution'), getFieldValue('duration'))} 算力`}
                description="提交前会检查余额，视频生成成功后才会实际扣费。"
                style={{ marginBottom: 20 }} />
            )}
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={loading} size="large">
                提交生成任务
              </Button>
              <Button onClick={() => navigate('/video')} size="large">返回列表</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

function VideoCameraIcon() {
  return (
    <span style={{
      display: 'inline-block', width: 40, height: 40, borderRadius: 10,
      background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
      textAlign: 'center', lineHeight: '40px', marginRight: 8,
    }}>
      <span style={{ fontSize: 20 }}>🎬</span>
    </span>
  );
}
