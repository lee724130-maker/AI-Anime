import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Typography, Button, Tag, Space, Spin, message, Modal,
  Alert, Input, Select, Progress, Tooltip, Popconfirm,
} from 'antd';
import {
  ArrowLeftOutlined, ThunderboltOutlined, AimOutlined,
  ScissorOutlined, CheckCircleOutlined, DownloadOutlined, DeleteOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import './episode-detail.css';   // 本页质感改造样式（作用域 .edp-，详见文件头注释）

const { Title, Text } = Typography;
const STYLE_LABEL: Record<string, string> = { anime: '动漫', realistic: '写实' };
const API_BASE = import.meta.env.VITE_API_BASE || '';
const getUrl = (p: string | null) => p ? (p.startsWith('http') ? p : API_BASE + p) : '';

interface Segment {
  id: number; episode_id: number; segment_no: number;
  summary: string | null; prompt: string | null; prompt_cn: string | null;
  character_refs: string | null; prop_refs: string | null; scene_refs: string | null;
  duration: number | null; status: string; video_url: string | null;
}

interface Candidate {
  id: number; candidate_index: number; video_url: string | null;
  status: string; quality: string | null;
  quality_report: { issues?: string[]; consistency?: string } | null;
  is_accepted: boolean; is_main: boolean; error_msg: string | null;
}

const QUALITY_BADGE: Record<string, { color: string; label: string }> = {
  pass: { color: 'success', label: '✔ 合格' },
  flag: { color: 'error', label: '✘ 变形' },
  unknown: { color: 'default', label: '⚠ 未检' },
};

interface Episode {
  id: number; episode_no: number; title: string; summary: string | null;
  duration: number | null; video_url: string | null; stitch_status: string;
  style: string | null; ratio: string | null; resolution: string | null; audio_lang: string | null; tts_voice: string | null;
}

export default function EpisodeDetailPage() {
  const navigate = useNavigate();
  const { id, episodeId } = useParams();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [stitching, setStitching] = useState(false);
  const [generating, setGenerating] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState<Set<number>>(new Set());
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ total: number; completed: number } | null>(null);
  const [planning, setPlanning] = useState<Set<number>>(new Set());
  const [editModal, setEditModal] = useState<{ visible: boolean; seg: Segment | null; value: string }>({ visible: false, seg: null, value: '' });
  const [settingsModal, setSettingsModal] = useState<{ visible: boolean; style: string; ratio: string; resolution: string; audio_lang: string; tts_voice: string }>({ visible: false, style: 'anime', ratio: '9:16', resolution: '720p', audio_lang: 'zh', tts_voice: '' });
  const [voices, setVoices] = useState<Array<{ id: string; name: string; gender: string; style: string }>>([]);
  const [segmentProgress, setSegmentProgress] = useState<Record<number, { message: string; percent: number }>>({});
  const [stitchProgress, setStitchProgress] = useState<{ message: string; percent: number } | null>(null);
  const [candidates, setCandidates] = useState<Record<number, Candidate[]>>({});
  const [candidateCounts, setCandidateCounts] = useState<Record<number, number>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [playingCand, setPlayingCand] = useState<number | null>(null);
  const [candLoading, setCandLoading] = useState<Set<number>>(new Set());
  const [accepting, setAccepting] = useState<Set<number>>(new Set());
  const pollTimers = useRef<Map<number, any>>(new Map());
  const submittingRef = useRef<Set<number>>(new Set());
  const stitchPollTimer = useRef<any>(null);

  const fetchData = async () => {
    if (!episodeId) return;
    try {
      const { data } = await api.get(`/api/drama/episodes/${episodeId}`);
      setEpisode(data.episode);
      setSegments(data.segments || []);
      (data.segments || []).forEach((s: any) => {
        if (s.status === 'completed') loadCandidates(s.id);
      });
    } catch { message.error('加载失败'); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [episodeId]);

  useEffect(() => {
    api.get('/api/generate/tts-voices').then((res) => setVoices(res.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (segments.length && (selectedId === null || !segments.find(s => s.id === selectedId))) {
      setSelectedId(segments[0].id);
      setPlayingCand(null);
    }
  }, [segments, selectedId]);

  const clearAllTimers = () => {
    for (const timer of pollTimers.current.values()) { clearInterval(timer); }
    pollTimers.current.clear();
    if (stitchPollTimer.current) { clearInterval(stitchPollTimer.current); stitchPollTimer.current = null; }
    setGenerating(new Set());
    setBatchProgress(null);
    setBatchGenerating(false);
    setStitchProgress(null);
  };

  useEffect(() => { clearAllTimers(); }, [episodeId]);

  const finishPolling = (segId: number) => {
    const timer = pollTimers.current.get(segId);
    if (timer) { clearInterval(timer); pollTimers.current.delete(segId); }
    setGenerating(prev => { const s = new Set(prev); s.delete(segId); return s; });
    setSegmentProgress(prev => {
      const next = { ...prev };
      delete next[segId];
      return next;
    });
    setBatchProgress(prev => {
      if (!prev) return prev;
      const next = { ...prev, completed: prev.completed + 1 };
      if (next.completed >= next.total) {
        setTimeout(() => { setBatchProgress(null); setBatchGenerating(false); }, 1500);
      }
      return next;
    });
  };

  const startPolling = (segId: number) => {
    if (pollTimers.current.has(segId)) return;
    setGenerating(prev => new Set(prev).add(segId));
    const timer = setInterval(async () => {
      try {
        const { data } = await api.get(`/api/drama/episodes/${episodeId}/segments/${segId}/status`);
        if (data.progress_message || data.progress_percent != null) {
          setSegmentProgress(prev => ({ ...prev, [segId]: { message: data.progress_message || '', percent: data.progress_percent || 0 } }));
        }
        if (data.status === 'completed') {
          setSegmentProgress(prev => ({ ...prev, [segId]: { message: '视频已生成', percent: 100 } }));
          setTimeout(() => finishPolling(segId), 1000);
          fetchData();
          loadCandidates(segId);
        } else if (data.status === 'failed') {
          finishPolling(segId);
          message.error(`片段 #${segId} 生成失败`);
          fetchData();
        }
      } catch {
        finishPolling(segId);
      }
    }, 2000);
    pollTimers.current.set(segId, timer);
  };

  const candLoadingRef = useRef<Set<number>>(new Set());

  const loadCandidates = async (segId: number) => {
    if (candLoadingRef.current.has(segId)) return;
    candLoadingRef.current.add(segId);
    setCandLoading(prev => new Set(prev).add(segId));
    try {
      const { data } = await api.get(`/api/drama/segments/${segId}/candidates`);
      if (Array.isArray(data)) {
        setCandidates(prev => ({ ...prev, [segId]: data }));
      }
    } catch { /* 候选加载失败不影响主流程 */ }
    candLoadingRef.current.delete(segId);
    setCandLoading(prev => { const s = new Set(prev); s.delete(segId); return s; });
  };

  const handleAcceptCandidate = async (candidateId: number, segId: number) => {
    if (accepting.has(candidateId)) return;
    setAccepting(prev => new Set(prev).add(candidateId));
    try {
      await api.post(`/api/drama/candidates/${candidateId}/accept`);
      message.success('已采纳该候选');
      await loadCandidates(segId);
      setPlayingCand(null);
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.message || '采纳失败');
    }
    setAccepting(prev => { const s = new Set(prev); s.delete(candidateId); return s; });
  };

  const handleDeleteCandidate = async (candidateId: number, segId: number) => {
    try {
      await api.delete(`/api/drama/candidates/${candidateId}`);
      message.success('候选已移除');
      setPlayingCand(prev => (prev === candidateId ? null : prev));
      await loadCandidates(segId);
    } catch (err: any) {
      message.error(err.response?.data?.message || '删除失败');
    }
  };

  const handleGenerate = async (segId: number) => {
    if (submittingRef.current.has(segId)) return;
    submittingRef.current.add(segId);
    setSubmitting(prev => new Set(prev).add(segId));
    try {
      const count = candidateCounts[segId] || 1;
      await api.post(`/api/drama/episodes/${episodeId}/segments/${segId}/generate`, { candidate_count: count });
      message.info(`已加入生成队列（候选 ${count} 个）`);
      startPolling(segId);
    } catch (err: any) {
      message.error(err.response?.data?.message || '提交失败');
    } finally {
      submittingRef.current.delete(segId);
      setSubmitting(prev => { const s = new Set(prev); s.delete(segId); return s; });
    }
  };

  const handleGenerateAll = async () => {
    setBatchGenerating(true);
    setBatchProgress(null);
    let submittedCount = 0;
    try {
      const { data } = await api.post(`/api/drama/episodes/${episodeId}/generate-all`);
      const queued = data.filter((item: any) => item.status === 'queued');
      setBatchProgress({ total: queued.length, completed: 0 });
      for (const item of queued) {
        if (submittingRef.current.has(item.segmentId)) continue;
        startPolling(item.segmentId);
        submittedCount++;
      }
      if (submittedCount > 0) {
        message.success(`已提交 ${submittedCount} 个片段到生成队列`);
      } else {
        message.info('没有待生成的片段');
        setBatchGenerating(false);
        setBatchProgress(null);
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || '批量提交失败');
      setBatchGenerating(false);
      setBatchProgress(null);
    }
    if (submittedCount === 0) return;
  };

  useEffect(() => { return () => { clearAllTimers(); }; }, []);

  const startStitchPolling = () => {
    if (stitchPollTimer.current) return;
    setStitching(true);
    stitchPollTimer.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/api/drama/episodes/${episodeId}/stitch-status`);
        if (data.stitch_progress_message || data.stitch_progress_percent != null) {
          setStitchProgress({ message: data.stitch_progress_message || '', percent: data.stitch_progress_percent || 0 });
        }
        if (data.stitch_status === 'completed') {
          setStitchProgress({ message: '本集成片已完成', percent: 100 });
          setTimeout(() => {
            if (stitchPollTimer.current) { clearInterval(stitchPollTimer.current); stitchPollTimer.current = null; }
            setStitching(false);
            setStitchProgress(null);
          }, 1500);
          message.success('本集合成成功！');
          fetchData();
        } else if (data.stitch_status === 'failed') {
          if (stitchPollTimer.current) { clearInterval(stitchPollTimer.current); stitchPollTimer.current = null; }
          setStitching(false);
          setStitchProgress(null);
          message.error(data.stitch_progress_message || '合成失败');
          fetchData();
        }
      } catch {
        if (stitchPollTimer.current) { clearInterval(stitchPollTimer.current); stitchPollTimer.current = null; }
        setStitching(false);
        setStitchProgress(null);
      }
    }, 2000);
  };

  const handleStitch = async () => {
    try {
      const { data } = await api.post(`/api/drama/episodes/${episodeId}/stitch`);
      if (data.status === 'queued') {
        message.info('已加入合成队列');
        startStitchPolling();
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || '合成失败');
    }
  };

  const handleEditPrompt = (seg: Segment) => {
    setEditModal({ visible: true, seg, value: seg.prompt_cn || seg.prompt || '' });
  };

  const openSettings = () => {
    if (!episode) return;
    setSettingsModal({
      visible: true,
      style: episode.style || 'anime',
      ratio: episode.ratio || '9:16',
      resolution: episode.resolution || '720p',
      audio_lang: episode.audio_lang && episode.audio_lang !== 'none' ? episode.audio_lang : 'zh',
      tts_voice: episode.tts_voice || '',
    });
  };

  const saveSettings = async () => {
    const { style, ratio, resolution, audio_lang, tts_voice } = settingsModal;
    if (!episode) return;
    try {
      const payload: any = { style, ratio, resolution, audio_lang };
      if (tts_voice) payload.tts_voice = tts_voice;
      await api.put(`/api/drama/episodes/${episode.id}/settings`, payload);
      message.success('设置已保存');
      setSettingsModal(prev => ({ ...prev, visible: false }));
      fetchData();
    } catch { message.error('保存失败'); }
  };

  const handleEditSave = async () => {
    const { seg, value } = editModal;
    if (!seg) return;
    try {
      await api.put(`/api/drama/episodes/${episodeId}/segments/${seg.id}`, { prompt_cn: value });
      message.success('已更新');
      setEditModal({ visible: false, seg: null, value: '' });
      fetchData();
    } catch { message.error('更新失败'); }
  };

  const handlePlan = async (segId: number) => {
    setPlanning(prev => new Set(prev).add(segId));
    try {
      const { data } = await api.post(`/api/drama/episodes/${episodeId}/segments/${segId}/plan`);
      if (data.warning) message.warning(`智能规划：${data.duration}秒 · ${data.warning}`, 6);
      else message.success(`智能规划完成：${data.duration}秒`);
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.message || '规划失败');
    }
    setPlanning(prev => { const s = new Set(prev); s.delete(segId); return s; });
  };

  const handleDurationChange = async (segId: number, duration: number) => {
    try {
      await api.put(`/api/drama/episodes/${episodeId}/segments/${segId}`, { duration });
      fetchData();
    } catch (err: any) { message.error(err.response?.data?.message || '更新时长失败', 6); }
  };

  const parseRefs = (json: string | null): string[] => {
    try { return JSON.parse(json || '[]'); } catch { return []; }
  };

  if (loading) return <div className="edp-loading"><Spin size="large" /></div>;
  if (!episode) return null;

  const pendingCount = segments.filter(s => s.status === 'pending' || s.status === 'failed').length;
  const completedCount = segments.filter(s => s.status === 'completed').length;
  const allCompleted = completedCount === segments.length && segments.length > 0;

  const selectedSeg = segments.find(s => s.id === selectedId) || segments[0] || null;
  const segStatusColor = (seg: Segment) => seg.status === 'completed' ? 'success' : generating.has(seg.id) || seg.status === 'generating' ? 'processing' : seg.status === 'failed' ? 'error' : 'default';
  const segStatusLabel = (seg: Segment) => seg.status === 'completed' ? '✅已完成' : generating.has(seg.id) || seg.status === 'generating' ? '⏳生成中' : seg.status === 'failed' ? '❌失败' : '待生成';
  const cands = selectedSeg ? (candidates[selectedSeg.id] || []) : [];
  const isGenerating = !!selectedSeg && (generating.has(selectedSeg.id) || selectedSeg.status === 'generating');
  const prog = selectedSeg ? segmentProgress[selectedSeg.id] : undefined;
  const chars = selectedSeg ? parseRefs(selectedSeg.character_refs) : [];
  const props = selectedSeg ? parseRefs(selectedSeg.prop_refs) : [];
  const scenes = selectedSeg ? parseRefs(selectedSeg.scene_refs) : [];
  const playingUrl = (() => {
    if (!selectedSeg) return '';
    const c = cands.find(x => x.id === playingCand && x.status === 'completed' && x.video_url);
    return c ? c.video_url : (selectedSeg.video_url || '');
  })();
  const playingLabel = (() => {
    if (!selectedSeg) return '';
    const c = cands.find(x => x.id === playingCand);
    if (c && !c.is_main && c.video_url) return `片段${selectedSeg.segment_no} · 备选 ${cands.filter(x => !x.is_main).indexOf(c) + 1}`;
    return `片段${selectedSeg.segment_no} · 主视频`;
  })();

  return (
    <div className="edp-root">
      <div className="edp-back">
        <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/drama/${id}/episodes`)}>
          返回分集列表
        </Button>
      </div>

      <div className="edp-panel">
        <div className="edp-panel__hd">
          <div className="edp-hd-titles">
            <Title level={4} className="edp-title">
              第{episode.episode_no}集 · {episode.title}
            </Title>
            <Text className="edp-sub">
              {segments.length} 个片段 · {completedCount} 已完成 · {pendingCount} 待生成
              {episode.duration && ` · 目标 ${episode.duration} 秒`}
              {episode.stitch_status === 'completed' && ' · ✅ 已合成'}
              {episode.stitch_status === 'failed' && ' · ❌ 合成失败'}
            </Text>
          </div>
          <Space>
            <Button icon={<ThunderboltOutlined />} loading={batchGenerating}
              disabled={pendingCount === 0 || batchProgress !== null} onClick={handleGenerateAll}>
              批量生成 ({pendingCount})
            </Button>
            <Button type="primary" icon={<ScissorOutlined />} loading={stitching}
              disabled={!allCompleted} className="edp-btn-brand"
              onClick={handleStitch}>
              合成本集
            </Button>
          </Space>
        </div>
        <div className="edp-panel__bd">
          {episode.summary && (
            <Text className="edp-sub" style={{ display: 'block', marginBottom: 8 }}>{episode.summary}</Text>
          )}
          <div className="edp-tags">
            <Text className="edp-tags__label">本集设置：</Text>
            <Tag>{STYLE_LABEL[episode.style || ''] || '动漫'}</Tag>
            <Tag>{episode.ratio || '9:16'}</Tag>
            <Tag>{episode.resolution || '720p'}</Tag>
            <Tag>{{ zh: '中文配音', en: '英文配音', ja: '日文配音' }[episode.audio_lang === 'none' || !episode.audio_lang ? 'zh' : episode.audio_lang] || '中文配音'}</Tag>
            <Button type="link" size="small" style={{ fontSize: 12, padding: 0 }}
              onClick={openSettings}>设置</Button>
          </div>
        </div>
      </div>

      {batchProgress && (
        <div className="edp-panel">
          <div className="edp-panel__bd">
            <div className="edp-progress-row">
              <Text>批量生成进度</Text>
              <Progress percent={Math.round((batchProgress.completed / batchProgress.total) * 100)}
                format={() => `${batchProgress.completed}/${batchProgress.total}`} />
            </div>
          </div>
        </div>
      )}

      {stitchProgress && (
        <div className="edp-panel">
          <div className="edp-panel__bd">
            <div className="edp-progress-col">
              <Text strong>合成本集进度</Text>
              <Progress percent={stitchProgress.percent} />
              <Text className="edp-sub">{stitchProgress.message}</Text>
            </div>
          </div>
        </div>
      )}

      {!allCompleted && segments.length > 0 && (
        <Alert type="info" showIcon title="所有片段完成后即可合成整集视频" />
      )}

      {selectedSeg && (
        <div className="edp-split">
          <div>
            <div className="edp-panel" style={{ marginBottom: 12 }}>
              <div className="edp-panel__bd edp-panel__bd--tight">
                {playingUrl ? (
                  <div className="edp-stage">
                    <video key={playingUrl} src={getUrl(playingUrl)} controls
                      onError={(e) => { (e.target as HTMLVideoElement).style.display = 'none'; }} />
                  </div>
                ) : (
                  <div className="edp-stage edp-stage--empty">
                    <Text>该片段暂无视频</Text>
                    <Button type="primary" icon={<ThunderboltOutlined />} loading={isGenerating || submitting.has(selectedSeg.id)}
                      disabled={isGenerating || submitting.has(selectedSeg.id)}
                      className="edp-btn-brand"
                      onClick={() => handleGenerate(selectedSeg.id)}>
                      生成视频
                    </Button>
                  </div>
                )}
                <div className="edp-stage-bar">
                  <Tag color="purple">片段{selectedSeg.segment_no}</Tag>
                  <Tag color={segStatusColor(selectedSeg)}>
                    {segStatusLabel(selectedSeg)}
                  </Tag>
                  {selectedSeg.duration && <Text className="edp-sub">{selectedSeg.duration} 秒</Text>}
                  <div className="edp-stage-bar__fill" />
                  <Text className="edp-sub">正在播放：{playingLabel}</Text>
                </div>
              </div>
            </div>

            <div className="edp-panel" style={{ marginBottom: 12 }}>
              <div className="edp-panel__hd">
                <Space size={6}>
                  <Text strong>片段{selectedSeg.segment_no} · 详情</Text>
                  <Text className="edp-hint">{selectedSeg.summary}</Text>
                </Space>
              </div>
              <div className="edp-panel__bd">
                <div className="edp-actions">
                  <Button type="primary" icon={<ThunderboltOutlined />} loading={isGenerating || submitting.has(selectedSeg.id)}
                    disabled={isGenerating || submitting.has(selectedSeg.id)}
                    className="edp-btn-brand"
                    onClick={() => handleGenerate(selectedSeg.id)}>
                    生成视频
                  </Button>
                  <Button icon={<CheckCircleOutlined />} loading={planning.has(selectedSeg.id)}
                    onClick={() => handlePlan(selectedSeg.id)}>
                    智能规划
                  </Button>
                  <Button icon={<AimOutlined />} onClick={() => handleEditPrompt(selectedSeg)}>
                    编辑提示词
                  </Button>
                  <div className="edp-field">
                    <Text className="edp-field__label">时长</Text>
                    <Select value={selectedSeg.duration || 5} size="small" style={{ width: 84 }}
                      onChange={v => handleDurationChange(selectedSeg.id, v)}
                      options={Array.from({ length: 15 }, (_, i) => ({
                        label: `${i + 1}秒${i + 1 === 4 || i + 1 === 5 ? '★' : ''}`, value: i + 1,
                      }))} />
                  </div>
                  <div className="edp-field">
                    <Text className="edp-field__label">候选数</Text>
                    <Select
                      value={candidateCounts[selectedSeg.id] || 1}
                      size="small" style={{ width: 64 }}
                      disabled={isGenerating || submitting.has(selectedSeg.id) || selectedSeg.status === 'generating'}
                      onChange={v => setCandidateCounts(prev => ({ ...prev, [selectedSeg.id]: v }))}
                      options={[1, 2, 3].map(n => ({ label: `${n} 个`, value: n }))} />
                  </div>
                </div>

                {isGenerating && (
                  <div className="edp-progress-inline">
                    <Progress percent={prog?.percent ?? 0} size="small" />
                    <Text className="edp-sub">{prog?.message || '正在提交任务...'}</Text>
                  </div>
                )}

                {(selectedSeg.prompt_cn || selectedSeg.prompt) && (
                  <div className="edp-prompt" onClick={() => handleEditPrompt(selectedSeg)}>
                    {selectedSeg.prompt_cn || selectedSeg.prompt}
                  </div>
                )}
                <div className="edp-ref-tags">
                  {chars.map(c => <Tag key={c} color="blue">{c}</Tag>)}
                  {props.map(p => <Tag key={p} color="orange">{p}</Tag>)}
                  {scenes.map(s => <Tag key={s} color="green">{s}</Tag>)}
                </div>
              </div>
            </div>
          </div>

          <div className="edp-split__side">
            <div className="edp-panel">
              <div className="edp-panel__hd">
                <Space size={6}>
                  <Text strong>视频版本</Text>
                  <Text className="edp-hint">点击切换中间播放器</Text>
                </Space>
                {selectedSeg.status === 'completed' && (
                  <Button type="link" size="small" style={{ fontSize: 12, padding: 0 }}
                    loading={candLoading.has(selectedSeg.id)}
                    onClick={() => loadCandidates(selectedSeg.id)}>
                    {cands.length > 0 ? `刷新 (${cands.length})` : '查看候选'}
                  </Button>
                )}
              </div>
              <div className="edp-panel__bd">
                {cands.length === 0 ? (
                  <Text className="edp-list__empty">暂无版本，点击「生成视频」后展示正式版与备选</Text>
                ) : (
                  <div className="edp-list">
                    {cands.map(c => {
                      const badge = QUALITY_BADGE[c.quality || ''] || QUALITY_BADGE.unknown;
                      const report = c.quality_report;
                      const altNo = cands.filter(x => !x.is_main).indexOf(c) + 1;
                      const isPlaying = c.is_main ? playingCand === null : playingCand === c.id;
                      return (
                        <div key={c.id} className="edp-item"
                          data-active={isPlaying ? '1' : '0'}
                          data-clickable={c.video_url ? '1' : '0'}
                          onClick={() => { if (c.status === 'completed' && c.video_url) setPlayingCand(c.is_main ? null : c.id); }}>
                          <div className="edp-item__hd">
                            <Tag color={c.is_main ? 'purple' : 'default'}>
                              {c.is_main ? '主视频' : `备选 ${altNo}`}
                            </Tag>
                            {c.status === 'failed' ? (
                              <Tag color="error">✘ 生成失败</Tag>
                            ) : (
                              <Tooltip title={
                                report && (report.issues?.length || report.consistency)
                                  ? `质检报告：${[report.consistency, ...(report.issues || [])].filter(Boolean).join('；')}`
                                  : '无质检详情'
                              }>
                                <Tag color={badge.color}>{badge.label}</Tag>
                              </Tooltip>
                            )}
                            {isPlaying && c.video_url && <Tag color="purple">播放中</Tag>}
                            <div className="edp-item__fill" />
                            {c.status === 'completed' && !c.is_main && (
                              <Button type="primary" size="small" className="edp-btn-brand edp-btn-mini"
                                loading={accepting.has(c.id)}
                                onClick={(e) => { e.stopPropagation(); handleAcceptCandidate(c.id, selectedSeg.id); }}>
                                采纳替换
                              </Button>
                            )}
                            {!c.is_main && (
                              <Popconfirm title="移除该备选？" onConfirm={() => handleDeleteCandidate(c.id, selectedSeg.id)}
                                okText="移除" cancelText="取消">
                                <Button type="text" size="small" icon={<DeleteOutlined />}
                                  onClick={(e) => e.stopPropagation()} />
                              </Popconfirm>
                            )}
                          </div>
                          {c.video_url ? (
                            <video className="edp-item__media" src={getUrl(c.video_url)} preload="metadata"
                              onError={(e) => { (e.target as HTMLVideoElement).style.display = 'none'; }} />
                          ) : c.error_msg ? (
                            <Text type="danger" className="edp-item__err">{c.error_msg}</Text>
                          ) : null}
                          <div className="edp-item__note">
                            {c.is_main ? '当前正式版本' : '备选版本 · 预览满意后可采纳替换'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="edp-panel">
        <div className="edp-panel__hd">
          <Space size={6}>
            <Text strong>片段列表</Text>
            <Text className="edp-hint">点击切换中间播放器</Text>
          </Space>
        </div>
        <div className="edp-panel__bd">
          <div className="edp-strip">
            {segments.map(seg => {
              const active = seg.id === selectedId;
              return (
                <div key={seg.id} className="edp-seg" data-active={active ? '1' : '0'}
                  onClick={() => { setSelectedId(seg.id); setPlayingCand(null); }}>
                  <div className="edp-seg__hd">
                    <Tag color={active ? 'purple' : 'default'}>片段{seg.segment_no}</Tag>
                    <Tag color={segStatusColor(seg)}>{segStatusLabel(seg)}</Tag>
                  </div>
                  {seg.summary && <div className="edp-seg__summary">{seg.summary}</div>}
                  {seg.video_url && (
                    <video className="edp-seg__media" src={getUrl(seg.video_url)} preload="metadata"
                      onError={(e) => { (e.target as HTMLVideoElement).style.display = 'none'; }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {episode.video_url && (
        <div className="edp-panel edp-final">
          <div className="edp-panel__hd">
            <Text strong>本集成片</Text>
            <a href={getUrl(episode.video_url)} download target="_blank" rel="noreferrer">
              <Button icon={<DownloadOutlined />}>下载</Button>
            </a>
          </div>
          <div className="edp-panel__bd">
            <video src={getUrl(episode.video_url)} controls />
          </div>
        </div>
      )}

      <Modal title="编辑提示词" open={editModal.visible} onOk={handleEditSave}
        onCancel={() => setEditModal({ visible: false, seg: null, value: '' })}
        okText="保存" cancelText="取消">
        <Input.TextArea rows={4} value={editModal.value}
          onChange={e => setEditModal(prev => ({ ...prev, value: e.target.value }))} />
      </Modal>

      <Modal className="edp-modal--centered" title="本集设置" open={settingsModal.visible} onOk={saveSettings}
        onCancel={() => setSettingsModal(prev => ({ ...prev, visible: false }))}
        okText="保存" cancelText="取消">
        <div className="edp-form">
          <div className="edp-form__item">
            <Text strong className="edp-form__label">画面风格</Text>
            <Select value={settingsModal.style} onChange={v => setSettingsModal(prev => ({ ...prev, style: v }))}
              style={{ width: '100%' }}
              options={[{ label: '动漫', value: 'anime' }, { label: '写实', value: 'realistic' }]} />
          </div>
          <div className="edp-form__item">
            <Text strong className="edp-form__label">画面比例</Text>
            <Select value={settingsModal.ratio} onChange={v => setSettingsModal(prev => ({ ...prev, ratio: v }))}
              style={{ width: '100%' }}
              options={[
                { label: '9:16 竖屏', value: '9:16' },
                { label: '16:9 横屏', value: '16:9' },
                { label: '1:1 方形', value: '1:1' },
                { label: '4:3 横版', value: '4:3' },
                { label: '3:4 竖版', value: '3:4' },
              ]} />
          </div>
          <div className="edp-form__item">
            <Text strong className="edp-form__label">清晰度</Text>
            <Select value={settingsModal.resolution} onChange={v => setSettingsModal(prev => ({ ...prev, resolution: v }))}
              style={{ width: '100%' }}
              options={['480p', '720p', '1080p'].map(r => ({ label: r, value: r }))} />
          </div>
          <div className="edp-form__item">
            <Text strong className="edp-form__label">配音语言</Text>
            <Select value={settingsModal.audio_lang} onChange={v => setSettingsModal(prev => ({ ...prev, audio_lang: v }))}
              style={{ width: '100%' }}
              options={[
                { label: '中文', value: 'zh' },
                { label: '英文', value: 'en' },
                { label: '日文', value: 'ja' },
              ]} />
          </div>
          <div className="edp-form__item">
            <Text strong className="edp-form__label">配音音色</Text>
            <Select value={settingsModal.tts_voice} onChange={v => setSettingsModal(prev => ({ ...prev, tts_voice: v }))}
              style={{ width: '100%' }} allowClear placeholder="默认（按语言自动）"
              options={voices.map(v => ({ label: `${v.gender === 'female' ? '女' : '男'}·${v.name}（${v.style}）`, value: v.id }))} />
          </div>
        </div>
      </Modal>
    </div>
  );
}