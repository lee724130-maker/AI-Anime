import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Typography, Button, Card, Tag, Space, Spin, message, Row, Col, Modal,
  Alert, Input, Select, Progress,
} from 'antd';
import {
  ArrowLeftOutlined, ThunderboltOutlined, AimOutlined,
  ScissorOutlined, CheckCircleOutlined, DownloadOutlined,
} from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;
const STYLE_LABEL: Record<string, string> = { anime: '动漫', realistic: '写实' };
const API_BASE = 'http://localhost:3000';
const getUrl = (p: string | null) => p ? (p.startsWith('http') ? p : API_BASE + p) : '';

interface Segment {
  id: number; episode_id: number; segment_no: number;
  summary: string | null; prompt: string | null; prompt_cn: string | null;
  character_refs: string | null; prop_refs: string | null; scene_refs: string | null;
  duration: number | null; status: string; video_url: string | null;
}

interface Episode {
  id: number; episode_no: number; title: string; summary: string | null;
  duration: number | null; video_url: string | null; stitch_status: string;
  style: string | null; ratio: string | null; resolution: string | null;
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
  const pollTimers = useRef<Map<number, any>>(new Map());
  const submittingRef = useRef<Set<number>>(new Set());

  const fetchData = async () => {
    if (!episodeId) return;
    try {
      const { data } = await api.get(`/api/drama/episodes/${episodeId}`);
      setEpisode(data.episode);
      setSegments(data.segments || []);
    } catch { message.error('加载失败'); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [episodeId]);

  const clearAllTimers = () => {
    for (const timer of pollTimers.current.values()) { clearInterval(timer); }
    pollTimers.current.clear();
    setGenerating(new Set());
    setBatchProgress(null);
    setBatchGenerating(false);
  };

  useEffect(() => { clearAllTimers(); }, [episodeId]);

  const finishPolling = (segId: number) => {
    const timer = pollTimers.current.get(segId);
    if (timer) { clearInterval(timer); pollTimers.current.delete(segId); }
    setGenerating(prev => { const s = new Set(prev); s.delete(segId); return s; });
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
        if (data.status === 'completed') {
          finishPolling(segId);
          fetchData();
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

  const handleGenerate = async (segId: number) => {
    if (submittingRef.current.has(segId)) return;
    submittingRef.current.add(segId);
    setSubmitting(prev => new Set(prev).add(segId));
    try {
      await api.post(`/api/drama/episodes/${episodeId}/segments/${segId}/generate`);
      message.info('已加入生成队列');
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

  const handleStitch = async () => {
    setStitching(true);
    try {
      await api.post(`/api/drama/episodes/${episodeId}/stitch`);
      message.success('本集合成成功！');
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.message || '合成失败');
    }
    setStitching(false);
  };

  const handleEditPrompt = (seg: Segment) => {
    setEditModal({ visible: true, seg, value: seg.prompt_cn || seg.prompt || '' });
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
      message.success(`智能规划完成：${data.duration}秒`);
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
    } catch { message.error('更新时长失败'); }
  };

  const parseRefs = (json: string | null): string[] => {
    try { return JSON.parse(json || '[]'); } catch { return []; }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  if (!episode) return null;

  const pendingCount = segments.filter(s => s.status === 'pending' || s.status === 'failed').length;
  const completedCount = segments.filter(s => s.status === 'completed').length;
  const allCompleted = completedCount === segments.length && segments.length > 0;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/drama/${id}/episodes`)} style={{ padding: 0 }}>
          返回分集列表
        </Button>
      </Space>

      <Card style={{ borderRadius: 12, marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={4} style={{ margin: 0 }}>
              第{episode.episode_no}集 · {episode.title}
            </Title>
            <Text type="secondary">
              {segments.length} 个片段 · {completedCount} 已完成 · {pendingCount} 待生成
              {episode.duration && ` · 目标 ${episode.duration} 秒`}
              {episode.stitch_status === 'completed' && ' · ✅ 已合成'}
              {episode.stitch_status === 'failed' && ' · ❌ 合成失败'}
            </Text>
          </Col>
          <Col>
            <Space>
              <Button icon={<ThunderboltOutlined />} loading={batchGenerating}
                disabled={pendingCount === 0 || batchProgress !== null} onClick={handleGenerateAll}>
                批量生成 ({pendingCount})
              </Button>
              <Button type="primary" icon={<ScissorOutlined />} loading={stitching}
                disabled={!allCompleted}
                style={{ background: '#7c3aed', borderColor: '#7c3aed' }}
                onClick={handleStitch}>
                合成本集
              </Button>
            </Space>
          </Col>
        </Row>
        {episode.summary && (
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>{episode.summary}</Text>
        )}
        <Space style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>画面设置：</Text>
          <Tag style={{ fontSize: 11 }}>{STYLE_LABEL[episode.style || ''] || '动漫'}</Tag>
          <Tag style={{ fontSize: 11 }}>{episode.ratio || '9:16'}</Tag>
          <Tag style={{ fontSize: 11 }}>{episode.resolution || '720p'}</Tag>
          <Button type="link" size="small" style={{ fontSize: 12, padding: 0 }}
            onClick={() => navigate(`/drama/${id}/episodes`)}>修改</Button>
        </Space>
      </Card>

      {batchProgress && (
        <Card style={{ borderRadius: 12, marginBottom: 16 }}>
          <Space style={{ width: '100%' }}>
            <Text>批量生成进度</Text>
            <Progress percent={Math.round((batchProgress.completed / batchProgress.total) * 100)}
              format={() => `${batchProgress.completed}/${batchProgress.total}`}
              style={{ flex: 1 }} />
          </Space>
        </Card>
      )}

      {episode.video_url && (
        <Card title="本集成片" style={{ borderRadius: 12, marginBottom: 16 }}
          extra={
            <a href={getUrl(episode.video_url)} download target="_blank">
              <Button icon={<DownloadOutlined />}>下载</Button>
            </a>
          }>
          <video src={getUrl(episode.video_url)} controls
            style={{ width: '100%', maxHeight: 400, borderRadius: 8 }} />
        </Card>
      )}

      {!allCompleted && segments.length > 0 && (
        <Alert type="info" showIcon message="所有片段完成后即可合成整集视频"
          style={{ marginBottom: 16, borderRadius: 8 }} />
      )}

      <Row gutter={[12, 12]}>
        {segments.map(seg => {
          const isGenerating = generating.has(seg.id);
          const chars = parseRefs(seg.character_refs);
          const props = parseRefs(seg.prop_refs);
          const scenes = parseRefs(seg.scene_refs);
          return (
            <Col key={seg.id} xs={24} sm={12} lg={8}>
              <Card
                size="small"
                style={{ borderRadius: 8 }}
                 title={
                  <Space>
                    <Tag color="purple">片段{seg.segment_no}</Tag>
                    <Select value={seg.duration || 5} size="small" style={{ width: 72 }}
                      onChange={v => handleDurationChange(seg.id, v)}
                      options={Array.from({ length: 13 }, (_, i) => ({ label: `${i + 3}秒`, value: i + 3 }))} />
                    <Tag color={seg.status === 'completed' ? 'success' : isGenerating || seg.status === 'generating' ? 'processing' : seg.status === 'failed' ? 'error' : 'default'}>
                      {seg.status === 'completed' ? '✅已完成' : isGenerating || seg.status === 'generating' ? '⏳生成中' : seg.status === 'failed' ? '❌失败' : '待生成'}
                    </Tag>
                  </Space>
                }
                actions={[
                  <Button type="text" size="small" icon={<ThunderboltOutlined />}
                    loading={isGenerating || submitting.has(seg.id)}
                    disabled={isGenerating || submitting.has(seg.id)}
                    onClick={() => handleGenerate(seg.id)}>
                    生成视频
                  </Button>,
                  <Button type="text" size="small" icon={<CheckCircleOutlined />}
                    loading={planning.has(seg.id)} onClick={() => handlePlan(seg.id)}>
                    智能规划
                  </Button>,
                  <Button type="text" size="small" icon={<AimOutlined />}
                    onClick={() => handleEditPrompt(seg)}>
                    编辑提示词
                  </Button>,
                ]}
              >
                {seg.summary && (
                  <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 6, lineHeight: 1.4 }}>
                    {seg.summary}
                  </Text>
                )}
                {(seg.prompt_cn || seg.prompt) && (
                  <div onClick={() => handleEditPrompt(seg)} style={{ cursor: 'pointer' }}>
                    <Text style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 12, marginBottom: 6, lineHeight: 1.4, color: '#595959' }}>
                      {(seg.prompt_cn || seg.prompt)}
                    </Text>
                  </div>
                )}
                <Space size={4} wrap>
                  {chars.map(c => <Tag key={c} color="blue">{c}</Tag>)}
                  {props.map(p => <Tag key={p} color="orange">{p}</Tag>)}
                  {scenes.map(s => <Tag key={s} color="green">{s}</Tag>)}
                </Space>
                {seg.video_url && (
                  <div style={{ marginTop: 8 }}>
                    <video src={getUrl(seg.video_url)} controls
                      style={{ width: '100%', borderRadius: 4, maxHeight: 160 }}
                      onError={(e) => { (e.target as HTMLVideoElement).style.display = 'none'; }} />
                  </div>
                )}
              </Card>
            </Col>
          );
        })}
      </Row>

      <Modal title="编辑提示词" open={editModal.visible} onOk={handleEditSave}
        onCancel={() => setEditModal({ visible: false, seg: null, value: '' })}
        okText="保存" cancelText="取消">
        <Input.TextArea rows={4} value={editModal.value}
          onChange={e => setEditModal(prev => ({ ...prev, value: e.target.value }))} />
      </Modal>
    </div>
  );
}
