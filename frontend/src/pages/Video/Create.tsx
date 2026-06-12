import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Form, Select, Typography, message, Alert, Space, Segmented } from 'antd';
import { SendOutlined, ThunderboltOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title } = Typography;
const DEFAULT_COSTS: Record<string, number> = { '480p': 5, '720p': 10, '1080p': 20 };

function estimateCredits(resolution = '720p', duration = 5) {
  return (DEFAULT_COSTS[resolution] || DEFAULT_COSTS['720p']) * Math.max(1, Math.ceil(duration / 5));
}

export default function VideoCreatePage() {
  const [loading, setLoading] = useState(false);
  const [scripts, setScripts] = useState<any[]>([]);
  const [characters, setCharacters] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      api.get('/api/script/list'),
      api.get('/api/character/list'),
    ]).then(([scriptRes, charRes]) => {
      setScripts(scriptRes.data || []);
      setCharacters(charRes.data || []);
    }).catch(() => {
      message.error('获取数据失败');
    });
  }, []);

  const onFinish = async (values: { script_id?: number; character_id?: number; resolution?: string; duration?: number }) => {
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

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 24 }}>
      <Title level={2}>
        <VideoCameraIcon /> 新建视频生成任务
      </Title>

      <Alert
        message="视频生成流程"
        description={
          <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            <li>选择一个已完成的剧本</li>
            <li>选择要使用的角色（可选）</li>
            <li>提交任务后，系统将异步处理视频生成</li>
            <li>您可以在视频列表页实时查看生成进度</li>
          </ol>
        }
        type="info"
        showIcon
        style={{ marginBottom: 24, borderRadius: 12 }}
      />

      <Card style={{ borderRadius: 12 }}>
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item name="resolution" label="分辨率" initialValue="720p">
            <Segmented
              block
              options={[
                { label: '480p', value: '480p' },
                { label: '720p', value: '720p' },
                { label: '1080p', value: '1080p' },
              ]}
            />
          </Form.Item>

          <Form.Item name="duration" label="时长" initialValue={5}>
            <Segmented
              block
              options={[
                { label: '5 秒', value: 5 },
                { label: '10 秒', value: 10 },
                { label: '15 秒', value: 15 },
              ]}
            />
          </Form.Item>

          <Form.Item name="style" label="风格" initialValue="anime">
            <Segmented
              block
              options={[
                { label: '🎨 动漫', value: 'anime' },
                { label: '📷 真人', value: 'realistic' },
              ]}
            />
          </Form.Item>

          <Form.Item name="model" label="模型（可选）">
            <Select
              allowClear placeholder="自动（按优先级）"
              size="large"
              options={[
                { value: 'doubao-seedance-1-5-pro-251215', label: '火山引擎 Seedance 1.5 Pro' },
                { value: 'wan2.7-t2v-2026-04-25', label: '阿里云 通义万相 2.7 T2V' },
                { value: 'wan2.7-i2v-2026-04-25', label: '阿里云 通义万相 2.7 I2V' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="script_id"
            label="选择剧本"
            rules={[{ required: true, message: '请选择剧本' }]}
          >
            <Select
              placeholder="选择要生成视频的剧本"
              size="large"
              showSearch
              optionFilterProp="label"
              options={scripts.map((s: any) => ({
                value: s.id,
                label: s.title || '未命名剧本',
              }))}
              notFoundContent="暂无剧本，请先去剧本模块创建"
            />
          </Form.Item>

          <Form.Item
            name="character_id"
            label="选择角色（可选）"
          >
            <Select
              placeholder="选择要使用的角色"
              size="large"
              allowClear
              showSearch
              optionFilterProp="label"
              options={characters.map((c: any) => ({
                value: c.id,
                label: c.name,
              }))}
              notFoundContent="暂无角色，请先去角色模块创建"
            />
          </Form.Item>

          <Form.Item shouldUpdate noStyle>
            {({ getFieldValue }) => (
              <Alert
                type="warning"
                showIcon
                icon={<ThunderboltOutlined />}
                message={`预计消耗 ${estimateCredits(getFieldValue('resolution'), getFieldValue('duration'))} 算力`}
                description="提交前会检查余额，视频生成成功后才会实际扣费。"
                style={{ marginBottom: 20 }}
              />
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
      display: 'inline-block',
      width: 40, height: 40,
      borderRadius: 10,
      background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
      textAlign: 'center', lineHeight: '40px', marginRight: 8,
    }}>
      <span style={{ fontSize: 20 }}>🎬</span>
    </span>
  );
}
