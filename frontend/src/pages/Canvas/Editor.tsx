import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Typography, Button, Space, Input, Select, Spin, message, Card, Empty, Tabs, Upload, Progress, Tag, Tooltip, Drawer,
} from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, PlayCircleOutlined, DownloadOutlined,
  FontSizeOutlined, AudioOutlined, ClearOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import AssetCard from './components/AssetPanel';
import type { AssetItem } from './components/AssetPanel';
import NodeCard from './components/NodeCard';
import type { CanvasNodeData } from './components/NodeCard';

const { Text } = Typography;

interface RenderStatus { status: string; progress: number; result_url?: string | null; error_msg?: string | null; }

let uid = 0;
const genId = () => `node_${Date.now()}_${uid++}`;

// Convert absolute backend paths (e.g. C:\...\backend\output\x.mp4) into
// /static/ URLs so the browser can actually load them.
const toStaticUrl = (u?: string | null): string | undefined => {
  if (!u) return undefined;
  if (/^\/static\//.test(u) || /^https?:/.test(u) || /^data:/.test(u)) return u;
  const m = u.replace(/\\/g, '/').match(/([^/]+\.(mp4|webm|mov|jpg|jpeg|png|webp|gif))$/i);
  return m ? `/static/${m[1]}` : u;
};

export default function CanvasEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [name, setName] = useState('未命名画布');
  const [ratio, setRatio] = useState('9:16');
  const [resolution, setResolution] = useState('720p');
  const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
  const [bgmUrl, setBgmUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [render, setRender] = useState<RenderStatus | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewNode, setPreviewNode] = useState<CanvasNodeData | null>(null);
  const [uploading, setUploading] = useState(false);

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
      try {
        const res = await api.get(`/api/canvas/projects/${id}`);
        const p = res.data;
        setName(p.name);
        setRatio(p.ratio || '9:16');
        setResolution(p.resolution || '720p');
        setNodes((p.nodes || []).map((n: any) => {
          const node = { ...n, order: n.order ?? 0 };
          if (node.source?.url) node.source = { ...node.source, url: toStaticUrl(node.source.url) };
          return node;
        }));
        setBgmUrl(p.bgm_url || null);
        setProjectId(p.id);
        if (p.status === 'rendering' || p.status === 'completed') {
          setRender({ status: p.status, progress: p.progress, result_url: p.result_url, error_msg: p.error_msg });
        }
      } catch (err: any) {
        message.error('加载项目失败: ' + (err?.response?.data?.message || err.message));
      }
      setLoading(false);
    };
    load();
  }, [id]);

  // Poll render progress
  useEffect(() => {
    if (!render || render.status !== 'rendering' || !projectId) return;
    const timer = setInterval(async () => {
      try {
        const res = await api.get(`/api/canvas/projects/${projectId}/export`);
        setRender(res.data);
        if (res.data.status === 'completed' && res.data.result_url) {
          setPreviewUrl(res.data.result_url);
          message.success('渲染完成！');
          clearInterval(timer);
        } else if (res.data.status === 'failed') {
          message.error('渲染失败: ' + (res.data.error_msg || '未知错误'));
          clearInterval(timer);
        }
      } catch { clearInterval(timer); }
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

      // AI history
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

      // Global assets
          if (gaRes.status === 'fulfilled') {
            const items = gaRes.value.data?.items || gaRes.value.data || [];
            const assets: AssetItem[] = [];
            for (const a of items) {
              if (a.image_url) assets.push({ kind: 'global_asset', type: 'image', url: a.image_url, title: a.name || '资产', thumbnail: a.image_url, ref_id: a.id });
              if (a.video_url) assets.push({ kind: 'global_asset', type: 'video', url: a.video_url, title: a.name || '资产', ref_id: a.id });
            }
            setGlobalAssets(assets);
          }

      // Viral projects (finished films)
      if (viralRes.status === 'fulfilled') {
        const items = viralRes.value.data || [];
        const assets: AssetItem[] = items
          .filter((p: any) => p.status === 'completed' && p.result_url)
          .map((p: any) => ({ kind: 'viral', type: 'video', url: toStaticUrl(p.result_url), title: `热门创作: ${p.name}`, thumbnail: toStaticUrl(p.cover_url), ref_id: p.id }));
        setViralProjects(assets);
      }

      // Drama segments
      if (dramaRes.status === 'fulfilled') {
        const items = dramaRes.value.data?.items || [];
        const assets: AssetItem[] = [];
        for (const proj of items) {
          try {
            const epRes = await api.get(`/api/drama/${proj.id}/episodes`);
            const eps = epRes.data || [];
            for (const ep of eps) {
              const segs = ep.segments || [];
              for (const s of segs) {
                if (s.video_url) {
                  assets.push({ kind: 'drama', type: 'video', url: toStaticUrl(s.video_url) || '', title: `${proj.name} - ${ep.name || ''} ${s.segment_no}`, ref_id: s.id });
                }
              }
            }
          } catch { /* ignore */ }
        }
        setDramaClips(assets);
      }
    } catch { /* ignore */ }
    setAssetLoading(false);
  }, []);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  const persist = async (): Promise<number | null> => {
    const ordered = nodes.map((n, i) => ({ ...n, order: i }));
    const payload = {
      name, ratio, resolution,
      nodes: JSON.stringify(ordered),
      bgm_url: bgmUrl,
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
      if (nodes.length === 0) { message.warning('请先添加素材块'); return; }
      if (nodes.some(n => n.type === 'text' && !n.params?.text)) { message.warning('有文字块未填写内容'); return; }
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

  const handleAddNode = (item: AssetItem) => {
    const newNode: CanvasNodeData = {
      id: genId(),
      type: item.type,
      source: { kind: item.kind, ref_id: item.ref_id, url: toStaticUrl(item.url) },
      duration: item.type === 'image' ? 3 : 5,
      order: nodes.length,
      params: {},
      transition: null,
    };
    setNodes([...nodes, newNode]);
    message.success(`已添加${item.type === 'video' ? '视频' : '图片'}素材`);
  };

  const handleAddText = () => {
    const newNode: CanvasNodeData = {
      id: genId(),
      type: 'text',
      source: null,
      duration: 3,
      order: nodes.length,
      params: { text: '', bg_color: '#7C3AED', text_color: '#FFFFFF', font_size: 48 },
      transition: null,
    };
    setNodes([...nodes, newNode]);
  };

  const updateNode = (id: string, updated: CanvasNodeData) => {
    setNodes(prev => prev.map(n => n.id === id ? updated : n));
  };

  const removeNode = (id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id));
  };

  // Drag & drop reorder (HTML5)
  const dragIndex = useRef<number | null>(null);

  const handleDropAsset = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const item = JSON.parse(raw) as AssetItem;
      handleAddNode(item);
    } catch { /* ignore */ }
  };

  const onBoardDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleDropAsset(e);
  };

  const handleDropUpload = async (file: File): Promise<boolean> => {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post('/api/media/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(res.data.url);
      handleAddNode({ kind: 'upload', type: isVideo ? 'video' : 'image', url: res.data.url, title: res.data.original_name || '上传素材' });
      message.success('上传成功并已添加');
      return true;
    } catch (err: any) {
      message.error('上传失败: ' + (err?.response?.data?.message || err.message));
      return false;
    } finally {
      setUploading(false);
    }
  };

  // BGM picker modal
  const [bgmOpen, setBgmOpen] = useState(false);
  const bgmSources: AssetItem[] = [...viralProjects];

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '100px 0' }}><Spin size="large" /></div>;
  }

  const nodeCount = nodes.length;
  const totalDuration = nodes.reduce((acc, n) => acc + (n.duration || 0), 0);

  return (
    <div style={{ padding: '16px 24px', height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexShrink: 0 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/canvas')} style={{ borderRadius: 10 }} />
        <Input
          value={name} onChange={e => setName(e.target.value)}
          style={{ width: 220, borderRadius: 10, fontWeight: 600 }}
          placeholder="画布名称"
        />
        <Select value={ratio} onChange={setRatio} style={{ width: 90, borderRadius: 10 }}
          options={['9:16', '16:9', '1:1', '3:4', '4:3', '2:3'].map(r => ({ value: r, label: r }))} />
        <Select value={resolution} onChange={setResolution} style={{ width: 90, borderRadius: 10 }}
          options={['480p', '720p', '1080p'].map(r => ({ value: r, label: r }))} />
        <Text type="secondary" style={{ fontSize: 12 }}>{nodeCount} 块 · 约 {totalDuration}s</Text>

        <div style={{ flex: 1 }} />

        {saved && <Tag color="success" icon={<CheckCircleOutlined />}>已保存</Tag>}
        <Button icon={<SaveOutlined />} loading={saving} onClick={handleSave} style={{ borderRadius: 10 }}>保存</Button>
        <Button
          type="primary" icon={<PlayCircleOutlined />} loading={render?.status === 'rendering'}
          onClick={handleRender} style={{ borderRadius: 10, background: '#7c3aed', borderColor: '#7c3aed' }}
        >
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
        <div style={{ marginBottom: 12, flexShrink: 0 }}>
          <Progress percent={render.progress || 0} status="active" strokeColor="#7c3aed" size="small" />
        </div>
      )}
      {render?.status === 'failed' && (
        <div style={{ marginBottom: 12, flexShrink: 0, color: '#f5222d', fontSize: 12 }}>
          渲染失败: {render.error_msg}
        </div>
      )}

      {/* Preview */}
      {(previewUrl || previewNode?.source?.url) && (
        <div style={{ marginBottom: 12, flexShrink: 0 }}>
          <Card size="small" style={{ borderRadius: 14, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
            title={<Text strong style={{ fontSize: 13 }}>{previewNode ? `预览: 素材块` : '成片预览'}</Text>}
            extra={
              previewNode ? (
                <Button type="link" size="small" onClick={() => setPreviewNode(null)}>回到成片</Button>
              ) : (
                render?.status === 'completed' && render.result_url && (
                  <Button type="link" size="small" icon={<DownloadOutlined />} href={render.result_url} download>下载</Button>
                )
              )
            }
          >
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {previewNode?.type === 'text' ? (
                <div style={{ width: 180, height: 320, background: previewNode.params?.bg_color || '#7C3AED', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: previewNode.params?.text_color || '#fff', fontWeight: 600, fontSize: 16, textAlign: 'center', padding: 16 }}>
                  {previewNode.params?.text || '文字块'}
                </div>
              ) : (
                <video
                  src={previewUrl || previewNode?.source?.url || undefined}
                  controls style={{ maxHeight: 320, borderRadius: 12, maxWidth: '100%' }}
                />
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Main area: asset panel + canvas */}
      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
        {/* Asset panel */}
        <div style={{ width: 260, flexShrink: 0, background: '#fafafa', borderRadius: 14, padding: 12, overflow: 'auto', border: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text strong style={{ fontSize: 13 }}>素材面板</Text>
            <Space size={6}>
              <Tooltip title="添加文字块">
                <Button size="small" type="primary" ghost icon={<FontSizeOutlined />} onClick={handleAddText} style={{ borderRadius: 8, color: '#7c3aed', borderColor: '#7c3aed' }} />
              </Tooltip>
              <Tooltip title="添加 BGM">
                <Button size="small" icon={<AudioOutlined />} onClick={() => setBgmOpen(true)} style={{ borderRadius: 8 }} />
              </Tooltip>
            </Space>
          </div>

          {/* Local upload */}
          <Upload.Dragger
            beforeUpload={(file) => { handleDropUpload(file); return false; }}
            showUploadList={false}
            style={{ marginBottom: 12, borderRadius: 10 }}
          >
            <div style={{ padding: '6px 0' }}>
              <Text style={{ fontSize: 12, color: '#666' }}>{uploading ? '上传中...' : '上传本地视频/图片'}</Text>
            </div>
          </Upload.Dragger>

          {/* BGM indicator */}
          {bgmUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, background: '#fff1f2', borderRadius: 8, padding: '6px 10px' }}>
              <AudioOutlined style={{ color: '#e11d48' }} />
              <Text style={{ fontSize: 11, flex: 1 }} ellipsis>已设置 BGM</Text>
              <Button type="text" size="small" danger icon={<ClearOutlined />} onClick={() => { setBgmUrl(null); message.success('已移除 BGM'); }} style={{ fontSize: 11, padding: 2 }} />
            </div>
          )}

          <Tabs
            size="small"
            items={[
              {
                key: 'ai',
                label: 'AI历史',
                children: assetLoading ? <Spin size="small" /> : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {aiTasks.map((it, i) => <AssetCard key={`ai${i}`} item={it} onClick={handleAddNode} />)}
                    {aiTasks.length === 0 && <Empty description="暂无 AI 素材" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ gridColumn: '1 / -1' }} />}
                  </div>
                ),
              },
              {
                key: 'assets',
                label: '大资产库',
                children: (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {globalAssets.map((it, i) => <AssetCard key={`ga${i}`} item={it} onClick={handleAddNode} />)}
                    {globalAssets.length === 0 && <Empty description="暂无资产" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ gridColumn: '1 / -1' }} />}
                  </div>
                ),
              },
              {
                key: 'viral',
                label: '热门创作',
                children: (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {viralProjects.map((it, i) => <AssetCard key={`vp${i}`} item={it} onClick={handleAddNode} />)}
                    {viralProjects.length === 0 && <Empty description="暂无成片" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ gridColumn: '1 / -1' }} />}
                  </div>
                ),
              },
              {
                key: 'drama',
                label: '短剧片段',
                children: (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {dramaClips.map((it, i) => <AssetCard key={`dc${i}`} item={it} onClick={handleAddNode} />)}
                    {dramaClips.length === 0 && <Empty description="暂无片段" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ gridColumn: '1 / -1' }} />}
                  </div>
                ),
              },
            ]}
          />
        </div>

        {/* Canvas board */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onBoardDrop}
          style={{ flex: 1, background: '#fafafa', borderRadius: 14, border: '1px dashed #d9d9d9', padding: 16, overflow: 'auto', minWidth: 0 }}
        >
          {nodes.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <FontSizeOutlined style={{ fontSize: 40, color: '#ccc' }} />
              <Text type="secondary" style={{ fontSize: 13 }}>
                从左侧拖素材到这里，或点击素材卡片直接添加
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                横向顺序 = 成片播放顺序
              </Text>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-start', padding: '8px 4px', overflowX: 'auto' }}>
              {nodes.map((node, i) => (
                <div key={node.id} style={{ display: 'flex', alignItems: 'flex-start' }}>
                  {i > 0 && (
                    <div style={{ width: 40, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <div style={{ width: 14, height: 14, border: '2px solid #b7b7b7', borderStyle: 'dashed', transform: 'rotate(45deg)', opacity: 0.5 }} />
                    </div>
                  )}
                  <NodeCard
                    node={node}
                    index={i}
                    lastNode={i === nodes.length - 1}
                    onUpdate={(u) => updateNode(node.id, u)}
                    onRemove={() => removeNode(node.id)}
                    onDragStart={() => { dragIndex.current = i; }}
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={() => {
                      const from = dragIndex.current;
                      if (from === null || from === i) { dragIndex.current = null; return; }
                      setNodes(prev => {
                        const next = [...prev];
                        const [moved] = next.splice(from, 1);
                        next.splice(i, 0, moved);
                        return next;
                      });
                      dragIndex.current = null;
                    }}
                    onPreview={() => {
                      setPreviewNode(node);
                      if (node.source?.url) setPreviewUrl(node.source.url);
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* BGM drawer */}
      <Drawer
        title="选择背景音乐"
        open={bgmOpen}
        onClose={() => setBgmOpen(false)}
        size="default"
      >        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
          从热门创作成片中选择 BGM（自动使用其音频）。渲染时叠加到整片。
        </Text>
        {bgmSources.length === 0 && (
          <Empty description="暂无可用 BGM 来源" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {bgmSources.map((it, i) => (
            <div key={`bgm${i}`} style={{ border: '1px solid #f0f0f0', borderRadius: 10, padding: 8, cursor: 'pointer', textAlign: 'center' }}
              onClick={() => {
                setBgmUrl(it.url);
                setBgmOpen(false);
                message.success('BGM 已设置');
              }}>
              <video src={it.url} muted playsInline preload="metadata" style={{ width: '100%', height: 60, objectFit: 'cover', borderRadius: 8 }} />
              <Text style={{ fontSize: 11, display: 'block', marginTop: 6 }} ellipsis>{it.title}</Text>
            </div>
          ))}
        </div>
      </Drawer>
    </div>
  );
}