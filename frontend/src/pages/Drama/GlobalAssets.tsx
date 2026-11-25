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
import './global-assets.css';   // 本页质感改造样式（作用域 .dga-，详见文件头注释）

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
    /* 只有 height 是动态值（调用方会传），保留一处内联；其余全部走 .dga-thumb* 类 */
    const box = (cls: string, children?: React.ReactNode) => (
      <div className={`dga-thumb ${cls}`} style={{ height }}>{children}</div>
    );
    const play = (
      <div className="dga-thumb__play"><PlayCircleFilled /></div>
    );
    if (isVideo) {
      if (asset.image_url) {
        return box('dga-thumb--media', <>
          <img className="dga-thumb__media" src={getUrl(asset.image_url)} alt={asset.name} />
          {play}
        </>);
      }
      if (asset.video_url) {
        return box('dga-thumb--media', <>
          <video className="dga-thumb__media" src={getUrl(asset.video_url)} preload="metadata" muted />
          {play}
        </>);
      }
      return box('dga-thumb--video-ph', <>
        <VideoCameraOutlined className="dga-thumb__ph-icon" />
        <span className="dga-thumb__ph-text">暂无预览</span>
      </>);
    }
    if (isAudio) {
      return box('dga-thumb--audio', <>
        <div className="dga-audio-badge"><AudioOutlined /></div>
      </>);
    }
    if (asset.image_url) {
      return box('dga-thumb--img',
        <Image className="dga-thumb__media" src={getUrl(asset.image_url)} alt={asset.name} preview={false} />
      );
    }
    return box('dga-thumb--none', <>
      <PictureOutlined />
      <span>暂无图片</span>
    </>);
  };

  if (loading) return <div className="dga-loading"><Spin size="large" /></div>;

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
    <div className="dga-root">
      <div className="dga-back">
        <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')}>
          返回工作台
        </Button>
      </div>

      <div className="dga-head">
        <div className="dga-head__row">
          <div>
            <Title level={3} className="dga-head__title">大资产库</Title>
            <Text className="dga-head__sub">管理您的人物、场景、道具、视频和音频资产</Text>
          </div>
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => setAddModal(true)} className="dga-btn-new">
            新增资产
          </Button>
        </div>
        <div className="dga-tools">
          <Input
            className="dga-search"
            prefix={<SearchOutlined />}
            placeholder="搜索资产名称..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
          />
          <div className="dga-tabs">
            {filterItems.map(it => (
              <button
                key={it.key}
                type="button"
                className="dga-tab"
                data-on={activeTab === it.key ? '1' : '0'}
                onClick={() => setActiveTab(it.key)}
              >
                {it.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="dga-grid">
        {filteredAssets.map(asset => (
          <div key={asset.id} className="dga-card" onClick={() => setSelected(asset)}>
            {renderThumb(asset)}
            <div className="dga-card__body">
              <div className="dga-card__title">
                <Text strong className="dga-card__name" ellipsis={{ tooltip: asset.name }}>
                  {asset.name}
                </Text>
                <Tag className="dga-card__tag" color={TYPE_COLOR[asset.type]}>
                  {TYPE_LABEL[asset.type]}
                </Tag>
              </div>
              {asset.tags && (
                <div className="dga-card__chips">
                  {asset.tags.split(',').slice(0, 3).map(t => (
                    <Tag key={t}>{t.trim()}</Tag>
                  ))}
                </div>
              )}
              <div className="dga-card__foot">
                <Text className="dga-card__time">{timeAgo(asset.updated_at || asset.created_at)}</Text>
                {generatingSet.has(asset.id) && <SyncOutlined spin className="dga-card__spin" />}
              </div>
            </div>
          </div>
        ))}
        <div className="dga-add" onClick={() => setAddModal(true)}>
          <div className="dga-add__badge"><PlusOutlined /></div>
          <Text className="dga-add__label">新增资产</Text>
        </div>
      </div>

      {filteredAssets.length === 0 && !loading && (
        <div className="dga-empty">
          <PictureOutlined />
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
            <div className="dga-modal__media-wrap">
              <div className="dga-modal__head">
                <Title level={4} className="dga-modal__title">{asset.name}</Title>
                <div className="dga-modal__tags">
                  <Tag color={TYPE_COLOR[asset.type]}>{TYPE_LABEL[asset.type]}</Tag>
                  <Tag color={detailFile ? 'success' : 'default'}>{detailFile ? '已上传' : '无文件'}</Tag>
                  {asset.usage_count > 0 && <Tag>引用 {asset.usage_count} 次</Tag>}
                  {asset.tags && asset.tags.split(',').map(t => <Tag key={t}>{t.trim()}</Tag>)}
                </div>
              </div>

              {asset.type === 'video' ? (
                asset.video_url ? (
                  <div className="dga-modal__video">
                    <video
                      src={getUrl(asset.video_url)}
                      controls
                      playsInline
                      preload="metadata"
                    />
                  </div>
                ) : (
                  <div className="dga-modal__missing">暂无视频</div>
                )
              ) : asset.type === 'audio' ? (
                <div className="dga-modal__audio">
                  <AudioOutlined />
                  {asset.audio_url && <audio src={getUrl(asset.audio_url)} controls />}
                </div>
              ) : asset.image_url ? (
                <div className="dga-modal__image">
                  <Image
                    src={getUrl(asset.image_url)}
                    alt={asset.name}
                    preview={{ mask: <EyeOutlined style={{ fontSize: 20 }} /> }}
                  />
                </div>
              ) : (
                <div className="dga-modal__missing">暂无图片</div>
              )}

              <div className="dga-modal__body">
                {asset.description && (
                  <div className="dga-modal__desc">{asset.description}</div>
                )}
                {(asset.prompt_cn || asset.prompt) && (
                  <div className="dga-modal__prompt">
                    <span className="dga-modal__prompt-label">提示词</span>
                    <span className="dga-modal__prompt-text">{asset.prompt_cn || asset.prompt}</span>
                  </div>
                )}
                <div className="dga-modal__kv">
                  <div className="dga-modal__kv-label">类型</div>
                  <div>{TYPE_LABEL[asset.type]}</div>
                  <div className="dga-modal__kv-label">来源</div>
                  <div>{asset.source_type || '手动创建'}</div>
                  <div className="dga-modal__kv-label">创建时间</div>
                  <div>{new Date(asset.created_at).toLocaleString('zh-CN')}</div>
                  <div className="dga-modal__kv-label">更新时间</div>
                  <div>{new Date(asset.updated_at).toLocaleString('zh-CN')}</div>
                </div>
              </div>

              <div className="dga-modal__acts">
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
