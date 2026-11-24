import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Typography, Input, Select, Tag, message, Segmented, Tooltip,
} from 'antd';
import {
  VideoCameraOutlined, UserOutlined,
  SendOutlined, ArrowLeftOutlined, ClockCircleOutlined, CheckCircleOutlined,
  CloseCircleOutlined, SyncOutlined, PlayCircleOutlined, HistoryOutlined,
  EditOutlined, PlusOutlined, CloseOutlined, ThunderboltOutlined,
  NodeIndexOutlined, ReloadOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import './studio.css';   // 本页质感改造样式（作用域 .stu-root，详见文件头注释）

const { Title, Text } = Typography;
const { TextArea } = Input;

const API_BASE = import.meta.env.VITE_API_BASE || '';
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
    <div className="stu-root">
      {/* 顶栏 + 单层容器（原来标题区 maxWidth:1000、内容区 maxWidth:1100，标题和内容左右不对齐） */}
      <div className="stu-topbar">
        <div className="stu-topbar__lead">
          <Button shape="circle" icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')} />
          <div className="stu-topbar__titles">
            <Title level={4} className="stu-topbar__title">AI 动漫创作中心</Title>
            <span className="stu-topbar__sub">角色 → 剧情 → 视频设置，三步出片</span>
          </div>
        </div>
      </div>

      <div className="stu-cols">
        {/* LEFT: Creation Panel */}
        <div className="stu-panel">
          {/* Step 1 */}
          <div className="stu-step" data-tone="1">
            <div className="stu-step__head">
              <span className="stu-step__no">1</span>
              <span className="stu-step__title">角色设定</span>
              <span className="stu-step__hint">每个角色单独选择定位，可自由搭配</span>
            </div>

            <div className="stu-slots">
              {charSlots.map((slot, index) => (
                <div key={index} className="stu-slot" style={{ ['--role-color' as string]: ROLE_COLORS[slot.role] || 'var(--primary)' }}>
                  <div className="stu-slot__head">
                    <span className="stu-slot__no">{index + 1}</span>
                    <Select size="small" value={slot.role}
                      onChange={(v) => updateSlot(index, 'role', v)}
                      style={{ width: 100 }}
                      options={ROLE_OPTIONS.map(r => ({
                        ...r,
                        disabled: r.value !== slot.role && charSlots.some(s => s.role === r.value),
                      }))}
                    />
                    <div className="stu-slot__spacer" />
                    <Tooltip title="移除此角色">
                      <Button className="stu-slot__del" size="small" type="text" danger icon={<CloseOutlined />}
                        onClick={() => removeSlot(index)} />
                    </Tooltip>
                  </div>
                  <div className="stu-slot__fields">
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
                    <Input size="middle" placeholder="角色名"
                      prefix={<UserOutlined />}
                      value={slot.character_name}
                      onChange={(e) => updateSlot(index, 'character_name', e.target.value)} />
                    <Input size="middle" placeholder="外貌描述"
                      prefix={<EditOutlined />}
                      value={slot.character_desc}
                      onChange={(e) => updateSlot(index, 'character_desc', e.target.value)} />
                  </div>
                </div>
              ))}

              {charSlots.length < 5 && (
                <Button type="dashed" className="stu-btn-add" icon={<PlusOutlined />} onClick={addSlot} block>
                  {charSlots.length === 0 ? '添加角色' : '继续添加角色'}
                </Button>
              )}
            </div>
          </div>

          {/* Step 2 */}
          <div className="stu-step" data-tone="2">
            <div className="stu-step__head">
              <span className="stu-step__no">2</span>
              <span className="stu-step__title">剧情内容</span>
              <Segmented
                className="stu-mode__seg"
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
                <span className="stu-step__tags">
                  <Tag color="purple">{scriptScenes.length} 场景</Tag>
                  <Tag color="success">{scriptScenes.filter(s => s.status === 'completed').length} 完成</Tag>
                </span>
              )}
            </div>

            {/* Script selector or custom title */}
            {scriptMode === 'select' ? (
              <Select size="large" placeholder="选择已有剧本..." allowClear
                value={scriptId} onChange={setScriptId}
                style={{ width: '100%' }}
                options={scripts.map((s: any) => ({ value: s.id, label: s.title || '未命名' }))} />
            ) : (
              <Input size="large" placeholder="剧本标题，如：异世界剑士的冒险"
                value={scriptTitle} onChange={e => setScriptTitle(e.target.value)}
                prefix={<EditOutlined />}
                maxLength={50} />
            )}

            {/* Scene panel when script has scenes */}
            {scriptMode === 'select' && scriptScenes.length > 0 ? (
              <div className="stu-scenes">
                <div className="stu-scenes__bar">
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
                  /* 状态底色又是写死浅色系（与 /script 同源）→ data-status + color-mix */
                  <div className="stu-scene" key={i} data-status={scene.status || 'pending'}>
                    <div className="stu-scene__head">
                      <span className="stu-scene__no">{i + 1}</span>
                      <Tag color={SCENE_STATUS[scene.status]?.color}>{SCENE_STATUS[scene.status]?.label}</Tag>
                      <span className="stu-scene__meta">{scene.duration || 5}秒</span>
                      <div className="stu-scene__spacer" />
                      {scene.video_url && (
                        <Tooltip title="预览">
                          <video className="stu-scene__preview" src={getUrl(scene.video_url)} muted playsInline />
                        </Tooltip>
                      )}
                    </div>
                    <div className="stu-scene__row">
                      <TextArea className="stu-scene__prompt" size="small" rows={2}
                        value={scene.prompt} placeholder="场景 prompt"
                        onChange={(e) => handleSceneUpdate(i, 'prompt', e.target.value)}
                      />
                      <Select size="small" value={scene.duration || 5}
                        onChange={(v) => handleSceneUpdate(i, 'duration', v)}
                        style={{ width: 64, flexShrink: 0 }}
                        options={[5, 10, 15].map(d => ({ value: d, label: `${d}s` }))}
                      />
                    </div>
                    {scene.error_msg && <span className="stu-scene__err">{scene.error_msg}</span>}
                  </div>
                ))}
              </div>
            ) : (
              /* Custom prompt textarea */
              <TextArea
                className="stu-story"
                rows={5}
                placeholder={`在这里写你的故事……\n\n例如：林风站在学校天台，夕阳染红天空。突然一道金光闪过，他穿越到异世界，拔出腰间长剑面对巨龙……`}
                value={storyPrompt} onChange={e => setStoryPrompt(e.target.value)}
                maxLength={1000} showCount
                style={{ marginTop: 12 }}
              />
            )}
          </div>

          {/* Step 3 */}
          <div className="stu-step" data-tone="3">
            <div className="stu-step__head">
              <span className="stu-step__no">3</span>
              <span className="stu-step__title">视频设置</span>
            </div>
            <div className="stu-opts">
              <div className="stu-opt">
                <span className="stu-opt__label">分辨率</span>
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
              </div>
              <div className="stu-opt">
                <span className="stu-opt__label">宽高比</span>
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
              </div>
              <div className="stu-opt">
                <span className="stu-opt__label">
                  时长 {scriptScenes.length > 0 && <Tag style={{ fontSize: 10 }}>由各场景控制</Tag>}
                </span>
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
              </div>
              <div className="stu-opt">
                <span className="stu-opt__label">风格</span>
                <Select
                  value={style}
                  onChange={(v) => setStyle(v as string)}
                  style={{ width: '100%' }}
                  options={[
                    { label: '🎨 动漫', value: 'anime' },
                    { label: '📷 真人', value: 'realistic' },
                  ]}
                />
              </div>
              <div className="stu-opt stu-opt--wide">
                <span className="stu-opt__label">模型</span>
                <Select
                  size="large" allowClear placeholder="自动（按优先级）"
                  value={modelName || undefined} onChange={(v) => setModelName(v || '')}
                  style={{ width: '100%' }}
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
              </div>
            </div>
          </div>

          {/* 主 CTA：写死 #7c3aed→#ec4899 渐变 + rgba(124,58,237,.3) 阴影 → .stu-cta 令牌 */}
          {scriptMode === 'select' && scriptScenes.length > 0 ? (
            <Button type="primary" className="stu-cta" size="large" icon={<NodeIndexOutlined />}
              onClick={handleGenerateAll} loading={genAllLoading} block>
              生成全部场景 · {scriptScenes.length} 场 · {resolution} · 约 {scriptScenes.reduce((s, c) => s + estimateCredits(resolution, c.duration || 5), 0)} 算力
            </Button>
          ) : (
            <Button type="primary" className="stu-cta" size="large" icon={<SendOutlined />}
              onClick={handleGenerate} loading={loading} block>
              生成视频 · {resolution} · {duration}秒 · 约 {estimateCredits(resolution, duration)} 算力
            </Button>
          )}

          {/* Stitch result */}
          {stitchResult && (
            <div className="stu-stitch">
              <Text strong className="stu-stitch__title">拼接完成</Text>
              <video controls width="100%" src={getUrl(stitchResult.video_url)}>
                <source src={getUrl(stitchResult.video_url)} type="video/mp4" />
              </video>
            </div>
          )}
        </div>

        {/* RIGHT: History */}
        <div className="stu-side">
          <div className="stu-hist">
            <div className="stu-hist__head">
              <HistoryOutlined />
              <span>生成历史</span>
              <span className="stu-hist__count">{tasks.length} 条</span>
            </div>
            <div className="stu-hist__body">
              {tasks.length === 0 ? (
                <div className="stu-empty">
                  <VideoCameraOutlined />
                  还没有作品，开始创作吧
                </div>
              ) : (
                tasks.slice(0, 10).map((item) => {
                  const s = STATUS_MAP[item.status] || STATUS_MAP.pending;
                  return (
                    <div className="stu-hitem" key={item.id} onClick={() => navigate(`/video/${item.id}`)}>
                      <div className="stu-hitem__thumb">
                        {item.status === 'completed' && item.video_url ? (
                          item.cover_url ? (
                            /* 封面挂了先退到视频首帧，视频也拿不到就把自己藏掉 ——
                               否则暗/浅都会露浏览器裂图图标（探针实测 brokenImgs=1 抓到的就是这个） */
                            <img src={getUrl(item.cover_url)} alt="封面"
                              onError={(e) => {
                                const el = e.target as HTMLImageElement;
                                if (el.dataset.fallback === '1') { el.style.visibility = 'hidden'; return; }
                                el.dataset.fallback = '1';
                                el.src = getUrl(item.video_url);
                              }} />
                          ) : (
                            <video src={getUrl(item.video_url)} preload="metadata" muted
                              onError={(e) => { (e.target as HTMLVideoElement).style.visibility = 'hidden'; }} />
                          )
                        ) : item.status === 'processing' ? (
                          <SyncOutlined spin className="stu-hitem__spin" />
                        ) : (
                          <VideoCameraOutlined className="stu-hitem__ph" />
                        )}
                      </div>
                      <div className="stu-hitem__main">
                        <div className="stu-hitem__line">
                          <Tag color={s.color}>{s.label}</Tag>
                          <span className="stu-hitem__time">
                            {new Date(item.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {item.scriptTitle && <span className="stu-hitem__title">{item.scriptTitle}</span>}
                        {item.error_msg && <span className="stu-hitem__err">{item.error_msg}</span>}
                      </div>
                      {item.status === 'completed' && <PlayCircleOutlined className="stu-hitem__play" />}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
