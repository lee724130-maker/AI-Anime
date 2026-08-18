import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Typography, Button, Input, Select, Spin, message, Empty, Tabs, Upload, Progress, Tag, Segmented, Divider, Modal,
} from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, PlayCircleOutlined, DownloadOutlined, QuestionCircleOutlined,
  VideoCameraOutlined, PictureOutlined, FontSizeOutlined, AudioOutlined,
  ThunderboltOutlined, ExportOutlined, CheckCircleOutlined, DeleteOutlined,
  DoubleLeftOutlined, DoubleRightOutlined, ZoomInOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import AssetCard from './components/AssetPanel';
import type { AssetItem } from './components/AssetPanel';
import WorkflowCanvas from './components/WorkflowCanvas';
import type { AssetPayload } from './components/WorkflowCanvas';
import PropertiesPanel from './components/PropertiesPanel';
import {
  NODE_META, type Workflow, type WFNode, type WFNodeType,
} from './components/WorkflowTypes';

const { Text } = Typography;

interface RenderStatus { status: string; progress: number; result_url?: string | null; error_msg?: string | null; }

let uid = 0;
const genId = (prefix: string) => `${prefix}_${Date.now()}_${uid++}`;

const toStaticUrl = (u?: string | null): string | undefined => {
  if (!u) return undefined;
  if (/^\/static\//.test(u) || /^https?:/.test(u) || /^data:/.test(u)) return u;
  const m = u.replace(/\\/g, '/').match(/([^/]+\.(mp4|webm|mov|jpg|jpeg|png|webp|gif))$/i);
  return m ? `/static/${m[1]}` : u;
};

const NODE_PALETTE: { type: WFNodeType; icon: any; label: string; color: string }[] = [
  { type: 'video', icon: <VideoCameraOutlined />, label: '视频', color: NODE_META.video.color },
  { type: 'image', icon: <PictureOutlined />, label: '图片', color: NODE_META.image.color },
  { type: 'text', icon: <FontSizeOutlined />, label: '文字', color: NODE_META.text.color },
  { type: 'audio', icon: <AudioOutlined />, label: '音频', color: NODE_META.audio.color },
  { type: 'effect', icon: <ThunderboltOutlined />, label: '转场/滤镜', color: NODE_META.effect.color },
  { type: 'output', icon: <ExportOutlined />, label: '输出', color: NODE_META.output.color },
];

const newNode = (type: WFNodeType, pos: { x: number; y: number }): WFNode => {
  const base: WFNode = {
    id: genId(type),
    type,
    position: pos,
    source: null,
    duration: type === 'video' ? 3 : type === 'image' ? 3 : type === 'audio' ? 3 : 1,
    params: {},
  };
  if (type === 'text') base.params = { text: '', start: 0, x: 0.5, y: 0.5, font_size: 48, text_color: '#FFFFFF', animation: 'fade' };
  if (type === 'audio') base.params = { volume: 0.8, start: 0, fade_in: 0, fade_out: 0 };
  if (type === 'effect') base.params = { kind: 'transition', transition: 'fade', transition_duration: 0.5 };
  return base;
};

export default function CanvasEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [name, setName] = useState('未命名画布');
  const [ratio, setRatio] = useState('9:16');
  const [resolution, setResolution] = useState('720p');
  const [workflow, setWorkflow] = useState<Workflow>({ nodes: [], edges: [] });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [render, setRender] = useState<RenderStatus | null>(null);
  const [uploading, setUploading] = useState(false);
  const [paletteKind, setPaletteKind] = useState<'node' | 'asset'>('node');
  const [assetTab, setAssetTab] = useState('ai');
  const [leftCollapsed, setLeftCollapsed] = useState(() => localStorage.getItem('canvas_left_collapsed') === '1');
  const [rightCollapsed, setRightCollapsed] = useState(() => localStorage.getItem('canvas_right_collapsed') === '1');
  const [previewOpen, setPreviewOpen] = useState(false);

  const toggleLeft = () => setLeftCollapsed((v) => { localStorage.setItem('canvas_left_collapsed', v ? '0' : '1'); return !v; });
  const toggleRight = () => setRightCollapsed((v) => { localStorage.setItem('canvas_right_collapsed', v ? '0' : '1'); return !v; });

  // Asset panel data
  const [aiTasks, setAiTasks] = useState<AssetItem[]>([]);
  const [globalAssets, setGlobalAssets] = useState<AssetItem[]>([]);
  const [viralProjects, setViralProjects] = useState<AssetItem[]>([]);
  const [dramaClips, setDramaClips] = useState<AssetItem[]>([]);
  const [assetLoading, setAssetLoading] = useState(false);

  // Load project
  useEffect(() => {
    if (isNew) return;
    const load = async () => {
      // reset render state so a previous project's result cannot leak in
      setRender(null);
      setLoadError(null);
      try {
        const res = await api.get(`/api/canvas/projects/${id}`);
        const p = res.data;
        setName(p.name);
        setRatio(p.ratio || '9:16');
        setResolution(p.resolution || '720p');
        setProjectId(p.id);
        const rawNodes: any[] = p.nodes || [];
        const rawEdges: any[] = p.edges || [];
        // legacy nodes (no position) → auto layout + migrate old fields into params
        const nodes: WFNode[] = rawNodes.map((n, i) => {
          if (n.position && typeof n.position.x === 'number') {
            return {
              ...n,
              source: n.source ? { ...n.source, url: toStaticUrl(n.source.url) } : null,
            } as WFNode;
          }
          const base = newNode(n.type || 'video', { x: 80 + (i % 3) * 260, y: 60 + Math.floor(i / 3) * 160 });
          const legacyParams: any = {
            ...(n.params || {}),
          };
          // legacy top-level fields → new params (backend workflow render reads params)
          if (n.text !== undefined && legacyParams.text === undefined) legacyParams.text = n.text;
          if (n.bg_color !== undefined && legacyParams.bg_color === undefined) legacyParams.bg_color = n.bg_color;
          if (n.text_color !== undefined && legacyParams.text_color === undefined) legacyParams.text_color = n.text_color;
          if (n.font_size !== undefined && legacyParams.font_size === undefined) legacyParams.font_size = n.font_size;
          return {
            ...base,
            params: { ...base.params, ...legacyParams },
            source: n.source ? { ...n.source, url: toStaticUrl(n.source.url) } : null,
            duration: n.duration || 3,
            transition: n.transition, // preserved so workflow render can use it
          };
        });
        const edges = rawEdges.map((e: any) => ({ id: e.id, from: e.from, to: e.to }));
        // if workflow empty on legacy list, generate a chain to an output node
        let finalEdges = edges;
        if (edges.length === 0 && nodes.length > 0) {
          const main = nodes.filter((n) => n.type === 'video' || n.type === 'image');
          const outNode = nodes.find((n) => n.type === 'output');
          if (main.length > 0) {
            const chainEdges = main.slice(0, -1).map((n, i) => ({ id: `auto_${i}`, from: n.id, to: main[i + 1].id }));
            finalEdges = [...chainEdges];
            if (outNode) {
              if (main.length > 0) finalEdges.push({ id: 'auto_out_main', from: main[main.length - 1].id, to: outNode.id });
              nodes.filter((n) => n.type === 'text' || n.type === 'audio').forEach((n) => {
                finalEdges.push({ id: `auto_out_${n.id}`, from: n.id, to: outNode.id });
              });
            }
          }
        }
        setWorkflow({ nodes, edges: finalEdges });
        if (p.status === 'rendering' || p.status === 'completed' || p.status === 'failed') {
          setRender({ status: p.status, progress: p.progress, result_url: p.result_url, error_msg: p.error_msg });
        }
      } catch (err: any) {
        // do not leave a blank editor over the real project (save would overwrite it)
        setLoadError(err?.response?.data?.message || err.message || '未知错误');
      }
      setLoading(false);
    };
    load();
  }, [id]);

  // Poll render progress
  useEffect(() => {
    if (!render || render.status !== 'rendering' || !projectId) return;
    let failCount = 0;
    const timer = setInterval(async () => {
      try {
        const res = await api.get(`/api/canvas/projects/${projectId}/export`);
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

  // Load asset sources
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
        // fetch episodes of all drama projects in parallel
        const epLists = await Promise.all(items.map(async (proj: any) => {
          try {
            const epRes = await api.get(`/api/drama/${proj.id}/episodes`);
            return { proj, eps: epRes.data || [] };
          } catch { return { proj, eps: [] }; }
        }));
        for (const { proj, eps } of epLists) {
          for (const ep of eps) {
            // episodes expose the stitched full video; segment-level urls live in
            // a separate detail endpoint, so surface the episode video here
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

  // Properties panel asset options
  const assetOptions = useMemo<Record<'video' | 'image', AssetPayload[]>>(() => {
    const dedupe = (arr: AssetPayload[]) => [...new Map(arr.map((a) => [a.url, a])).values()];
    return {
      video: dedupe([...viralProjects, ...aiTasks.filter((a) => a.type === 'video'), ...dramaClips, ...globalAssets.filter((a) => a.type === 'video')]
        .map((a) => ({ kind: a.kind, type: a.type, url: a.url, title: a.title, thumbnail: a.thumbnail, ref_id: a.ref_id }))),
      image: dedupe([...globalAssets.filter((a) => a.type === 'image'), ...aiTasks.filter((a) => a.type === 'image')]
        .map((a) => ({ kind: a.kind, type: a.type, url: a.url, title: a.title, thumbnail: a.thumbnail, ref_id: a.ref_id }))),
    };
  }, [viralProjects, aiTasks, dramaClips, globalAssets]);

  const persist = async (): Promise<number | null> => {
    const payload = {
      name, ratio, resolution,
      nodes: JSON.stringify(workflow),
      bgm_url: null,
    };
    if (projectId) {
      await api.put(`/api/canvas/projects/${projectId}`, payload);
      return projectId;
    }
    const res = await api.post('/api/canvas/projects', payload);
    setProjectId(res.data.id);
    return res.data.id;
  };

  const handleSave = async () => {
    if (render?.status === 'rendering') {
      message.warning('渲染进行中，请等待完成后再保存修改');
      return;
    }
    setSaving(true);
    try {
      const pid = await persist();
      message.success('已保存');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      if (isNew && pid) navigate(`/canvas/editor/${pid}`, { replace: true });
    } catch (err: any) {
      message.error('保存失败: ' + (err?.response?.data?.message || err.message));
    }
    setSaving(false);
  };

  const handleRender = async () => {
    try {
      const mediaNodes = workflow.nodes.filter((n) => n.type === 'video' || n.type === 'image');
      const textNodes = workflow.nodes.filter((n) => n.type === 'text');
      const outputNode = workflow.nodes.find((n) => n.type === 'output');
      if (mediaNodes.length === 0 && textNodes.length === 0) { message.warning('请先添加视频/图片素材，或文字节点'); return; }
      if (mediaNodes.length > 0 && !outputNode) { message.warning('请先添加「输出」节点'); return; }
      if (workflow.nodes.some((n) => n.type === 'text' && !(n.params?.text && String(n.params.text).trim()))) { message.warning('有文字节点未填写内容'); return; }
      if (workflow.nodes.some((n) => (n.type === 'video' || n.type === 'image' || n.type === 'audio') && !n.source?.url)) { message.warning('有素材节点未选择素材'); return; }
      const canReachOutput = (startId: string, outputId: string): boolean => {
        const seen = new Set<string>();
        const frontier = [startId];
        while (frontier.length > 0) {
          const cur = frontier.shift()!;
          if (seen.has(cur)) continue;
          seen.add(cur);
          for (const e of workflow.edges) {
            if (e.from !== cur) continue;
            if (e.to === outputId) return true;
            frontier.push(e.to);
          }
        }
        return false;
      };
      const unusedMedia = mediaNodes.filter((n) => !outputNode || !canReachOutput(n.id, outputNode.id));
      if (unusedMedia.length > 0) { message.warning('有视频/图片节点未连接到输出节点'); return; }

      setSaving(true);
      const pid = await persist();
      setSaving(false);
      if (isNew && pid) navigate(`/canvas/editor/${pid}`, { replace: true });
      await api.post(`/api/canvas/projects/${pid}/render`);
      setRender({ status: 'rendering', progress: 0 });
      message.success('开始渲染...');
    } catch (err: any) {
      setSaving(false);
      message.error('渲染启动失败: ' + (err?.response?.data?.message || err.message));
    }
  };

  const addAssetNode = (asset: AssetPayload, pos: { x: number; y: number }) => {
    if (asset.kind === 'palette') {
      addPaletteNode(asset.type as WFNodeType, pos);
      return;
    }
    const node = newNode(asset.type, pos);
    node.source = { kind: asset.kind, ref_id: asset.ref_id, url: toStaticUrl(asset.url) };
    setWorkflow((wf) => ({ ...wf, nodes: [...wf.nodes, node] }));
    setSelectedIds([node.id]);
    message.success(`已添加${asset.type === 'video' ? '视频' : '图片'}节点`);
  };

  const addPaletteNode = (type: WFNodeType, pos?: { x: number; y: number }) => {
    if (type === 'output' && workflow.nodes.some((n) => n.type === 'output')) {
      setSelectedIds([workflow.nodes.find((n) => n.type === 'output')!.id]);
      message.info('输出节点已存在');
      return;
    }
    const col = workflow.nodes.length % 2;
    const row = Math.floor(workflow.nodes.length / 2) % 6;
    const node = newNode(type, pos ?? { x: 60 + col * 280, y: 60 + row * 160 });
    setWorkflow((wf) => ({ ...wf, nodes: [...wf.nodes, node] }));
    setSelectedIds([node.id]);
  };

  const handleAddFromAssetPanel = (item: AssetItem) => {
    const pos = { x: 100 + (workflow.nodes.length % 4) * 30, y: 80 + (workflow.nodes.length % 4) * 30 };
    addAssetNode({ kind: item.kind, type: item.type, url: item.url, title: item.title, thumbnail: item.thumbnail, ref_id: item.ref_id }, pos);
  };

  const handleUpload = async (file: File): Promise<boolean> => {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post('/api/media/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(res.data.url);
      handleAddFromAssetPanel({ kind: 'upload', type: isVideo ? 'video' : 'image', url: res.data.url, title: res.data.original_name || '上传素材' });
      message.success('上传成功并已添加');
      return true;
    } catch (err: any) {
      message.error('上传失败: ' + (err?.response?.data?.message || err.message));
      return false;
    } finally {
      setUploading(false);
    }
  };

  const selectedNode = workflow.nodes.find((n) => n.id === selectedIds[selectedIds.length - 1]) || null;

  // Ctrl+S quick save (skip when typing in inputs)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow, name, ratio, resolution, projectId]);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#17181c' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#17181c' }}>
        <div style={{ textAlign: 'center', background: '#fff', padding: '40px 60px', borderRadius: 16 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <Text strong style={{ fontSize: 15 }}>项目加载失败</Text>
          <div style={{ color: '#f5222d', margin: '10px 0 20px', fontSize: 13 }}>{loadError}</div>
          <Button onClick={() => navigate('/canvas')} style={{ borderRadius: 10 }}>返回画布列表</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', width: '100vw', overflow: 'hidden', background: '#17181c', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar — full-screen workbench header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: 52, flexShrink: 0, background: '#1f2126', borderBottom: '1px solid #2c2f36' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/canvas')} style={{ borderRadius: 10, background: '#2c2f36', borderColor: '#3a3d46', color: '#e8eaed' }} />
        <Input value={name} onChange={e => setName(e.target.value)} style={{ width: 220, borderRadius: 10, fontWeight: 600, background: '#2c2f36', borderColor: '#3a3d46', color: '#e8eaed' }} placeholder="画布名称" />
        <Select value={ratio} onChange={setRatio} style={{ width: 80, borderRadius: 10 }}
          options={['9:16', '16:9', '1:1', '3:4', '4:3', '2:3'].map(r => ({ value: r, label: r }))} />
        <Select value={resolution} onChange={setResolution} style={{ width: 84, borderRadius: 10 }}
          options={['480p', '720p', '1080p'].map(r => ({ value: r, label: r }))} />
        <Text style={{ color: '#9aa4b2', fontSize: 12 }}>{workflow.nodes.length} 节点 · {workflow.edges.length} 连线</Text>

        <div style={{ flex: 1 }} />

        {saved && <Tag color="success" icon={<CheckCircleOutlined />}>已保存</Tag>}
        <Button icon={<QuestionCircleOutlined />} onClick={() => setHelpOpen(true)} style={{ borderRadius: 10, background: '#2c2f36', borderColor: '#3a3d46', color: '#e8eaed' }}>使用教程</Button>
        <Button icon={<SaveOutlined />} loading={saving} onClick={handleSave} style={{ borderRadius: 10, background: '#2c2f36', borderColor: '#3a3d46', color: '#e8eaed' }}>保存</Button>
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

      {/* Render progress strip */}
      {render?.status === 'rendering' && (
        <div style={{ flexShrink: 0, background: '#17181c', padding: '4px 14px 0' }}>
          <Progress percent={render.progress || 0} status="active" strokeColor="#7c3aed" size="small" />
        </div>
      )}
      {render?.status === 'failed' && (
        <div style={{ flexShrink: 0, background: '#17181c', padding: '6px 14px', color: '#ff7875', fontSize: 12 }}>
          渲染失败: {render.error_msg}
        </div>
      )}

      {/* Main area: palette + canvas + properties */}
      <div style={{ display: 'flex', gap: 10, flex: 1, minHeight: 0, padding: 10 }}>
        {/* Left: palette (collapsible) */}
        {leftCollapsed ? (
          <div onClick={toggleLeft} title="展开素材面板"
            style={{ width: 34, flexShrink: 0, borderRadius: 12, background: '#1f2126', border: '1px solid #2c2f36', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12, gap: 12, cursor: 'pointer' }}>
            <DoubleRightOutlined style={{ color: '#9aa4b2', fontSize: 13 }} />
            <Text style={{ color: '#9aa4b2', fontSize: 11, writingMode: 'vertical-rl', letterSpacing: 3 }}>节点 / 素材</Text>
          </div>
        ) : (
        <div style={{ width: 240, flexShrink: 0, background: '#fff', borderRadius: 12, padding: 10, overflow: 'auto', border: '1px solid #2c2f36', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexShrink: 0 }}>
            <Text strong style={{ fontSize: 13 }}>节点 / 素材</Text>
            <Button type="text" size="small" icon={<DoubleLeftOutlined />} onClick={toggleLeft} title="收起面板" />
          </div>

          {/* Local upload */}
          <Upload.Dragger beforeUpload={(file) => { handleUpload(file); return false; }} showUploadList={false} style={{ marginBottom: 10, borderRadius: 10 }}>
            <div style={{ padding: '4px 0' }}>
              <Text style={{ fontSize: 11, color: '#666' }}>{uploading ? '上传中...' : '上传本地视频/图片'}</Text>
            </div>
          </Upload.Dragger>

          <Segmented block size="small" value={paletteKind} onChange={(v) => setPaletteKind(v as any)} style={{ marginBottom: 10 }}
            options={[{ value: 'node', label: '节点' }, { value: 'asset', label: '素材' }]} />

          {paletteKind === 'node' ? (
            <div>
              <Text type="secondary" style={{ fontSize: 11, marginBottom: 6, display: 'block' }}>点击添加节点，拖到画布上摆放</Text>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {NODE_PALETTE.map((p) => (
                  <div key={p.type} data-palette={p.type}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData('application/json', JSON.stringify({ __palette: p.type })); e.dataTransfer.effectAllowed = 'copy'; }}
                    onClick={() => addPaletteNode(p.type)}
                    style={{ cursor: 'pointer', border: `1.5px solid ${p.color}55`, background: `${p.color}0d`, borderRadius: 10, padding: '10px 8px', textAlign: 'center', transition: 'all .15s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = p.color)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = `${p.color}55`)}
                  >
                    <div style={{ fontSize: 17, color: p.color }}>{p.icon}</div>
                    <Text style={{ fontSize: 12, fontWeight: 500, display: 'block', marginTop: 4 }}>{p.label}</Text>
                  </div>
                ))}
              </div>
              <Divider plain style={{ margin: '12px 0' }} />
              <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.6, display: 'block' }}>
                连线规则：<br />
                · 视频/图片 → 输出（主链）<br />
                · 效果节点放两段视频之间 = 转场；直接连视频 = 单段滤镜<br />
                · 文字 / 音频 → 输出（叠加层 / 音轨）<br />
                · 点右侧圆点拖到左侧圆点完成连线
              </Text>
            </div>
          ) : (
            <Tabs size="small" tabBarStyle={{ marginBottom: 4 }} activeKey={assetTab} onChange={setAssetTab}
              items={[
                { key: 'ai', label: 'AI历史', children: assetLoading ? <Spin size="small" /> : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {aiTasks.map((it, i) => <AssetCard key={`ai${i}`} item={it} onClick={handleAddFromAssetPanel} />)}
                    {aiTasks.length === 0 && <Empty description="暂无 AI 素材" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ gridColumn: '1 / -1', margin: '12px 0' }} />}
                  </div>
                ) },
                { key: 'assets', label: '大资产库', children: (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {globalAssets.map((it, i) => <AssetCard key={`ga${i}`} item={it} onClick={handleAddFromAssetPanel} />)}
                    {globalAssets.length === 0 && <Empty description="暂无资产" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ gridColumn: '1 / -1', margin: '12px 0' }} />}
                  </div>
                ) },
                { key: 'viral', label: '热门创作', children: (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {viralProjects.map((it, i) => <AssetCard key={`vp${i}`} item={it} onClick={handleAddFromAssetPanel} />)}
                    {viralProjects.length === 0 && <Empty description="暂无成片" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ gridColumn: '1 / -1', margin: '12px 0' }} />}
                  </div>
                ) },
                { key: 'drama', label: '短剧片段', children: (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {dramaClips.map((it, i) => <AssetCard key={`dc${i}`} item={it} onClick={handleAddFromAssetPanel} />)}
                    {dramaClips.length === 0 && <Empty description="暂无片段" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ gridColumn: '1 / -1', margin: '12px 0' }} />}
                  </div>
                ) },
              ]}
            />
          )}
        </div>
        )}

        {/* Center: canvas */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <WorkflowCanvas
            workflow={workflow}
            selectedIds={selectedIds}
            onSelect={setSelectedIds}
            onChange={setWorkflow}
            onAddAsset={addAssetNode}
          />
        </div>

        {/* Right: properties (collapsible) */}
        {rightCollapsed ? (
          <div onClick={toggleRight} title="展开属性面板"
            style={{ width: 34, flexShrink: 0, borderRadius: 12, background: '#1f2126', border: '1px solid #2c2f36', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12, gap: 12, cursor: 'pointer' }}>
            <DoubleLeftOutlined style={{ color: '#9aa4b2', fontSize: 13 }} />
            <Text style={{ color: '#9aa4b2', fontSize: 11, writingMode: 'vertical-rl', letterSpacing: 3 }}>属性</Text>
          </div>
        ) : (
        <div style={{ width: 280, flexShrink: 0, background: '#fff', borderRadius: 12, border: '1px solid #2c2f36', overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px 0', flexShrink: 0 }}>
            <Text strong style={{ fontSize: 13 }}>属性{selectedIds.length > 1 ? `（${selectedIds.length} 节点）` : ''}</Text>
            <Button type="text" size="small" icon={<DoubleRightOutlined />} onClick={toggleRight} title="收起面板" />
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {selectedIds.length > 1 ? (
            <div style={{ padding: 16, textAlign: 'center' }}>
              <Empty description={<span>已选中 <span style={{ color: '#7c3aed', fontWeight: 700 }}>{selectedIds.length}</span> 个节点</span>} image={Empty.PRESENTED_IMAGE_SIMPLE} />
              <Text type="secondary" style={{ fontSize: 12, display: 'block', margin: '10px 0 14px' }}>
                拖动任意选中节点可整体移动，Delete 键可批量删除
              </Text>
              <Button danger block icon={<DeleteOutlined />} onClick={() => {
                const idSet = new Set(selectedIds);
                setWorkflow((wf) => ({ ...wf, nodes: wf.nodes.filter((x) => !idSet.has(x.id)), edges: wf.edges.filter((e) => !idSet.has(e.from) && !idSet.has(e.to)) }));
                setSelectedIds([]);
              }}>删除选中节点</Button>
              <Button block style={{ marginTop: 8 }} onClick={() => setSelectedIds([])}>取消选择</Button>
            </div>
          ) : (
            <PropertiesPanel
              node={selectedNode}
              assetOptions={assetOptions}
              onChange={(n) => setWorkflow((wf) => ({ ...wf, nodes: wf.nodes.map((x) => x.id === n.id ? n : x) }))}
              onRemove={(nid) => {
                setWorkflow((wf) => ({ ...wf, nodes: wf.nodes.filter((x) => x.id !== nid), edges: wf.edges.filter((e) => e.from !== nid && e.to !== nid) }));
                setSelectedIds([]);
              }}
            />
          )}
          </div>
        </div>
        )}
      </div>

      {/* Bottom: result preview */}
      {render?.status === 'completed' && render.result_url && (
        <div style={{ flexShrink: 0, display: 'flex', gap: 12, background: '#1f2126', borderTop: '1px solid #2c2f36', padding: '8px 14px', alignItems: 'center' }}>
          <Text strong style={{ fontSize: 12, color: '#e8eaed', flexShrink: 0 }}>成片预览</Text>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <video key={render.result_url || projectId} src={render.result_url || undefined} controls preload="metadata"
              onClick={() => setPreviewOpen(true)}
              title="点击放大查看"
              style={{ width: 120, height: 67, borderRadius: 8, background: '#111', objectFit: 'contain', cursor: 'pointer' }} />
            <Button type="primary" size="small" shape="circle" icon={<ZoomInOutlined />}
              title="放大查看" aria-label="放大查看"
              onClick={() => setPreviewOpen(true)}
              style={{ position: 'absolute', right: 2, bottom: 2, width: 24, height: 24, minWidth: 24, padding: 0, fontSize: 12, lineHeight: '20px' }} />
          </div>
          <Text style={{ color: '#9aa4b2', fontSize: 11, flex: 1 }}>渲染已完成，可下载或继续调整画布后重新渲染。点击视频可放大查看。</Text>
          <Button type="primary" size="small" icon={<DownloadOutlined />} href={render.result_url} download style={{ background: '#16a34a', borderColor: '#16a34a' }}>下载成片</Button>
        </div>
      )}

      {/* Result video viewer modal */}
      <Modal title="成片预览" open={previewOpen} onCancel={() => setPreviewOpen(false)} footer={null} width={520} destroyOnClose>
        {render?.result_url && (
          <video key={render.result_url} src={render.result_url} controls autoPlay
            style={{ width: '100%', maxHeight: '72vh', borderRadius: 10, background: '#000', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
        )}
      </Modal>

      {/* Help / tutorial modal */}
      <Modal title="画布使用教程" open={helpOpen} onCancel={() => setHelpOpen(false)} footer={null} width={640}>
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <Text strong style={{ fontSize: 14, color: '#7c3aed', display: 'block', marginBottom: 4 }}>一、鼠标操作</Text>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
            <tbody>
              {[
                ['左键 点击节点', '选中节点，右侧属性面板显示其可编辑属性'],
                ['左键 拖动节点', '移动节点位置；拖动已选中的节点可整体移动多个节点'],
                ['左键 在空白处拖动', '拉出紫色选框，框选多个节点（可整体拖动 / 批量删除）'],
                ['右键 拖动', '平移画布视角（任意位置）'],
                ['滚轮', '缩放画布（按住 Ctrl + 滚轮缩放幅度更大）'],
                ['节点右侧圆点 → 拖到左侧圆点', '建立节点之间的连线'],
                ['节点右上角 ×', '删除该节点（及其连线）'],
              ].map(([k, v]) => (
                <tr key={k} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '4px 10px 4px 0', whiteSpace: 'nowrap', fontWeight: 600, width: 210 }}>{k}</td>
                  <td style={{ padding: '4px 0', color: '#555' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <Text strong style={{ fontSize: 14, color: '#7c3aed', display: 'block', marginBottom: 4 }}>二、快捷键</Text>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
            <tbody>
              {[
                ['Delete / Backspace', '删除所有选中的节点（含连线）'],
                ['Esc', '取消选中'],
                ['Ctrl + A', '全选所有节点'],
                ['Ctrl + S', '保存项目'],
              ].map(([k, v]) => (
                <tr key={k} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '4px 10px 4px 0', whiteSpace: 'nowrap', fontWeight: 600, width: 210 }}>{k}</td>
                  <td style={{ padding: '4px 0', color: '#555' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <Text strong style={{ fontSize: 14, color: '#7c3aed', display: 'block', marginBottom: 4 }}>三、左侧「节点 / 素材」面板</Text>
          <div style={{ color: '#555', marginBottom: 14 }}>
            · <b>节点</b>：6 种节点（视频 / 图片 / 文字 / 音频 / 转场滤镜 / 输出），点击即添加到画布，也可拖拽摆放。<br />
            · <b>素材</b>：从「AI 历史 / 大资产库 / 热门创作 / 短剧片段」四个来源选择素材，点击或拖拽添加到画布；上方还可上传本地视频/图片。<br />
            · <b>连线规则</b>：视频/图片 → 输出（主链）；效果节点放两段视频之间 = 转场，直接连单个视频 = 滤镜；文字/音频 → 输出（叠加层/音轨）。
          </div>

          <Text strong style={{ fontSize: 14, color: '#7c3aed', display: 'block', marginBottom: 4 }}>四、顶部工具栏按钮</Text>
          <div style={{ color: '#555', marginBottom: 14 }}>
            · <b>名称</b>：项目名称。<b>比例 / 分辨率</b>：成片输出规格（如 9:16 竖屏 720p）。<br />
            · <b>保存</b>：保存画布（或 Ctrl+S）。<b>导出渲染</b>：按画布生成成片（需节点齐全并连接到输出）。<b>下载成片</b>：渲染完成后下载视频。
          </div>

          <Text strong style={{ fontSize: 14, color: '#7c3aed', display: 'block', marginBottom: 4 }}>五、右侧属性面板</Text>
          <div style={{ color: '#555' }}>
            选中节点后可编辑：素材时长、替换素材、文字内容 / 字号 / 动画 / 颜色 / 位置、音频音量 / 淡入淡出、转场样式与时长、滤镜效果等；多选节点时显示批量操作（整体移动 / 删除）。
          </div>
        </div>
      </Modal>
    </div>
  );
}