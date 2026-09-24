import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Button, Tag, Space, Spin, message, Modal,
  Input, Select, Upload, Image, Progress,
} from 'antd';
import {
  ArrowLeftOutlined, PlusOutlined, DeleteOutlined,
  ThunderboltOutlined, UploadOutlined,
  SyncOutlined, EyeOutlined, AimOutlined, SearchOutlined,
  PlayCircleFilled, VideoCameraOutlined, AudioOutlined, PictureOutlined,
  EditOutlined,
} from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;
const { TextArea } = Input;

const API_BASE = import.meta.env.VITE_API_BASE || '';
const getUrl = (p: string | null) => p ? (p.startsWith('http') ? p : API_BASE + p) : '';

interface GlobalAsset {
  id: number; type: string; name: string;
  description: string | null; prompt: string | null; prompt_cn: string | null;
  image_url: string | null; video_url: string | null; audio_url: string | null; status: string;
  candidates: string | null; tags: string | null;
  source_type: string; source_project_id: number | null;
  usage_count: number; created_at: string; updated_at: string;
}

const TYPE_LABEL: Record<string, string> = {
  character: '人物', prop: '物品', scene: '场景', video: '视频', audio: '音频',
};
const TYPE_COLOR: Record<string, string> = {
  character: 'purple', prop: 'blue', scene: 'green', video: 'cyan', audio: 'orange',
};

export default function GlobalAssetsPage() {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<GlobalAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingSet, setGeneratingSet] = useState<Set<number>>(new Set());
  const [planSet, setPlanSet] = useState<Set<number>>(new Set());
  const [stats, setStats] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [addModal, setAddModal] = useState(false);
  const [addType, setAddType] = useState<'character' | 'prop' | 'scene' | 'video' | 'audio'>('character');
  const [addName, setAddName] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addPrompt, setAddPrompt] = useState('');
  const [addPromptCn, setAddPromptCn] = useState('');
  const [addTags, setAddTags] = useState('');
  const [editModal, setEditModal] = useState<{ visible: boolean; asset: GlobalAsset | null; promptCn: string; prompt: string; planning: boolean; translating: boolean }>({ visible: false, asset: null, promptCn: '', prompt: '', planning: false, translating: false });
  const [generateModal, setGenerateModal] = useState<{ visible: boolean; assetId: number | null; ratio: string; size: string; style: string }>({ visible: false, assetId: null, ratio: '9:16', size: 'hd', style: 'anime' });
  const [selected, setSelected] = useState<GlobalAsset | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ percent: number; filename: string } | null>(null);

  const stylePresets = [
    { label: '动漫', value: 'anime' },
    { label: '写实', value: 'realistic' },
  ];
  const ratioPresets = [
    { label: '9:16', value: '9:16' },
    { label: '16:9', value: '16:9' },
    { label: '1:1', value: '1:1' },
    { label: '3:4', value: '3:4' },
    { label: '4:3', value: '4:3' },
  ];
  const sizeOptions = [
    { label: '标清', value: 'sd', height: 720 },
    { label: '高清', value: 'hd', height: 1080 },
    { label: '超清', value: 'fhd', height: 1920 },
  ];

  const calcSize = (ratio: string, sizeKey: string) => {
    const [wr, hr] = ratio.split(':').map(Number);
    const base = sizeOptions.find(s => s.value === sizeKey)?.height || 1080;
    const w = Math.round(base * wr / hr);
    const h = base;
    return { width: w % 2 ? w + 1 : w, height: h };
  };

  const fetchData = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('keyword', search);
      if (activeTab !== 'all') params.set('type', activeTab);
      params.set('limit', '200');
      const { data } = await api.get(`/api/global-assets?${params}`);
      setAssets(data.items || []);
    } catch { message.error('加载大资产库失败'); }
    setLoading(false);
  };

  const fetchStats = async () => {
    try {
      const { data } = await api.get('/api/global-assets/stats');
      setStats(data);
    } catch {}
  };

  useEffect(() => {
    fetchData();
    fetchStats();
  }, [activeTab, search]);

  const filteredAssets = useMemo(
    () => activeTab === 'all' ? assets : assets.filter(a => a.type === activeTab),
    [assets, activeTab],
  );

  const openGenerateModal = (assetId: number) => {
    setGenerateModal({ visible: true, assetId, ratio: '9:16', size: 'hd', style: 'anime' });
  };

  const handleGenerate = async () => {
    const { assetId, ratio, size, style } = generateModal;
    if (!assetId) return;
    const { width, height } = calcSize(ratio, size);
    setGeneratingSet(prev => new Set(prev).add(assetId));
    setGenerateModal(prev => ({ ...prev, visible: false }));
    try {
      await api.post(`/api/global-assets/${assetId}/generate`, { width, height, style });
      message.success(`生成成功（${ratio} ${width}x${height}）`);
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.message || '生成失败');
      fetchData();
    }
    setGeneratingSet(prev => { const s = new Set(prev); s.delete(assetId); return s; });
  };

  const handlePlanPrompt = async (assetId: number) => {
    setPlanSet(prev => new Set(prev).add(assetId));
    try {
      await api.post(`/api/global-assets/${assetId}/plan-prompt`);
      message.success('提示词已优化');
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.message || '优化失败');
    }
    setPlanSet(prev => { const s = new Set(prev); s.delete(assetId); return s; });
  };

  const handleDelete = async (assetId: number) => {
    try {
      await api.delete(`/api/global-assets/${assetId}`);
      message.success('已删除');
      setSelected(null);
      fetchData();
      fetchStats();
    } catch { message.error('删除失败'); }
  };

  const handleAdd = async () => {
    if (!addName.trim()) { message.warning('请输入名称'); return; }
    try {
      await api.post('/api/global-assets', {
        type: addType, name: addName.trim(),
        description: addDesc.trim() || undefined,
        prompt: addPrompt.trim() || undefined,
        prompt_cn: addPromptCn.trim() || undefined,
        tags: addTags.trim() || undefined,
      });
      message.success('已添加');
      setAddModal(false);
      setAddName(''); setAddDesc(''); setAddPrompt(''); setAddPromptCn(''); setAddTags('');
      fetchData();
      fetchStats();
    } catch { message.error('添加失败'); }
  };

  const resetAddForm = () => {
    setAddName(''); setAddDesc(''); setAddPrompt(''); setAddPromptCn(''); setAddTags('');
  };

  const handleAudioUpload = async (file: File) => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      setUploadProgress({ percent: 0, filename: file.name });
      const { data } = await api.post('/api/media/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => { if (e.total) setUploadProgress({ percent: Math.round(e.loaded * 100 / e.total), filename: file.name }); },
      });
      const name = addName.trim() || file.name.replace(/\.[^/.]+$/, '');
      await api.post('/api/global-assets', {
        type: 'audio',
        name,
        audio_url: data.url,
        description: addDesc.trim() || undefined,
        tags: addTags.trim() || undefined,
      });
      message.success('音频上传并保存成功');
      setAddModal(false);
      resetAddForm();
      fetchData();
      fetchStats();
    } catch (err: any) {
      message.error(err.response?.data?.message || '音频上传失败');
    }
    setUploadProgress(null);
  };

  const handleImageUpload = async (file: File) => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      setUploadProgress({ percent: 0, filename: file.name });
      const { data } = await api.post('/api/media/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => { if (e.total) setUploadProgress({ percent: Math.round(e.loaded * 100 / e.total), filename: file.name }); },
      });
      const name = addName.trim() || file.name.replace(/\.[^/.]+$/, '');
      await api.post('/api/global-assets', {
        type: addType,
        name,
        image_url: data.url,
        description: addDesc.trim() || undefined,
        prompt: addPrompt.trim() || undefined,
        prompt_cn: addPromptCn.trim() || undefined,
        tags: addTags.trim() || undefined,
      });
      message.success('图片上传并保存成功');
      setAddModal(false);
      resetAddForm();
      fetchData();
      fetchStats();
    } catch (err: any) {
      message.error(err.response?.data?.message || '图片上传失败');
    }
    setUploadProgress(null);
  };

  const handleVideoUpload = async (file: File) => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      setUploadProgress({ percent: 0, filename: file.name });
      const { data } = await api.post('/api/media/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => { if (e.total) setUploadProgress({ percent: Math.round(e.loaded * 100 / e.total), filename: file.name }); },
      });
      const name = addName.trim() || file.name.replace(/\.[^/.]+$/, '');
      await api.post('/api/global-assets', {
        type: 'video',
        name,
        video_url: data.url,
        description: addDesc.trim() || undefined,
        prompt: addPrompt.trim() || undefined,
        prompt_cn: addPromptCn.trim() || undefined,
        tags: addTags.trim() || undefined,
      });
      message.success('视频上传并保存成功');
      setAddModal(false);
      resetAddForm();
      fetchData();
      fetchStats();
    } catch (err: any) {
      message.error(err.response?.data?.message || '视频上传失败');
    }
    setUploadProgress(null);
  };

  const handleEdit = (asset: GlobalAsset) => {
    setEditModal({ visible: true, asset, promptCn: asset.prompt_cn || '', prompt: asset.prompt || '', planning: false, translating: false });
  };

  const handleEditSave = async () => {
    const { asset, promptCn, prompt } = editModal;
    if (!asset) return;
    try {
      await api.put(`/api/global-assets/${asset.id}`, { prompt_cn: promptCn, prompt });
      message.success('已更新');
      setEditModal({ visible: false, asset: null, promptCn: '', prompt: '', planning: false, translating: false });
      fetchData();
    } catch { message.error('更新失败'); }
  };

  const handlePlanInModal = async () => {
    const { asset } = editModal;
    if (!asset) return;
    setEditModal(prev => ({ ...prev, planning: true }));
    try {
      const { data } = await api.post(`/api/global-assets/${asset.id}/plan-prompt`);
      setEditModal(prev => ({ ...prev, promptCn: data.prompt_cn || '', prompt: data.prompt || '' }));
      message.success('提示词已优化');
    } catch (err: any) {
      message.error(err.response?.data?.message || '优化失败');
    }
    setEditModal(prev => ({ ...prev, planning: false }));
  };

  const handleTranslatePrompt = async () => {
    const { asset, promptCn } = editModal;
    if (!asset || !promptCn.trim()) { message.warning('请先输入中文提示词'); return; }
    setEditModal(prev => ({ ...prev, translating: true }));
    try {
      const { data } = await api.post(`/api/global-assets/${asset.id}/translate`, { text: promptCn });
      setEditModal(prev => ({ ...prev, prompt: data.prompt }));
      message.success('中文已转换为英文提示词');
    } catch (err: any) {
      message.error(err.response?.data?.message || '翻译失败');
    }
    setEditModal(prev => ({ ...prev, translating: false }));
  };

  const handleUpload = async (assetId: number, file: File, assetType: string) => {
    const form = new FormData();
    form.append('file', file);
    try {
      setUploadProgress({ percent: 0, filename: file.name });
      const { data } = await api.post(`/api/media/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => { if (e.total) setUploadProgress({ percent: Math.round(e.loaded * 100 / e.total), filename: file.name }); },
      });
      const updatePayload: any = {};
      if (assetType === 'audio') updatePayload.audio_url = data.url;
      else if (assetType === 'video') updatePayload.video_url = data.url;
      else updatePayload.image_url = data.url;
      await api.put(`/api/global-assets/${assetId}`, updatePayload);
      if (assetType === 'video') {
        try { await api.post(`/api/global-assets/${assetId}/thumbnail`); } catch { /* ignore */ }
      }
      message.success('上传成功');
      fetchData();
    } catch { message.error('上传失败'); }
    setUploadProgress(null);
  };

  const timeAgo = (s?: string | null) => {
    if (!s) return '';
    const d = new Date(s);
    const diff = Date.now() - d.getTime();
    if (diff < 6e4) return '刚刚';
    if (diff < 36e5) return `${Math.floor(diff / 6e4)} 分钟前`;
    if (diff < 864e5) return `${Math.floor(diff / 36e5)} 小时前`;
    if (diff < 6048e5) return `${Math.floor(diff / 864e5)} 天前`;
    return d.toLocaleDateString('zh-CN');
  };

  const renderThumb = (asset: GlobalAsset, height = 200) => {
    const isVideo = asset.type === 'video';
    const isAudio = asset.type === 'audio';
    const overlay = (
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        background: 'rgba(0,0,0,0.5)', borderRadius: '50%', width: 48, height: 48,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <PlayCircleFilled style={{ fontSize: 30, color: '#fff' }} />
      </div>
    );
    if (isVideo) {
      if (asset.image_url) {
        return (
          <div style={{ position: 'relative', height, overflow: 'hidden', background: '#000' }}>
            <img src={getUrl(asset.image_url)} alt={asset.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            {overlay}
          </div>
        );
      }
      if (asset.video_url) {
        return (
          <div style={{ position: 'relative', height, overflow: 'hidden', background: '#000' }}>
            <video src={getUrl(asset.video_url)} preload="metadata" muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            {overlay}
          </div>
        );
      }
      return (
        <div style={{ height, background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
          <VideoCameraOutlined style={{ fontSize: 36, color: 'rgba(255,255,255,0.3)' }} />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>暂无预览</span>
        </div>
      );
    }
    if (isAudio) {
      return (
        <div style={{ height, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AudioOutlined style={{ fontSize: 28, color: '#fff' }} />
          </div>
        </div>
      );
    }
    if (asset.image_url) {
      return (
        <div style={{ height, overflow: 'hidden', background: '#f0f0f0' }}>
          <Image src={getUrl(asset.image_url)} alt={asset.name} preview={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      );
    }
    return (
      <div style={{ height, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
        <PictureOutlined style={{ fontSize: 36, color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>暂无图片</span>
      </div>
    );
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;

  const filterItems = [
    { key: 'all', label: `全部 (${stats?.total || 0})` },
    { key: 'character', label: `人物 (${stats?.characters || 0})` },
    { key: 'prop', label: `物品 (${stats?.props || 0})` },
    { key: 'scene', label: `场景 (${stats?.scenes || 0})` },
    { key: 'video', label: `视频 (${stats?.videos || 0})` },
    { key: 'audio', label: `音频 (${stats?.audios || 0})` },
  ];

  const detailFile = selected
    ? (selected.type === 'video' ? selected.video_url : selected.type === 'audio' ? selected.audio_url : selected.image_url)
    : null;
  const detailGenerating = selected ? generatingSet.has(selected.id) : false;

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <Space style={{ marginBottom: 16 }}>
        <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')} style={{ padding: 0 }}>
          返回工作台
        </Button>
      </Space>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>大资产库</Title>
            <Text type="secondary">管理您的人物、场景、道具、视频和音频资产</Text>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setAddModal(true)}
            style={{ background: 'var(--primary)', borderColor: 'var(--primary)', height: 40, paddingInline: 24, fontWeight: 500 }}
          >
            新增资产
          </Button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Input
            prefix={<SearchOutlined style={{ color: 'var(--text-muted)' }} />}
            placeholder="搜索资产名称..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 280, borderRadius: 8 }}
            allowClear
          />
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-secondary)', borderRadius: 8, padding: 4 }}>
            {filterItems.map(it => (
              <button
                key={it.key}
                onClick={() => setActiveTab(it.key)}
                style={{
                  padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: activeTab === it.key ? 'var(--primary)' : 'transparent',
                  color: activeTab === it.key ? '#fff' : 'var(--text-secondary)',
                  fontSize: 13, fontWeight: activeTab === it.key ? 500 : 400, transition: 'all 0.2s',
                }}
              >
                {it.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {filteredAssets.map(asset => (
          <div
            key={asset.id}
            onClick={() => setSelected(asset)}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
            style={{
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12,
              overflow: 'hidden', cursor: 'pointer', transition: 'all 0.2s', position: 'relative',
            }}
          >
            {renderThumb(asset)}
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <Text strong style={{ fontSize: 14, lineHeight: 1.3, flex: 1 }} ellipsis={{ tooltip: asset.name }}>
                  {asset.name}
                </Text>
                <Tag color={TYPE_COLOR[asset.type]} style={{ fontSize: 11, marginLeft: 6, flexShrink: 0 }}>
                  {TYPE_LABEL[asset.type]}
                </Tag>
              </div>
              {asset.tags && (
                <Space size={2} wrap style={{ marginBottom: 6 }}>
                  {asset.tags.split(',').slice(0, 3).map(t => (
                    <Tag key={t} style={{ fontSize: 10, padding: '0 6px', margin: 0 }}>{t.trim()}</Tag>
                  ))}
                </Space>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text type="secondary" style={{ fontSize: 11 }}>{timeAgo(asset.updated_at || asset.created_at)}</Text>
                {generatingSet.has(asset.id) && (
                  <SyncOutlined spin style={{ color: 'var(--primary)', fontSize: 14 }} />
                )}
              </div>
            </div>
          </div>
        ))}
        <div
          onClick={() => setAddModal(true)}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--primary)';
            e.currentTarget.style.background = 'rgba(124,58,237,0.04)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.background = 'transparent';
          }}
          style={{
            border: '2px dashed var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', minHeight: 260, cursor: 'pointer',
            transition: 'all 0.2s', gap: 12,
          }}
        >
          <div style={{
            width: 56, height: 56, borderRadius: 12, border: '2px dashed var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <PlusOutlined style={{ fontSize: 24, color: 'var(--text-muted)' }} />
          </div>
          <Text type="secondary" style={{ fontSize: 13 }}>新增资产</Text>
        </div>
      </div>

      {filteredAssets.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <PictureOutlined style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }} />
          <div>暂无资产，点击上方「新增资产」或右下角卡片添加</div>
        </div>
      )}

      {selected && (() => {
        const asset = selected;
        return (
          <Modal
            open={!!selected}
            onCancel={() => setSelected(null)}
            footer={null}
            width={860}
            centered
            destroyOnClose
            className="global-asset-detail-modal"
            styles={{ body: { maxHeight: 'calc(100vh - 120px)', overflowY: 'auto', overflowX: 'hidden', padding: 0 } }}
          >
            <div style={{ overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px 0' }}>
                <Title level={4} style={{ margin: 0 }}>{asset.name}</Title>
                <Space size={8} wrap style={{ marginTop: 8 }}>
                  <Tag color={TYPE_COLOR[asset.type]}>{TYPE_LABEL[asset.type]}</Tag>
                  <Tag color={detailFile ? 'success' : 'default'}>{detailFile ? '已上传' : '无文件'}</Tag>
                  {asset.usage_count > 0 && <Tag>引用 {asset.usage_count} 次</Tag>}
                  {asset.tags && asset.tags.split(',').map(t => <Tag key={t}>{t.trim()}</Tag>)}
                </Space>
              </div>

              {asset.type === 'video' ? (
                asset.video_url ? (
                  <div style={{ margin: '16px 0', background: '#000' }}>
                    <video
                      src={getUrl(asset.video_url)}
                      controls
                      playsInline
                      preload="metadata"
                      style={{ width: '100%', maxHeight: 400, objectFit: 'contain', display: 'block' }}
                    />
                  </div>
                ) : (
                  <div style={{ margin: '16px -24px', height: 200, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Text type="secondary">暂无视频</Text>
                  </div>
                )
              ) : asset.type === 'audio' ? (
                <div style={{ margin: '16px -24px', height: 160, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                  <AudioOutlined style={{ fontSize: 48, color: '#fff' }} />
                  {asset.audio_url && <audio src={getUrl(asset.audio_url)} controls style={{ width: '80%' }} />}
                </div>
              ) : asset.image_url ? (
                <div style={{ margin: '16px -24px', background: '#000', overflow: 'hidden', textAlign: 'center' }}>
                  <Image
                    src={getUrl(asset.image_url)}
                    alt={asset.name}
                    style={{ maxWidth: '100%', maxHeight: 400, objectFit: 'contain' }}
                    preview={{ mask: <EyeOutlined style={{ fontSize: 20 }} /> }}
                  />
                </div>
              ) : (
                <div style={{ margin: '16px -24px', height: 200, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Text type="secondary">暂无图片</Text>
                </div>
              )}

              <div style={{ padding: '0 24px' }}>
                {asset.description && (
                  <div style={{ marginBottom: 12 }}>
                    <Text type="secondary" style={{ fontSize: 13 }}>{asset.description}</Text>
                  </div>
                )}
                {(asset.prompt_cn || asset.prompt) && (
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>提示词</Text>
                    <Text style={{ fontSize: 13, lineHeight: 1.5 }}>{asset.prompt_cn || asset.prompt}</Text>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', marginBottom: 16, fontSize: 13 }}>
                  <div><Text type="secondary" strong>类型</Text></div>
                  <div><Text>{TYPE_LABEL[asset.type]}</Text></div>
                  <div><Text type="secondary" strong>来源</Text></div>
                  <div><Text>{asset.source_type || '手动创建'}</Text></div>
                  <div><Text type="secondary" strong>创建时间</Text></div>
                  <div><Text>{new Date(asset.created_at).toLocaleString('zh-CN')}</Text></div>
                  <div><Text type="secondary" strong>更新时间</Text></div>
                  <div><Text>{new Date(asset.updated_at).toLocaleString('zh-CN')}</Text></div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', padding: '16px 24px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {asset.type !== 'video' && (
                  <Button
                    icon={detailGenerating ? <SyncOutlined spin /> : <ThunderboltOutlined />}
                    onClick={() => { openGenerateModal(asset.id); setSelected(null); }}
                    disabled={detailGenerating}
                  >
                    {detailGenerating ? '生成中...' : '生成图片'}
                  </Button>
                )}
                <Button icon={<AimOutlined />} loading={planSet.has(asset.id)} onClick={() => handlePlanPrompt(asset.id)}>
                  智能规划
                </Button>
                <Button icon={<EditOutlined />} onClick={() => { handleEdit(asset); setSelected(null); }}>
                  编辑提示词
                </Button>
                <Upload
                  showUploadList={false}
                  beforeUpload={(file) => { handleUpload(asset.id, file, asset.type); return false; }}
                >
                  <Button icon={<UploadOutlined />}>{detailFile ? '上传替换' : '上传文件'}</Button>
                </Upload>
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => Modal.confirm({
                    title: '确定删除？被引用的资产删除后可能影响已有项目',
                    content: '删除后无法撤销',
                    okText: '删除',
                    okType: 'danger',
                    cancelText: '取消',
                    onOk: () => handleDelete(asset.id),
                  })}
                >
                  删除
                </Button>
              </div>
            </div>
          </Modal>
        );
      })()}

      <Modal
        title="新增全局资产"
        open={addModal}
        onOk={handleAdd}
        onCancel={() => setAddModal(false)}
        okText="添加"
        cancelText="取消"
        width={560}
      >
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>资产类型</Text>
            <Select value={addType} onChange={v => setAddType(v)} style={{ width: '100%' }}>
              <Select.Option value="character">人物</Select.Option>
              <Select.Option value="prop">物品</Select.Option>
              <Select.Option value="scene">场景</Select.Option>
              <Select.Option value="video">视频</Select.Option>
              <Select.Option value="audio">音频</Select.Option>
            </Select>
          </div>
          <Input placeholder="资产名称" value={addName} onChange={e => setAddName(e.target.value)} />
          <TextArea placeholder="资产描述（可选）" value={addDesc} onChange={e => setAddDesc(e.target.value)} rows={2} />
          {addType === 'audio' ? (
            <Upload.Dragger
              beforeUpload={async (file) => { await handleAudioUpload(file); return false; }}
              accept="audio/*"
              showUploadList={false}
            >
              <p className="ant-upload-drag-icon">
                <AudioOutlined style={{ fontSize: 32, color: 'var(--primary)' }} />
              </p>
              <p className="ant-upload-text">点击或拖拽上传音频文件</p>
              <p className="ant-upload-hint">支持格式：mp3, wav, m4a, flac, ogg</p>
            </Upload.Dragger>
          ) : addType === 'video' ? (
            <>
              <TextArea placeholder="英文视频提示词（给AI用，可选）" value={addPrompt} onChange={e => setAddPrompt(e.target.value)} rows={2} />
              <TextArea placeholder="中文视频提示词描述（给你看，可选）" value={addPromptCn} onChange={e => setAddPromptCn(e.target.value)} rows={2} />
              <Upload.Dragger
                beforeUpload={async (file) => { await handleVideoUpload(file); return false; }}
                accept="video/mp4,video/webm,video/quicktime,video/x-matroska,video/avi,video/x-m4v"
                showUploadList={false}
              >
                <p className="ant-upload-drag-icon">
                  <VideoCameraOutlined style={{ fontSize: 32, color: 'var(--primary)' }} />
                </p>
                <p className="ant-upload-text">点击或拖拽上传本地视频</p>
                <p className="ant-upload-hint">支持格式：mp4, webm, mov, mkv, avi, m4v</p>
              </Upload.Dragger>
            </>
          ) : (
            <>
              <TextArea placeholder="英文提示词（给AI用，可选）" value={addPrompt} onChange={e => setAddPrompt(e.target.value)} rows={2} />
              <TextArea placeholder="中文提示词描述（给你看，可选）" value={addPromptCn} onChange={e => setAddPromptCn(e.target.value)} rows={2} />
              <Upload.Dragger
                beforeUpload={async (file) => { await handleImageUpload(file); return false; }}
                accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
                showUploadList={false}
              >
                <p className="ant-upload-drag-icon">
                  <PictureOutlined style={{ fontSize: 32, color: 'var(--primary)' }} />
                </p>
                <p className="ant-upload-text">点击或拖拽上传图片</p>
                <p className="ant-upload-hint">支持格式：png, jpg, webp, gif</p>
              </Upload.Dragger>
            </>
          )}
          <Input placeholder="标签，用逗号分隔（如：古风,仙侠,主角）" value={addTags} onChange={e => setAddTags(e.target.value)} />
        </Space>
      </Modal>

      <Modal
        title="编辑提示词"
        open={editModal.visible}
        onOk={handleEditSave}
        onCancel={() => setEditModal({ visible: false, asset: null, promptCn: '', prompt: '', planning: false, translating: false })}
        okText="保存"
        cancelText="取消"
        width={700}
        centered
      >
        <Space orientation="vertical" size="small" style={{ width: '100%' }}>
          <Text strong>中文提示词</Text>
          <TextArea rows={8} value={editModal.promptCn}
            onChange={e => setEditModal(prev => ({ ...prev, promptCn: e.target.value }))} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<ThunderboltOutlined />} loading={editModal.planning}
              onClick={handlePlanInModal} style={{ flex: 1 }}>
              智能规划
            </Button>
            <Button icon={<SyncOutlined />} loading={editModal.translating}
              onClick={handleTranslatePrompt} style={{ flex: 1 }}>
              中文转英文
            </Button>
          </div>
          <Text strong>英文提示词（只读）</Text>
          <TextArea rows={8} value={editModal.prompt} readOnly
            style={{ background: 'var(--bg-tertiary)' }} />
        </Space>
      </Modal>

      <Modal
        title="生成图片参数"
        open={generateModal.visible}
        onOk={handleGenerate}
        onCancel={() => setGenerateModal(prev => ({ ...prev, visible: false }))}
        okText="开始生成"
        cancelText="取消"
      >
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong>画面风格</Text>
            <Space style={{ marginTop: 6 }}>
              {stylePresets.map(s => (
                <Button key={s.value}
                  type={generateModal.style === s.value ? 'primary' : 'default'}
                  onClick={() => setGenerateModal(prev => ({ ...prev, style: s.value }))}
                  style={generateModal.style === s.value ? { background: 'var(--primary)', borderColor: 'var(--primary)' } : {}}>
                  {s.label}
                </Button>
              ))}
            </Space>
          </div>
          <div>
            <Text strong>宽高比</Text>
            <Space wrap style={{ marginTop: 6 }}>
              {ratioPresets.map(p => (
                <Button key={p.value}
                  type={generateModal.ratio === p.value ? 'primary' : 'default'}
                  onClick={() => setGenerateModal(prev => ({ ...prev, ratio: p.value }))}
                  style={generateModal.ratio === p.value ? { background: 'var(--primary)', borderColor: 'var(--primary)' } : {}}>
                  {p.label}
                </Button>
              ))}
            </Space>
          </div>
          <div>
            <Text strong>画质</Text>
            <Space style={{ marginTop: 6 }}>
              {sizeOptions.map(s => (
                <Button key={s.value}
                  type={generateModal.size === s.value ? 'primary' : 'default'}
                  onClick={() => setGenerateModal(prev => ({ ...prev, size: s.value }))}
                  style={generateModal.size === s.value ? { background: 'var(--primary)', borderColor: 'var(--primary)' } : {}}>
                  {s.label}
                </Button>
              ))}
            </Space>
          </div>
          {generateModal.visible && (
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 6, padding: '8px 12px' }}>
              <Text type="secondary">
                输出尺寸：{calcSize(generateModal.ratio, generateModal.size).width} x {calcSize(generateModal.ratio, generateModal.size).height}
              </Text>
            </div>
          )}
        </Space>
      </Modal>

      {uploadProgress && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.45)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--bg)', borderRadius: 12, padding: '28px 36px',
            minWidth: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            textAlign: 'center',
          }}>
            <UploadOutlined style={{ fontSize: 32, color: 'var(--primary)', marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
              正在上传：{uploadProgress.filename}
            </div>
            <Progress percent={uploadProgress.percent} strokeColor="var(--primary)"
              style={{ margin: '12px 0 0' }} />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {uploadProgress.percent >= 100 ? '上传完成，正在保存...' : '请勿关闭页面'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
