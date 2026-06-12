import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Card, Typography, Input, Select, Space, Divider,
  Tag, message, Row, Col, Badge, Segmented,
} from 'antd';
import {
  VideoCameraOutlined, UserOutlined,
  SendOutlined, HomeOutlined, ClockCircleOutlined, CheckCircleOutlined,
  CloseCircleOutlined, SyncOutlined, PlayCircleOutlined, HistoryOutlined,
  EditOutlined,
} from '@ant-design/icons';
import api from '../../services/api';

const { Text } = Typography;
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

export default function StudioPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [characters, setCharacters] = useState<any[]>([]);
  const [scripts, setScripts] = useState<any[]>([]);

  const [characterMode, setCharacterMode] = useState<'quick' | 'select'>('quick');
  const [characterId, setCharacterId] = useState<number | undefined>();
  const [characterName, setCharacterName] = useState('');
  const [characterDesc, setCharacterDesc] = useState('');
  const [scriptMode, setScriptMode] = useState<'select' | 'custom'>('select');
  const [scriptId, setScriptId] = useState<number | undefined>();
  const [scriptTitle, setScriptTitle] = useState('');
  const [storyPrompt, setStoryPrompt] = useState('');
  const [resolution, setResolution] = useState('720p');
  const [duration, setDuration] = useState(5);
  const [style, setStyle] = useState('anime');
  const [modelName, setModelName] = useState('');

  const fetchTasks = async () => {
    try { const { data } = await api.get('/api/video/list', { params: { limit: 8 } }); setTasks(data.items || []); } catch {}
  };
  const fetchRefs = async () => {
    try {
      const [c, s] = await Promise.all([api.get('/api/character/list'), api.get('/api/script/list')]);
      setCharacters(c.data || []); setScripts(s.data || []);
    } catch {}
  };

  useEffect(() => { fetchTasks(); fetchRefs(); }, []);
  useEffect(() => {
    if (!tasks.some(t => t.status === 'pending' || t.status === 'processing')) return;
    const t = setInterval(fetchTasks, 5000); return () => clearInterval(t);
  }, [tasks]);

  const handleGenerate = async () => {
    if (!storyPrompt.trim() && !scriptId && !characterName.trim() && !characterId) {
      message.warning('请至少填写角色名或剧情'); return;
    }
    setLoading(true);
    try {
      const payload: any = { resolution, duration, style };
      if (modelName) payload.model = modelName;
      if (characterId) payload.character_id = characterId;
      else if (characterName.trim()) {
        payload.character_name = characterName.trim();
        if (characterDesc.trim()) payload.character_desc = characterDesc.trim();
      }
      if (scriptMode === 'select' && scriptId) payload.script_id = scriptId;
      if (scriptMode === 'custom' && scriptTitle.trim()) payload.script_title = scriptTitle.trim();
      if (storyPrompt.trim()) payload.prompt = storyPrompt.trim();
      await api.post('/api/video/generate', payload);
      message.success('任务已创建');
      fetchTasks();
    } catch (e: any) { message.error(e.response?.data?.message || '失败'); }
    finally { setLoading(false); }
  };

  const pendingCount = tasks.filter(t => t.status === 'processing' || t.status === 'pending').length;

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fb' }}>
      {/* Header */}
      <div style={{ background: '#fff', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0' }}>
        <Space>
          <Button type="text" icon={<HomeOutlined />} onClick={() => navigate('/')}>主页</Button>
        </Space>
        <Text strong style={{ fontSize: 17 }}>🎬 AI 动漫创作中心</Text>
        <Badge count={pendingCount} size="small">
          <Button type="text" icon={<HistoryOutlined />} onClick={fetchTasks}>刷新</Button>
        </Badge>
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
                  <Segmented
                    size="small"
                    value={characterMode}
                    onChange={(val) => {
                      if (val === 'select') { setCharacterMode('select'); setCharacterName(''); setCharacterDesc(''); }
                      else { setCharacterMode('quick'); setCharacterId(undefined); }
                    }}
                    options={[
                      { label: '快速创建', value: 'quick' },
                      { label: '从角色库选', value: 'select' },
                    ]}
                  />
                </div>
                {characterMode === 'quick' ? (
                  <Row gutter={16}>
                    <Col xs={12}>
                      <Input size="large" placeholder="角色名，如：林风"
                        prefix={<UserOutlined style={{ color: '#bbb' }} />}
                        value={characterName} onChange={e => setCharacterName(e.target.value)}
                        style={{ borderRadius: 10 }} />
                    </Col>
                    <Col xs={12}>
                      <Input size="large" placeholder="外貌描述，如：18岁黑发剑士，红色披风"
                        prefix={<EditOutlined style={{ color: '#bbb' }} />}
                        value={characterDesc} onChange={e => setCharacterDesc(e.target.value)}
                        style={{ borderRadius: 10 }} />
                    </Col>
                  </Row>
                ) : (
                  <Select size="large" placeholder="选择已有角色..."
                    allowClear value={characterId} onChange={setCharacterId}
                    style={{ width: '100%', borderRadius: 10 }}
                    options={characters.map((c: any) => ({ value: c.id, label: `${c.name} — ${c.description?.slice(0, 30) || ''}` }))} />
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
                      if (val === 'select') { setScriptMode('select'); setScriptTitle(''); }
                      else { setScriptMode('custom'); setScriptId(undefined); }
                    }}
                    options={[
                      { label: '从剧本库选', value: 'select' },
                      { label: '自己编辑', value: 'custom' },
                    ]}
                  />
                </div>
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
                <TextArea
                  rows={5}
                  placeholder={`在这里写你的故事……\n\n例如：林风站在学校天台，夕阳染红天空。突然一道金光闪过，他穿越到异世界，拔出腰间长剑面对巨龙……`}
                  value={storyPrompt} onChange={e => setStoryPrompt(e.target.value)}
                  style={{ borderRadius: 12, fontSize: 14, lineHeight: 1.8, marginTop: 12 }}
                  maxLength={1000} showCount
                />
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
                  <Col xs={24} sm={8}>
                    <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>分辨率</Text>
                    <Segmented
                      value={resolution}
                      onChange={(v) => setResolution(v as string)}
                      options={[
                        { label: '480p', value: '480p' },
                        { label: '720p', value: '720p' },
                        { label: '1080p', value: '1080p' },
                      ]}
                      block
                    />
                  </Col>
                  <Col xs={24} sm={8}>
                    <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>时长</Text>
                    <Segmented
                      value={duration}
                      onChange={(v) => setDuration(v as number)}
                      options={[
                        { label: '5 秒', value: 5 },
                        { label: '10 秒', value: 10 },
                        { label: '15 秒', value: 15 },
                      ]}
                      block
                    />
                  </Col>
                  <Col xs={24} sm={8}>
                    <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>风格</Text>
                    <Segmented
                      value={style}
                      onChange={(v) => setStyle(v as string)}
                      options={[
                        { label: '🎨 动漫', value: 'anime' },
                        { label: '📷 真人', value: 'realistic' },
                      ]}
                      block
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
                        { value: 'doubao-seedance-1-5-pro-251215', label: '火山引擎 Seedance 1.5 Pro' },
                        { value: 'wan2.7-t2v-2026-04-25', label: '阿里云 通义万相 2.7 T2V' },
                        { value: 'wan2.7-i2v-2026-04-25', label: '阿里云 通义万相 2.7 I2V' },
                      ]}
                    />
                  </Col>
                </Row>
              </div>

              <Button type="primary" size="large" icon={<SendOutlined />}
                onClick={handleGenerate} loading={loading} block
                style={{
                  height: 52, borderRadius: 14, fontSize: 17, fontWeight: 600,
                  background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
                  border: 'none', boxShadow: '0 4px 16px rgba(124,58,237,0.3)',
                }}>
                生成视频 · {resolution} · {duration}秒 · 约 {estimateCredits(resolution, duration)} 算力
              </Button>
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
                            <video src={getUrl(item.video_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              preload="metadata" muted />
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
