import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Typography, Button, Tag, Space, Spin, message, Tabs, Modal,
  Input, Select, Image, Popconfirm, Checkbox,
} from 'antd';
import {
  ArrowLeftOutlined, PlusOutlined, DeleteOutlined,
  ThunderboltOutlined,
  SyncOutlined, EyeOutlined, AimOutlined, ExportOutlined, ImportOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import './assets.css';   // 本页质感改造样式（作用域 .das-，详见文件头注释）

const { Title, Text } = Typography;
const { TextArea } = Input;

const API_BASE = import.meta.env.VITE_API_BASE || '';
const getUrl = (p: string | null) => p ? (p.startsWith('http') ? p : API_BASE + p) : '';

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  character: { label: '人物', color: 'blue' },
  prop: { label: '物品', color: 'orange' },
  scene: { label: '场景', color: 'green' },
};

interface Asset {
  id: number; project_id: number; type: string; name: string;
  description: string | null; prompt: string | null; prompt_cn: string | null;
  image_url: string | null; status: string; locked: boolean;
  candidates: string | null; created_at: string; updated_at: string;
}

export default function DramaAssetsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [projectTitle, setProjectTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<Set<number>>(new Set());
  const [planning, setPlanning] = useState<Set<number>>(new Set());
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [addType, setAddType] = useState<'character' | 'prop' | 'scene'>('character');
  const [addName, setAddName] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addPrompt, setAddPrompt] = useState('');
  const [addPromptCn, setAddPromptCn] = useState('');
  const [importModal, setImportModal] = useState(false);
  const [globalAssets, setGlobalAssets] = useState<any[]>([]);
  const [loadingGlobal, setLoadingGlobal] = useState(false);
  const [selectedGlobal, setSelectedGlobal] = useState<number[]>([]);
  const [editModal, setEditModal] = useState<{ visible: boolean; asset: Asset | null; promptCn: string; prompt: string; planning: boolean; translating: boolean }>({ visible: false, asset: null, promptCn: '', prompt: '', planning: false, translating: false });
  const [generateModal, setGenerateModal] = useState<{ visible: boolean; assetId: number | null; ratio: string; size: string; style: string }>({ visible: false, assetId: null, ratio: '9:16', size: 'hd', style: 'anime' });

  const stylePresets = [
    { label: '动漫', value: 'anime' },
    { label: '写实', value: 'realistic' },
  ];
  const presets = [
    { label: '9:16 竖屏', value: '9:16' },
    { label: '16:9 横屏', value: '16:9' },
    { label: '1:1 方形', value: '1:1' },
    { label: '3:4 竖版', value: '3:4' },
    { label: '4:3 横版', value: '4:3' },
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

  const handlePublishToGlobal = async (asset: Asset) => {
    try {
      await api.post('/api/global-assets', {
        type: asset.type, name: asset.name,
        description: asset.description, prompt: asset.prompt,
        prompt_cn: asset.prompt_cn, image_url: asset.image_url,
        tags: '', source_type: 'import', source_project_id: Number(id),
      });
      message.success('已保存到大资产库');
    } catch { message.error('保存失败'); }
  };

  const openImportModal = async () => {
    setImportModal(true);
    setSelectedGlobal([]);
    setLoadingGlobal(true);
    try {
      const { data } = await api.get('/api/global-assets?limit=200');
      setGlobalAssets(data.items || []);
    } catch { message.error('加载大资产库失败'); }
    setLoadingGlobal(false);
  };

  const handleImportGlobal = async () => {
    if (!selectedGlobal.length) { message.warning('请选择要导入的资产'); return; }
    try {
      const { data } = await api.post(`/api/drama/${id}/assets/import-from-global`, { assetIds: selectedGlobal });
      message.success(`成功导入 ${data?.length || 0} 个资产`);
      setImportModal(false);
      fetchData();
    } catch { message.error('导入失败'); }
  };

  const fetchData = async () => {
    if (!id) return;
    try {
      const [assetsRes, projRes] = await Promise.all([
        api.get(`/api/drama/${id}/assets`),
        api.get(`/api/drama/${id}`),
      ]);
      setAssets(assetsRes.data || []);
      setProjectTitle(projRes.data?.title || '');
    } catch { message.error('加载资产库失败'); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id]);

  const openGenerateModal = (assetId: number) => {
    setGenerateModal({ visible: true, assetId, ratio: '9:16', size: 'hd', style: 'anime' });
  };

  const handleGenerate = async () => {
    const { assetId, ratio, size, style } = generateModal;
    if (!assetId) return;
    const { width, height } = calcSize(ratio, size);
    setGenerating(prev => new Set(prev).add(assetId));
    setGenerateModal(prev => ({ ...prev, visible: false }));
    try {
      await api.post(`/api/drama/${id}/assets/${assetId}/generate`, { width, height, style });
      message.success(`生成成功（${ratio} ${width}x${height}）`);
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.message || '生成失败');
      fetchData();
    }
    setGenerating(prev => { const s = new Set(prev); s.delete(assetId); return s; });
  };

  const handleGenerateAll = async () => {
    setBatchGenerating(true);
    try {
      const { data } = await api.post(`/api/drama/${id}/assets/generate-all`);
      const succeeded = data.filter((r: any) => r.status === 'completed').length;
      const failed = data.filter((r: any) => r.status === 'failed').length;
      message.success(`批量生成完成：${succeeded} 成功${failed ? `，${failed} 失败` : ''}`);
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.message || '批量生成失败');
    }
    setBatchGenerating(false);
  };

  const handleDelete = async (assetId: number) => {
    try {
      await api.delete(`/api/drama/assets/${assetId}`);
      message.success('已删除');
      fetchData();
    } catch { message.error('删除失败'); }
  };

  const handleAdd = async () => {
    if (!addName.trim()) { message.warning('请输入名称'); return; }
    try {
      await api.post(`/api/drama/${id}/assets`, {
        type: addType, name: addName.trim(),
        description: addDesc.trim() || undefined,
        prompt: addPrompt.trim() || undefined,
        prompt_cn: addPromptCn.trim() || undefined,
      });
      message.success('已添加');
      setAddModal(false);
      setAddName('');
      setAddDesc('');
      setAddPrompt('');
      setAddPromptCn('');
      fetchData();
    } catch { message.error('添加失败'); }
  };

  const handleEditPrompt = (asset: Asset) => {
    setEditModal({ visible: true, asset, promptCn: asset.prompt_cn || '', prompt: asset.prompt || '', planning: false, translating: false });
  };

  const handleEditSave = async () => {
    const { asset, promptCn, prompt } = editModal;
    if (!asset) return;
    try {
      await api.put(`/api/drama/assets/${asset.id}`, { prompt_cn: promptCn, prompt });
      message.success('已更新');
      setEditModal({ visible: false, asset: null, promptCn: '', prompt: '', planning: false, translating: false });
      fetchData();
    } catch { message.error('更新失败'); }
  };

  const handlePlanPrompt = async (assetId: number) => {
    setPlanning(prev => new Set(prev).add(assetId));
    try {
      await api.post(`/api/drama/${id}/assets/${assetId}/plan-prompt`);
      message.success('提示词已优化');
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.message || '优化失败');
    }
    setPlanning(prev => { const s = new Set(prev); s.delete(assetId); return s; });
  };

  const handlePlanInModal = async () => {
    const { asset } = editModal;
    if (!asset) return;
    setEditModal(prev => ({ ...prev, planning: true }));
    try {
      const { data } = await api.post(`/api/drama/${id}/assets/${asset.id}/plan-prompt`);
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
      const { data } = await api.post(`/api/drama/${id}/assets/${asset.id}/translate`, { text: promptCn });
      setEditModal(prev => ({ ...prev, prompt: data.prompt }));
      message.success('中文已转换为英文提示词');
    } catch (err: any) {
      message.error(err.response?.data?.message || '翻译失败');
    }
    setEditModal(prev => ({ ...prev, translating: false }));
  };

  const pendingCount = assets.filter(a => a.status === 'pending' || a.status === 'failed').length;

  if (loading) return <div className="das-loading"><Spin size="large" /></div>;

  const grouped = {
    character: assets.filter(a => a.type === 'character'),
    prop: assets.filter(a => a.type === 'prop'),
    scene: assets.filter(a => a.type === 'scene'),
  };

  const renderAssetCard = (asset: Asset) => {
    const isGenerating = generating.has(asset.id);
    return (
      <div key={asset.id} className="das-card">
        <div className="das-card__hd">
          <Text className="das-card__name">{asset.name}</Text>
          <Tag color={asset.status === 'completed' ? 'success' : asset.status === 'failed' ? 'error' : 'default'}>
            {asset.status === 'completed' ? '有图' : asset.status === 'pending' ? '待生成' : '失败'}
          </Tag>
        </div>
        <div className="das-card__media">
          {asset.image_url ? (
            <Image className="das-card__img" src={getUrl(asset.image_url)} alt={asset.name}
              preview={{ mask: <EyeOutlined /> }}
            />
          ) : (
            <div className="das-card__ph">
              {asset.prompt ? '点击⚡生成' : '无提示词'}
            </div>
          )}
        </div>
        {asset.description && (
          <Text className="das-card__desc">{asset.description}</Text>
        )}
        {(asset.prompt_cn || asset.prompt) && (
          <div className="das-card__prompt" onClick={() => handleEditPrompt(asset)}>
            {asset.prompt_cn || asset.prompt}
          </div>
        )}
        <div className="das-card__acts">
          <Button type="text" size="small" icon={isGenerating ? <SyncOutlined spin /> : <ThunderboltOutlined />}
            onClick={() => openGenerateModal(asset.id)}>
            {isGenerating ? '生成中' : '生成图片'}
          </Button>
          <Button type="text" size="small" icon={<CheckCircleOutlined />}
            loading={planning.has(asset.id)} onClick={() => handlePlanPrompt(asset.id)}>
            智能规划
          </Button>
          <Button type="text" size="small" icon={<AimOutlined />}
            onClick={() => handleEditPrompt(asset)}>
            编辑提示词
          </Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(asset.id)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
          <Button type="text" size="small" icon={<ExportOutlined />}
            onClick={() => handlePublishToGlobal(asset)} className="das-publish das-card__span">
            保存到大资产库
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="das-root">
      <div className="das-back">
        <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/drama/${id}`)}>
          返回项目详情
        </Button>
      </div>

      <div className="das-panel">
        <div className="das-panel__bd">
          <div className="das-hd">
            <div className="das-hd__titles">
              <Title level={4} className="das-title">资产库 · {projectTitle}</Title>
              <Text className="das-sub">共 {assets.length} 个资产，{pendingCount} 个待生成</Text>
            </div>
            <Space>
              <Button icon={<PlusOutlined />} onClick={() => setAddModal(true)}>新增资产</Button>
              <Button icon={<ImportOutlined />} onClick={openImportModal}>从大资产库导入</Button>
              <Button type="primary" icon={<ThunderboltOutlined />} loading={batchGenerating}
                disabled={pendingCount === 0} className="das-btn-brand"
                onClick={handleGenerateAll}>
                批量生成 ({pendingCount})
              </Button>
            </Space>
          </div>
        </div>
      </div>

      <Tabs
        items={[
          { key: 'character', label: `人物 (${grouped.character.length})`, children: (
            grouped.character.length === 0
              ? <div className="das-empty">暂无人物资产</div>
              : <div className="das-grid">{grouped.character.map(a => renderAssetCard(a))}</div>
          )},
          { key: 'prop', label: `物品 (${grouped.prop.length})`, children: (
            grouped.prop.length === 0
              ? <div className="das-empty">暂无物品资产</div>
              : <div className="das-grid">{grouped.prop.map(a => renderAssetCard(a))}</div>
          )},
          { key: 'scene', label: `场景 (${grouped.scene.length})`, children: (
            grouped.scene.length === 0
              ? <div className="das-empty">暂无场景资产</div>
              : <div className="das-grid">{grouped.scene.map(a => renderAssetCard(a))}</div>
          )},
        ]}
      />

      <Modal title="从大资产库导入" open={importModal} onOk={handleImportGlobal}
        onCancel={() => setImportModal(false)} okText="导入选中" cancelText="取消" width={640}>
        {loadingGlobal ? <Spin /> : (
          <div className="das-picklist">
            {globalAssets.length === 0 ? <Text className="das-sub">大资产库暂无资产</Text> : (
              <div className="das-pickgrid">
                {globalAssets.map(a => (
                  <div key={a.id} className="das-pick"
                    data-on={selectedGlobal.includes(a.id) ? '1' : '0'}
                    onClick={() => {
                      setSelectedGlobal(prev =>
                        prev.includes(a.id) ? prev.filter(x => x !== a.id) : [...prev, a.id]
                      );
                    }}>
                    <div className="das-pick__check">
                      <Checkbox checked={selectedGlobal.includes(a.id)} />
                    </div>
                    {a.image_url ? (
                      <Image className="das-pick__img" src={getUrl(a.image_url)} preview={false} />
                    ) : (
                      <div className="das-pick__ph">无图</div>
                    )}
                    <Text className="das-pick__name">{a.name}</Text>
                    <Tag className="das-pick__tag" color={TYPE_CONFIG[a.type]?.color}>{TYPE_CONFIG[a.type]?.label}</Tag>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal title="新增资产" open={addModal} onOk={handleAdd} onCancel={() => setAddModal(false)}
        okText="添加" cancelText="取消">
        <div className="das-form">
          <div className="das-form__item">
            <Text className="das-form__label">类型</Text>
            <Select value={addType} onChange={v => setAddType(v)} style={{ width: '100%' }}>
              <Select.Option value="character">人物</Select.Option>
              <Select.Option value="prop">物品</Select.Option>
              <Select.Option value="scene">场景</Select.Option>
            </Select>
          </div>
          <Input placeholder="资产名称" value={addName} onChange={e => setAddName(e.target.value)} />
          <TextArea placeholder="资产描述（可选）" value={addDesc} onChange={e => setAddDesc(e.target.value)} rows={2} />
          <TextArea placeholder="英文提示词（给AI用，可选）" value={addPrompt} onChange={e => setAddPrompt(e.target.value)} rows={2} />
          <TextArea placeholder="中文提示词描述（给你看，可选）" value={addPromptCn} onChange={e => setAddPromptCn(e.target.value)} rows={2} />
        </div>
      </Modal>

      <Modal className="das-modal--centered" title="编辑提示词" open={editModal.visible} onOk={handleEditSave}
        onCancel={() => setEditModal({ visible: false, asset: null, promptCn: '', prompt: '', planning: false, translating: false })}
        okText="保存" cancelText="取消" width={900} centered>
        <div className="das-form">
          <Text strong style={{ fontSize: 14 }}>中文提示词</Text>
          <TextArea rows={8} value={editModal.promptCn}
            onChange={e => setEditModal(prev => ({ ...prev, promptCn: e.target.value }))} />
          <div className="das-presets">
            <Button icon={<ThunderboltOutlined />} loading={editModal.planning}
              onClick={handlePlanInModal} style={{ flex: 1 }}>
              智能规划
            </Button>
            <Button icon={<SyncOutlined />} loading={editModal.translating}
              onClick={handleTranslatePrompt} style={{ flex: 1 }}>
              中文转英文
            </Button>
          </div>
          <Text strong style={{ fontSize: 14 }}>英文提示词（只读）</Text>
          <TextArea className="das-readonly" rows={8} value={editModal.prompt} readOnly />
        </div>
      </Modal>

      <Modal title="生成图片参数" open={generateModal.visible} onOk={handleGenerate}
        onCancel={() => setGenerateModal(prev => ({ ...prev, visible: false }))}
        okText="开始生成" cancelText="取消">
        <div className="das-form">
          <div className="das-form__item">
            <Text strong>画面风格</Text>
            <div className="das-presets">
              {stylePresets.map(s => (
                <Button key={s.value} type={generateModal.style === s.value ? 'primary' : 'default'}
                  onClick={() => setGenerateModal(prev => ({ ...prev, style: s.value }))}
                  className={generateModal.style === s.value ? 'das-btn-brand' : undefined}>
                  {s.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="das-form__item">
            <Text strong>宽高比</Text>
            <div className="das-presets">
              {presets.map(p => (
                <Button key={p.value} type={generateModal.ratio === p.value ? 'primary' : 'default'}
                  onClick={() => setGenerateModal(prev => ({ ...prev, ratio: p.value }))}
                  className={generateModal.ratio === p.value ? 'das-btn-brand' : undefined}>
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="das-form__item">
            <Text strong>画质</Text>
            <div className="das-presets">
              {sizeOptions.map(s => (
                <Button key={s.value} type={generateModal.size === s.value ? 'primary' : 'default'}
                  onClick={() => setGenerateModal(prev => ({ ...prev, size: s.value }))}
                  className={generateModal.size === s.value ? 'das-btn-brand' : undefined}>
                  {s.label}
                </Button>
              ))}
            </div>
          </div>
          {generateModal.visible && (
            <div className="das-hint">
              输出尺寸：{calcSize(generateModal.ratio, generateModal.size).width} x {calcSize(generateModal.ratio, generateModal.size).height}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
