import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button, Steps, Form, Input, InputNumber, Select, Space, Typography,
  Table, Tag, Alert, Progress, Row, Col, Image, Divider, Tooltip, message, Empty, Spin,
  Modal, Tabs,
} from 'antd';
import {
  PlusOutlined, ArrowLeftOutlined, ThunderboltOutlined, CheckOutlined,
  ReloadOutlined, DownloadOutlined, SwapOutlined, LockOutlined, UnlockOutlined,
  DeleteOutlined, AppstoreOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import './comic-studio.css';   // 本页质感改造样式（作用域 .cst-root，范围与遗留项见文件头注释）

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
  costume: '人物服装', pose: '姿势', styling: '造型',
};

/** 每个设定本块对应的参考图类别（用于在大资产库/开源图鉴里按 tag 筛选） */
const BLOCK_REF_TAG: Record<string, string> = {
  portrait: 'face', three_view: 'face', expressions: 'face', details: 'face',
  costume: 'costume', pose: 'pose', styling: 'styling',
};

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  pending: { color: 'default', label: '待生成' },
  processing: { color: 'processing', label: '生成中' },
  completed: { color: 'success', label: '完成' },
  failed: { color: 'error', label: '失败' },
};

/** 项目整体状态映射（落地页卡片用） */
const PROJECT_STATUS: Record<string, { color: string; label: string }> = {
  draft: { color: 'default', label: '草稿' },
  script_review: { color: 'processing', label: '大纲已定' },
  generating: { color: 'processing', label: '生成中' },
  completed: { color: 'success', label: '已完成' },
};

/** 7 个图像块的固定顺序（4 必选 + 3 可选，与后端 SHEET_BLOCKS 一致） */
const BLOCK_KEYS = Object.keys(BLOCK_LABELS);
/** 必选 4 块：齐了即可拼版 / 锁定 / 进入下一步；其余 3 块为可选生成项 */
const REQUIRED_KEYS = ['portrait', 'three_view', 'expressions', 'details'];
const OPTIONAL_KEYS = BLOCK_KEYS.filter((k) => !REQUIRED_KEYS.includes(k));

/** 块显示状态：有成品图（生成结果或已应用的大资产图）即为「完成」，兼容旧数据与中间态 */
const blockStatus = (b: any): string => (b?.url ? 'completed' : (b?.status || 'pending'));
/** 块当前可展示的图：成品图优先，其次已绑定的参考图 */
const blockImage = (b: any): string => b?.url || b?.reference_image || b?.asset_url || '';
/** 角色摘要用的正面头像：portrait 块 → 设定本拼版 → 空 */
const portraitImage = (c: any): string => {
  const p = (c?.blocks || []).find((b: any) => b.key === 'portrait');
  return blockImage(p) || c?.sheet_url || '';
};
const blockDone = (c: any, k: string): boolean => {
  const b = (c?.blocks || []).find((x: any) => x.key === k);
  return !!b?.url;
};
const doneRequired = (c: any): number => REQUIRED_KEYS.filter((k) => blockDone(c, k)).length;
const doneOptional = (c: any): number => OPTIONAL_KEYS.filter((k) => blockDone(c, k)).length;

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
  /** 项目 id 存在 URL 里：/comic-studio/:id 为项目页，/comic-studio 为新建/列表主页 */
  const { id: routeId } = useParams();
  const [form] = Form.useForm();
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [project, setProject] = useState<any>(null);
  const [characters, setCharacters] = useState<any[]>([]);
  const [panels, setPanels] = useState<any[]>([]);
  const [outline, setOutline] = useState('');
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<any>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  /** 生成前预检结果（审格步骤用，后端 startGeneration 也会复用同一份做硬门控） */
  const [preflight, setPreflight] = useState<any>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  /** 设定本块「应用大资产」挑选器状态 */
  const [picker, setPicker] = useState<{ characterId: string; block: string; kind: string } | null>(null);
  /** 角色详情弹窗：只存 id，内容由 characters 派生，保证 3s 轮询能实时刷新弹窗 */
  const [detailCharId, setDetailCharId] = useState<string | null>(null);
  const detailChar = characters.find((c) => c.id === detailCharId) || null;
  /** 分格脚本：正在为第几格（panels 下标）从大资产库挑选姿势参考图 */
  const [posePicker, setPosePicker] = useState<number | null>(null);
  /** 是否处于「新建项目」页（与项目列表页、工作页三者互斥） */
  const [creating, setCreating] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const { data } = await api.get('/api/comic-studio');
      setProjects(Array.isArray(data) ? data : data.items || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const applyProject = useCallback((data: any) => {
    setProjectId(data.id);
    // 记住最近打开的项目，供 OpenGallery「去角色设定本」直接返回（§18 边界修复）
    try { localStorage.setItem('comicStudioLastProjectId', String(data.id)); } catch { /* ignore */ }
    setProject(data);
    setOutline(data.outline || '');
    setCharacters(data.character_list || []);
    setPanels(data.spec?.panels || []);
    setExportUrl(data.export_url || null);
    form.setFieldsValue({ ...DEFAULT_FORM, ...data, idea: '' });
    let target = 0;
    if (data.sheet_status === 'locked') target = 3;
    else if (data.characters_status === 'confirmed') target = 2;
    else if (data.outline_status === 'confirmed' || data.outline) target = 1;
    if (data.status === 'generating') target = 5;
    if (data.status === 'completed') target = 6;
    // 刷新后优先恢复上次所在步骤（按项目 id 隔离），否则才按项目进度推导；
    // 审格步骤没有任何项目状态可推导，不这么做刷新必丢。
    try {
      const saved = Number(sessionStorage.getItem(`comicStudioStep:${data.id}`));
      if (Number.isInteger(saved) && saved >= 0 && saved < STEPS.length) target = saved;
    } catch { /* ignore */ }
    setStep(target);
    setConfirmed(false);
  }, [form]);

  const openProject = useCallback(async (id: number) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/comic-studio/${id}`);
      applyProject(data);
      // 从落地页点开项目 → push，保留落地页历史（浏览器回退能回到项目列表）；
      // 已是项目 URL（直链 / 刷新 / 项目间切换）→ replace，避免反复堆历史。
      const fromLanding = !routeId || !Number.isInteger(Number(routeId)) || Number(routeId) <= 0;
      navigate(`/comic-studio/${id}`, { replace: !fromLanding });
    } catch (e: any) { message.error(e?.response?.data?.message || '项目读取失败'); }
    finally { setLoading(false); }
  }, [applyProject, navigate]);

  /** 回到项目列表页：清空当前项目态并刷新列表，projectId 置空后落地页会接管渲染 */
  const goLanding = useCallback(() => {
    setProjectId(null); setProject(null); setCharacters([]); setPanels([]);
    setOutline(''); setStep(0); setExportUrl(null); setCreating(false); setPreflight(null);
    form.resetFields();
    void loadProjects();
    navigate('/comic-studio');
  }, [form, navigate, loadProjects]);

  /** URL 里的 id 决定当前视图：
   *  - 有合法 id → 打开对应项目（仅当 projectId 还未指向它时才拉取，避免重复请求）；
   *  - 没有 id（浏览器回退到 /comic-studio）→ 清空项目态，让落地页正确接管。
   *  否则 projectId 仍残留会使页面停在「工作页」，回退看起来像没生效。 */
  useEffect(() => {
    const id = Number(routeId);
    if (Number.isInteger(id) && id > 0) {
      if (id !== projectId) void openProject(id);
    } else if (projectId !== null || project !== null || creating) {
      setProjectId(null); setProject(null); setCharacters([]); setPanels([]);
      setOutline(''); setStep(0); setExportUrl(null); setCreating(false); setPreflight(null);
      form.resetFields();
      void loadProjects();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  const refreshPreflight = useCallback(async (id: number) => {
    setPreflightLoading(true);
    try {
      const { data } = await api.get(`/api/comic-studio/${id}/preflight`);
      setPreflight(data);
    } catch { setPreflight(null); }
    finally { setPreflightLoading(false); }
  }, []);

  /** 进入审格步骤就拉一次预检；确认状态只在预检通过时才允许保持 */
  useEffect(() => { if (step === 4 && projectId) refreshPreflight(projectId); }, [step, projectId, refreshPreflight]);
  useEffect(() => { if (preflight && !preflight.canGenerate) setConfirmed(false); }, [preflight]);

  /** 记住每个项目当前所在步骤，刷新后由 applyProject 恢复 */
  useEffect(() => {
    if (!projectId) return;
    try { sessionStorage.setItem(`comicStudioStep:${projectId}`, String(step)); } catch { /* ignore */ }
  }, [step, projectId]);

  /** 设定本生成中 / 剧情图生成中，3 秒轮询回填。
   *  串行化：上一个请求未返回前不再发下一个，避免 status 接口慢时请求堆积打垮后端。 */
  useEffect(() => {
    if (!projectId || (step !== 2 && step !== 5)) return;
    let stopped = false;
    let inflight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (stopped || inflight) return;
      inflight = true;
      try {
        const { data } = await api.get(`/api/comic-studio/${projectId}/status`);
        if (stopped) return;
        setPanels(data.panels || []);
        setCharacters(data.characters || []);
        setProgress(data.progress || null);
        if (data.project) setProject(data.project);
      } catch { /* ignore */ }
      finally {
        inflight = false;
        if (!stopped) timer = setTimeout(tick, 3000);
      }
    };
    void tick();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
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
      if (projectId) {
        const { data } = await api.put(`/api/comic-studio/${projectId}`, payload);
        applyProject(data);
        await loadProjects();
        message.success('项目已保存');
      } else {
        const { data } = await api.post('/api/comic-studio', payload);
        applyProject(data);
        await loadProjects();
        setCreating(false);
        message.success('项目已创建');
        navigate(`/comic-studio/${data.id}`);
      }
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
        message.success(`已补生成 ${data.created} 个必选块（可选块不自动生成，拼版会自动刷新）`);
      }
      setStep(2);
    } catch (e: any) { message.error(e?.response?.data?.message || '设定本生成失败'); }
    finally { setLoading(false); }
  };

  const regenBlock = async (characterId: string, block: string) => {
    if (!guard()) return;
    try {
      await api.post(`/api/comic-studio/${projectId}/sheets/generate`, { characterId, blocks: [block] });
      message.success(`「${BLOCK_LABELS[block] || block}」已提交生成（生成会消耗积分，完成后自动拼版）`);
      setStep(2);
    } catch (e: any) { message.error(e?.response?.data?.message || '重生成失败'); }
  };

  /** 应用大资产：图片直接成为该块成品图（0 生图 0 积分），同时保留为 i2i 参考供「重生成」 */
  const applyReference = async (characterId: string, block: string, assetId: number, referenceImage?: string) => {
    if (!guard()) return;
    try {
      await api.put(`/api/comic-studio/${projectId}/sheets/block-reference`, { characterId, block, assetId, referenceImage });
      message.success(`「${BLOCK_LABELS[block] || block}」已应用为成品图（无需生图）`);
      if (projectId) await openProject(projectId);
    } catch (e: any) { message.error(e?.response?.data?.message || '应用失败'); }
  };

  const clearReference = async (characterId: string, block: string) => {
    if (!guard()) return;
    try {
      await api.put(`/api/comic-studio/${projectId}/sheets/block-reference`, { characterId, block, clear: true });
      message.success(`已移除「${BLOCK_LABELS[block] || block}」的图像，恢复待生成`);
      if (projectId) await openProject(projectId);
    } catch (e: any) { message.error(e?.response?.data?.message || '移除失败'); }
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
    { title: '姿势图（大资产）', key: 'pose_ref', width: 150,
      render: (_: any, r: any, i: number) => (
        <Space direction="vertical" size={2} style={{ width: '100%' }}>
          {r.pose_ref
            ? <Image src={getUrl(r.pose_ref)} width={44} height={44} preview={false}
                style={{ objectFit: 'cover' }} className="cst-thumb" />
            : null}
          <Button size="small" block icon={<AppstoreOutlined />} onClick={() => setPosePicker(i)}>
            {r.pose_ref ? '更换姿势图' : '应用大资产'}
          </Button>
          {r.pose_ref
            ? <Button size="small" type="link" danger block style={{ padding: 0, height: 18 }}
                onClick={() => patchPanel(i, 'pose_ref', '')}>清除</Button>
            : null}
        </Space>
      ) },
    { title: '旁白 / 台词（排版层）', key: 'text', width: 210,
      render: (_: any, r: any, i: number) => (
        <Space direction="vertical" size={2} style={{ width: '100%' }}>
          <Input size="small" value={r.narration} placeholder="旁白" onChange={(e) => patchPanel(i, 'narration', e.target.value)} />
          <Input size="small" value={r.dialogue} placeholder="台词" onChange={(e) => patchPanel(i, 'dialogue', e.target.value)} />
        </Space>
      ) },
  ];

  const pct = progress?.total ? Math.round(((progress.completed + progress.failed) / progress.total) * 100) : 0;

  const projectSetupForm = (
    <div className="cst-form">
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
        <div className="cst-form__foot">
          <Button type="primary" htmlType="submit" icon={<CheckOutlined />}>保存项目</Button>
        </div>
      </Form>
      {projectId && (
        <>
          <Divider titlePlacement="left" plain>剧情大纲（模型生成，可人工改写）</Divider>
          <TextArea rows={6} value={outline} onChange={(e) => setOutline(e.target.value)} placeholder="点下方按钮生成，或直接粘贴现成大纲" />
          <div className="cst-form__foot">
            <Button icon={<ThunderboltOutlined />} onClick={genOutline}>生成剧情大纲</Button>
            <Button type="primary" icon={<CheckOutlined />} onClick={confirmOutline}>确认大纲，去识别人物</Button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="cst-root">
      {projectId ? (
        <>
          <div className="cst-topbar">
            <div className="cst-topbar__lead">
              <Button shape="circle" icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')} />
              <div className="cst-topbar__titles">
                <Title level={4} className="cst-topbar__title">漫画工作室</Title>
                <span className="cst-topbar__sub">大纲 → 人物 → 设定本（锁定） → 逐页剧情图</span>
              </div>
              <Tag className="cst-topbar__tag">V2 · 角色设定本驱动</Tag>
            </div>
            <Button icon={<AppstoreOutlined />} onClick={goLanding}>项目列表</Button>
          </div>

      <Alert className="cst-note" type="info" showIcon style={{ marginBottom: 16 }}
        message="标准流程：大纲 → 识别人物 → 人设 → 角色设定本（锁定） → 逐页剧情图"
        description="角色由模型从剧情里识别并生成设定本，锁定后作为每一页唯一的身份基准；文字层（旁白/气泡/分支卡）仍交给剪辑应用排版层，底图不含中文。" />

      <div className="cst-panel">
        <Steps current={step} onChange={(s) => {
          if (!projectId && s > 0) { message.info('先保存项目'); return; }
          // 不能靠点步骤条绕过审格直接进生图 / 交付
          if (s > step && s >= 5) {
            if (s === 5 && !(preflight?.canGenerate && confirmed)) {
              message.warning('请先在「审格 · 门控与用量」通过预检并确认，才能进入生成');
              return;
            }
            if (s === 6 && (!panels.length || panels.some((p: any) => p.status === 'processing' || p.status === 'pending'))) {
              message.warning('还有未完成的格，请等生成结束或重生成失败格');
              return;
            }
          }
          setStep(s);
        }} items={STEPS} style={{ marginBottom: 24 }} />

        <Spin spinning={loading}>
          {/* 0 立项与大纲 */}
          {step === 0 && (<div>{projectSetupForm}</div>)}

          {/* 1 人物与人设 */}
          {step === 1 && (
            <div className="cst-step">
              <div className="cst-step__bar">
                <Button type="primary" icon={<ThunderboltOutlined />} onClick={extractCharacters}>从大纲识别人物</Button>
                <Button icon={<ThunderboltOutlined />} onClick={genPrompts} disabled={!characters.length}>生成人设提示词</Button>
                <span className="cst-step__hint">人物由模型识别；可增删改各项人设，服装务必逐件写清</span>
              </div>
              {characters.length ? (
                <>
                  {/* 人设卡：antd Card(title 里塞 Input) → 令牌卡；Input/onChange/value 一字未动 */}
                  <div className="cst-chargrid">
                    {characters.map((c, i) => (
                      <div className="cst-char" key={c.id}>
                        <div className="cst-char__head">
                          <Tag className="cst-char__no">{c.id}</Tag>
                          <Input size="small" style={{ width: 140 }} value={c.name} onChange={(e) => patchChar(i, 'name', e.target.value)} />
                        </div>
                        <div className="cst-char__fields">
                          <Input size="small" addonBefore="身份" value={c.role} onChange={(e) => patchChar(i, 'role', e.target.value)} />
                          <Input size="small" addonBefore="年龄/性别" value={`${c.age || ''} ${c.gender || ''}`} onChange={(e) => { patchChar(i, 'age', e.target.value); }} />
                          <Input size="small" addonBefore="外貌" value={c.appearance} onChange={(e) => patchChar(i, 'appearance', e.target.value)} />
                          <TextArea rows={2} placeholder="服装逐件（上衣/下装/鞋/外搭/配饰，含颜色材质）" value={c.costume} onChange={(e) => patchChar(i, 'costume', e.target.value)} />
                          <Input size="small" addonBefore="配饰" value={c.accessories} onChange={(e) => patchChar(i, 'accessories', e.target.value)} />
                          <Input size="small" addonBefore="标志" value={c.signature} onChange={(e) => patchChar(i, 'signature', e.target.value)} />
                          {c.prompt && <Alert className="cst-char__prompt" type="success" message={<span><span className="cst-char__prompt-label">英文设定本提示词：</span>{c.prompt}</span>} />}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="cst-step__foot">
                    <Button type="primary" icon={<CheckOutlined />} onClick={confirmCharacters}>确认人物，去生成设定本</Button>
                  </div>
                </>
              ) : <div className="cst-stage"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有人物，点「从大纲识别人物」" /></div>}
            </div>
          )}

          {/* 2 角色设定本 */}
          {step === 2 && (
            <div className="cst-step">
              {/* 长说明：常驻 Alert → 默认折叠指南条（/open-gallery 同款范式），文案一字不动 */}
              <details className="cst-guide">
                <summary className="cst-guide__summary">
                  <span className="cst-guide__mark">i</span>
                  <span>角色设定本 = 角色一致性的唯一基准</span>
                  <span className="cst-guide__chev">▶</span>
                </summary>
                <div className="cst-guide__body">
                  必选 4 块：正面头像 / 三视图 / 表情组 / 局部特写——这 4 块齐了就能自动拼版、锁定并进入下一步。可选 3 块：人物服装 / 姿势 / 造型，不默认生成、不阻塞流程，需要时在详情弹窗里单独生成，生成后会自动拼进设定本。「应用大资产」可把大资产库/开源图鉴的图直接作为该块成品（0 生图 0 积分）。
                </div>
              </details>
              <div className="cst-sheetgrid">
                {characters.map((c) => {
                  const done = doneRequired(c);
                  const opt = doneOptional(c);
                  const total = REQUIRED_KEYS.length;
                  const failed = (c.blocks || []).filter((b: any) => b.status === 'failed' && !b.url).length;
                  const cover = portraitImage(c);
                  return (
                    <div className="cst-sheet" key={c.id}>
                      <div className="cst-sheet__head">
                        <span className="cst-sheet__name">{c.name}</span>
                        <Tag className="cst-sheet__lock" color={c.locked ? 'success' : 'default'}>{c.locked ? '已锁定' : '未锁定'}</Tag>
                        <Button size="small" type="link" icon={<AppstoreOutlined />} onClick={() => setDetailCharId(c.id)}>详情</Button>
                      </div>
                      <div className="cst-sheet__cover" onClick={() => setDetailCharId(c.id)}>
                        {cover
                          ? <Image className="cst-sheet__img" alt={c.name} src={getUrl(cover)} preview={false} />
                          : <div className="cst-ph cst-ph--1x1 cst-ph--pointer">暂无正面头像 · 点详情应用</div>}
                      </div>
                      <div className="cst-sheet__body">
                        <span className="cst-sheet__meta">必选 {done}/{total} · 可选 {opt}/{OPTIONAL_KEYS.length}</span>
                        <Progress percent={Math.round(done / total * 100)} size="small" showInfo={false} />
                        {failed > 0 && (
                          <Button className="cst-sheet__retry" size="small" type="link" danger
                            onClick={() => setDetailCharId(c.id)}>{failed} 块生成失败 · 点此重试</Button>
                        )}
                      </div>
                      <div className="cst-sheet__foot">
                        <Button size="small" type="link" icon={<ReloadOutlined />} disabled={c.locked} onClick={() => genSheet(c.id)}>补生成必选块</Button>
                        <Button size="small" type="link" icon={c.locked ? <UnlockOutlined /> : <LockOutlined />} disabled={!c.sheet_url} onClick={() => toggleLock(c.id, !c.locked)}>{c.locked ? '解锁' : '锁定'}</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="cst-step__foot cst-step__foot--split">
                <span className="cst-step__hint">{!allLocked ? '需所有人物的 4 个必选块完成并锁定设定本' : ''}</span>
                <span className="cst-step__acts">
                  <Button onClick={() => setStep(1)}>返回改人设</Button>
                  <Button type="primary" disabled={!allLocked} onClick={() => setStep(3)}>全部已锁定，去生成分格</Button>
                </span>
              </div>
            </div>
          )}

          {/* 3 分格 */}
          {step === 3 && (
            <div className="cst-step">
              <div className="cst-step__bar">
                <Button type="primary" icon={<ThunderboltOutlined />} onClick={genScript}>生成分格脚本</Button>
                <span className="cst-step__hint">每格必须指定出场人物；该人物的设定本会自动作为生图参考图</span>
              </div>
              {panels.length ? (
                <>
                  <div className="cst-table">
                    <Table rowKey="page_no" size="small" pagination={false} scroll={{ x: 1100, y: 460 }} dataSource={panels} columns={columns} />
                  </div>
                  <div className="cst-step__foot">
                    <Button type="primary" icon={<CheckOutlined />} onClick={() => savePanels(panels)}>保存分格并去审格</Button>
                  </div>
                </>
              ) : <div className="cst-stage"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="点按钮生成逐页剧情" /></div>}
            </div>
          )}

          {/* 4 审格 · 门控与用量（生成前预检） */}
          {step === 4 && (
            <div className="cst-step">
              <Title level={5} className="cst-h5">审格 · 门控与用量（生成前预检）</Title>
              <Paragraph className="cst-p" type="secondary">同一「复用组」的格只生成 1 张底图，其余格复制同图，仅文字层不同。下面逐项确认前面几步的设定与「能否正确生成」，有「未通过」项时无法开始生图。</Paragraph>
              <Spin spinning={preflightLoading}>
                {preflight ? (
                  <>
                    {/* 预检数字：5 个 antd Card → 令牌统计块（品牌左条 + 等宽数字） */}
                    <div className="cst-statrow">
                      <div className="cst-stat"><span className="cst-stat__label">总格数</span><Title level={3} className="cst-stat__num">{preflight.estimate.page_count}</Title></div>
                      <div className="cst-stat"><span className="cst-stat__label">需生成底图</span><Title level={3} className="cst-stat__num">{preflight.estimate.base_count}</Title></div>
                      <div className="cst-stat"><span className="cst-stat__label">单张积分</span><Title level={3} className="cst-stat__num">{preflight.estimate.per_image_credits}</Title></div>
                      <div className="cst-stat"><span className="cst-stat__label">预计消耗</span><Title level={3} className="cst-stat__num" data-tone="warn">{preflight.estimate.total_credits}</Title></div>
                      <div className="cst-stat"><span className="cst-stat__label">当前余额</span><Title level={3} className="cst-stat__num" data-tone={preflight.deficit ? 'danger' : 'success'}>{preflight.balance}</Title></div>
                    </div>
                    <Alert className="cst-note" type={preflight.canGenerate ? 'success' : 'error'} showIcon
                      message={preflight.canGenerate ? '预检通过，可以开始生成' : `预检未通过：${(preflight.checks || []).filter((c: any) => c.level === 'error' && !c.ok).length} 项必须处理后才能生成`}
                      description={preflight.deficit ? `积分还差 ${preflight.deficit} 分，请先充值` : undefined} />
                    {/* 检查清单：antd List(bordered) → 令牌清单（数据与 renderItem 判定不变） */}
                    <div className="cst-checks">
                      {(preflight.checks || []).map((c: any, i: number) => (
                        <div className="cst-check" key={i}>
                          <Tag color={c.ok ? 'success' : (c.level === 'error' ? 'error' : 'warning')}>
                            {c.ok ? '通过' : (c.level === 'error' ? '未通过' : '提醒')}
                          </Tag>
                          <span className="cst-check__label">{c.label}</span>
                          {c.detail && <span className="cst-check__detail">{c.detail}</span>}
                        </div>
                      ))}
                    </div>
                  </>
                ) : <div className="cst-modalstage"><Spin /></div>}
              </Spin>
              <details className="cst-guide">
                <summary className="cst-guide__summary">
                  <span className="cst-guide__mark">!</span>
                  <span>底图不含任何中文文字</span>
                  <span className="cst-guide__chev">▶</span>
                </summary>
                <div className="cst-guide__body">
                  旁白、台词、气泡、分支卡全部留给剪辑应用 /comic 排版层。提示词已固定注入禁分镜 / 禁拼图 / 禁多余人物 / 禁换装。
                </div>
              </details>
              <div className="cst-step__bar">
                <Button onClick={() => setConfirmed(!confirmed)} icon={<CheckOutlined />}
                  disabled={!preflight?.canGenerate} type={confirmed ? 'primary' : 'default'}>
                  {confirmed ? '已确认分格与设定本' : '点此确认分格与设定本'}
                </Button>
                <Button type="primary" disabled={!confirmed || !preflight?.canGenerate} loading={loading} onClick={startGeneration}>开始生成底图</Button>
                <Button onClick={() => setStep(3)}>返回改分格</Button>
                <Button onClick={() => projectId && refreshPreflight(projectId)} loading={preflightLoading}>重新检查</Button>
              </div>
            </div>
          )}

          {/* 5 生成 */}
          {step === 5 && (
            <div className="cst-step">
              <div className="cst-step__bar">
                <Text strong>生成进度</Text>
                {progress && <span className="cst-step__hint">完成 {progress.completed} / {progress.total} · 失败 {progress.failed} · 进行中 {progress.processing}</span>}
              </div>
              <Progress className="cst-cell__bar" percent={pct} status={progress?.failed ? 'exception' : undefined} />
              <div className="cst-cellgrid">
                {panels.map((p) => (
                  <div className="cst-cell" key={p.page_no}>
                    {p.output_url
                      ? <Image className="cst-cell__img" alt={`格${p.page_no}`} src={getUrl(p.output_url)} />
                      : <div className="cst-ph cst-ph--2x3">{p.status === 'failed' ? '生成失败' : '生成中…'}</div>}
                    <div className="cst-cell__body">
                      <span className="cst-cell__tags">
                        <Tag>第 {p.page_no} 格</Tag>
                        <Tag color={STATUS_TAG[p.status || 'pending']?.color}>{STATUS_TAG[p.status || 'pending']?.label}</Tag>
                      </span>
                      <span className="cst-cell__sub">{p.reuse_group}</span>
                      {p.error_msg && <Tooltip title={p.error_msg}><Text type="danger" className="cst-cell__err">失败原因</Text></Tooltip>}
                      <Button className="cst-cell__act" size="small" icon={<ReloadOutlined />} onClick={() => regenerate(p.page_no)}>重生成</Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="cst-step__foot">
                <Button type="primary" disabled={!panels.length || panels.some((p: any) => p.status === 'processing' || p.status === 'pending')}
                  onClick={() => setStep(6)}>查看交付</Button>
              </div>
            </div>
          )}

          {/* 6 交付 */}
          {step === 6 && (
            <div className="cst-step">
              <Title level={5} className="cst-h5">漫画包交付</Title>
              <Paragraph className="cst-p" type="secondary">导出 ZIP 含 <code>格NN.png</code>、各人物 <code>设定本_cN.png</code>、<code>panel-spec.json</code>、<code>manifest.json</code>。拿去 <code>D:\剪辑应用</code> 的 /comic 页套文字层并完善剧情。</Paragraph>
              <div className="cst-step__bar">
                <Button type="primary" icon={<DownloadOutlined />} loading={loading} onClick={exportPackage}>导出漫画包</Button>
                <Button icon={<SwapOutlined />} onClick={cloneOtherStyle}>复制为另一风格</Button>
                {exportUrl && <Button href={getUrl(exportUrl)} target="_blank" download>下载 ZIP</Button>}
              </div>
              <div className="cst-cellgrid">
                {panels.map((p) => (
                  <div className="cst-cell" key={p.page_no}>
                    {p.output_url
                      ? <Image className="cst-cell__img" alt={`格${p.page_no}`} src={getUrl(p.output_url)} />
                      : <div className="cst-ph cst-ph--2x3">无底图</div>}
                    <div className="cst-cell__body">
                      <span className="cst-cell__tags"><Tag>第 {p.page_no} 格</Tag></span>
                      <span className="cst-cell__sub">{p.narration || p.dialogue || p.action}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Spin>
        <CharacterDetailModal
          open={!!detailChar}
          character={detailChar}
          onClose={() => setDetailCharId(null)}
          onRegen={regenBlock}
          onPick={(characterId, block, kind) => setPicker({ characterId, block, kind })}
          onClear={clearReference}
          onGenSheet={(characterId) => genSheet(characterId)}
          onToggleLock={toggleLock}
        />
        <BlockAssetPicker
          open={!!picker}
          characterId={picker?.characterId || ''}
          block={picker?.block || ''}
          blockLabel={BLOCK_LABELS[picker?.block || ''] || picker?.block || ''}
          kind={picker?.kind || 'open'}
          projectId={projectId}
          onClose={() => setPicker(null)}
          onApplied={async (assetId, referenceImage) => { if (picker) await applyReference(picker.characterId, picker.block, assetId, referenceImage); }}
        />
        <BlockAssetPicker
          open={posePicker !== null}
          characterId=""
          block=""
          blockLabel={`第 ${posePicker !== null ? (panels[posePicker]?.page_no ?? posePicker + 1) : 1} 格姿势图`}
          kind="pose"
          projectId={projectId}
          onClose={() => setPosePicker(null)}
          onApplied={(_assetId, imageUrl) => {
            if (posePicker !== null && imageUrl) patchPanel(posePicker, 'pose_ref', imageUrl);
            setPosePicker(null);
          }}
        />
      </div>
      </>
      ) : creating ? (
        <>
          <div className="cst-topbar">
            <div className="cst-topbar__lead">
              <Button shape="circle" icon={<ArrowLeftOutlined />} onClick={() => setCreating(false)} />
              <div className="cst-topbar__titles">
                <Title level={4} className="cst-topbar__title">新建漫画项目</Title>
                <span className="cst-topbar__sub">先定标题、风格与格数，大纲可让 AI 起草</span>
              </div>
            </div>
          </div>
          <div className="cst-panel cst-panel--narrow">
            {projectSetupForm}
          </div>
        </>
      ) : (
        <>
          <div className="cst-topbar">
            <div className="cst-topbar__lead">
              <Button shape="circle" icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')} />
              <div className="cst-topbar__titles">
                <Title level={4} className="cst-topbar__title">我的漫画项目</Title>
                <span className="cst-topbar__sub">共 {projects.length} 个项目，点开继续大纲 → 设定本 → 剧情图</span>
              </div>
            </div>
            <Button type="primary" className="cst-btn-new" icon={<PlusOutlined />} onClick={() => setCreating(true)}>新建项目</Button>
          </div>
          {projects.length === 0 ? (
            <div className="cst-stage">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有漫画项目" />
              <span className="cst-stage__hint">点右上角「新建项目」，先定标题、画风与格数</span>
              <Button type="primary" className="cst-btn-new" icon={<PlusOutlined />} onClick={() => setCreating(true)}>新建项目</Button>
            </div>
          ) : (
            <div className="cst-pgrid">
              {projects.map((p) => (
                <div className="cst-pcard" key={p.id} onClick={() => openProject(p.id)}>
                  <div className="cst-pcard__head">
                    <span className="cst-pcard__title">{p.title}</span>
                    <Tag className="cst-pcard__status" color={PROJECT_STATUS[p.status]?.color || 'default'}>{PROJECT_STATUS[p.status]?.label || p.status}</Tag>
                  </div>
                  <div className="cst-pcard__meta">
                    <span className="cst-pcard__row">画风：{p.style_mode === 'anime' ? '动漫' : '真人'}</span>
                    <span className="cst-pcard__row">分格：{p.panel_count || 0} 格</span>
                    {p.updated_at && <span className="cst-pcard__row">更新：{String(p.updated_at).slice(0, 16).replace('T', ' ')}</span>}
                  </div>
                  <Button type="primary" block className="cst-pcard__cta"
                    onClick={(e) => { e.stopPropagation(); openProject(p.id); }}>打开项目</Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** 角色详情弹窗：摘要卡片只放正面头像 + 名字 + 详情键，7 个图像块（4 必选 + 3 可选）集中在这里网格展示。
 *  character 由页面 characters state 派生，3s 轮询刷新时弹窗内容会同步更新。 */
function CharacterDetailModal(props: {
  open: boolean;
  character: any | null;
  onClose: () => void;
  onRegen: (characterId: string, block: string) => void;
  onPick: (characterId: string, block: string, kind: string) => void;
  onClear: (characterId: string, block: string) => void;
  onGenSheet: (characterId: string) => void;
  onToggleLock: (characterId: string, locked: boolean) => void;
}) {
  const { open, character: c, onClose, onRegen, onPick, onClear, onGenSheet, onToggleLock } = props;
  const done = doneRequired(c);
  const opt = doneOptional(c);
  const total = REQUIRED_KEYS.length;
  return (
    <Modal open={open && !!c} title={c ? `「${c.name}」· 角色设定本（必选 ${done}/${total} · 可选 ${opt}/${OPTIONAL_KEYS.length}）` : '角色设定本'}
      onCancel={onClose} width={1000} footer={null}>
      {c && (
        <>
          <div className="cst-digest">
            {c.sheet_url
              ? <Image className="cst-digest__sheet" alt="设定本拼版" src={getUrl(c.sheet_url)} width={72} height={72} preview={false} />
              : <div className="cst-ph cst-ph--72">拼版待齐</div>}
            <div className="cst-digest__main">
              <span className="cst-digest__text">4 个必选块齐了即自动拼版并解锁「锁定」。可选块不默认生成：点每块的「生成」单独生成，失败块用「重试生成」，生成后自动拼进设定本；已锁定后仍可重试可选块，必选块需先解锁。「应用大资产」的图片直接作为成品，0 生图 0 积分。</span>
              <div className="cst-digest__acts">
                <Button size="small" icon={<ReloadOutlined />} disabled={c.locked} onClick={() => onGenSheet(c.id)}>补生成必选块</Button>
                <Button size="small" icon={c.locked ? <UnlockOutlined /> : <LockOutlined />} disabled={!c.sheet_url}
                  onClick={() => onToggleLock(c.id, !c.locked)}>{c.locked ? '解锁' : '锁定'}</Button>
              </div>
            </div>
          </div>
          {/* 7 个图像块（4 必选 + 3 可选）：antd Card → 令牌块卡；可选块用虚线边框区分 */}
          <div className="cst-blocks">
            {BLOCK_KEYS.map((key) => {
              const b: any = (c.blocks || []).find((x: any) => x.key === key) || {};
              const st = blockStatus(b);
              const img = blockImage(b);
              const optional = OPTIONAL_KEYS.includes(key);
              // 锁定后身份基准（必选 4 块）不可动，但失败/未完成的可选块仍允许生成与替换
              const canEdit = !c.locked || optional;
              return (
                <div className="cst-block" key={key} data-optional={optional ? '1' : '0'}>
                  <div className="cst-block__head">
                    <span className="cst-block__title">{BLOCK_LABELS[key]}</span>
                    <Tag className="cst-block__state" color={STATUS_TAG[st]?.color}>{STATUS_TAG[st]?.label}</Tag>
                  </div>
                  {img
                    ? <Image className="cst-block__img" alt={BLOCK_LABELS[key]} src={getUrl(img)} />
                    : <div className="cst-ph cst-ph--1x1">暂无图像</div>}
                  <div className="cst-block__body">
                    <div className="cst-block__tags">
                      <Tag color={optional ? 'default' : 'blue'}>{optional ? '可选' : '必选'}</Tag>
                      {b.reference_asset_id ? <Tag color="purple">大资产</Tag> : null}
                      {b.source === 'generated' ? <Tag color="blue">已生成</Tag> : null}
                      {b.source === 'library' && !b.reference_asset_id ? <Tag color="geekblue">素材图</Tag> : null}
                      {b.error_msg ? <Tooltip title={b.error_msg}><Tag color="error">有错误</Tag></Tooltip> : null}
                    </div>
                    <div className="cst-block__acts">
                      <Button size="small" type="link" disabled={!canEdit} icon={<AppstoreOutlined />}
                        onClick={() => onPick(c.id, key, BLOCK_REF_TAG[key] || 'open')}>应用大资产</Button>
                      <Button size="small" type="link"
                        disabled={!canEdit || st === 'processing'} danger={st === 'failed'}
                        title={canEdit ? '生成会调用模型并消耗积分' : '请先解锁后再重生成必选块'}
                        icon={st === 'completed' || st === 'processing' ? <ReloadOutlined /> : <ThunderboltOutlined />}
                        onClick={() => onRegen(c.id, key)}>
                        {st === 'failed' ? '重试生成' : st === 'processing' ? '生成中…' : b.url ? '重生成' : '生成'}
                      </Button>
                      {b.reference_image && (
                        <Button size="small" type="link" danger disabled={!canEdit}
                          icon={<DeleteOutlined />} onClick={() => onClear(c.id, key)}>移除</Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}

/** 设定本块「应用大资产」挑选器：从大资产库(按 tag 过滤) 或 开源图鉴 选一张图，直接作为该块成品图 */
function BlockAssetPicker(props: {
  open: boolean; characterId: string; block: string; blockLabel: string; kind: string;
  projectId: number | null;
  onClose: () => void;
  onApplied: (assetId: number, referenceImage: string) => void;
}) {
  const { open, blockLabel, kind, projectId, onClose, onApplied } = props;
  const [tab, setTab] = useState('lib');
  const [lib, setLib] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(null); setTab('lib'); setCatalog(null); setLib([]);
    (async () => {
      setLoading(true);
      try {
        const [libRes, catRes] = await Promise.all([
          api.get(`/api/global-assets?tag=${kind}&limit=60`),
          api.get('/api/comic-studio/open-gallery'),
        ]);
        setLib(libRes.data.items || []);
        setCatalog(catRes.data);
      } catch { message.error('加载素材库失败'); }
      finally { setLoading(false); }
    })();
  }, [open, kind]);

  let catItems: any[] = [];
  if (catalog) {
    if (kind === 'costume') catItems = catalog.costumes || [];
    else if (kind === 'pose') catItems = catalog.poses || [];
    else catItems = (catalog.faces || []).filter((f: any) => f.kind === kind);
  }

  const thumbUrl = (u: string) => (u ? (u.startsWith('http') ? u : API_BASE + u) : '');

  const importAndApply = async (item: any) => {
    if (!projectId) return;
    setBusyId(item.id);
    try {
      const { data } = await api.post('/api/comic-studio/open-gallery/import', { url: item.full, id: item.id, kind: item.kind, title: item.title });
      onApplied(data.assetId, data.url);
      onClose();
    } catch (e: any) { message.error(e?.response?.data?.message || '导入失败'); }
    finally { setBusyId(null); }
  };

  const confirmLib = async () => {
    if (selected == null) { message.warning('请选择一张大资产图'); return; }
    const asset = lib.find((a) => a.id === selected);
    onApplied(selected, asset?.image_url || '');
    onClose();
  };

  return (
    <Modal open={open} title={`为「${blockLabel}」选择图像`} onCancel={onClose} width={780} zIndex={1200}
      okText="应用所选" okButtonProps={{ disabled: tab !== 'lib' || selected == null }}
      onOk={tab === 'lib' ? confirmLib : undefined}>
      {/* 挑选器网格：内联 gridStyle → .cst-pickgrid（5 列，超高滚动）；Tabs/接口/选择逻辑不动 */}
      <Tabs activeKey={tab} onChange={setTab} items={[
        {
          key: 'lib', label: '我的资产库',
          children: loading ? <div className="cst-modalstage"><Spin /></div> :
            lib.length ? (
              <div className="cst-pickgrid">
                {lib.map((a) => (
                  <div key={a.id} onClick={() => setSelected(a.id)}
                    className="cst-pick" data-on={selected === a.id ? '1' : '0'}>
                    <Image src={thumbUrl(a.image_url)} width="100%" height={90} style={{ objectFit: 'cover' }} preview={false} />
                    <div className="cst-pick__cap">{a.name}</div>
                  </div>
                ))}
              </div>
            ) : <Empty description="资产库还没有该类图像，去「开源图鉴」导入" />,
        },
        {
          key: 'open', label: '开源图鉴',
          children: loading ? <div className="cst-modalstage"><Spin /></div> :
            <div className="cst-pickgrid">
              {catItems.map((it: any) => (
                <div key={it.id} className="cst-pick__cell">
                  <Image src={thumbUrl(it.thumb || it.full)} width="100%" height={90} style={{ objectFit: 'cover' }} preview={false} />
                  <Button size="small" block loading={busyId === it.id} onClick={() => importAndApply(it)}>导入并应用</Button>
                </div>
              ))}
              {!catItems.length && <Empty description="该类别暂无开源图" />}
            </div>,
        },
      ]} />
    </Modal>
  );
}
