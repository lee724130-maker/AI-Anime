import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Card, Typography, Input, Select, Space, Divider,
  Tag, message, Row, Col, Segmented, Tooltip,
} from 'antd';
import {
  VideoCameraOutlined, UserOutlined,
  SendOutlined, ArrowLeftOutlined, ClockCircleOutlined, CheckCircleOutlined,
  CloseCircleOutlined, SyncOutlined, PlayCircleOutlined, HistoryOutlined,
  EditOutlined, PlusOutlined, CloseOutlined, ThunderboltOutlined,
  NodeIndexOutlined, ReloadOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import AppHeader from '../../components/AppHeader';

const { Title, Text } = Typography;
const { TextArea } = Input;

const API_BASE = 'http://localhost:3000';
const getUrl = (p: string | null) => p ? (p.startsWith('http') ? p : API_BASE + p) : '';

const STATUS_MAP: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  pending:    { color: 'default',    icon: <ClockCircleOutlined />,       label: '排队' },
  processing: { color: 'processing', icon: <SyncOutlined spin />,         label: '生成中' },
  completed:  { color: 'success',    icon: <CheckCircleOutlined />,       label: '完成' },
  failed:     { color: 'error',      icon: <CloseCircleOutlined />,       label: '失败' },
};
const DEFAULT_COSTS: Record<string, number> = { '480p': 5, '720p': 10, '1080p': 20 };
const estimateCredits = (res: string, seconds: number) =>
  (DEFAULT_COSTS[res] || DEFAULT_COSTS['720p']) * Math.max(1, Math.ceil(seconds / 5));

const ROLE_OPTIONS = [
  { value: 'male_lead', label: '男一号' },
  { value: 'female_lead', label: '女一号' },
  { value: 'male_support', label: '男二' },
  { value: 'female_support', label: '女二' },
  { value: 'backup', label: '备用' },
];
const ROLE_COLORS: Record<string, string> = {
  male_lead: '#ec4899', female_lead: '#7c3aed',
  male_support: '#f59e0b', female_support: '#3b82f6', backup: '#6b7280',
};
const SCENE_STATUS: Record<string, { color: string; label: string }> = {
  pending:    { color: 'default',    label: '待生成' },
  processing: { color: 'processing', label: '生成中' },
  completed:  { color: 'success',    label: '已完成' },
  failed:     { color: 'error',      label: '失败' },
};

interface CharacterSlot {
  role: string;
  character_id?: number;
  character_name?: string;
  character_desc?: string;
}

export default function StudioPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [characters, setCharacters] = useState<any[]>([]);
  const [scripts, setScripts] = useState<any[]>([]);

  const [charSlots, setCharSlots] = useState<CharacterSlot[]>([]);
  const [scriptMode, setScriptMode] = useState<'select' | 'custom'>('select');
  const [scriptId, setScriptId] = useState<number | undefined>();
  const [scriptTitle, setScriptTitle] = useState('');
  const [storyPrompt, setStoryPrompt] = useState('');
  const [resolution, setResolution] = useState('720p');
  const [ratio, setRatio] = useState('9:16');
  const [duration, setDuration] = useState(5);
  const [style, setStyle] = useState('anime');
  const [modelName, setModelName] = useState('');

  const [scriptScenes, setScriptScenes] = useState<any[]>([]);
  const [genAllLoading, setGenAllLoading] = useState(false);
  const [stitchLoading, setStitchLoading] = useState(false);
  const [stitchResult, setStitchResult] = useState<any>(null);

  const fetchDefaults = async () => {
    try {
      const { data } = await api.get('/api/video/defaults');
      if (data.resolution) setResolution(data.resolution);
      if (data.ratio) setRatio(data.ratio);
      if (data.duration) setDuration(data.duration);
      if (data.style) setStyle(data.style);
      if (data.model) setModelName(data.model);
    } catch {}
  };

  const fetchTasks = async () => {
    try { const { data } = await api.get('/api/video/list', { params: { limit: 8 } }); setTasks(data.items || []); } catch {}
  };
  const fetchRefs = async () => {
    try {
      const [c, s] = await Promise.all([api.get('/api/character/list'), api.get('/api/script/list')]);
      setCharacters(c.data || []); setScripts(s.data || []);
    } catch {}
  };

  useEffect(() => { fetchDefaults(); fetchTasks(); fetchRefs(); }, []);
  useEffect(() => {
    if (!tasks.some(t => t.status === 'pending' || t.status === 'processing')) return;
    const t = setInterval(fetchTasks, 5000); return () => clearInterval(t);
  }, [tasks]);

  // Fetch script scenes when script is selected
  useEffect(() => {
    (async () => {
      if (!scriptId) { setScriptScenes([]); return; }
      try {
        const { data } = await api.get(`/api/script/${scriptId}`);
        if (data.scenes && Array.isArray(data.scenes) && data.scenes.length > 0) {
          setScriptScenes(data.scenes);
        } else {
          setScriptScenes([]);
        }
      } catch { setScriptScenes([]); }
    })();
  }, [scriptId]);

  // Poll script scenes if any are active
  useEffect(() => {
    const hasActive = scriptScenes.some(s => s.status === 'processing' || s.status === 'pending');
    if (!hasActive) return;
    const t = setInterval(async () => {
      if (!scriptId) return;
      try {
        const { data } = await api.get(`/api/script/${scriptId}`);
        if (data.scenes) setScriptScenes(data.scenes);
      } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, [scriptScenes, scriptId]);

  const addSlot = () => {
    if (charSlots.length >= 5) { message.warning('最多添加 5 个角色'); return; }
    const usedRoles = new Set(charSlots.map(s => s.role));
    const firstAvailable = ROLE_OPTIONS.find(r => !usedRoles.has(r.value));
    setCharSlots([...charSlots, { role: firstAvailable?.value || 'backup' }]);
  };

  const removeSlot = (index: number) => {
    setCharSlots(charSlots.filter((_, i) => i !== index));
  };

  const updateSlot = (index: number, field: string, value: any) => {
    const copy = [...charSlots];
    (copy[index] as any)[field] = value;
    setCharSlots(copy);
  };

  const handleGenerate = async () => {
    if (!storyPrompt.trim() && !scriptId && charSlots.length === 0) {
      message.warning('请至少添加一个角色或填写剧情'); return;
    }
    setLoading(true);
    try {
      const payload: any = { resolution, ratio, duration, style, characters: charSlots };
      if (modelName) payload.model = modelName;
      if (scriptMode === 'select' && scriptId) payload.script_id = scriptId;
      if (scriptMode === 'custom' && scriptTitle.trim()) payload.script_title = scriptTitle.trim();
      if (storyPrompt.trim()) payload.prompt = storyPrompt.trim();
      await api.post('/api/video/generate', payload);
      message.success('任务已创建');
      fetchTasks();
    } catch (e: any) { message.error(e.response?.data?.message || '失败'); }
    finally { setLoading(false); }
  };

  const handleGenerateAll = async () => {
    if (!scriptId) return;
    setGenAllLoading(true);
    try {
      const { data } = await api.post(`/api/script/${scriptId}/generate-all`, {
        resolution, ratio, duration, style, model: modelName || undefined,
        characters: charSlots,
      });
      message.success(`已提交 ${data.total} 个场景`);
      // Refresh scenes
      const { data: scriptData } = await api.get(`/api/script/${scriptId}`);
      if (scriptData.scenes) setScriptScenes(scriptData.scenes);
    } catch (e: any) { message.error(e.response?.data?.message || '生成失败'); }
    finally { setGenAllLoading(false); }
  };

  const handleStitchAll = async () => {
    if (!scriptId) return;
    setStitchLoading(true);
    setStitchResult(null);
    try {
      const { data } = await api.post(`/api/script/${scriptId}/stitch-all`);
      setStitchResult(data);
      message.success('拼接完成');
    } catch (e: any) { message.error(e.response?.data?.message || '拼接失败'); }
    finally { setStitchLoading(false); }
  };

  const handleSceneUpdate = async (index: number, field: string, value: any) => {
    if (!scriptId) return;
    const copy = [...scriptScenes];
    copy[index] = { ...copy[index], [field]: value };
    setScriptScenes(copy);
    try {
      await api.put(`/api/script/${scriptId}/scene/${index}`, { [field]: value });
    } catch { /* ignore */ }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fb' }}>
      <AppHeader />
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 24px 0' }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <Title level={3} style={{ margin: 0 }}>AI 动漫创作中心</Title>
        </div>
        <Button className="back-btn" icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')} style={{ marginBottom: 16 }}>返回</Button>
      </div>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px' }}>
        <Row gutter={[24, 24]}>
          {/* LEFT: Creation Panel */}
          <Col xs={24} lg={15}>
            <Card style={{ borderRadius: 16, border: '1px solid #f0f0f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }} styles={{ body: { padding: '28px 32px' } }}>
              {/* Step 1 */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: 8, display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'linear-gradient(135deg, #ec4899, #f59e0b)', color: '#fff', fontSize: 14, fontWeight: 700,
                  }}>1</span>
                  <Text strong style={{ fontSize: 16 }}>角色设定</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>每个角色单独选择定位，可自由搭配</Text>
                </div>

                {charSlots.map((slot, index) => (
                  <div key={index} style={{
                    padding: '12px 16px', marginBottom: 12,
                    border: '1px solid #f0f0f0', borderRadius: 12,
                    background: '#fafafa',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 24, height: 24, borderRadius: 6,
                        background: ROLE_COLORS[slot.role] || '#999', color: '#fff',
                        fontSize: 12, fontWeight: 600,
                      }}>{index + 1}</span>
                      <Select size="small" value={slot.role}
                        onChange={(v) => updateSlot(index, 'role', v)}
                        style={{ width: 100 }}
                        options={ROLE_OPTIONS.map(r => ({
                          ...r,
                          disabled: r.value !== slot.role && charSlots.some(s => s.role === r.value),
                        }))}
                      />
                      <div style={{ flex: 1 }} />
                      <Tooltip title="移除此角色">
                        <Button size="small" type="text" danger icon={<CloseOutlined />}
                          onClick={() => removeSlot(index)} />
                      </Tooltip>
                    </div>
                    <Row gutter={12}>
                      <Col xs={24} sm={8}>
                        <Select size="middle" placeholder="从角色库选..." allowClear showSearch
                          value={slot.character_id}
                          onChange={(v) => {
                            updateSlot(index, 'character_id', v);
                            if (v) {
                              const c = characters.find(ch => ch.id === v);
                              if (c) { updateSlot(index, 'character_name', c.name); if (c.description) updateSlot(index, 'character_desc', c.description); }
                            } else { updateSlot(index, 'character_name', ''); updateSlot(index, 'character_desc', ''); }
                          }}
                          style={{ width: '100%' }}
                          optionFilterProp="label"
                          options={characters.map((c: any) => ({ value: c.id, label: `${c.name} — ${(c.description || '').slice(0, 20)}` }))}
                          notFoundContent="暂无角色"
                        />
                      </Col>
                      <Col xs={12} sm={8}>
                        <Input size="middle" placeholder="角色名"
                          prefix={<UserOutlined style={{ color: '#bbb' }} />}
                          value={slot.character_name}
                          onChange={(e) => updateSlot(index, 'character_name', e.target.value)} />
                      </Col>
                      <Col xs={12} sm={8}>
                        <Input size="middle" placeholder="外貌描述"
                          prefix={<EditOutlined style={{ color: '#bbb' }} />}
                          value={slot.character_desc}
                          onChange={(e) => updateSlot(index, 'character_desc', e.target.value)} />
                      </Col>
                    </Row>
                  </div>
                ))}

                {charSlots.length < 5 && (
                  <Button type="dashed" icon={<PlusOutlined />} onClick={addSlot} block
                    style={{ borderRadius: 10, height: 44, borderStyle: 'dashed' }}>
                    {charSlots.length === 0 ? '添加角色' : '继续添加角色'}
                  </Button>
                )}
              </div>

              <Divider style={{ margin: '0 0 28px' }} />

              {/* Step 2 */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: 8, display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: '#fff', fontSize: 14, fontWeight: 700,
                  }}>2</span>
                  <Text strong style={{ fontSize: 16 }}>剧情内容</Text>
                  <Segmented
                    size="small"
                    value={scriptMode}
                    onChange={(val) => {
                      if (val === 'select') { setScriptMode('select'); setScriptTitle(''); setScriptScenes([]); }
                      else { setScriptMode('custom'); setScriptId(undefined); setScriptScenes([]); }
                    }}
                    options={[
                      { label: '从剧本库选', value: 'select' },
                      { label: '自己编辑', value: 'custom' },
                    ]}
                  />
                  {scriptMode === 'select' && scriptScenes.length > 0 && (
                    <>
                      <Tag color="purple">{scriptScenes.length} 场景</Tag>
                      <Tag color="success">{scriptScenes.filter(s => s.status === 'completed').length} 完成</Tag>
                    </>
                  )}
                </div>

                {/* Script selector or custom title */}
                {scriptMode === 'select' ? (
                  <Select size="large" placeholder="选择已有剧本..." allowClear
                    value={scriptId} onChange={setScriptId}
                    style={{ width: '100%', borderRadius: 10 }}
                    options={scripts.map((s: any) => ({ value: s.id, label: s.title || '未命名' }))} />
                ) : (
                  <Input size="large" placeholder="剧本标题，如：异世界剑士的冒险"
                    value={scriptTitle} onChange={e => setScriptTitle(e.target.value)}
                    style={{ borderRadius: 10, marginBottom: 12 }}
                    prefix={<EditOutlined style={{ color: '#bbb' }} />}
                    maxLength={50} />
                )}

                {/* Scene panel when script has scenes */}
                {scriptMode === 'select' && scriptScenes.length > 0 ? (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                      <Button size="small" icon={<VideoCameraOutlined />} type="primary"
                        loading={genAllLoading} onClick={handleGenerateAll}>
                        生成全部 ({scriptScenes.length} 场景)
                      </Button>
                      <Button size="small" icon={<ThunderboltOutlined />}
                        disabled={scriptScenes.filter(s => s.status === 'completed').length < 2}
                        loading={stitchLoading} onClick={handleStitchAll}>
                        拼接全部
                      </Button>
                      <Button size="small" icon={<ReloadOutlined />} onClick={async () => {
                        if (!scriptId) return;
                        try {
                          const { data } = await api.get(`/api/script/${scriptId}`);
                          if (data.scenes) setScriptScenes(data.scenes);
                        } catch {}
                      }}>刷新</Button>
                    </div>
                    {scriptScenes.map((scene: any, i: number) => (
                      <div key={i} style={{
                        padding: '10px 14px', marginBottom: 8,
                        border: `1px solid ${scene.status === 'completed' ? '#b7eb8f' : scene.status === 'failed' ? '#ffa39e' : '#f0f0f0'}`,
                        borderRadius: 10,
                        background: scene.status === 'completed' ? '#f6fff6' : scene.status === 'failed' ? '#fff6f6' : '#fff',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 22, height: 22, borderRadius: 6,
                            background: scene.status === 'completed' ? '#52c41a' : scene.status === 'failed' ? '#ff4d4f' : scene.status === 'processing' ? '#1890ff' : '#7c3aed',
                            color: '#fff', fontSize: 11, fontWeight: 600,
                          }}>{i + 1}</span>
                          <Tag color={SCENE_STATUS[scene.status]?.color} style={{ margin: 0, fontSize: 11 }}>
                            {SCENE_STATUS[scene.status]?.label}
                          </Tag>
                          <Text type="secondary" style={{ fontSize: 11 }}>{scene.duration || 5}秒</Text>
                          <div style={{ flex: 1 }} />
                          {scene.video_url && (
                            <Tooltip title="预览">
                              <video src={getUrl(scene.video_url)} style={{ height: 32, borderRadius: 4 }} />
                            </Tooltip>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <TextArea size="small" rows={2}
                            value={scene.prompt} placeholder="场景 prompt"
                            onChange={(e) => handleSceneUpdate(i, 'prompt', e.target.value)}
                            style={{ fontSize: 12, lineHeight: 1.6, borderRadius: 6, flex: 1 }}
                          />
                          <Select size="small" value={scene.duration || 5}
                            onChange={(v) => handleSceneUpdate(i, 'duration', v)}
                            style={{ width: 64, flexShrink: 0 }}
                            options={[5, 10, 15].map(d => ({ value: d, label: `${d}s` }))}
                          />
                        </div>
                        {scene.error_msg && (
                          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>{scene.error_msg}</Text>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Custom prompt textarea */
                  <TextArea
                    rows={5}
                    placeholder={`在这里写你的故事……\n\n例如：林风站在学校天台，夕阳染红天空。突然一道金光闪过，他穿越到异世界，拔出腰间长剑面对巨龙……`}
                    value={storyPrompt} onChange={e => setStoryPrompt(e.target.value)}
                    style={{ borderRadius: 12, fontSize: 14, lineHeight: 1.8, marginTop: 12 }}
                    maxLength={1000} showCount
                  />
                )}
              </div>

              <Divider style={{ margin: '0 0 28px' }} />

              {/* Step 3 */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: 8, display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'linear-gradient(135deg, #f59e0b, #ef4444)', color: '#fff', fontSize: 14, fontWeight: 700,
                  }}>3</span>
                  <Text strong style={{ fontSize: 16 }}>视频设置</Text>
                </div>
                <Row gutter={[32, 16]}>
                  <Col xs={24} sm={5}>
                    <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>分辨率</Text>
                    <Select
                      value={resolution}
                      onChange={(v) => setResolution(v as string)}
                      style={{ width: '100%' }}
                      options={[
                        { label: '480p', value: '480p' },
                        { label: '720p', value: '720p' },
                        { label: '1080p', value: '1080p' },
                      ]}
                    />
                  </Col>
                  <Col xs={24} sm={8}>
                    <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>宽高比</Text>
                    <Select
                      value={ratio}
                      onChange={(v) => setRatio(v as string)}
                      style={{ width: '100%' }}
                      options={[
                        { label: '9:16 竖屏', value: '9:16' },
                        { label: '16:9 横屏', value: '16:9' },
                        { label: '1:1 方屏', value: '1:1' },
                        { label: '4:3 传统', value: '4:3' },
                        { label: '3:4 海报', value: '3:4' },
                        { label: '21:9 超宽', value: '21:9' },
                      ]}
                    />
                  </Col>
                  <Col xs={24} sm={5}>
                    <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                      时长 {scriptScenes.length > 0 && <Tag style={{ marginLeft: 4, fontSize: 10 }}>由各场景控制</Tag>}
                    </Text>
                    <Select
                      value={duration}
                      onChange={(v) => setDuration(v as number)}
                      disabled={scriptScenes.length > 0}
                      style={{ width: '100%' }}
                      options={[
                        { label: '5 秒', value: 5 },
                        { label: '10 秒', value: 10 },
                        { label: '15 秒', value: 15 },
                      ]}
                    />
                  </Col>
                  <Col xs={24} sm={6}>
                    <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>风格</Text>
                    <Select
                      value={style}
                      onChange={(v) => setStyle(v as string)}
                      style={{ width: '100%' }}
                      options={[
                        { label: '🎨 动漫', value: 'anime' },
                        { label: '📷 真人', value: 'realistic' },
                      ]}
                    />
                  </Col>
                </Row>
                <Row gutter={[32, 16]} style={{ marginTop: 16 }}>
                  <Col xs={24}>
                    <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>模型</Text>
                    <Select
                      size="large" allowClear placeholder="自动（按优先级）"
                      value={modelName || undefined} onChange={(v) => setModelName(v || '')}
                      style={{ width: '100%', borderRadius: 10 }}
                      options={[
                        { value: 'happyhorse-1.1-t2v', label: '阿里云 HappyHorse 1.1 文生视频 ⭐' },
                        { value: 'happyhorse-1.1-i2v', label: '阿里云 HappyHorse 1.1 图生视频 ⭐' },
                        { value: 'happyhorse-1.1-r2v', label: '阿里云 HappyHorse 1.1 参考生视频' },
                        { value: 'happyhorse-1.0-t2v', label: '阿里云 HappyHorse 1.0 文生视频' },
                        { value: 'happyhorse-1.0-i2v', label: '阿里云 HappyHorse 1.0 图生视频' },
                        { value: 'happyhorse-1.0-r2v', label: '阿里云 HappyHorse 1.0 参考生视频' },
                        { value: 'wan2.7-videoedit', label: '阿里云 WAN 2.7 视频编辑 ⭐' },
                        { value: 'wan2.5-t2v-preview', label: '阿里云 WAN 2.5 T2V Preview' },
                        { value: 'wanx2.1-t2v-turbo', label: '阿里云 WAN 2.1 T2V Turbo' },
                        { value: 'wanx2.1-t2v-plus', label: '阿里云 WAN 2.1 T2V Plus' },
                        { value: 'wan2.7-t2v-2026-06-12', label: '阿里云 通义万相 2.7 T2V (06-12)' },
                        { value: 'wan2.7-t2v', label: '阿里云 通义万相 2.7 T2V' },
                        { value: 'wan2.7-i2v-2026-04-25', label: '阿里云 通义万相 2.7 I2V (04-25)' },
                        { value: 'wan2.7-i2v', label: '阿里云 通义万相 2.7 I2V' },
                      ]}
                    />
                  </Col>
                </Row>
              </div>

              {scriptMode === 'select' && scriptScenes.length > 0 ? (
                <Button type="primary" size="large" icon={<NodeIndexOutlined />}
                  onClick={handleGenerateAll} loading={genAllLoading} block
                  style={{
                    height: 52, borderRadius: 14, fontSize: 17, fontWeight: 600,
                    background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
                    border: 'none', boxShadow: '0 4px 16px rgba(124,58,237,0.3)',
                  }}>
                  生成全部场景 · {scriptScenes.length} 场 · {resolution} · 约 {scriptScenes.reduce((s, c) => s + estimateCredits(resolution, c.duration || 5), 0)} 算力
                </Button>
              ) : (
                <Button type="primary" size="large" icon={<SendOutlined />}
                  onClick={handleGenerate} loading={loading} block
                  style={{
                    height: 52, borderRadius: 14, fontSize: 17, fontWeight: 600,
                    background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
                    border: 'none', boxShadow: '0 4px 16px rgba(124,58,237,0.3)',
                  }}>
                  生成视频 · {resolution} · {duration}秒 · 约 {estimateCredits(resolution, duration)} 算力
                </Button>
              )}

              {/* Stitch result */}
              {stitchResult && (
                <Card size="small" style={{ marginTop: 16, borderRadius: 10, border: '1px solid #52c41a' }}>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>拼接完成</Text>
                  <video controls width="100%" style={{ borderRadius: 8, maxHeight: 300 }}
                    src={getUrl(stitchResult.video_url)}>
                    <source src={getUrl(stitchResult.video_url)} type="video/mp4" />
                  </video>
                </Card>
              )}
            </Card>
          </Col>

          {/* RIGHT: History */}
          <Col xs={24} lg={9}>
            <Card
              title={<Space><HistoryOutlined style={{ color: '#f59e0b' }} />生成历史</Space>}
              style={{ borderRadius: 16, border: '1px solid #f0f0f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
              styles={{ body: { padding: '8px 16px 16px', maxHeight: 'calc(100vh - 140px)', overflow: 'auto' } }}
            >
              {tasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: '#bbb' }}>
                  <VideoCameraOutlined style={{ fontSize: 40, marginBottom: 12, display: 'block' }} />
                  还没有作品，开始创作吧
                </div>
              ) : (
                tasks.slice(0, 10).map((item) => {
                  const s = STATUS_MAP[item.status] || STATUS_MAP.pending;
                  return (
                    <Card key={item.id} size="small" hoverable
                      onClick={() => navigate(`/video/${item.id}`)}
                      style={{ marginBottom: 10, borderRadius: 12, border: '1px solid #f5f5f5' }}
                      styles={{ body: { padding: 12 } }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{
                          width: 48, height: 64, borderRadius: 8, background: '#000',
                          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          overflow: 'hidden',
                        }}>
                          {item.status === 'completed' && item.video_url ? (
                            item.cover_url ? (
                              <img src={getUrl(item.cover_url)} alt="封面"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={(e) => { (e.target as HTMLImageElement).src = getUrl(item.video_url); }} />
                            ) : (
                              <video src={getUrl(item.video_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                preload="metadata" muted />
                            )
                          ) : item.status === 'processing' ? (
                            <SyncOutlined spin style={{ color: '#7c3aed', fontSize: 20 }} />
                          ) : (
                            <VideoCameraOutlined style={{ color: '#999', fontSize: 18 }} />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Tag color={s.color} style={{ margin: 0, fontSize: 11 }}>{s.label}</Tag>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              {new Date(item.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </div>
                          {item.scriptTitle && (
                            <Text style={{ fontSize: 13 }} ellipsis>{item.scriptTitle}</Text>
                          )}
                          {item.error_msg && (
                            <Text type="danger" style={{ fontSize: 11 }} ellipsis>{item.error_msg}</Text>
                          )}
                        </div>
                        {item.status === 'completed' && (
                          <PlayCircleOutlined style={{ color: '#7c3aed', fontSize: 20, marginTop: 12 }} />
                        )}
                      </div>
                    </Card>
                  );
                })
              )}
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
}
