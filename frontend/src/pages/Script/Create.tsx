import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Card, Form, Input, Typography, message, Space, Tag, Select, Row, Col, Tooltip,
} from 'antd';
import {
  SaveOutlined, ArrowLeftOutlined, VideoCameraOutlined,
  ThunderboltOutlined, ScissorOutlined, NodeIndexOutlined,
  PlayCircleOutlined,
  SyncOutlined, ReloadOutlined,
} from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;
const { TextArea } = Input;
const API_BASE = 'http://localhost:3000';
const getUrl = (p: string | null) => p ? (p.startsWith('http') ? p : API_BASE + p) : '';

const STATUS_META: Record<string, { color: string; label: string }> = {
  pending:    { color: 'default',    label: '待生成' },
  processing: { color: 'processing', label: '生成中' },
  completed:  { color: 'success',    label: '已完成' },
  failed:     { color: 'error',      label: '失败' },
};

export default function ScriptCreatePage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // Created script state
  const [scriptId, setScriptId] = useState<number | null>(null);
  const [script, setScript] = useState<any>(null);

  // Scene operations
  const [genLoading, setGenLoading] = useState(false);
  const [stitchLoading, setStitchLoading] = useState(false);
  const [stitchResult, setStitchResult] = useState<any>(null);
  const [resolution, setResolution] = useState('720p');
  const [ratio, setRatio] = useState('9:16');
  const [style, setStyle] = useState('anime');
  const [characters, setCharacters] = useState<any[]>([]);
  const [charOptions, setCharOptions] = useState<any[]>([]);

  const fetchScript = useCallback(async () => {
    if (!scriptId) return;
    try {
      const { data } = await api.get(`/api/script/${scriptId}`);
      setScript(data);
    } catch { message.error('加载失败'); }
  }, [scriptId]);

  useEffect(() => {
    (async () => {
      try {
        const { data: chars } = await api.get('/api/character/list');
        setCharOptions(chars || []);
      } catch {}
    })();
  }, []);

  // Poll scenes
  useEffect(() => {
    if (!script?.scenes || !Array.isArray(script.scenes)) return;
    const hasActive = script.scenes.some((s: any) => s.status === 'processing' || s.status === 'pending');
    if (!hasActive) return;
    const t = setInterval(fetchScript, 5000);
    return () => clearInterval(t);
  }, [script, fetchScript]);

  const onFinish = async (values: { title: string; content: string }) => {
    setSaving(true);
    try {
      const { data } = await api.post('/api/script', values);
      setScriptId(data.id);
      setScript(data);
      message.success('剧本创建成功');
    } catch {
      message.error('创建失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSplit = async () => {
    if (!scriptId) return;
    try {
      const { data } = await api.post(`/api/script/${scriptId}/split`);
      setScript((prev: any) => ({ ...prev, scenes: data }));
      message.success(`已拆分为 ${data.length} 个场景`);
    } catch (err: any) {
      message.error(err.response?.data?.message || '拆分失败');
    }
  };

  const handleSceneUpdate = async (index: number, field: string, value: any) => {
    if (!scriptId) return;
    const copy = { ...script };
    copy.scenes[index][field] = value;
    setScript(copy);
    try {
      await api.put(`/api/script/${scriptId}/scene/${index}`, { [field]: value });
    } catch { /* ignore */ }
  };

  const handleGenerateAll = async () => {
    if (!scriptId) return;
    setGenLoading(true);
    try {
      const { data } = await api.post(`/api/script/${scriptId}/generate-all`, {
        resolution, ratio, style,
        characters: characters.map((cid: number) => {
          const ch = charOptions.find((c: any) => c.id === cid);
          return ch ? { character_id: ch.id, character_name: ch.name, character_desc: ch.description } : { character_id: cid };
        }),
      });
      message.success(`已提交 ${data.total} 个场景`);
      fetchScript();
    } catch (err: any) {
      message.error(err.response?.data?.message || '生成失败');
    } finally {
      setGenLoading(false);
    }
  };

  const handleStitchAll = async () => {
    if (!scriptId) return;
    setStitchLoading(true);
    setStitchResult(null);
    try {
      const { data } = await api.post(`/api/script/${scriptId}/stitch-all`);
      setStitchResult(data);
      message.success('拼接完成');
      fetchScript();
    } catch (err: any) {
      message.error(err.response?.data?.message || '拼接失败');
    } finally {
      setStitchLoading(false);
    }
  };

  const scenes: any[] = script?.scenes || [];
  const completedCount = scenes.filter((s: any) => s.status === 'completed').length;
  const hasActive = scenes.some((s: any) => s.status === 'processing' || s.status === 'pending');

  // Before creation — show form
  if (!scriptId) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <Title level={2} style={{ margin: 0 }}>新建剧本</Title>
        </div>
        <Card>
          <Form form={form} onFinish={onFinish} layout="vertical">
            <Form.Item name="title" label="剧本标题">
              <Input placeholder="输入剧本标题" />
            </Form.Item>
            <Form.Item name="content" label="剧本内容" rules={[{ required: true, message: '请输入剧本内容' }]}>
              <TextArea rows={12} placeholder="在此输入或粘贴剧本内容，场景之间用 --- 或空行分隔..." />
            </Form.Item>
            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存并创建</Button>
                <Button onClick={() => navigate('/script')}>返回</Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      </div>
    );
  }

  // After creation — show scene panel
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/script')}>返回</Button>
        <Title level={2} style={{ margin: 0, flex: 1 }}>{script?.title || '未命名剧本'}</Title>
        {hasActive && <Tag icon={<SyncOutlined spin />} color="processing">生成中...</Tag>}
      </div>

      {/* Script Content Editor */}
      <Card style={{ marginBottom: 20 }}>
        <Form form={form} onFinish={onFinish} layout="vertical">
          <Form.Item name="title" label="标题">
            <Input placeholder="剧本标题" />
          </Form.Item>
          <Form.Item name="content" label="剧本内容">
            <TextArea rows={6} placeholder="输入完整剧本，场景之间用 --- 或空行分隔" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存修改</Button>
              <Button icon={<ScissorOutlined />} onClick={handleSplit}>拆分场景</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {/* Scene Panel */}
      <Card
        title={
          <Space>
            <NodeIndexOutlined style={{ color: '#7c3aed' }} />
            <Text strong>场景列表</Text>
            <Tag color="purple">{scenes.length} 个场景</Tag>
            {completedCount > 0 && <Tag color="success">{completedCount} 已完成</Tag>}
          </Space>
        }
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchScript} size="small">刷新</Button>
            <Button icon={<VideoCameraOutlined />} type="primary"
              disabled={scenes.length === 0} onClick={handleGenerateAll} loading={genLoading}>
              生成全部
            </Button>
            <Button icon={<ThunderboltOutlined />}
              disabled={completedCount < 2} loading={stitchLoading} onClick={handleStitchAll}>
              拼接全部
            </Button>
          </Space>
        }
        style={{ borderRadius: 12, marginBottom: 20 }}
      >
        {scenes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#bbb' }}>
            请先在剧本内容中编写剧本，点击"拆分场景"
          </div>
        ) : (
          scenes.map((scene: any, i: number) => (
            <div key={i} style={{
              padding: 16, marginBottom: 12,
              border: `1px solid ${scene.status === 'completed' ? '#b7eb8f' : scene.status === 'failed' ? '#ffa39e' : '#e8e0f0'}`,
              borderRadius: 12,
              background: scene.status === 'completed' ? '#f6fff6' : scene.status === 'failed' ? '#fff6f6' : '#fff',
            }}>
              <Row gutter={16} align="top">
                <Col xs={24} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 26, height: 26, borderRadius: 8,
                      background: scene.status === 'completed' ? '#52c41a' : scene.status === 'failed' ? '#ff4d4f' : scene.status === 'processing' ? '#1890ff' : '#7c3aed',
                      color: '#fff', fontSize: 13, fontWeight: 600,
                    }}>{i + 1}</span>
                    <Text strong>场景 {i + 1}</Text>
                    <Tag color={STATUS_META[scene.status]?.color}>{STATUS_META[scene.status]?.label}</Tag>
                    <div style={{ flex: 1 }} />
                    <Space size={4}>
                      <Text type="secondary" style={{ fontSize: 12 }}>时长</Text>
                      <Select size="small" value={scene.duration || 5}
                        onChange={(v) => handleSceneUpdate(i, 'duration', v)}
                        style={{ width: 80 }}
                        options={[5, 10, 15].map(d => ({ value: d, label: `${d}秒` }))}
                      />
                      {scene.task_id && (
                        <Tooltip title="查看视频">
                          <Button size="small" type="text" icon={<PlayCircleOutlined />}
                            onClick={() => navigate(`/video/${scene.task_id}`)} />
                        </Tooltip>
                      )}
                    </Space>
                  </div>
                </Col>
                <Col xs={24} md={scene.video_url ? 14 : 24}>
                  <TextArea size="small" rows={3}
                    value={scene.prompt} placeholder="场景 prompt"
                    onChange={(e) => handleSceneUpdate(i, 'prompt', e.target.value)}
                    style={{ fontSize: 13, lineHeight: 1.7, borderRadius: 8 }}
                  />
                </Col>
                {scene.video_url && (
                  <Col xs={24} md={10}>
                    <video controls width="100%" style={{ borderRadius: 8, maxHeight: 120 }}
                      src={getUrl(scene.video_url)}
                      poster={scene.cover_url ? getUrl(scene.cover_url) : undefined}
                    >
                      <source src={getUrl(scene.video_url)} type="video/mp4" />
                    </video>
                  </Col>
                )}
                {scene.error_msg && (
                  <Col xs={24}>
                    <Text type="danger" style={{ fontSize: 12 }}>{scene.error_msg}</Text>
                  </Col>
                )}
              </Row>
            </div>
          ))
        )}
      </Card>

      {/* Generate Options */}
      {scenes.length > 0 && (
        <Card title="生成设置" size="small" style={{ borderRadius: 12, marginBottom: 20 }}>
          <Row gutter={[16, 12]} align="middle">
            <Col xs={8} sm={4}><Text type="secondary" style={{ fontSize: 12 }}>分辨率</Text></Col>
            <Col xs={16} sm={8}>
              <Select value={resolution} onChange={setResolution} style={{ width: '100%' }}
                options={[{ value: '480p', label: '480p' }, { value: '720p', label: '720p' }, { value: '1080p', label: '1080p' }]} />
            </Col>
            <Col xs={8} sm={4}><Text type="secondary" style={{ fontSize: 12 }}>宽高比</Text></Col>
            <Col xs={16} sm={8}>
              <Select value={ratio} onChange={setRatio} style={{ width: '100%' }}
                options={[
                  { label: '9:16', value: '9:16' },
                  { label: '16:9', value: '16:9' },
                  { label: '1:1', value: '1:1' },
                  { label: '4:3', value: '4:3' },
                  { label: '3:4', value: '3:4' },
                  { label: '21:9', value: '21:9' },
                ]} />
            </Col>
            <Col xs={8} sm={4}><Text type="secondary" style={{ fontSize: 12 }}>风格</Text></Col>
            <Col xs={16} sm={8}>
              <Select value={style} onChange={setStyle} style={{ width: '100%' }}
                options={[{ value: 'anime', label: '动漫' }, { value: 'realistic', label: '真人' }]} />
            </Col>
            <Col xs={8} sm={4}><Text type="secondary" style={{ fontSize: 12 }}>角色</Text></Col>
            <Col xs={16} sm={8}>
              <Select mode="multiple" value={characters} onChange={setCharacters} style={{ width: '100%' }}
                placeholder="选择角色" options={charOptions.map((c: any) => ({ value: c.id, label: c.name }))} />
            </Col>
            <Col xs={24}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                每个场景会带上前一个场景的剧情提要作为上下文，保证连贯性
              </Text>
            </Col>
          </Row>
        </Card>
      )}

      {/* Stitch result */}
      {stitchResult && (
        <Card title="拼接结果" style={{ borderRadius: 12, border: '1px solid #52c41a' }}>
          <video controls width="100%" style={{ maxHeight: 400, borderRadius: 8 }}
            src={getUrl(stitchResult.video_url)}>
            <source src={getUrl(stitchResult.video_url)} type="video/mp4" />
          </video>
        </Card>
      )}
    </div>
  );
}
