import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Button, Card, Tag, Space, Spin, message, Tabs, Modal,
  Input, Select, Upload, Image, Row, Col, Popconfirm,
} from 'antd';
import {
  ArrowLeftOutlined, PlusOutlined, DeleteOutlined,
  ThunderboltOutlined, UploadOutlined,
  SyncOutlined, EyeOutlined, AimOutlined, SearchOutlined,
} from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;
const { TextArea } = Input;

const API_BASE = 'http://localhost:3000';
const getUrl = (p: string | null) => p ? (p.startsWith('http') ? p : API_BASE + p) : '';


interface GlobalAsset {
  id: number; type: string; name: string;
  description: string | null; prompt: string | null; prompt_cn: string | null;
  image_url: string | null; status: string;
  candidates: string | null; tags: string | null;
  source_type: string; source_project_id: number | null;
  usage_count: number; created_at: string; updated_at: string;
}

export default function GlobalAssetsPage() {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<GlobalAsset[]>([]);
  const [, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<Set<number>>(new Set());
  const [planning, setPlanning] = useState<Set<number>>(new Set());
  const [stats, setStats] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('character');
  const [search, setSearch] = useState('');
  const [addModal, setAddModal] = useState(false);
  const [addType, setAddType] = useState<'character' | 'prop' | 'scene'>('character');
  const [addName, setAddName] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addPrompt, setAddPrompt] = useState('');
  const [addPromptCn, setAddPromptCn] = useState('');
  const [addTags, setAddTags] = useState('');
  const [editModal, setEditModal] = useState<{ visible: boolean; asset: GlobalAsset | null; promptCn: string; prompt: string; planning: boolean; translating: boolean }>({ visible: false, asset: null, promptCn: '', prompt: '', planning: false, translating: false });
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

  const fetchData = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('keyword', search);
      params.set('type', activeTab);
      params.set('limit', '200');
      const { data } = await api.get(`/api/global-assets?${params}`);
      setAssets(data.items || []);
      setTotal(data.total || 0);
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
      await api.post(`/api/global-assets/${assetId}/generate`, { width, height, style });
      message.success(`生成成功（${ratio} ${width}x${height}）`);
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.message || '生成失败');
      fetchData();
    }
    setGenerating(prev => { const s = new Set(prev); s.delete(assetId); return s; });
  };

  const handlePlanPrompt = async (assetId: number) => {
    setPlanning(prev => new Set(prev).add(assetId));
    try {
      await api.post(`/api/global-assets/${assetId}/plan-prompt`);
      message.success('提示词已优化');
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.message || '优化失败');
    }
    setPlanning(prev => { const s = new Set(prev); s.delete(assetId); return s; });
  };

  const handleDelete = async (assetId: number) => {
    try {
      await api.delete(`/api/global-assets/${assetId}`);
      message.success('已删除');
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

  const handleUpload = async (assetId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    try {
      const { data } = await api.post(`/api/media/upload`, form);
      await api.put(`/api/global-assets/${assetId}`, { image_url: data.url });
      message.success('上传成功');
      fetchData();
    } catch { message.error('上传失败'); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;

  const renderCard = (asset: GlobalAsset) => {
    const isGenerating = generating.has(asset.id);
    return (
      <Card
        key={asset.id}
        size="small"
        style={{ borderRadius: 8 }}
      >
        <div style={{ marginBottom: 8 }}>
          <Space size={4}>
            <Text strong style={{ fontSize: 13 }}>{asset.name}</Text>
            <Tag color={asset.status === 'completed' ? 'success' : 'failed'} style={{ fontSize: 11 }}>
              {asset.status === 'completed' ? '有图' : '无图'}
            </Tag>
            {asset.usage_count > 0 && (
              <Tag style={{ fontSize: 10 }}>引用{asset.usage_count}</Tag>
            )}
          </Space>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          {asset.image_url ? (
            <Image src={getUrl(asset.image_url)} alt={asset.name}
              style={{ maxWidth: '100%', maxHeight: 140, borderRadius: 4 }}
              preview={{ mask: <EyeOutlined /> }}
            />
          ) : (
            <div style={{ width: '100%', height: 140, background: '#f5f5f5', borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc' }}>
              {asset.prompt ? '点击⚡生成' : '无提示词'}
            </div>
          )}
        </div>
        {asset.description && (
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4, lineHeight: 1.4 }}>
            {asset.description}
          </Text>
        )}
        {(asset.prompt_cn || asset.prompt) && (
          <div onClick={() => handleEdit(asset)} style={{
            cursor: 'pointer', display: '-webkit-box', WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical', overflow: 'hidden', marginTop: 2,
          }}>
            <Text style={{ fontSize: 11, lineHeight: 1.3, color: '#8c8c8c' }}>
              {asset.prompt_cn || asset.prompt}
            </Text>
          </div>
        )}
        {asset.tags && (
          <Space size={2} wrap style={{ marginTop: 4 }}>
            {asset.tags.split(',').map(t => <Tag key={t} style={{ fontSize: 10 }}>{t.trim()}</Tag>)}
          </Space>
        )}
        <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 8, paddingTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
          <Button type="text" size="small" icon={isGenerating ? <SyncOutlined spin /> : <ThunderboltOutlined />}
            onClick={() => openGenerateModal(asset.id)} style={{ fontSize: 12, height: 32, width: '100%' }}>
            {isGenerating ? '生成中' : '生成图片'}
          </Button>
          <Button type="text" size="small" icon={<AimOutlined />}
            loading={planning.has(asset.id)} onClick={() => handlePlanPrompt(asset.id)}
            style={{ fontSize: 12, height: 32, width: '100%' }}>
            智能规划
          </Button>
          <Button type="text" size="small" icon={<AimOutlined />}
            onClick={() => handleEdit(asset)} style={{ fontSize: 12, height: 32, width: '100%' }}>
            编辑提示词
          </Button>
          <Upload showUploadList={false} beforeUpload={(file) => { handleUpload(asset.id, file); return false; }}>
            <Button type="text" size="small" icon={<UploadOutlined />} style={{ fontSize: 12, height: 32, width: '100%' }}>
              上传替换
            </Button>
          </Upload>
          <Popconfirm title="确定删除？被引用的资产删除后可能影响已有项目" onConfirm={() => handleDelete(asset.id)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ fontSize: 12, height: 32, width: '100%' }}>
              删除
            </Button>
          </Popconfirm>
        </div>
      </Card>
    );
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')} style={{ padding: 0 }}>
          返回工作台
        </Button>
      </Space>

      <Card style={{ borderRadius: 12, marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={4} style={{ margin: 0 }}>大资产库</Title>
            <Text type="secondary">
              {stats ? `共 ${stats.total} 个资产 · 人物 ${stats.characters} · 物品 ${stats.props} · 场景 ${stats.scenes}` : '加载中...'}
            </Text>
          </Col>
          <Col>
            <Space>
              <Input prefix={<SearchOutlined />} placeholder="搜索名称" value={search}
                onChange={e => setSearch(e.target.value)} style={{ width: 200 }} allowClear />
              <Button icon={<PlusOutlined />} onClick={() => setAddModal(true)}>新增资产</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Tabs activeKey={activeTab} onChange={setActiveTab}
        items={[
          { key: 'character', label: `人物 (${stats?.characters || 0})`, children: (
            <Row gutter={[12, 12]}>
              {assets.length === 0 && <Col span={24}><Text type="secondary">暂无人物资产</Text></Col>}
              {assets.map(a => <Col key={a.id} xs={24} sm={12} md={8} lg={6}>{renderCard(a)}</Col>)}
            </Row>
          )},
          { key: 'prop', label: `物品 (${stats?.props || 0})`, children: (
            <Row gutter={[12, 12]}>
              {assets.length === 0 && <Col span={24}><Text type="secondary">暂无物品资产</Text></Col>}
              {assets.map(a => <Col key={a.id} xs={24} sm={12} md={8} lg={6}>{renderCard(a)}</Col>)}
            </Row>
          )},
          { key: 'scene', label: `场景 (${stats?.scenes || 0})`, children: (
            <Row gutter={[12, 12]}>
              {assets.length === 0 && <Col span={24}><Text type="secondary">暂无场景资产</Text></Col>}
              {assets.map(a => <Col key={a.id} xs={24} sm={12} md={8} lg={6}>{renderCard(a)}</Col>)}
            </Row>
          )},
        ]}
      />

      <Modal title="新增全局资产" open={addModal} onOk={handleAdd} onCancel={() => setAddModal(false)}
        okText="添加" cancelText="取消">
        <Space orientation="vertical" style={{ width: '100%' }}>
          <div>
            <Text>类型</Text>
            <Select value={addType} onChange={v => setAddType(v)} style={{ width: '100%', marginTop: 4 }}>
              <Select.Option value="character">人物</Select.Option>
              <Select.Option value="prop">物品</Select.Option>
              <Select.Option value="scene">场景</Select.Option>
            </Select>
          </div>
          <Input placeholder="资产名称" value={addName} onChange={e => setAddName(e.target.value)} />
          <TextArea placeholder="资产描述（可选）" value={addDesc} onChange={e => setAddDesc(e.target.value)} rows={2} />
          <TextArea placeholder="英文提示词（给AI用，可选）" value={addPrompt} onChange={e => setAddPrompt(e.target.value)} rows={2} />
          <TextArea placeholder="中文提示词描述（给你看，可选）" value={addPromptCn} onChange={e => setAddPromptCn(e.target.value)} rows={2} />
          <Input placeholder="标签，用逗号分隔（如：古风,仙侠,主角）" value={addTags} onChange={e => setAddTags(e.target.value)} />
        </Space>
      </Modal>

      <Modal title={<div style={{ textAlign: 'center', fontSize: 18 }}>编辑提示词</div>} open={editModal.visible} onOk={handleEditSave}
        onCancel={() => setEditModal({ visible: false, asset: null, promptCn: '', prompt: '', planning: false, translating: false })}
        okText="保存" cancelText="取消" width={900} centered>
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Text strong style={{ fontSize: 14 }}>中文提示词</Text>
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
          <Text strong style={{ fontSize: 14 }}>英文提示词（只读）</Text>
          <TextArea rows={8} value={editModal.prompt} readOnly
            style={{ background: '#f5f5f5' }} />
        </Space>
      </Modal>

      <Modal title="生成图片参数" open={generateModal.visible} onOk={handleGenerate}
        onCancel={() => setGenerateModal(prev => ({ ...prev, visible: false }))}
        okText="开始生成" cancelText="取消">
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong>画面风格</Text>
            <Row gutter={[8, 8]} style={{ marginTop: 6 }}>
              {stylePresets.map(s => (
                <Col key={s.value}>
                  <Button type={generateModal.style === s.value ? 'primary' : 'default'}
                    onClick={() => setGenerateModal(prev => ({ ...prev, style: s.value }))}
                    style={generateModal.style === s.value ? { background: '#7c3aed', borderColor: '#7c3aed' } : {}}>
                    {s.label}
                  </Button>
                </Col>
              ))}
            </Row>
          </div>
          <div>
            <Text strong>宽高比</Text>
            <Row gutter={[8, 8]} style={{ marginTop: 6 }}>
              {presets.map(p => (
                <Col key={p.value}>
                  <Button type={generateModal.ratio === p.value ? 'primary' : 'default'}
                    onClick={() => setGenerateModal(prev => ({ ...prev, ratio: p.value }))}
                    style={generateModal.ratio === p.value ? { background: '#7c3aed', borderColor: '#7c3aed' } : {}}>
                    {p.label}
                  </Button>
                </Col>
              ))}
            </Row>
          </div>
          <div>
            <Text strong>画质</Text>
            <Row gutter={[8, 8]} style={{ marginTop: 6 }}>
              {sizeOptions.map(s => (
                <Col key={s.value}>
                  <Button type={generateModal.size === s.value ? 'primary' : 'default'}
                    onClick={() => setGenerateModal(prev => ({ ...prev, size: s.value }))}
                    style={generateModal.size === s.value ? { background: '#7c3aed', borderColor: '#7c3aed' } : {}}>
                    {s.label}
                  </Button>
                </Col>
              ))}
            </Row>
          </div>
          {generateModal.visible && (
            <div style={{ background: '#f5f5f5', borderRadius: 6, padding: '8px 12px' }}>
              <Text type="secondary">
                输出尺寸：{calcSize(generateModal.ratio, generateModal.size).width} x {calcSize(generateModal.ratio, generateModal.size).height}
              </Text>
            </div>
          )}
        </Space>
      </Modal>
    </div>
  );
}
