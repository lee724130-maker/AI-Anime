import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Typography, Button, Input, Select, Spin, message, Empty, Upload, Progress, Tag, Radio,
} from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, PlayCircleOutlined, PauseCircleOutlined, DownloadOutlined,
  VideoCameraOutlined, FontSizeOutlined, SoundOutlined, ReloadOutlined,
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

const CSS_FILTERS: Record<string, string> = {
  grayscale: 'grayscale(1)',
  sepia: 'sepia(0.8)',
  warm: 'sepia(0.3) saturate(1.4)',
  cool: 'saturate(0.8) hue-rotate(20deg)',
  vintage: 'sepia(0.4) saturate(0.8) brightness(0.9)',
  bright: 'brightness(1.3)',
  dark: 'brightness(0.7)',
  contrast: 'contrast(1.4)',
  soft: 'blur(0.5px) brightness(1.1)',
  vivid: 'saturate(1.8) contrast(1.1)',
};

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
  const audioRef = useRef<HTMLAudioElement>(null);
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
          if (a.audio_url) assets.push({ kind: 'global_asset', type: 'audio', url: a.audio_url, title: a.name || '资产', ref_id: a.id });
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

  // Every timeline mutation recomputes the total duration (ruler range /
  // scroll width / seek clamping all depend on it). Mutations push a history
  // snapshot so 撤回/还原 (undo/redo) can step back to a previous state.
  const MAX_HISTORY = 50;
  const timelineRef = useRef(timeline);
  useEffect(() => { timelineRef.current = timeline; }, [timeline]);
  const [undoStack, setUndoStack] = useState<TimelineDoc[]>([]);
  const [redoStack, setRedoStack] = useState<TimelineDoc[]>([]);
  // Snapshot push is debounced (400ms window) so drag-move / typing bursts
  // collapse into one undo step instead of flooding the stack per mousemove.
  const pushTimerRef = useRef<any>(null);
  const flushHistoryTimer = useCallback(() => {
    if (pushTimerRef.current) { clearTimeout(pushTimerRef.current); pushTimerRef.current = null; }
  }, []);
  useEffect(() => () => flushHistoryTimer(), [flushHistoryTimer]);

  const pushHistory = useCallback(() => {
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      pushTimerRef.current = null;
      setUndoStack((prev) => {
        const next = [...prev, JSON.parse(JSON.stringify(timelineRef.current))];
        return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
      });
      setRedoStack([]);
    }, 400);
  }, []);

  const commitTimeline = useCallback((t: TimelineDoc, skipHistory = false) => {
    if (!skipHistory) pushHistory();
    setTimeline({ ...t, duration: round1(timelineDuration(t)) });
  }, [pushHistory]);

  const undo = useCallback(() => {
    flushHistoryTimer();
    if (undoStack.length === 0) return;
    const snapshot = undoStack[undoStack.length - 1];
    setUndoStack(undoStack.slice(0, -1));
    setRedoStack((r) => [...r, JSON.parse(JSON.stringify(timelineRef.current))]);
    setTimeline({ ...snapshot, duration: round1(timelineDuration(snapshot)) });
    setSelected(null);
  }, [undoStack, flushHistoryTimer]);

  const redo = useCallback(() => {
    flushHistoryTimer();
    if (redoStack.length === 0) return;
    const snapshot = redoStack[redoStack.length - 1];
    setRedoStack(redoStack.slice(0, -1));
    setUndoStack((u) => [...u, JSON.parse(JSON.stringify(timelineRef.current))]);
    setTimeline({ ...snapshot, duration: round1(timelineDuration(snapshot)) });
    setSelected(null);
  }, [redoStack, flushHistoryTimer]);

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
    commitTimeline(next);
    setSelected({ track, id: item.id });
  }, [timeline, commitTimeline]);

  // Probe a video's real duration (used as the clip duration when added)
  const probeVideoDuration = useCallback((url: string) => new Promise<number>((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    const done = (d: number) => {
      v.removeAttribute('src');
      v.load();
      resolve(Math.min(Math.max(d, 1), MAX_SECONDS));
    };
    v.onloadedmetadata = () => done(isFinite(v.duration) && v.duration > 0 ? v.duration : 3);
    v.onerror = () => done(3);
    v.src = url;
    setTimeout(() => { if (!isFinite(v.duration) || v.duration <= 0) done(3); }, 8000);
  }), []);

  // Probe an audio file's real duration (used as the track's sourceDuration /
  // duration cap when added to the audio track)
  const probeAudioDuration = useCallback((url: string) => new Promise<number>((resolve) => {
    const a = document.createElement('audio');
    a.preload = 'metadata';
    const done = (d: number) => {
      a.removeAttribute('src');
      a.load();
      resolve(isFinite(d) && d > 0 ? d : 0);
    };
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(0);
    a.src = url;
    setTimeout(() => { if (!isFinite(a.duration) || a.duration <= 0) done(0); }, 8000);
  }), []);

  const handleAddFromAssetPanel = useCallback(async (a: AssetItem) => {
    const url = toStaticUrl(a.url) || '';
    if (isAudioUrl(url)) {
      const srcDur = await probeAudioDuration(url);
      addToTrack('audio', {
        id: genId('a'), url, start: 0, duration: Math.max(0.5, Math.min(srcDur || 5, MAX_SECONDS)),
        volume: 0.8, fadeIn: 0, fadeOut: 0, trimIn: 0,
        sourceDuration: srcDur > 0 ? srcDur : undefined,
      } as TimelineAudioItem);
      return;
    }
    const dur = isVideoUrl(url) ? round1(await probeVideoDuration(url)) : 3;
    addToTrack('video', {
      id: genId('v'), url, start: videoEnd, duration: dur, trimIn: 0, filter: 'none', nextTransition: null, muted: false,
    } as TimelineVideoItem);
  }, [addToTrack, videoEnd, probeVideoDuration, probeAudioDuration]);

  // Render asset groups (videos + images separated)
  const renderAssetGroups = (items: AssetItem[]) => {
    if (items.length === 0) {
      return <Empty description="暂无素材" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '12px 0' }} />;
    }
    const videos = items.filter(it => it.type === 'video');
    const images = items.filter(it => it.type === 'image');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {videos.length > 0 && (
          <div>
            <Text strong style={{ fontSize: 11, color: '#888', marginBottom: 6, display: 'block' }}>🎬 视频素材 ({videos.length})</Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {videos.map((it, i) => <AssetCard key={`v${assetTab}${i}`} item={it} onClick={handleAddFromAssetPanel} />)}
            </div>
          </div>
        )}
        {images.length > 0 && (
          <div style={{ marginTop: videos.length > 0 ? 8 : 0, paddingTop: videos.length > 0 ? 8 : 0, borderTop: videos.length > 0 ? '1px solid #f0f0f0' : 'none' }}>
            <Text strong style={{ fontSize: 11, color: '#888', marginBottom: 6, display: 'block' }}>🖼️ 图片素材 ({images.length})</Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {images.map((it, i) => <AssetCard key={`i${assetTab}${i}`} item={it} onClick={handleAddFromAssetPanel} />)}
            </div>
          </div>
        )}
      </div>
    );
  };

  const addText = () => {
    addToTrack('text', {
      id: genId('t'), text: '请输入文字', start: round1(currentTime), duration: 3,
      x: 0.5, y: 0.5, fontSize: 48, color: '#FFFFFF', opacity: 1, animation: 'fade',
    } as TimelineTextItem);
  };

  // Drag a text overlay on the preview to reposition it (0..1 ratio)
  const previewWrapRef = useRef<HTMLDivElement | null>(null);
  const updateTextPos = useCallback((id: string, x: number, y: number) => {
    pushHistory();
    setTimeline((prev) => {
      const next: TimelineDoc = {
        ...prev,
        text: (prev.text as TimelineTextItem[]).map((it) =>
          it.id === id ? { ...it, x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) } : it,
        ),
      };
      return { ...next, duration: round1(timelineDuration(next)) };
    });
  }, []);

  const startTextDrag = useCallback((t: TimelineTextItem, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const wrap = previewWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const sx = e.clientX, sy = e.clientY;
    const ox = t.x ?? 0.5, oy = t.y ?? 0.5;
    const move = (ev: MouseEvent) => {
      updateTextPos(t.id, ox + (ev.clientX - sx) / rect.width, oy + (ev.clientY - sy) / rect.height);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [updateTextPos]);

  const handleUpload = async (file: File): Promise<boolean> => {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post('/api/editor/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = res.data.url;
      if (isAudioUrl(url)) {
        setAudioItems((arr) => [...arr, { kind: 'upload', type: 'video', url, title: res.data.original_name || '音频' }]);
        const srcDur = await probeAudioDuration(url);
        addToTrack('audio', {
          id: genId('a'), url, start: 0, duration: Math.max(0.5, Math.min(srcDur || 5, MAX_SECONDS)),
          volume: 0.8, fadeIn: 0, fadeOut: 0, trimIn: 0,
          sourceDuration: srcDur > 0 ? srcDur : undefined,
        } as TimelineAudioItem);
      } else {
        const dur = isVideoUrl(url) ? round1(await probeVideoDuration(url)) : 3;
        addToTrack('video', {
          id: genId('v'), url, start: videoEnd, duration: dur, trimIn: 0, filter: 'none', nextTransition: null, muted: false,
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
    commitTimeline({ ...timeline, [selected.track]: [...arr.filter((x) => x.id !== item.id), head, tail] });
    setSelected({ track: selected.track, id: tail.id });
    setPlaying(false);
  };

  const handleMerge = async () => {
    if (!selected || selected.track !== 'video') { message.warning('请先在视频轨上选中片段'); return; }
    const sorted = [...timeline.video].sort((a, b) => (a.start || 0) - (b.start || 0));
    const sortedIdx = sorted.findIndex((x) => x.id === selected.id);
    if (sortedIdx < 0) return;
    if (sortedIdx >= sorted.length - 1) { message.warning('没有可合并的下一段（已是最后一段）'); return; }
    const cur = sorted[sortedIdx];
    const next = sorted[sortedIdx + 1];
    const curStart = Number(cur.start) || 0;
    const nextEnd = (Number(next.start) || 0) + (Number(next.duration) || 0);

    // Same URL → simple duration merge
    if (cur.url === next.url) {
      const merged: TimelineVideoItem = {
        ...cur,
        duration: round1(nextEnd - curStart),
        nextTransition: next.nextTransition || null,
      };
      const newArr = sorted.filter((x) => x.id !== next.id).map((x) => x.id === cur.id ? merged : x);
      commitTimeline({ ...timeline, video: newArr });
      setSelected({ track: 'video', id: cur.id });
      setPlaying(false);
      message.success('已合成');
      return;
    }

    // Different URLs → ffmpeg concat via backend
    message.loading({ content: '正在拼接视频...', key: 'merge', duration: 0 });
    try {
      const { data } = await api.post('/api/editor/concat', { urlA: cur.url, urlB: next.url });
      const merged: TimelineVideoItem = {
        ...cur,
        url: data.url,
        duration: round1(data.duration || (nextEnd - curStart)),
        trimIn: 0,
        nextTransition: next.nextTransition || null,
      };
      const newArr = sorted.filter((x) => x.id !== next.id).map((x) => x.id === cur.id ? merged : x);
      commitTimeline({ ...timeline, video: newArr });
      setSelected({ track: 'video', id: cur.id });
      setPlaying(false);
      message.success({ content: '拼接完成', key: 'merge' });
    } catch (err: any) {
      message.error({ content: '拼接失败: ' + (err.response?.data?.message || err.message), key: 'merge' });
    }
  };

  const handleDeleteSelected = () => {
    if (!selected) return;
    commitTimeline({ ...timeline, [selected.track]: (timeline as any)[selected.track].filter((x: any) => x.id !== selected.id) });
    setSelected(null);
  };

  // ── Player wiring ──
  // playable segments (video + image clips) sorted by start (timeline preview mode)
  const playableSegs = useMemo(
    () => timeline.video
      .filter((v) => v.url)
      .sort((a, b) => (a.start || 0) - (b.start || 0)),
    [timeline.video],
  );
  const fallbackVideo = useMemo(
    () => timeline.video.find((v) => isVideoUrl(v.url)) || null,
    [timeline.video],
  );
  const renderOK = render?.status === 'completed' && !!render.result_url;
  const playerSrc = renderOK && render.result_url
    ? render.result_url
    : fallbackVideo ? toStaticUrl(fallbackVideo.url) : undefined;
  const playerCanPlay = renderOK ? !!playerSrc : playableSegs.length > 0 || timeline.audio.length > 0;
  // The <video> element must stay visible while the timeline preview drives it
  // via bindSeg (it is hidden only when there is nothing video-like to show).
  const showVideoEl = renderOK ? !!playerSrc : timeline.video.length > 0;

  const playheadRef = useRef(0);
  const setPlayhead = (t: number) => { playheadRef.current = t; setCurrentTime(t); };

  // Bound segment + image overlay (image segments are shown as a static frame,
  // only while the playhead sits inside the image segment — selecting a clip
  // must never cover the video area)
  const boundSegRef = useRef<TimelineVideoItem | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [previewFilter, setPreviewFilter] = useState<string>('none');
  const [transitionOpacity, setTransitionOpacity] = useState<number>(0);
  const previewImgShown = previewImg;

  // When a bound segment is removed from the timeline, clear its stale preview
  useEffect(() => {
    const boundId = boundSegRef.current?.id;
    if (boundId && !timeline.video.some((s) => s.id === boundId)) {
      boundSegRef.current = null;
      setPreviewImg(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline.video]);

  // Bind a segment to the player (video: play; image: pause video + show static img)
const bindSeg = useCallback((v: HTMLVideoElement, seg: TimelineVideoItem, segOffset: number) => {
    const prevSeg = boundSegRef.current;
    boundSegRef.current = seg;
    if (isImageUrl(seg.url)) {
      v.pause();
      setPreviewImg(toStaticUrl(seg.url) || null);
      setPreviewFilter('none');
      return;
    }
    setPreviewImg(null);
    // Apply CSS filter for preview
    setPreviewFilter(seg.filter || 'none');
    // Fade transition: briefly show overlay when switching segments
    if (prevSeg && prevSeg.id !== seg.id) {
      const trans = prevSeg.nextTransition;
      if (trans && trans.type !== 'none') {
        setTransitionOpacity(1);
        setTimeout(() => setTransitionOpacity(0), 200);
      }
    }
    // The <video> element only carries the clip's own audio; the mute toggle
    // on the segment hides it during preview (matching the 最终成片行为).
    v.muted = !!seg.muted;
    const url = toStaticUrl(seg.url) || '';
    const local = Math.max(0, segOffset + (Number(seg.trimIn) || 0));
    // duration may still be NaN right after assigning src (or when the source
    // errored); only seek once the metadata is ready, and never assign NaN
    const applyLocal = () => {
      const d = v.duration;
      if (!isFinite(d) || d <= 0) return;
      const t = Math.min(local, Math.max(0, d - 0.05));
      if (!isFinite(t)) return;
      try { v.currentTime = t; } catch { /* ignore */ }
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      if (playingRef.current) v.play().catch(() => { });
    };
    if (v.getAttribute('src') !== url) {
      v.src = url;
      v.addEventListener('loadedmetadata', applyLocal, { once: true });
    } else if (isFinite(v.duration) && v.duration > 0) {
      applyLocal();
    } else {
      v.addEventListener('loadedmetadata', applyLocal, { once: true });
    }
  }, []);

  // Live mirror of playing for callbacks/interval
  const playingRef = useRef(false);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  // Drive the audio-track elements in sync with the timeline playhead.
  // The <video> element only carries video segments' native audio; the audio
  // track (BGM / narration) is a SEPARATE hidden <audio> element that follows
  // the active item at the current playhead (respecting start / trimIn /
  // duration / volume). Skipped after a render, since the exported file has
  // the mixed audio baked in.
  const syncAudio = useCallback(() => {
    // ⚡ 关键：先同步 playingRef，避免闭包 stale 导致的无效返回
    playingRef.current = playing;
    const el = audioRef.current;
    if (!el) return;
    if (renderOK) {
      if (!el.paused) el.pause();
      return;
    }
    const t = playheadRef.current;
    // ⚡ 容差 ±0.2s 兼容浮点比较不精确与播放头抖动
    const active = ((timeline.audio as TimelineAudioItem[]) || []).find(
      (a) => t > (Number(a.start) || 0) - 0.2 && t < (Number(a.start) || 0) + (Number(a.duration) || 0) + 0.2,
    ) || null;
    if (!active) {
      if (!el.paused) el.pause();
      return;
    }
    const url = toStaticUrl(active.url) || '';
    if (!url) { el.src = ''; if (!el.paused) el.pause(); return; }
    const local = Math.max(0, t - (Number(active.start) || 0) + (Number(active.trimIn) || 0));
    const baseVol = Math.max(0, Math.min(1, Number(active.volume) ?? 0.8));
    const fadeIn = Number(active.fadeIn) || 0;
    const fadeOut = Number(active.fadeOut) || 0;
    const dur = Number(active.duration) || 0;
    let vol = baseVol;
    if (fadeIn > 0 && local < fadeIn) vol = baseVol * (local / fadeIn);
    if (fadeOut > 0 && dur > 0 && local > dur - fadeOut) vol = baseVol * ((dur - local) / fadeOut);
    vol = Math.max(0, Math.min(1, vol));
    const playIt = () => el.play().catch(() => { /* ignore autoplay errors */ });
    if (el.getAttribute('src') !== url) {
      el.src = url;
      el.onloadedmetadata = () => {
        const d = el.duration;
        if (isFinite(d) && d > 0) { try { el.currentTime = Math.min(local, Math.max(0, d - 0.05)); } catch { /* ignore */ } }
        el.volume = vol;
        playIt();
      };
    } else {
      // ⚡ 已有 src 时，若偏差超过 0.3s 才重新 seek，避免每帧抖动
      if (Math.abs(el.currentTime - local) > 0.3) { try { el.currentTime = local; } catch { /* ignore */ } }
      el.volume = vol;
      playIt();
    }
  }, [timeline.audio, renderOK, playing]); // ← 新增 playing 依赖，确保 playing 变化时重新计算

  // Start / restart playback from the current playhead (or selected clip start)
  useEffect(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v) return;
    if (!playing) {
      v.pause();
      if (a && !a.paused) a.pause();
      return;
    }
    if (renderOK) {
      v.muted = false;
      v.play().catch(() => { /* ignore autoplay errors */ });
      return;
    }
    // timeline preview: bind the segment under the playhead (fallback: next segment)
    const t0 = playheadRef.current;
    const target = playableSegs.find((s) => t0 >= (s.start || 0) && t0 < (s.start || 0) + (s.duration || 0))
      || playableSegs.find((s) => (s.start || 0) + (s.duration || 0) > t0)
      || null;
    if (target) {
      bindSeg(v, target, Math.max(0, t0 - (target.start || 0)));
    } else {
      // No video segment under the playhead (audio-only project, or between
      // segments): keep playing — the interval loop advances the playhead by
      // wall time and will stop at the end.
      v.pause();
      boundSegRef.current = null;
      setPreviewImg(null);
    }
    syncAudio();
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
      setPreviewImg(null);
      return;
    }
    if (Math.abs(v.currentTime - currentTime) > 0.3) v.currentTime = currentTime;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerSrc, renderOK]);

  // Timeline preview: advance to the next playable segment when the current one ends
  const advanceToNext = useCallback((v: HTMLVideoElement) => {
    const cur = boundSegRef.current;
    const from = cur ? (cur.start || 0) + (cur.duration || 0) : playheadRef.current;
    const next = playableSegs.find((s) => (s.start || 0) + (s.duration || 0) > from + 0.03) || null;
    if (!next) { setPlaying(false); setPlayhead(0); return; }
    bindSeg(v, next, 0);
  }, [playableSegs, bindSeg]);

  // Preview master loop: image segments advance the playhead by wall time;
  // video segment ends are detected via the timeupdate handler below;
  // gaps / audio-only sections advance by wall time too (audio track keeps playing)
  useEffect(() => {
    if (!playing || renderOK) return;
    let last = 0;
    const iv = window.setInterval(() => {
      const v = videoRef.current;
      if (!v || !playingRef.current) return;
      const now = Date.now();
      const dt = last ? (now - last) / 1000 : 0;
      last = now;
      const boundId = boundSegRef.current?.id;
      const seg = (boundId && playableSegs.find((s) => s.id === boundId)) || null;
      if (seg) {
        if (!isImageUrl(seg.url)) {
          const advance = v.currentTime >= (seg.duration || 0) - 0.08;
          if (advance) setPlayhead((seg.start || 0) + (seg.duration || 0));
          else setPlayhead((seg.start || 0) + v.currentTime - (Number(seg.trimIn) || 0));
          if (advance) advanceToNext(v);
          syncAudio();
          return;
        }
        // image segment: advance playhead by elapsed wall time
        const end = (seg.start || 0) + (seg.duration || 0);
        const nt = Math.min(playheadRef.current + dt, end - 0.05);
        setPlayhead(nt);
        if (nt >= end - 0.05) advanceToNext(v);
        syncAudio();
        return;
      }
      // no bound video segment: wall-clock advance (audio-only project or gap)
      const totalEnd = timelineDuration(timeline);
      const nt2 = Math.min(playheadRef.current + dt, totalEnd);
      setPlayhead(nt2);
      // entering a video segment from a gap → bind it
      const target = playableSegs.find((s) => nt2 >= (s.start || 0) && nt2 < (s.start || 0) + (s.duration || 0));
      if (target) bindSeg(v, target, Math.max(0, nt2 - (target.start || 0)));
      if (nt2 >= totalEnd - 0.02) { setPlaying(false); setPlayhead(0); }
      syncAudio();
    }, 120);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, renderOK, playableSegs, timeline, syncAudio]);

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !playing) return;
    if (renderOK) {
      setPlayhead(v.currentTime);
      syncAudio();
      if (v.currentTime >= v.duration - 0.12) { setPlaying(false); setPlayhead(0); }
      return;
    }
    // timeline preview: resolve the bound segment against the latest timeline data
    const boundId = boundSegRef.current?.id;
    const seg = (boundId && playableSegs.find((s) => s.id === boundId)) || null;
    if (!seg) { advanceToNext(v); return; }
    // image segment: no video time drives it — the interval loop advances the
    // playhead and detects the segment end (a stray timeupdate must NOT advance)
    if (isImageUrl(seg.url)) return;
    const local = v.currentTime;
    if (local >= (seg.duration || 0) - 0.08) { advanceToNext(v); return; }
    const globalT = (seg.start || 0) + local - (Number(seg.trimIn) || 0);
    if (Math.abs(playheadRef.current - globalT) > 0.1) setPlayhead(globalT);
    syncAudio();
  };

  const handleSeek = (t: number) => {
    setPlayhead(t);
    if (!renderOK) {
      const v = videoRef.current;
      if (v) {
        const target = playableSegs.find((s) => t >= (s.start || 0) && t < (s.start || 0) + (s.duration || 0)) || null;
        if (target) {
          bindSeg(v, target, Math.max(0, t - (target.start || 0)));
        } else {
          v.pause();
          setPreviewImg(null);
          boundSegRef.current = null;
        }
      }
      syncAudio();
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
    <div style={{ padding: '12px 16px', height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', overflowX: 'auto' }}>
      <div className="mobile-only-hint" style={{ flexShrink: 0, background: '#7c3aed', color: '#fff', textAlign: 'center', fontSize: 12, padding: '6px 12px', borderRadius: 8, marginBottom: 8 }}>
        剪辑编辑器为桌面端工具，建议在电脑浏览器（宽屏 ≥1024px）中操作，当前视口已启用横向滚动
      </div>
      <div style={{ minWidth: 1024, height: '100%', display: 'flex', flexDirection: 'column' }}>
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
            assetLoading
              ? <Spin size="small" style={{ margin: '20px auto', display: 'block' }} />
              : renderAssetGroups(
                  assetTab === 'ai' ? aiTasks : assetTab === 'assets' ? globalAssets : assetTab === 'viral' ? viralProjects : dramaClips
                )
          ) : (
            <div>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                上传 mp3/wav/m4a 音频作为 BGM 或配音；点击左侧「上传」后自动加入音频轨
              </Text>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {globalAssets.filter(it => it.type === 'audio').map((it, i) => (
                  <div key={`global-audio-${i}`}
                    onClick={() => handleAddFromAssetPanel(it)}
                    style={{ border: '1px solid #f0f0f0', borderRadius: 10, padding: 12, background: '#fff', cursor: 'pointer', transition: 'border-color .2s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#7c3aed')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#f0f0f0')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <SoundOutlined style={{ fontSize: 22, color: '#0ea5e9' }} />
                      <Text style={{ fontSize: 11, color: '#888', flex: 1 }} ellipsis={{ tooltip: it.title }}>{it.title}</Text>
                      <Tag color="blue">大资产库</Tag>
                    </div>
                    <audio src={toStaticUrl(it.url)} controls onClick={e => e.stopPropagation()} style={{ width: '100%' }} />
                  </div>
                ))}
                {audioItems.map((it, i) => (
                  <div key={`upload-${i}`}
                    onClick={() => handleAddFromAssetPanel(it)}
                    style={{ border: '1px solid #f0f0f0', borderRadius: 10, padding: 12, background: '#fff', cursor: 'pointer', transition: 'border-color .2s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#10b981')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#f0f0f0')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <SoundOutlined style={{ fontSize: 22, color: '#0ea5e9' }} />
                      <Text style={{ fontSize: 11, color: '#888', flex: 1 }} ellipsis={{ tooltip: it.title }}>{it.title}</Text>
                      <Tag color="green">上传</Tag>
                    </div>
                    <audio src={toStaticUrl(it.url)} controls onClick={e => e.stopPropagation()} style={{ width: '100%' }} />
                  </div>
                ))}
                {(globalAssets.filter(it => it.type === 'audio').length === 0 && audioItems.length === 0) && (
                  <Empty description="暂无音频" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '12px 0' }} />
                )}
                <Text type="secondary" style={{ fontSize: 10, textAlign: 'center' }}>点击卡片将音频添加到音频轨</Text>
              </div>
            </div>
          )}
        </div>

        {/* Center: player + timeline */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Player */}
          <div ref={previewWrapRef} style={{ background: previewImgShown ? '#000' : '#111', borderRadius: 12, height: 300, flexShrink: 0, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* hidden audio element drives the audio-track (BGM/narration) during preview */}
            <audio ref={audioRef} preload="auto" style={{ display: 'none' }} />
            {!showVideoEl ? (
              <video ref={videoRef} onTimeUpdate={handleTimeUpdate} preload="auto" style={{ display: 'none' }} />
            ) : (
              <video ref={videoRef} src={playerSrc && !isImageUrl(playerSrc) ? playerSrc : undefined} onTimeUpdate={handleTimeUpdate} preload="auto"
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: previewImgShown ? 'none' : undefined,
                  filter: previewFilter !== 'none' ? (CSS_FILTERS[previewFilter] || 'none') : undefined }} />
            )}
            {transitionOpacity > 0 && (
              <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: transitionOpacity * 0.6, zIndex: 15, pointerEvents: 'none', transition: 'opacity 0.2s' }} />
            )}
            {previewImgShown && (
              <img src={previewImgShown} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', zIndex: 10 }} />
            )}
            {!playerSrc && !previewImgShown && timeline.video.length === 0 && timeline.text.length === 0 && (
              <div style={{ textAlign: 'center', color: '#555' }}>
                <VideoCameraOutlined style={{ fontSize: 40 }} />
                <div style={{ fontSize: 12, marginTop: 8 }}>点击左侧素材添加到时间线，选中片段后可预览</div>
              </div>
            )}
            {/* text overlay (timeline preview only; final render bakes text into the video) */}
            {!renderOK && timeline.text.map((t) => {
              const inRange = currentTime >= (t.start || 0) && currentTime < (t.start || 0) + (t.duration || 0);
              const isSel = selected?.track === 'text' && selected.id === t.id;
              // While playing, honor the text block's time range strictly;
              // only when paused does a selected block show regardless of time (so its content/position can be edited)
              if (!inRange && !(isSel && !playing)) return null;
              return (
                <div key={t.id} onMouseDown={(e) => startTextDrag(t, e)} style={{
                  position: 'absolute', left: `${((t.x ?? 0.5)) * 100}%`, top: `${(t.y ?? 0.5) * 100}%`,
                  transform: 'translate(-50%,-50%)', color: t.color || '#fff',
                  fontSize: Math.max(10, Math.round((t.fontSize || 36) * 300 / 1280)),
                  opacity: t.opacity ?? 1, textShadow: '0 0 8px rgba(0,0,0,.85), 0 2px 4px rgba(0,0,0,.5)',
                  zIndex: 20, pointerEvents: 'auto', cursor: 'move', userSelect: 'none',
                  whiteSpace: 'pre-wrap', textAlign: 'center',
                  maxWidth: '92%', fontWeight: 600, lineHeight: 1.25,
                }}>
                  {t.text}
                </div>
              );
            })}
            <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8 }}>
              <Button
                icon={playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                disabled={!playerCanPlay}
                style={{ borderRadius: 20, background: 'rgba(0,0,0,.6)', color: '#fff', border: 'none' }}
                onClick={() => setPlaying(!playing)}
              />
              <Button
                icon={<ReloadOutlined />}
                disabled={!playerCanPlay}
                style={{ borderRadius: 20, background: 'rgba(0,0,0,.6)', color: '#fff', border: 'none' }}
                onClick={() => { setPlayhead(0); setPlaying(false); const v = videoRef.current; if (v) { v.currentTime = 0; v.pause(); } }}
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
              onTimelineChange={(t) => { commitTimeline(t); setSelected((s) => s && (t as any)[s.track].some((x: any) => x.id === s.id) ? s : null); }}
              onSelect={(s) => { setSelected(s); if (s) { setPlaying(false); } }}
              onSeek={handleSeek}
              onSplit={handleSplit}
              onMerge={handleMerge}
              onDeleteSelected={handleDeleteSelected}
              onUndo={undo}
              onRedo={redo}
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
            />
          </div>
        </div>

        {/* Right: props */}
        <div style={{ width: 270, flexShrink: 0, background: '#fff', borderRadius: 12, border: '1px solid #eceef1', overflow: 'hidden', minHeight: 0 }}>
          <PropsPanel selected={selected} timeline={timeline} onTimelineChange={commitTimeline} />
        </div>
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
    muted: !!v.muted,
  })) : [];
  const audio = Array.isArray(tl?.audio) ? tl.audio.map((a: any) => ({
    id: a.id, url: toStaticUrl(a.url) || '', start: Number(a.start) || 0, duration: Number(a.duration) || 5,
    volume: numOr(a.volume, 0.8), fadeIn: Number(a.fadeIn) || 0, fadeOut: Number(a.fadeOut) || 0,
    trimIn: Number(a.trimIn) || 0, sourceDuration: a.sourceDuration ? Number(a.sourceDuration) : undefined,
  })) : [];
  const text = Array.isArray(tl?.text) ? tl.text.map((t: any) => ({
    id: t.id, text: String(t.text || ''), start: Number(t.start) || 0, duration: Number(t.duration) || 3,
    x: numOr(t.x, 0.5), y: numOr(t.y, 0.5), fontSize: Number(t.fontSize) || 48,
    color: t.color || '#FFFFFF', opacity: numOr(t.opacity, 1), animation: t.animation || 'fade',
  })) : [];
  return { duration: Number(tl?.duration) || 0, video, audio, text };
}