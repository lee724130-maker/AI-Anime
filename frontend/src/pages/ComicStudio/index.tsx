import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Card, Steps, Form, Input, InputNumber, Select, Space, Typography,
  Table, Tag, Alert, Progress, Row, Col, Image, Divider, Tooltip, message, Empty, Spin,
} from 'antd';
import {
  PlusOutlined, ArrowLeftOutlined, ThunderboltOutlined, CheckOutlined,
  ReloadOutlined, DownloadOutlined, SwapOutlined, LockOutlined, UnlockOutlined,
} from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const API_BASE = import.meta.env.VITE_API_BASE || '';
const getUrl = (p: string | null | undefined) => (p ? (p.startsWith('http') ? p : API_BASE + p) : '');

const STYLE_OPTIONS = [
  { value: 'live_action', label: '真人漫画（写实照片）' },
  { value: 'anime', label: '动漫漫画（插画）' },
];
const MODEL_OPTIONS = [
  { value: 'agnes-image-2.5-flash', label: 'Agnes Image 2.5 Flash（推荐）' },
  { value: 'agnes-image-2.1-flash', label: 'Agnes Image 2.1 Flash' },
];
const SIZE_OPTIONS = ['1K', '2K', '3K', '4K'].map((v) => ({ value: v, label: v }));
const RATIO_OPTIONS = ['2:3', '3:4', '1:1', '4:3', '16:9', '9:16', '3:2', '21:9'].map((v) => ({ value: v, label: v }));

const STEPS = [
  { title: '立项与大纲', description: '灵感 → 剧情大纲' },
  { title: '人物与人设', description: '识别人物 → 人设提示词' },
  { title: '角色设定本', description: '三方图 → 锁定基准' },
  { title: '分格脚本', description: '逐页剧情' },
  { title: '审格', description: '门控与用量' },
  { title: '生成', description: '逐张剧情图' },
  { title: '交付', description: '导出漫画包' },
];

const BLOCK_LABELS: Record<string, string> = {
  portrait: '正面头像', three_view: '三视图', expressions: '表情组', details: '局部特写',
};

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  pending: { color: 'default', label: '待生成' },
  processing: { color: 'processing', label: '生成中' },
  completed: { color: 'success', label: '完成' },
  failed: { color: 'error', label: '失败' },
};

const DEFAULT_FORM = {
  title: '我的漫画',
  idea: '',
  style_mode: 'live_action',
  model: 'agnes-image-2.5-flash',
  image_size: '1K',
  ratio: '2:3',
  page_count: 16,
  scene_anchor: '简洁干净的浅色摄影棚背景，柔和均匀光线',
  costume_ref: '',
};

export default function ComicStudioPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [project, setProject] = useState<any>(null);
  const [characters, setCharacters] = useState<any[]>([]);
  const [panels, setPanels] = useState<any[]>([]);
  const [outline, setOutline] = useState('');
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [estimate, setEstimate] = useState<any>(null);
  const [progress, setProgress] = useState<any>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  /** 块级素材图输入：key = `${characterId}:${block}` */
  const [assetInputs, setAssetInputs] = useState<Record<string, string>>({});

  const loadProjects = useCallback(async () => {
    try {
      const { data } = await api.get('/api/comic-studio');
      setProjects(Array.isArray(data) ? data : data.items || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const applyProject = useCallback((data: any) => {
    setProjectId(data.id);
    setProject(data);
    setOutline(data.outline || '');
    setCharacters(data.character_list || []);
    setPanels(data.spec?.panels || []);
    setExportUrl(data.export_url || null);
    form.setFieldsValue({ ...DEFAULT_FORM, ...data, idea: '' });
    if (data.sheet_status === 'locked') setStep(3);
    else if (data.characters_status === 'confirmed') setStep(2);
    else if (data.outline_status === 'confirmed' || data.outline) setStep(1);
    else setStep(0);
    if (data.status === 'generating') setStep(5);
    if (data.status === 'completed') setStep(6);
    setConfirmed(false);
  }, [form]);

  const openProject = useCallback(async (id: number) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/comic-studio/${id}`);
      applyProject(data);
    } catch (e: any) { message.error(e?.response?.data?.message || '项目读取失败'); }
    finally { setLoading(false); }
  }, [applyProject]);

  const refreshEstimate = useCallback(async (id: number) => {
    try {
      const { data } = await api.get(`/api/comic-studio/${id}/estimate`);
      setEstimate(data);
    } catch { setEstimate(null); }
  }, []);

  /** 设定本生成中 / 剧情图生成中，3 秒轮询回填 */
  useEffect(() => {
    if (!projectId || (step !== 2 && step !== 5)) return;
    let stopped = false;
    const tick = async () => {
      try {
        const { data } = await api.get(`/api/comic-studio/${projectId}/status`);
        if (stopped) return;
        setPanels(data.panels || []);
        setCharacters(data.characters || []);
        setProgress(data.progress || null);
        if (data.project) setProject(data.project);
      } catch { /* ignore */ }
    };
    tick();
    const timer = setInterval(tick, 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [step, projectId]);

  const guard = () => {
    if (!projectId) { message.info('请先保存项目'); return false; }
    return true;
  };

  // ---------- 阶段 1 ----------
  const createOrUpdate = async (values: any) => {
    setLoading(true);
    try {
      const payload = { ...DEFAULT_FORM, ...values };
      const { data } = projectId
        ? await api.put(`/api/comic-studio/${projectId}`, payload)
        : await api.post('/api/comic-studio', payload);
      applyProject(data);
      await loadProjects();
      message.success('项目已保存');
    } catch (e: any) { message.error(e?.response?.data?.message || '保存失败'); }
    finally { setLoading(false); }
  };

  const genOutline = async () => {
    if (!guard()) return;
    const idea = form.getFieldValue('idea');
    if (!idea?.trim()) { message.warning('先写一句话灵感'); return; }
    setLoading(true);
    try {
      const { data } = await api.post(`/api/comic-studio/${projectId}/outline`, { idea });
      setOutline(data.outline);
      setProject((p: any) => ({ ...p, outline_status: 'review' }));
      message.success('剧情大纲已生成，可直接在下方修改');
    } catch (e: any) { message.error(e?.response?.data?.message || '大纲生成失败'); }
    finally { setLoading(false); }
  };

  const confirmOutline = async () => {
    if (!guard()) return;
    if (!outline.trim()) { message.warning('大纲不能为空'); return; }
    setLoading(true);
    try {
      const { data } = await api.put(`/api/comic-studio/${projectId}/outline`, { outline, confirm: true });
      applyProject(data);
      setStep(1);
      message.success('大纲已确认');
    } catch (e: any) { message.error(e?.response?.data?.message || '保存失败'); }
    finally { setLoading(false); }
  };

  // ---------- 阶段 2 ----------
  const extractCharacters = async () => {
    if (!guard()) return;
    setLoading(true);
    try {
      const { data } = await api.post(`/api/comic-studio/${projectId}/characters/extract`);
      setCharacters(data.character_list || []);
      message.success(`识别出 ${data.character_list?.length || 0} 位人物`);
    } catch (e: any) { message.error(e?.response?.data?.message || '人物解析失败'); }
    finally { setLoading(false); }
  };

  const genPrompts = async () => {
    if (!guard()) return;
    setLoading(true);
    try {
      const { data } = await api.post(`/api/comic-studio/${projectId}/characters/prompts`);
      setCharacters(data.character_list || []);
      message.success('人设生图提示词已生成');
    } catch (e: any) { message.error(e?.response?.data?.message || '生成失败'); }
    finally { setLoading(false); }
  };

  const patchChar = (i: number, key: string, value: any) => {
    setCharacters((prev) => prev.map((c, idx) => (idx === i ? { ...c, [key]: value } : c)));
  };

  const confirmCharacters = async () => {
    if (!guard()) return;
    if (!characters.length) { message.warning('请先识别人物'); return; }
    setLoading(true);
    try {
      const { data } = await api.put(`/api/comic-studio/${projectId}/characters`, { characters, confirm: true });
      applyProject(data);
      setStep(2);
      message.success('人物与人设已确认');
    } catch (e: any) { message.error(e?.response?.data?.message || '保存失败'); }
    finally { setLoading(false); }
  };

  // ---------- 阶段 3 ----------
  /** 重生成：默认只重建未完成/失败的块；传 blocks 时只重建指定块（成功块原样保留，不重复扣费） */
  const genSheet = async (characterId: string, blocks?: string[]) => {
    if (!guard()) return;
    setLoading(true);
    try {
      const { data } = await api.post(`/api/comic-studio/${projectId}/sheets/generate`, { characterId, blocks });
      if (data.created === 0) {
        message.info(data.message || '所有块均已完成，无需重生成');
      } else {
        message.success(`已重建 ${data.created} 个块，保留 ${data.kept} 个已完成块（拼版会自动刷新）`);
      }
      setStep(2);
    } catch (e: any) { message.error(e?.response?.data?.message || '设定本生成失败'); }
    finally { setLoading(false); }
  };

  const regenBlock = async (characterId: string, block: string) => {
    if (!guard()) return;
    try {
      await api.post(`/api/comic-studio/${projectId}/sheets/generate`, { characterId, blocks: [block] });
      message.success(`「${BLOCK_LABELS[block] || block}」已单独重新生成`);
      setStep(2);
    } catch (e: any) { message.error(e?.response?.data?.message || '重生成失败'); }
  };

  /** 块级素材来源：直接用现成图（/static/ 路径），0 次生成 0 积分 */
  const applyBlockAsset = async (characterId: string, block: string, assetUrl: string) => {
    if (!guard()) return;
    if (!assetUrl?.trim()) { message.warning('先填素材图路径'); return; }
    try {
      await api.put(`/api/comic-studio/${projectId}/sheets/block-asset`, { characterId, block, assetUrl });
      message.success(`「${BLOCK_LABELS[block] || block}」已换用现成素材图（0 积分）`);
      setStep(2);
    } catch (e: any) { message.error(e?.response?.data?.message || '应用失败'); }
  };

  const toggleLock = async (characterId: string, locked: boolean) => {
    if (!guard()) return;
    try {
      const { data } = await api.put(`/api/comic-studio/${projectId}/sheets/lock`, { characterId, locked });
      setCharacters(data.character_list || []);
      setProject(data);
      message.success(locked ? '设定本已锁定' : '已解锁，可重新生成');
    } catch (e: any) { message.error(e?.response?.data?.message || '操作失败'); }
  };

  const allLocked = characters.length > 0 && characters.every((c) => c.locked && c.sheet_url);

  // ---------- 阶段 4~6 ----------
  const genScript = async () => {
    if (!guard()) return;
    setLoading(true);
    try {
      const { data } = await api.post(`/api/comic-studio/${projectId}/script`, {
        page_count: form.getFieldValue('page_count') || project?.page_count || 16,
      });
      setPanels(data.spec?.panels || []);
      setProject(data);
      message.success(`已生成 ${data.spec?.panels?.length || 0} 格分镜脚本`);
    } catch (e: any) { message.error(e?.response?.data?.message || '分格脚本生成失败'); }
    finally { setLoading(false); }
  };

  const savePanels = async (next: any[]) => {
    if (!guard()) return;
    setLoading(true);
    try {
      const { data } = await api.put(`/api/comic-studio/${projectId}/panels`, { panels: next });
      setPanels(data.spec?.panels || []);
      setProject(data);
      await refreshEstimate(projectId!);
      setStep(4);
      message.success('分格已保存');
    } catch (e: any) { message.error(e?.response?.data?.message || '保存失败'); }
    finally { setLoading(false); }
  };

  const startGeneration = async () => {
    if (!projectId || !confirmed) return;
    setLoading(true);
    try {
      const { data } = await api.post(`/api/comic-studio/${projectId}/generate`);
      setStep(5);
      setProgress(null);
      message.success(`已开始生成 ${data.started}/${data.total_groups} 张底图${data.failed ? '（部分失败：' + data.failed + '）' : ''}`);
    } catch (e: any) { message.error(e?.response?.data?.message || '生成启动失败'); }
    finally { setLoading(false); }
  };

  const regenerate = async (pageNo: number) => {
    if (!guard()) return;
    const p = panels.find((x) => x.page_no === pageNo);
    try {
      await api.post(`/api/comic-studio/${projectId}/regenerate/${pageNo}`, {
        action: p?.action, expression: p?.expression, camera: p?.camera, pose_ref: p?.pose_ref,
      });
      message.success(`第 ${pageNo} 格已重新生成`);
      setStep(5);
    } catch (e: any) { message.error(e?.response?.data?.message || '重生成失败'); }
  };

  const exportPackage = async () => {
    if (!guard()) return;
    setLoading(true);
    try {
      const { data } = await api.post(`/api/comic-studio/${projectId}/export`);
      setExportUrl(data.url);
      message.success(`漫画包已生成（含 ${data.included_images}/${data.page_count} 张底图）`);
    } catch (e: any) { message.error(e?.response?.data?.message || '导出失败'); }
    finally { setLoading(false); }
  };

  const cloneOtherStyle = async () => {
    if (!project) return;
    const other = project.style_mode === 'live_action' ? 'anime' : 'live_action';
    setLoading(true);
    try {
      const { data } = await api.post('/api/comic-studio', {
        ...project, id: undefined, spec: undefined, character_list: undefined,
        created_at: undefined, updated_at: undefined, characters: undefined,
        title: `${project.title} · ${other === 'anime' ? '动漫版' : '真人版'}`,
        style_mode: other, status: 'draft', panel_spec: undefined,
      });
      await loadProjects();
      await openProject(data.id);
      message.success('已复制为另一风格，可复用同一份大纲');
    } catch (e: any) { message.error(e?.response?.data?.message || '复制失败'); }
    finally { setLoading(false); }
  };

  const patchPanel = (i: number, key: string, value: any) => {
    setPanels((prev) => prev.map((p, idx) => (idx === i ? { ...p, [key]: value } : p)));
  };

  const columns: any[] = [
    { title: '页', dataIndex: 'page_no', width: 52, render: (v: number) => <Tag color="blue">{v}</Tag> },
    { title: '出场人物', key: 'characters', width: 150,
      render: (_: any, r: any, i: number) => (
        <Select mode="multiple" size="small" style={{ width: '100%' }} value={r.characters || []}
          options={characters.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(v) => patchPanel(i, 'characters', v)} />
      ) },
    { title: '动作 / 表情', key: 'action', width: 230,
      render: (_: any, r: any, i: number) => (
        <Space direction="vertical" size={2} style={{ width: '100%' }}>
          <Input size="small" value={r.action} placeholder="动作（几何锚点）" onChange={(e) => patchPanel(i, 'action', e.target.value)} />
          <Input size="small" value={r.expression} placeholder="表情" onChange={(e) => patchPanel(i, 'expression', e.target.value)} />
        </Space>
      ) },
    { title: '景别', key: 'camera', width: 110,
      render: (_: any, r: any, i: number) => <Input size="small" value={r.camera} onChange={(e) => patchPanel(i, 'camera', e.target.value)} /> },
    { title: '复用组', key: 'reuse_group', width: 100,
      render: (_: any, r: any, i: number) => <Input size="small" value={r.reuse_group} onChange={(e) => patchPanel(i, 'reuse_group', e.target.value)} /> },
    { title: '姿势图', key: 'pose_ref', width: 130,
      render: (_: any, r: any, i: number) => <Input size="small" value={r.pose_ref} placeholder="/static/... 可选" onChange={(e) => patchPanel(i, 'pose_ref', e.target.value)} /> },
    { title: '旁白 / 台词（排版层）', key: 'text', width: 210,
      render: (_: any, r: any, i: number) => (
        <Space direction="vertical" size={2} style={{ width: '100%' }}>
          <Input size="small" value={r.narration} placeholder="旁白" onChange={(e) => patchPanel(i, 'narration', e.target.value)} />
          <Input size="small" value={r.dialogue} placeholder="台词" onChange={(e) => patchPanel(i, 'dialogue', e.target.value)} />
        </Space>
      ) },
  ];

  const pct = progress?.total ? Math.round(((progress.completed + progress.failed) / progress.total) * 100) : 0;

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 24px 60px' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')} />
          <Title level={3} style={{ margin: 0 }}>漫画工作室</Title>
          <Tag color="purple">V2 · 角色设定本驱动</Tag>
        </Space>
        <Space wrap>
          <Select style={{ width: 240 }} placeholder="切换已有项目" allowClear
            value={projectId ?? undefined}
            onChange={(v) => { if (v) openProject(v as number); else { setProjectId(null); setProject(null); setCharacters([]); setPanels([]); setOutline(''); setStep(0); form.resetFields(); } }}
            options={projects.map((p) => ({ value: p.id, label: `${p.title}（${p.style_mode === 'anime' ? '动漫' : '真人'} · ${p.panel_count || 0} 格）` }))} />
          <Button icon={<PlusOutlined />} onClick={() => { setProjectId(null); setProject(null); setCharacters([]); setPanels([]); setOutline(''); setStep(0); setEstimate(null); setExportUrl(null); form.setFieldsValue(DEFAULT_FORM); }}>新建</Button>
        </Space>
      </Space>

      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message="标准流程：大纲 → 识别人物 → 人设 → 角色设定本（锁定） → 逐页剧情图"
        description="角色由模型从剧情里识别并生成设定本，锁定后作为每一页唯一的身份基准；文字层（旁白/气泡/分支卡）仍交给剪辑应用排版层，底图不含中文。" />

      <Card>
        <Steps current={step} onChange={(s) => { if (!projectId && s > 0) { message.info('先保存项目'); return; } setStep(s); }}
          items={STEPS} style={{ marginBottom: 24 }} />

        <Spin spinning={loading}>
          {/* 0 立项与大纲 */}
          {step === 0 && (
            <div>
              <Form form={form} layout="vertical" initialValues={DEFAULT_FORM} onFinish={createOrUpdate}>
                <Row gutter={16}>
                  <Col xs={24} md={12}><Form.Item name="title" label="项目名称" rules={[{ required: true, message: '请填写名称' }]}><Input /></Form.Item></Col>
                  <Col xs={24} md={12}><Form.Item name="style_mode" label="画风（真人 / 动漫）"><Select options={STYLE_OPTIONS} /></Form.Item></Col>
                </Row>
                <Form.Item name="idea" label="一句话灵感 / 题材" extra="模型会据此生成完整剧情大纲，不需要你先想好人物">
                  <TextArea rows={2} placeholder="例：被仙人选中的少女离村修行，多年后回乡，与当年送别的少年重逢……" />
                </Form.Item>
                <Row gutter={16}>
                  <Col xs={12} md={5}><Form.Item name="model" label="模型"><Select options={MODEL_OPTIONS} /></Form.Item></Col>
                  <Col xs={12} md={5}><Form.Item name="image_size" label="强度"><Select options={SIZE_OPTIONS} /></Form.Item></Col>
                  <Col xs={12} md={5}><Form.Item name="ratio" label="比例" extra="默认 2:3 对齐排版页"><Select options={RATIO_OPTIONS} /></Form.Item></Col>
                  <Col xs={12} md={5}><Form.Item name="page_count" label="页数"><InputNumber min={4} max={24} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={24} md={4}><Form.Item name="scene_anchor" label="场景锚点"><Input /></Form.Item></Col>
                </Row>
                <Form.Item name="costume_ref" label="附加服装参考图（可选，/static/...）"><Input placeholder="可留空；服装主要由人物人设逐件描述" /></Form.Item>
                <Button type="primary" htmlType="submit" icon={<CheckOutlined />}>保存项目</Button>
              </Form>
              {projectId && (
                <>
                  <Divider orientation="left" plain>剧情大纲（模型生成，可人工改写）</Divider>
                  <TextArea rows={6} value={outline} onChange={(e) => setOutline(e.target.value)} placeholder="点下方按钮生成，或直接粘贴现成大纲" />
                  <Space style={{ marginTop: 12 }}>
                    <Button icon={<ThunderboltOutlined />} onClick={genOutline}>生成剧情大纲</Button>
                    <Button type="primary" icon={<CheckOutlined />} onClick={confirmOutline}>确认大纲，去识别人物</Button>
                  </Space>
                </>
              )}
            </div>
          )}

          {/* 1 人物与人设 */}
          {step === 1 && (
            <div>
              <Space style={{ marginBottom: 12 }} wrap>
                <Button type="primary" icon={<ThunderboltOutlined />} onClick={extractCharacters}>从大纲识别人物</Button>
                <Button icon={<ThunderboltOutlined />} onClick={genPrompts} disabled={!characters.length}>生成人设提示词</Button>
                <Text type="secondary">人物由模型识别；可增删改各项人设，服装务必逐件写清</Text>
              </Space>
              {characters.length ? (
                <>
                  <Row gutter={[12, 12]}>
                    {characters.map((c, i) => (
                      <Col xs={24} md={12} key={c.id}>
                        <Card size="small" title={<Space><Tag color="purple">{c.id}</Tag><Input size="small" style={{ width: 140 }} value={c.name} onChange={(e) => patchChar(i, 'name', e.target.value)} /></Space>}>
                          <Space direction="vertical" size={4} style={{ width: '100%' }}>
                            <Input size="small" addonBefore="身份" value={c.role} onChange={(e) => patchChar(i, 'role', e.target.value)} />
                            <Input size="small" addonBefore="年龄/性别" value={`${c.age || ''} ${c.gender || ''}`} onChange={(e) => { patchChar(i, 'age', e.target.value); }} />
                            <Input size="small" addonBefore="外貌" value={c.appearance} onChange={(e) => patchChar(i, 'appearance', e.target.value)} />
                            <TextArea rows={2} placeholder="服装逐件（上衣/下装/鞋/外搭/配饰，含颜色材质）" value={c.costume} onChange={(e) => patchChar(i, 'costume', e.target.value)} />
                            <Input size="small" addonBefore="配饰" value={c.accessories} onChange={(e) => patchChar(i, 'accessories', e.target.value)} />
                            <Input size="small" addonBefore="标志" value={c.signature} onChange={(e) => patchChar(i, 'signature', e.target.value)} />
                            {c.prompt && <Alert type="success" message={<span><Text type="secondary">英文设定本提示词：</Text>{c.prompt}</span>} />}
                          </Space>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                  <div style={{ marginTop: 12, textAlign: 'right' }}>
                    <Button type="primary" icon={<CheckOutlined />} onClick={confirmCharacters}>确认人物，去生成设定本</Button>
                  </div>
                </>
              ) : <Empty description="还没有人物，点「从大纲识别人物」" />}
            </div>
          )}

          {/* 2 角色设定本 */}
          {step === 2 && (
            <div>
              <Alert type="info" showIcon style={{ marginBottom: 12 }}
                message="角色设定本 = 角色一致性的唯一基准"
                description="每个人物分 4 个图像块生成（正面头像 / FRONT·SIDE·BACK 三视图 / 5 连表情 / 服饰局部特写），后端自动拼成一张 CHARACTER PROFILE；档案文字不烧进图（Agnes 渲染中文会崩）。确认无误后锁定，锁定后每一页都会用这张图当身份参考。" />
              <Row gutter={[12, 12]}>
                {characters.map((c) => (
                  <Col xs={24} md={12} key={c.id}>
                    <Card size="small" title={<Space><Tag color={c.locked ? 'success' : 'default'}>{c.name}</Tag>{c.locked ? <Tag color="success">已锁定</Tag> : <Tag>未锁定</Tag>}</Space>}
                      extra={<Space>
                        <Button size="small" icon={<ReloadOutlined />} disabled={c.locked} onClick={() => genSheet(c.id)}>重生成未完成块</Button>
                        <Button size="small" icon={c.locked ? <UnlockOutlined /> : <LockOutlined />} disabled={!c.sheet_url}
                          onClick={() => toggleLock(c.id, !c.locked)}>{c.locked ? '解锁' : '锁定'}</Button>
                      </Space>}>
                      <Row gutter={8}>
                        <Col span={10}>
                          {c.sheet_url
                            ? <Image alt="角色设定本" src={getUrl(c.sheet_url)} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover' }} />
                            : <div style={{ aspectRatio: '1/1', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 12 }}>设定本拼版中…</div>}
                        </Col>
                        <Col span={14}>
                          <Space direction="vertical" size={4} style={{ width: '100%' }}>
                            {(c.blocks || []).map((b: any) => (
                              <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                <Tag color={STATUS_TAG[b.status || 'pending']?.color}>{STATUS_TAG[b.status || 'pending']?.label}</Tag>
                                <Text type="secondary" style={{ fontSize: 12 }}>{BLOCK_LABELS[b.key] || b.key}</Text>
                                {b.source === 'library' && <Tag color="geekblue">素材图</Tag>}
                                <Button size="small" type="link" style={{ padding: 0, height: 18 }} disabled={c.locked}
                                  onClick={() => regenBlock(c.id, b.key)}>重生成</Button>
                                <Input size="small" placeholder="/static/素材图.jpg（可选）" style={{ width: 120 }}
                                  value={assetInputs[`${c.id}:${b.key}`] || ''}
                                  onChange={(e) => setAssetInputs((s) => ({ ...s, [`${c.id}:${b.key}`]: e.target.value }))} />
                                <Button size="small" disabled={c.locked}
                                  onClick={() => applyBlockAsset(c.id, b.key, assetInputs[`${c.id}:${b.key}`] || '')}>应用</Button>
                              </div>
                            ))}
                            {!c.blocks?.length && <Text type="secondary">尚未生成</Text>}
                          </Space>
                        </Col>
                      </Row>
                    </Card>
                  </Col>
                ))}
              </Row>
              <div style={{ marginTop: 16, textAlign: 'right' }}>
                <Button onClick={() => setStep(1)}>返回改人设</Button>
                <Button type="primary" disabled={!allLocked} onClick={() => setStep(3)}>全部已锁定，去生成分格</Button>
              </div>
              {!allLocked && <Text type="secondary" style={{ display: 'block', textAlign: 'right', marginTop: 6, fontSize: 12 }}>需所有人物都生成并锁定设定本</Text>}
            </div>
          )}

          {/* 3 分格 */}
          {step === 3 && (
            <div>
              <Space style={{ marginBottom: 12 }} wrap>
                <Button type="primary" icon={<ThunderboltOutlined />} onClick={genScript}>生成分格脚本</Button>
                <Text type="secondary">每格必须指定出场人物；该人物的设定本会自动作为生图参考图</Text>
              </Space>
              {panels.length ? (
                <>
                  <Table rowKey="page_no" size="small" pagination={false} scroll={{ x: 1100, y: 460 }} dataSource={panels} columns={columns} />
                  <div style={{ marginTop: 12, textAlign: 'right' }}>
                    <Button type="primary" icon={<CheckOutlined />} onClick={() => savePanels(panels)}>保存分格并去审格</Button>
                  </div>
                </>
              ) : <Empty description="点按钮生成逐页剧情" />}
            </div>
          )}

          {/* 4 审格 */}
          {step === 4 && (
            <div>
              <Title level={5}>生成前确认</Title>
              <Paragraph type="secondary">同一「复用组」的格只生成 1 张底图，其余格复制同图，仅文字层不同。</Paragraph>
              {estimate ? (
                <Row gutter={12} style={{ marginBottom: 16 }}>
                  <Col><Card size="small"><Text type="secondary">总格数</Text><Title level={3} style={{ margin: 0 }}>{estimate.page_count}</Title></Card></Col>
                  <Col><Card size="small"><Text type="secondary">需生成底图</Text><Title level={3} style={{ margin: 0 }}>{estimate.base_count}</Title></Card></Col>
                  <Col><Card size="small"><Text type="secondary">单张积分</Text><Title level={3} style={{ margin: 0 }}>{estimate.per_image_credits}</Title></Card></Col>
                  <Col><Card size="small"><Text type="secondary">预计总积分</Text><Title level={3} style={{ margin: 0, color: '#c2410c' }}>{estimate.total_credits}</Title></Card></Col>
                </Row>
              ) : <Spin />}
              <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="底图不含任何中文文字"
                description="旁白、台词、气泡、分支卡全部留给剪辑应用 /comic 排版层。提示词已固定注入禁分镜 / 禁拼图 / 禁多余人物 / 禁换装。" />
              <Space>
                <Button onClick={() => setConfirmed(!confirmed)} icon={<CheckOutlined />} type={confirmed ? 'primary' : 'default'}>
                  {confirmed ? '已确认分格与设定本' : '点此确认分格与设定本'}
                </Button>
                <Button type="primary" disabled={!confirmed} loading={loading} onClick={startGeneration}>开始生成底图</Button>
                <Button onClick={() => setStep(3)}>返回改分格</Button>
              </Space>
            </div>
          )}

          {/* 5 生成 */}
          {step === 5 && (
            <div>
              <Space style={{ marginBottom: 12 }} wrap>
                <Text strong>生成进度</Text>
                {progress && <Text type="secondary">完成 {progress.completed} / {progress.total} · 失败 {progress.failed} · 进行中 {progress.processing}</Text>}
              </Space>
              <Progress percent={pct} status={progress?.failed ? 'exception' : undefined} style={{ marginBottom: 16 }} />
              <Row gutter={[12, 12]}>
                {panels.map((p) => (
                  <Col key={p.page_no} xs={12} sm={8} md={6} lg={4}>
                    <Card size="small" cover={p.output_url
                      ? <Image alt={`格${p.page_no}`} src={getUrl(p.output_url)} style={{ aspectRatio: '2/3', objectFit: 'cover' }} />
                      : <div style={{ aspectRatio: '2/3', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 12 }}>{p.status === 'failed' ? '生成失败' : '生成中…'}</div>}>
                      <Space direction="vertical" size={2} style={{ width: '100%' }}>
                        <Space size={4}><Tag>第 {p.page_no} 格</Tag><Tag color={STATUS_TAG[p.status || 'pending']?.color}>{STATUS_TAG[p.status || 'pending']?.label}</Tag></Space>
                        <Text type="secondary" ellipsis style={{ fontSize: 11 }}>{p.reuse_group}</Text>
                        {p.error_msg && <Tooltip title={p.error_msg}><Text type="danger" style={{ fontSize: 11 }}>失败原因</Text></Tooltip>}
                        <Button size="small" block icon={<ReloadOutlined />} onClick={() => regenerate(p.page_no)}>重生成</Button>
                      </Space>
                    </Card>
                  </Col>
                ))}
              </Row>
              <div style={{ marginTop: 16, textAlign: 'right' }}><Button type="primary" onClick={() => setStep(6)}>查看交付</Button></div>
            </div>
          )}

          {/* 6 交付 */}
          {step === 6 && (
            <div>
              <Title level={5}>漫画包交付</Title>
              <Paragraph type="secondary">导出 ZIP 含 <code>格NN.png</code>、各人物 <code>设定本_cN.png</code>、<code>panel-spec.json</code>、<code>manifest.json</code>。拿去 <code>D:\剪辑应用</code> 的 /comic 页套文字层并完善剧情。</Paragraph>
              <Space style={{ marginBottom: 16 }} wrap>
                <Button type="primary" icon={<DownloadOutlined />} loading={loading} onClick={exportPackage}>导出漫画包</Button>
                <Button icon={<SwapOutlined />} onClick={cloneOtherStyle}>复制为另一风格</Button>
                {exportUrl && <Button href={getUrl(exportUrl)} target="_blank" download>下载 ZIP</Button>}
              </Space>
              <Row gutter={[12, 12]}>
                {panels.map((p) => (
                  <Col key={p.page_no} xs={12} sm={8} md={6} lg={4}>
                    <Card size="small" cover={p.output_url
                      ? <Image alt={`格${p.page_no}`} src={getUrl(p.output_url)} style={{ aspectRatio: '2/3', objectFit: 'cover' }} />
                      : <div style={{ aspectRatio: '2/3', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>无底图</div>}>
                      <Space direction="vertical" size={2}><Tag>第 {p.page_no} 格</Tag>
                        <Text type="secondary" style={{ fontSize: 11 }} ellipsis>{p.narration || p.dialogue || p.action}</Text></Space>
                    </Card>
                  </Col>
                ))}
              </Row>
            </div>
          )}
        </Spin>
      </Card>
    </div>
  );
}
