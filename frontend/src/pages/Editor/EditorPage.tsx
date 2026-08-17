import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Typography, Button, Input, Select, Spin, message, Empty, Upload, Progress, Tag, Radio,
} from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, PlayCircleOutlined, PauseCircleOutlined, DownloadOutlined,
  VideoCameraOutlined, FontSizeOutlined, SoundOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import AssetCard from '../Canvas/components/AssetPanel';
import type { AssetItem } from '../Canvas/components/AssetPanel';
import Timeline from './components/Timeline';
import PropsPanel from './components/PropsPanel';
import type { TimelineDoc, Selection, TrackKey, TimelineVideoItem, TimelineAudioItem, TimelineTextItem } from './types';
import {
  RATIOS, RESOLUTIONS, MAX_SECONDS, MAX_ITEMS, genId, toStaticUrl, isAudioUrl, isVideoUrl, isImageUrl, emptyTimeline, timelineDuration,
} from './types';

const { Text } = Typography;

interface RenderStatus { status: string; progress: number; result_url?: string | null; error_msg?: string | null; }

const round1 = (n: number) => Math.round(n * 10) / 10;

export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [name, setName] = useState('未命名剪辑');
  const [ratio, setRatio] = useState('9:16');
  const [resolution, setResolution] = useState('720p');
  const [timeline, setTimeline] = useState<TimelineDoc>(emptyTimeline());
  const [selected, setSelected] = useState<Selection | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pxPerSec, setPxPerSec] = useState(48);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [render, setRender] = useState<RenderStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [assetTab, setAssetTab] = useState('ai');

  // Assets
  const [aiTasks, setAiTasks] = useState<AssetItem[]>([]);
  const [globalAssets, setGlobalAssets] = useState<AssetItem[]>([]);
  const [viralProjects, setViralProjects] = useState<AssetItem[]>([]);
  const [dramaClips, setDramaClips] = useState<AssetItem[]>([]);
  const [audioItems, setAudioItems] = useState<AssetItem[]>([]);
  const [assetLoading, setAssetLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load project ──
  useEffect(() => {
    if (isNew) return;
    const load = async () => {
      setRender(null);
      setLoadError(null);
      try {
        const res = await api.get(`/api/editor/projects/${id}`);
        const p = res.data;
        setName(p.name);
        setRatio(p.ratio || '9:16');
        setResolution(p.resolution || '720p');
        setProjectId(p.id);
        setTimeline(normalizeTimeline(p.timeline));
        if (p.status === 'rendering' || p.status === 'completed' || p.status === 'failed') {
          setRender({ status: p.status, progress: p.progress, result_url: p.result_url, error_msg: p.error_msg });
        }
      } catch (err: any) {
        setLoadError(err?.response?.data?.message || err.message || '未知错误');
      }
      setLoading(false);
    };
    load();
  }, [id]);

  // ── Poll render progress ──
  useEffect(() => {
    if (!render || render.status !== 'rendering' || !projectId) return;
    let failCount = 0;
    const timer = setInterval(async () => {
      try {
        const res = await api.get(`/api/editor/projects/${projectId}/export`);
        failCount = 0;
        setRender(res.data);
        if (res.data.status === 'completed' && res.data.result_url) {
          message.success('渲染完成！');
          clearInterval(timer);
        } else if (res.data.status === 'failed') {
          message.error('渲染失败: ' + (res.data.error_msg || '未知错误'));
          clearInterval(timer);
        }
      } catch {
        failCount += 1;
        if (failCount >= 3) {
          message.error('渲染状态获取失败，请稍后手动刷新');
          clearInterval(timer);
        }
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [render?.status, projectId]);

  // ── Load asset sources (same as canvas editor) ──
  const loadAssets = useCallback(async () => {
    setAssetLoading(true);
    try {
      const [taskRes, gaRes, viralRes, dramaRes] = await Promise.allSettled([
        api.get('/api/generate/tasks', { params: { page: 1, limit: 30 } }),
        api.get('/api/global-assets', { params: { limit: 50 } }),
        api.get('/api/viral/projects'),
        api.get('/api/drama', { params: { page: 1, limit: 10 } }),
      ]);

      if (taskRes.status === 'fulfilled') {
        const items = taskRes.value.data?.items || [];
        const assets: AssetItem[] = [];
        for (const t of items) {
          if (t.status !== 'completed' || !t.output_data) continue;
          try {
            const out = JSON.parse(t.output_data);
            if (t.type === 'video' && out?.url) {
              assets.push({ kind: 'ai_history', type: 'video', url: out.url, title: `AI视频 #${t.id}`, ref_id: t.id });
            } else if (t.type === 'image') {
              const list = Array.isArray(out) ? out : (out?.url ? [out] : []);
              for (const im of list) {
                if (im?.url) assets.push({ kind: 'ai_history', type: 'image', url: im.url, title: `AI图片 #${t.id}`, ref_id: t.id });
              }
            }
          } catch { /* ignore */ }
        }
        setAiTasks(assets);
      }

      if (gaRes.status === 'fulfilled') {
        const items = gaRes.value.data?.items || gaRes.value.data || [];
        const assets: AssetItem[] = [];
        for (const a of items) {
          if (a.image_url) assets.push({ kind: 'global_asset', type: 'image', url: a.image_url, title: a.name || '资产', thumbnail: a.image_url, ref_id: a.id });
          if (a.video_url) assets.push({ kind: 'global_asset', type: 'video', url: a.video_url, title: a.name || '资产', ref_id: a.id });
        }
        setGlobalAssets(assets);
      }

      if (viralRes.status === 'fulfilled') {
        const items = viralRes.value.data || [];
        const assets: AssetItem[] = items
          .filter((p: any) => p.status === 'completed' && p.result_url)
          .map((p: any) => ({ kind: 'viral', type: 'video', url: toStaticUrl(p.result_url), title: `热门创作: ${p.name}`, thumbnail: toStaticUrl(p.cover_url), ref_id: p.id }));
        setViralProjects(assets);
      }

      if (dramaRes.status === 'fulfilled') {
        const items = dramaRes.value.data?.items || [];
        const assets: AssetItem[] = [];
        const epLists = await Promise.all(items.map(async (proj: any) => {
          try {
            const epRes = await api.get(`/api/drama/${proj.id}/episodes`);
            return { proj, eps: epRes.data || [] };
          } catch { return { proj, eps: [] }; }
        }));
        for (const { proj, eps } of epLists) {
          for (const ep of eps) {
            if (ep.video_url) {
              assets.push({
                kind: 'drama', type: 'video',
                url: toStaticUrl(ep.video_url) || '',
                title: `${proj.title || proj.name || '短剧'} - ${ep.title || `第${ep.episode_no}集`}`,
                ref_id: ep.id,
              });
            }
          }
        }
        setDramaClips(assets);
      }
    } catch { /* ignore */ }
    setAssetLoading(false);
  }, []);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  // ── Autosave (debounced) ──
  const persist = useCallback(async (): Promise<number | null> => {
    const payload = { name, ratio, resolution, timeline: JSON.stringify(timeline) };
    if (projectId) {
      await api.put(`/api/editor/projects/${projectId}`, payload);
      return projectId;
    }
    const res = await api.post('/api/editor/projects', payload);
    setProjectId(res.data.id);
    return res.data.id;
  }, [name, ratio, resolution, timeline, projectId]);

  const persistRef = useRef<Promise<number | null> | null>(null);
  useEffect(() => {
    if (loading || (isNew && !projectId)) return;
    if (render?.status === 'rendering') return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (!persistRef.current) {
        persistRef.current = persist()
          .catch(() => null)
          .finally(() => { persistRef.current = null; });
      }
    }, 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [timeline, name, ratio, resolution, loading, projectId, isNew, render?.status, persist]);

  const handleSave = async () => {
    if (render?.status === 'rendering') { message.warning('渲染进行中，请等待完成后再保存修改'); return; }
    setSaving(true);
    try {
      const pid = await persist();
      message.success('已保存');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      if (isNew && pid) navigate(`/editor/${pid}`, { replace: true });
    } catch (err: any) {
      message.error('保存失败: ' + (err?.response?.data?.message || err.message));
    }
    setSaving(false);
  };

  // ── Add items to timeline ──
  const videoEnd = useMemo(() => {
    let e = 0;
    for (const v of timeline.video) e = Math.max(e, (v.start || 0) + (v.duration || 0));
    return round1(e);
  }, [timeline.video]);

  const addToTrack = useCallback((track: TrackKey, item: any) => {
    const arr = (timeline as any)[track] as any[];
    if (arr.length + 1 > MAX_ITEMS) {
      message.warning(`素材数量不能超过 ${MAX_ITEMS} 个`);
      return;
    }
    const next = { ...timeline, [track]: [...arr, item] };
    if (timelineDuration(next) > MAX_SECONDS) {
      message.warning(`视频总长度不能超过 ${MAX_SECONDS} 秒，请缩短已有片段后再添加`);
      return;
    }
    setTimeline(next);
    setSelected({ track, id: item.id });
  }, [timeline]);

  const handleAddFromAssetPanel = useCallback((a: AssetItem) => {
    const url = toStaticUrl(a.url) || '';
    if (isAudioUrl(url)) {
      addToTrack('audio', {
        id: genId('a'), url, start: 0, duration: 5, volume: 0.8, fadeIn: 0, fadeOut: 2,
      } as TimelineAudioItem);
      return;
    }
    addToTrack('video', {
      id: genId('v'), url, start: videoEnd, duration: 3, trimIn: 0, filter: 'none', nextTransition: null,
    } as TimelineVideoItem);
  }, [addToTrack, videoEnd]);

  const addText = () => {
    addToTrack('text', {
      id: genId('t'), text: '请输入文字', start: round1(currentTime), duration: 3,
      x: 0.5, y: 0.15, fontSize: 48, color: '#FFFFFF', opacity: 1, animation: 'fade',
    } as TimelineTextItem);
  };

  const handleUpload = async (file: File): Promise<boolean> => {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post('/api/editor/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = res.data.url;
      if (isAudioUrl(url)) {
        setAudioItems((arr) => [...arr, { kind: 'upload', type: 'video', url, title: res.data.original_name || '音频' }]);
        addToTrack('audio', {
          id: genId('a'), url, start: 0, duration: 5, volume: 0.8, fadeIn: 0, fadeOut: 2,
        } as TimelineAudioItem);
      } else if (isVideoUrl(url)) {
        addToTrack('video', {
          id: genId('v'), url, start: videoEnd, duration: 3, trimIn: 0, filter: 'none', nextTransition: null,
        } as TimelineVideoItem);
      } else {
        addToTrack('video', {
          id: genId('v'), url, start: videoEnd, duration: 3, trimIn: 0, filter: 'none', nextTransition: null,
        } as TimelineVideoItem);
      }
      message.success('上传成功并已添加');
      return true;
    } catch (err: any) {
      message.error('上传失败: ' + (err?.response?.data?.message || err.message));
      return false;
    } finally {
      setUploading(false);
    }
  };

  // ── Split at playhead ──
  const handleSplit = () => {
    if (!selected) { message.warning('请先在时间线上选中片段'); return; }
    const cut = currentTime;
    const arr = (timeline as any)[selected.track] as any[];
    const item = arr.find((x) => x.id === selected.id);
    if (!item) return;
    const start = Number(item.start), dur = Number(item.duration);
    const end = start + dur;
    if (cut <= start + 0.2 || cut >= end - 0.2) { message.warning('播放头离片段边缘太近，无法分割'); return; }
    const head: any = { ...item, duration: round1(cut - start) };
    const tail: any = {
      ...item,
      id: genId(selected.track[0]),
      start: round1(cut),
      duration: round1(end - cut),
    };
    if (selected.track === 'video') {
      head.nextTransition = null;
      tail.nextTransition = (item as TimelineVideoItem).nextTransition;
      tail.trimIn = round1((Number(item.trimIn) || 0) + (cut - start));
    }
    setTimeline({ ...timeline, [selected.track]: [...arr.filter((x) => x.id !== item.id), head, tail] });
    setSelected({ track: selected.track, id: tail.id });
    setPlaying(false);
  };

  const handleDeleteSelected = () => {
    if (!selected) return;
    setTimeline({ ...timeline, [selected.track]: (timeline as any)[selected.track].filter((x: any) => x.id !== selected.id) });
    setSelected(null);
  };

  // ── Player wiring ──
  const selectedVideo = selected?.track === 'video'
    ? (timeline.video.find((x) => x.id === selected.id) || null) : null;
  const fallbackVideo = useMemo(
    () => timeline.video.find((v) => isVideoUrl(v.url)) || null,
    [timeline.video],
  );
  const renderOK = render?.status === 'completed' && !!render.result_url;
  const playerSrc = renderOK && render.result_url
    ? render.result_url
    : selectedVideo
      ? toStaticUrl(selectedVideo.url)
      : fallbackVideo ? toStaticUrl(fallbackVideo.url) : undefined;
  const playerCanPlay = !!playerSrc && !isImageUrl(playerSrc);

  // playable video segments sorted by start (timeline preview mode)
  const playableSegs = useMemo(
    () => timeline.video
      .filter((v) => v.url && isVideoUrl(v.url))
      .sort((a, b) => (a.start || 0) - (b.start || 0)),
    [timeline.video],
  );

  // Playing state: which video segment is currently bound to the <video>
  const boundSegRef = useRef<TimelineVideoItem | null>(null);

  // Start / restart playback from the current playhead (or selected clip start)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!playing) { v.pause(); return; }
    if (renderOK) {
      v.play().catch(() => { /* ignore autoplay errors */ });
      return;
    }
    // timeline preview: bind the segment under the playhead (fallback: playableSegs[0])
    const t0 = selectedVideo && isVideoUrl(selectedVideo.url)
      ? (selectedVideo.start || 0) : currentTime;
    const target = playableSegs.find((s) => t0 >= (s.start || 0) && t0 < (s.start || 0) + (s.duration || 0))
      || playableSegs.find((s) => (s.start || 0) + (s.duration || 0) > t0)
      || null;
    if (!target) { setPlaying(false); return; }
    boundSegRef.current = target;
    const url = toStaticUrl(target.url) || '';
    if (v.getAttribute('src') !== url) {
      v.src = url;
      const local = Math.max(0, t0 - (target.start || 0) + (Number(target.trimIn) || 0));
      v.addEventListener('loadedmetadata', () => {
        v.currentTime = Math.min(local, Math.max(0, v.duration - 0.05));
        v.play().catch(() => { });
      }, { once: true });
    } else {
      const local = Math.max(0, t0 - (target.start || 0) + (Number(target.trimIn) || 0));
      v.currentTime = Math.min(local, Math.max(0, v.duration - 0.05));
      v.play().catch(() => { });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playerSrc) return;
    if (!renderOK) {
      v.pause();
      v.removeAttribute('src');
      v.load();
      boundSegRef.current = null;
      return;
    }
    if (Math.abs(v.currentTime - currentTime) > 0.3) v.currentTime = currentTime;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerSrc, renderOK]);

  // Timeline preview: advance to the next playable segment when the current one ends
  const advanceToNext = useCallback((v: HTMLVideoElement) => {
    const cur = boundSegRef.current;
    const from = cur ? (cur.start || 0) + (cur.duration || 0) : currentTime;
    const next = playableSegs.find((s) => (s.start || 0) + (s.duration || 0) > from + 0.03) || null;
    if (!next) { setPlaying(false); return; }
    boundSegRef.current = next;
    const url = toStaticUrl(next.url) || '';
    const local = Math.max(0, Number(next.trimIn) || 0);
    if (v.getAttribute('src') !== url) {
      v.src = url;
      v.addEventListener('loadedmetadata', () => {
        v.currentTime = Math.min(local, Math.max(0, v.duration - 0.05));
        v.play().catch(() => { });
      }, { once: true });
    } else {
      v.currentTime = local;
      v.play().catch(() => { });
    }
  }, [playableSegs, currentTime]);

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !playing) return;
    if (renderOK) {
      setCurrentTime((t) => (Math.abs(t - v.currentTime) > 0.05 ? v.currentTime : t));
      if (v.currentTime >= v.duration - 0.12) setPlaying(false);
      return;
    }
    // timeline preview: resolve the bound segment against the latest timeline data
    const boundId = boundSegRef.current?.id;
    const seg = (boundId && playableSegs.find((s) => s.id === boundId)) || null;
    if (!seg) { advanceToNext(v); return; }
    const local = v.currentTime;
    if (local >= (seg.duration || 0) - 0.08) { advanceToNext(v); return; }
    const globalT = (seg.start || 0) + local - (Number(seg.trimIn) || 0);
    setCurrentTime((t) => (Math.abs(t - globalT) > 0.1 ? globalT : t));
  };

  const handleSeek = (t: number) => {
    setCurrentTime(t);
    if (!renderOK) {
      const v = videoRef.current;
      if (v) {
        const target = playableSegs.find((s) => t >= (s.start || 0) && t < (s.start || 0) + (s.duration || 0));
        if (target) {
          const url = toStaticUrl(target.url) || '';
          if (v.getAttribute('src') !== url) {
            v.src = url;
            v.addEventListener('loadedmetadata', () => {
              v.currentTime = Math.min(Math.max(0, t - (target.start || 0) + (Number(target.trimIn) || 0)), Math.max(0, v.duration - 0.05));
            }, { once: true });
          } else {
            v.currentTime = Math.max(0, t - (target.start || 0) + (Number(target.trimIn) || 0));
          }
        }
      }
      return;
    }
    const v = videoRef.current;
    if (v && Math.abs(v.currentTime - t) > 0.3) v.currentTime = t;
  };

  // ── Render / export ──
  const handleRender = async () => {
    try {
      if (timeline.video.length === 0 && timeline.text.length === 0) { message.warning('请先添加视频素材或文字片段'); return; }
      if (timeline.video.some((v) => !v.url)) { message.warning('有视频片段缺少素材'); return; }
      const total = timelineDuration(timeline);
      if (total > MAX_SECONDS) { message.warning(`视频总长度不能超过 ${MAX_SECONDS} 秒`); return; }
      setSaving(true);
      const pid = await persist();
      setSaving(false);
      if (isNew && pid) navigate(`/editor/${pid}`, { replace: true });
      await api.post(`/api/editor/projects/${pid}/render`);
      setRender({ status: 'rendering', progress: 0 });
      message.success('开始渲染...');
    } catch (err: any) {
      setSaving(false);
      message.error('渲染启动失败: ' + (err?.response?.data?.message || err.message));
    }
  };

  const totalDur = timelineDuration(timeline);
  const totalItems = timeline.video.length + timeline.audio.length + timeline.text.length;

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '100px 0' }}><Spin size="large" /></div>;
  }

  if (loadError) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <Text strong style={{ fontSize: 15 }}>项目加载失败</Text>
        <div style={{ color: '#f5222d', margin: '10px 0 20px', fontSize: 13 }}>{loadError}</div>
        <Button onClick={() => navigate('/editor')} style={{ borderRadius: 10 }}>返回剪辑列表</Button>
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px', height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexShrink: 0 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/editor')} style={{ borderRadius: 10 }} />
        <Input value={name} onChange={e => setName(e.target.value)} style={{ width: 180, borderRadius: 10, fontWeight: 600 }} placeholder="剪辑项目名称" />
        <Select value={ratio} onChange={setRatio} style={{ width: 80, borderRadius: 10 }}
          options={RATIOS.map(r => ({ value: r, label: r }))} />
        <Select value={resolution} onChange={setResolution} style={{ width: 84, borderRadius: 10 }}
          options={RESOLUTIONS.map(r => ({ value: r, label: r }))} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          总长 {totalDur.toFixed(1)}s · {totalItems}/{MAX_ITEMS} 素材
        </Text>
        <Tag color="orange" style={{ marginLeft: 4 }}>免费</Tag>

        <div style={{ flex: 1 }} />
        {saved && <Tag color="success">已保存</Tag>}
        <Button icon={<SaveOutlined />} loading={saving} onClick={handleSave} style={{ borderRadius: 10 }}>保存</Button>
        <Button type="primary" icon={<PlayCircleOutlined />} loading={render?.status === 'rendering'}
          onClick={handleRender} style={{ borderRadius: 10, background: '#7c3aed', borderColor: '#7c3aed' }}>
          导出渲染
        </Button>
        {render?.status === 'completed' && render.result_url && (
          <Button type="primary" icon={<DownloadOutlined />} href={render.result_url} download style={{ borderRadius: 10, background: '#16a34a', borderColor: '#16a34a' }}>
            下载成片
          </Button>
        )}
      </div>

      {/* Render progress */}
      {render?.status === 'rendering' && (
        <div style={{ marginBottom: 10, flexShrink: 0 }}>
          <Progress percent={render.progress || 0} status="active" strokeColor="#7c3aed" size="small" />
        </div>
      )}
      {render?.status === 'failed' && (
        <div style={{ marginBottom: 10, flexShrink: 0, color: '#f5222d', fontSize: 12 }}>
          渲染失败: {render.error_msg}
        </div>
      )}

      {/* Main */}
      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
        {/* Left: assets */}
        <div style={{ width: 210, flexShrink: 0, background: '#fff', borderRadius: 12, padding: 10, overflow: 'auto', border: '1px solid #eceef1', display: 'flex', flexDirection: 'column' }}>
          <Text strong style={{ fontSize: 13, marginBottom: 8 }}>素材库</Text>
          <Upload.Dragger beforeUpload={(file) => { handleUpload(file); return false; }} showUploadList={false} style={{ marginBottom: 10, borderRadius: 10, padding: '4px 0' }}>
            <Text style={{ fontSize: 11, color: '#666' }}>{uploading ? '上传中...' : '上传视频/图片/音频'}</Text>
          </Upload.Dragger>
          <Button block size="small" icon={<FontSizeOutlined />} onClick={addText} style={{ marginBottom: 10, borderRadius: 8, color: '#10b981' }}>
            添加文字
          </Button>
          <Radio.Group
            size="small"
            value={assetTab}
            onChange={(e) => setAssetTab(e.target.value)}
            style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}
          >
            <Radio.Button value="ai">AI 历史</Radio.Button>
            <Radio.Button value="assets">资产库</Radio.Button>
            <Radio.Button value="viral">热门创作</Radio.Button>
            <Radio.Button value="drama">短剧片段</Radio.Button>
            <Radio.Button value="audio">音频 BGM</Radio.Button>
          </Radio.Group>
          {assetTab !== 'audio' ? (
            assetLoading ? <Spin size="small" style={{ margin: '20px auto', display: 'block' }} /> : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(assetTab === 'ai' ? aiTasks : assetTab === 'assets' ? globalAssets : assetTab === 'viral' ? viralProjects : dramaClips)
                  .map((it, i) => <AssetCard key={`${assetTab}${i}`} item={it} onClick={handleAddFromAssetPanel} />)}
                {(assetTab === 'ai' ? aiTasks : assetTab === 'assets' ? globalAssets : assetTab === 'viral' ? viralProjects : dramaClips).length === 0 &&
                  <Empty description="暂无素材" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ gridColumn: '1 / -1', margin: '12px 0' }} />}
              </div>
            )
          ) : (
            <div>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                上传 mp3/wav/m4a 音频作为 BGM 或配音；点击左侧「上传」后自动加入音频轨
              </Text>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {audioItems.map((it, i) => (
                  <div key={i} onClick={() => handleAddFromAssetPanel(it)}
                    style={{ cursor: 'pointer', border: '1px solid #f0f0f0', borderRadius: 10, padding: 12, textAlign: 'center', background: '#fff' }}>
                    <SoundOutlined style={{ fontSize: 22, color: '#0ea5e9' }} />
                    <Text style={{ fontSize: 11, color: '#888', display: 'block', marginTop: 6 }} ellipsis={{ tooltip: it.title }}>{it.title}</Text>
                  </div>
                ))}
                {audioItems.length === 0 && <Empty description="暂无音频" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ gridColumn: '1 / -1', margin: '12px 0' }} />}
              </div>
            </div>
          )}
        </div>

        {/* Center: player + timeline */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Player */}
          <div style={{ background: '#111', borderRadius: 12, height: 300, flexShrink: 0, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {playerSrc ? (
              isImageUrl(playerSrc) ? (
                <img src={playerSrc} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} />
              ) : (
                <video ref={videoRef} src={playerSrc} onTimeUpdate={handleTimeUpdate} preload="auto"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              )
            ) : (
              <div style={{ textAlign: 'center', color: '#555' }}>
                <VideoCameraOutlined style={{ fontSize: 40 }} />
                <div style={{ fontSize: 12, marginTop: 8 }}>点击左侧素材添加到时间线，选中片段后可预览</div>
              </div>
            )}
            {/* text overlay (timeline preview only; final render bakes text into the video) */}
            {!renderOK && timeline.text.map((t) => {
              const visible = currentTime >= (t.start || 0) && currentTime < (t.start || 0) + (t.duration || 0);
              if (!visible) return null;
              return (
                <div key={t.id} style={{
                  position: 'absolute', left: `${t.x ?? 50}%`, top: `${t.y ?? 50}%`,
                  transform: 'translate(-50%,-50%)', color: t.color || '#fff',
                  fontSize: Math.max(10, Math.round((t.fontSize || 36) * 300 / 1280)),
                  opacity: t.opacity ?? 1, textShadow: '0 0 8px rgba(0,0,0,.85), 0 2px 4px rgba(0,0,0,.5)',
                  zIndex: 20, pointerEvents: 'none', whiteSpace: 'pre-wrap', textAlign: 'center',
                  maxWidth: '92%', fontWeight: 600, lineHeight: 1.25,
                }}>
                  {t.text}
                </div>
              );
            })}
            <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)' }}>
              <Button
                icon={playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                disabled={!playerCanPlay}
                style={{ borderRadius: 20, background: 'rgba(0,0,0,.6)', color: '#fff', border: 'none' }}
                onClick={() => setPlaying(!playing)}
              />
            </div>
          </div>

          {/* Timeline */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <Timeline
              timeline={timeline}
              currentTime={currentTime}
              selected={selected}
              pxPerSec={pxPerSec}
              playing={playing}
              onTogglePlay={(t) => { if (t !== currentTime) handleSeek(t); setPlaying(playerCanPlay && !playing); }}
              onPxPerSec={setPxPerSec}
              onTimelineChange={(t) => { setTimeline(t); setSelected((s) => s && (t as any)[s.track].some((x: any) => x.id === s.id) ? s : null); }}
              onSelect={(s) => { setSelected(s); if (s) { setPlaying(false); } }}
              onSeek={handleSeek}
              onSplit={handleSplit}
              onDeleteSelected={handleDeleteSelected}
            />
          </div>
        </div>

        {/* Right: props */}
        <div style={{ width: 270, flexShrink: 0, background: '#fff', borderRadius: 12, border: '1px solid #eceef1', overflow: 'hidden', minHeight: 0 }}>
          <PropsPanel selected={selected} timeline={timeline} onTimelineChange={setTimeline} />
        </div>
      </div>
    </div>
  );
}

function normalizeTimeline(tl: any): TimelineDoc {
  const numOr = (v: any, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const video = Array.isArray(tl?.video) ? tl.video.map((v: any) => ({
    id: v.id, url: toStaticUrl(v.url) || '', start: Number(v.start) || 0, duration: Number(v.duration) || 3,
    trimIn: Number(v.trimIn) || 0, filter: v.filter || 'none', nextTransition: v.nextTransition || null,
  })) : [];
  const audio = Array.isArray(tl?.audio) ? tl.audio.map((a: any) => ({
    id: a.id, url: toStaticUrl(a.url) || '', start: Number(a.start) || 0, duration: Number(a.duration) || 5,
    volume: numOr(a.volume, 0.8), fadeIn: Number(a.fadeIn) || 0, fadeOut: Number(a.fadeOut) || 0,
  })) : [];
  const text = Array.isArray(tl?.text) ? tl.text.map((t: any) => ({
    id: t.id, text: String(t.text || ''), start: Number(t.start) || 0, duration: Number(t.duration) || 3,
    x: numOr(t.x, 0.5), y: numOr(t.y, 0.15), fontSize: Number(t.fontSize) || 48,
    color: t.color || '#FFFFFF', opacity: numOr(t.opacity, 1), animation: t.animation || 'fade',
  })) : [];
  return { duration: Number(tl?.duration) || 0, video, audio, text };
}