import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Form, Select, Input, Button, Card, Tag,
  message, Upload, Typography, Space, Image, Modal, Empty, Radio, Tooltip, Alert, Progress, Switch,
} from 'antd';
import { InboxOutlined, SendOutlined, ReloadOutlined, BulbOutlined, PictureOutlined, VideoCameraOutlined, SaveOutlined, CloseCircleOutlined, DeleteOutlined, RobotOutlined, CloseOutlined, LoadingOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { TextArea } = Input;
const { Dragger } = Upload;
const { Text } = Typography;
const API_BASE = import.meta.env.VITE_API_BASE || '';
const getUrl = (p: string | null) => p ? (p.startsWith('http') ? p : API_BASE + p) : '';

const RATIO_LABELS: Record<string, string> = {
  '9:16': '竖屏', '16:9': '横屏', '1:1': '方屏', '4:3': '传统', '3:4': '海报', '21:9': '超宽',
};

const IMAGE_PRESETS = [
  { label: '角色立绘', value: '一个全身角色形象，动态姿势，精致的服装细节，明亮的色彩，高品质，面部细节丰富，工作室灯光' },
  { label: '场景背景', value: '精致的场景背景，广角视角，环境细节丰富，氛围光影，色彩鲜明，高分辨率' },
  { label: '物品道具', value: '一个奇幻风格物品的特写，发光特效，精致设计，焦距清晰，细节丰富，居中构图' },
  { label: '战斗场面', value: '角色交战的动态场景，动作模糊，粒子特效，戏剧性光影，紧张氛围' },
  { label: '日常场景', value: '平静的日常生活场景，温暖的光线，柔和的色彩，舒适的氛围，背景细节丰富，日常风格' },
  { label: '风景全景', value: '令人惊叹的全景风景，壮丽的景色，丰富的色彩，大气透视，电影感构图' },
];

const VIDEO_PRESETS = [
  { label: '角色出场', value: '一个角色从右侧走入画面，镜头平滑跟随，戏剧性亮相，慢动作效果，电影感灯光' },
  { label: '动作打斗', value: '快节奏的动作场景，快速镜头切换，动态运动，打击特效，激烈的战斗编排' },
  { label: '场景推移', value: '镜头缓慢平移扫过环境细节，建立镜头，平滑过渡，氛围感，电影质感' },
  { label: '情感独白', value: '角色面部特写，背景柔焦，情感表情，镜头缓慢推进，亲密氛围' },
  { label: '追逐奔跑', value: '角色在环境中奔跑，手持镜头风格，动态运动，环境快速掠过，急促节奏' },
  { label: '转场过渡', value: '平滑的转场镜头，镜头飞过环境，无缝移动，电影感流畅，建立上下文' },
];

function PromptPresets({ presets, onSelect, smartGenerate, hasImages, smartPlan, prompt, smartPlanLoading }: {
  presets: typeof IMAGE_PRESETS;
  onSelect: (v: string) => void;
  smartGenerate?: () => void;
  hasImages?: boolean;
  smartPlan?: () => void;
  prompt?: string;
  smartPlanLoading?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <Button type="link" size="small" icon={<BulbOutlined />} onClick={() => setShow(!show)} style={{ padding: 0 }}>
        {show ? '收起' : '💡 快速模板'}
      </Button>
      {smartGenerate && (
        <Button
          type="link"
          size="small"
          icon={<RobotOutlined />}
          onClick={smartGenerate}
          disabled={!hasImages}
          title={hasImages ? '根据图片智能生成描述' : '请先上传或选择图片'}
        >
          🖼️ 根据图片描述
        </Button>
      )}
      {smartPlan && (
        <Button
          type="link"
          size="small"
          icon={smartPlanLoading ? <LoadingOutlined /> : <RobotOutlined />}
          onClick={smartPlan}
          loading={smartPlanLoading}
          disabled={smartPlanLoading || !prompt || prompt.trim().length < 2}
          title={!prompt || prompt.trim().length < 2 ? '请先输入创意描述' : 'AI 帮你扩展成详细视频描述'}
        >
          {smartPlanLoading ? '规划中...' : '✨ AI 智能规划'}
        </Button>
      )}
      {show && (
        <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6, width: '100%' }}>
          {presets.map((p) => (
            <Tag key={p.label} color="blue" style={{ cursor: 'pointer', padding: '2px 10px' }}
              onClick={() => onSelect(p.value)}>
              {p.label}
            </Tag>
          ))}
        </div>
      )}
    </div>
  );
}

// 相对时间（生成历史侧栏）
function timeAgo(value: string) {
  if (!value) return '';
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${Math.floor(diff / 86400000)}天前`;
}

const navBtnStyle = (disabled: boolean): React.CSSProperties => ({
  position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 40, height: 40,
  borderRadius: '50%', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)',
  backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 2px 8px rgba(0,0,0,0.3)', cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.3 : 1, color: '#fff', fontSize: 24, lineHeight: 1, fontFamily: 'system-ui',
});

export default function GeneratePage() {
  const [tabKey, setTabKey] = useState('text-to-image');
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  // 结果区轮播：本次会话提交的任务 id（最新在前），关闭即移除
  const [resultIds, setResultIds] = useState<number[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const navigate = useNavigate();
  const [uploadFileList, setUploadFileList] = useState<any[]>([]);
  const [saveModal, setSaveModal] = useState<{ visible: boolean; record: any; name: string; type: string; description: string; promptCn: string }>({ visible: false, record: null, name: '', type: 'character', description: '', promptCn: '' });
  // 预览弹窗（图片预览 / 视频预览，点击右侧历史或结果打开）
  const [preview, setPreview] = useState<{ task: any; item?: any } | null>(null);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [planLoading, setPlanLoading] = useState(false);
  const [creditRules, setCreditRules] = useState<any>(null);
  const [voiceList, setVoiceList] = useState<any[]>([]);

  const voiceOptions = voiceList.map((v: any) => ({
    label: `${v.name}（${v.gender === 'female' ? '女' : '男'}·${v.style}）`,
    value: v.id,
  }));

  const [assetTab, setAssetTab] = useState<'character' | 'scene' | 'prop'>('character');
  const [assetSource, setAssetSource] = useState<'upload' | 'library'>('library');
  const [globalAssets, setGlobalAssets] = useState<any[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [selectedLibraryAssets, setSelectedLibraryAssets] = useState<any[]>([]);
  const MAX_LIBRARY_ASSETS = 9;

  const [formTextToImage] = Form.useForm();
  const [formTextToVideo] = Form.useForm();
  const [formImageToVideo] = Form.useForm();

  // 使用 Form.useWatch 让 prompt 值变成响应式，按钮状态才能实时更新
  const promptTextToImage = Form.useWatch('prompt', formTextToImage) || '';
  const promptTextToVideo = Form.useWatch('prompt', formTextToVideo) || '';
  const promptImageToVideo = Form.useWatch('prompt', formImageToVideo) || '';

  // 预计扣费：文生图按张数、文生视频按时长×分辨率（需积分规则）
  const numImagesWatch = Form.useWatch('num_images', formTextToImage) || 1;
  const resolutionWatch = Form.useWatch('resolution', formTextToVideo) || '720p';
  const durationWatch = Form.useWatch('duration', formTextToVideo) || 5;
  const estimateCost = (mode: string): number | null => {
    if (!creditRules) return null;
    if (mode === 'text-to-image') return creditRules.image_per_image * numImagesWatch;
    const rateKey = resolutionWatch === '1080p' ? 'video_1080p_per_5s'
      : resolutionWatch === '480p' ? 'video_480p_per_5s' : 'video_720p_per_5s';
    const rate = creditRules[rateKey] || creditRules.video_720p_per_5s || 20;
    return rate * Math.ceil(durationWatch / (creditRules.video_unit_seconds || 5));
  };

  const fetchHistory = useCallback(async (page = 1) => {
    try {
      const { data } = await api.get('/api/generate/tasks', { params: { page, limit: 20 } });
      setHistory(data.items || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchHistory();
    api.get('/api/generate/credit-rules').then(({ data }) => setCreditRules(data)).catch(() => setCreditRules(null));
    api.get('/api/generate/tts-voices').then(({ data }) => setVoiceList(data || [])).catch(() => setVoiceList([]));
  }, [fetchHistory]);

  // 自动轮询：有 pending/processing 任务或正在提交时，每 3 秒静默刷新
  const hasActiveTask = history.some(r => r.status === 'pending' || r.status === 'processing');
  useEffect(() => {
    if (!hasActiveTask && !loading) return;
    const timer = setInterval(() => fetchHistory(), 3000);
    return () => clearInterval(timer);
  }, [hasActiveTask, loading, fetchHistory]);

  const fetchGlobalAssets = useCallback(async (type: string) => {
    setAssetsLoading(true);
    try {
      const { data } = await api.get('/api/global-assets', { params: { type, limit: 50 } });
      const items = data.items || data || [];
      setGlobalAssets(items.filter((a: any) => a.image_url));
    } catch {
      setGlobalAssets([]);
    }
    setAssetsLoading(false);
  }, []);

  useEffect(() => {
    if (assetSource === 'library') {
      fetchGlobalAssets(assetTab);
    }
  }, [assetSource, assetTab, fetchGlobalAssets]);

  // 预览弹窗多图左右键切换
  useEffect(() => {
    if (!preview) return;
    const task = preview.task;
    if (task?.type === 'image') {
      try {
        const d = JSON.parse(task.output_data || '[]');
        const arr = Array.isArray(d) ? d : [];
        if (arr.length <= 1) return;
        const onKey = (e: KeyboardEvent) => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); setPreviewIdx(i => Math.max(0, i - 1)); }
          if (e.key === 'ArrowRight') { e.preventDefault(); setPreviewIdx(i => Math.min(arr.length - 1, i + 1)); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      } catch { return; }
    }
  }, [preview]);

  const toggleLibraryAsset = (asset: any) => {
    const exists = selectedLibraryAssets.find((a: any) => a.id === asset.id);
    if (exists) {
      setSelectedLibraryAssets(selectedLibraryAssets.filter((a: any) => a.id !== asset.id));
    } else {
      if (selectedLibraryAssets.length >= MAX_LIBRARY_ASSETS) {
        message.warning(`最多只能选择${MAX_LIBRARY_ASSETS}张图片`);
        return;
      }
      setSelectedLibraryAssets([...selectedLibraryAssets, asset]);
    }
  };

  const removeLibraryAsset = (assetId: number) => {
    setSelectedLibraryAssets(selectedLibraryAssets.filter((a: any) => a.id !== assetId));
  };

  const clearLibraryAssets = () => {
    setSelectedLibraryAssets([]);
  };

  const generateSmartDescription = async (form: any, images: string[]) => {
    if (!images || images.length === 0) {
      message.warning('请先上传图片');
      return;
    }
    const hideLoading = message.loading('正在智能分析图片...', 0);
    try {
      const { data } = await api.post('/api/generate/smart-describe', { images });
      form.setFieldsValue({ prompt: data.description });
      hideLoading();
      message.success('描述生成成功！');
    } catch (err: any) {
      hideLoading();
      message.error(err.response?.data?.message || '智能描述生成失败');
    }
  };

  const generateSmartPlan = async (form: any, images: string[], mode: string = 'video') => {
    const prompt = form.getFieldValue('prompt') || '';
    if (!prompt || prompt.trim().length < 2) {
      message.warning('请先输入创意描述');
      return;
    }
    const style = form.getFieldValue('style') || 'realistic';
    const duration = form.getFieldValue('duration') || 5;
    const voiceoverType = form.getFieldValue('voiceover_type') || 'character';
    const loadingText = mode === 't2i' ? 'AI 正在规划图片描述...' : 'AI 正在规划视频描述...';
    const hideLoading = message.loading(loadingText, 0);
    setPlanLoading(true);
    try {
      const { data } = await api.post('/api/generate/smart-plan', {
        prompt,
        images: images.length > 0 ? images : undefined,
        mode,
        style,
        duration,
        voiceoverType,
      });
      const patch: any = { prompt: data.prompt };
      if (mode !== 't2i' && data.voiceover) {
        patch.voiceover_text = data.voiceover;
      }
      form.setFieldsValue(patch);
      hideLoading();
      setPlanLoading(false);
      message.success('智能规划完成！');
    } catch (err: any) {
      hideLoading();
      setPlanLoading(false);
      message.error(err.response?.data?.message || '智能规划失败');
    }
  };

  const doGenerate = async (url: string, body: any, form: any) => {
    setLoading(true);
    try {
      const { data } = await api.post(url, body);
      message.success('生成任务已提交');
      if (data?.taskId) {
        setResultIds(prev => [data.taskId, ...prev.filter(id => id !== data.taskId)].slice(0, 10));
      }
      form.resetFields();
      setUploadFileList([]);
      setSelectedLibraryAssets([]);
      fetchHistory();
    } catch (err: any) {
      message.error(err.response?.data?.message || '生成失败');
      fetchHistory();
    } finally {
      setLoading(false);
    }
  };

  const openSaveModal = (record: any) => {
    try {
      const data = JSON.parse(record.output_data || '{}');
      const url = data.url || data[0]?.url;
      const input = JSON.parse(record.input_data || '{}');
      const prompt = record.prompt || input.prompt || '';
      const defaultType = record.type === 'video' ? 'video' : 'character';
      setSaveModal({ visible: true, record: { ...record, _url: url }, name: prompt.slice(0, 50) || '', type: defaultType, description: '', promptCn: '' });
    } catch { message.error('无法获取生成结果'); }
  };

  const handleSaveToGlobal = async () => {
    try {
      const { record, name, type, description, promptCn } = saveModal;
      const input = JSON.parse(record.input_data || '{}');
      const prompt = record.prompt || input.prompt || '';
      const isVideo = type === 'video';
      const payload: any = {
        type, name, description: description || '', prompt, prompt_cn: promptCn || '',
        source_type: 'generate', tags: type,
      };
      if (isVideo) {
        payload.video_url = record._url;
        payload.image_url = null;
      } else {
        payload.image_url = record._url;
      }
      await api.post('/api/global-assets', payload);
      message.success('已保存到大资产库');
      setSaveModal({ visible: false, record: null, name: '', type: 'character', description: '', promptCn: '' });
    } catch (err: any) {
      message.error(err.response?.data?.message || '保存失败');
    }
  };

  const handleRetry = async (id: number) => {
    try {
      await api.post(`/api/generate/tasks/${id}/retry`);
      message.success('任务已重新提交');
      fetchHistory();
    } catch (err: any) {
      message.error(err.response?.data?.message || '重试失败');
    }
  };

  const handleDelete = (id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除后数据无法恢复！',
      okText: '确认',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.delete(`/api/generate/tasks/${id}`);
          message.success('删除成功');
          setResultIds(prev => prev.filter(x => x !== id));
          fetchHistory();
        } catch (err: any) {
          message.error(err.response?.data?.message || '删除失败');
        }
      },
    });
  };

  const videoResolutions = ['480p', '720p', '1080p'];
  const videoRatios = ['9:16', '16:9', '1:1', '4:3', '3:4', '21:9'];
  const videoDurations: number[] = [5, 10, 15];

  const uploadProps = {
    name: 'file',
    multiple: true,
    maxCount: MAX_LIBRARY_ASSETS,
    fileList: uploadFileList,
    onChange(info: any) {
      setUploadFileList(info.fileList.slice(-MAX_LIBRARY_ASSETS));
      const urls = info.fileList
        .filter((f: any) => f.status === 'done')
        .map((f: any) => f.response?.url || f.url);
      formImageToVideo.setFieldsValue({
        image_url: urls[0] || '',
        media: urls.map((url: string) => ({ type: 'image', url })),
      });
    },
    customRequest: async (options: any) => {
      const formData = new FormData();
      formData.append('file', options.file);
      try {
        const { data } = await api.post('/api/media/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        options.onSuccess(data);
      } catch (err: any) {
        options.onError(err);
      }
    },
    onRemove: (file: any) => {
      const newList = uploadFileList.filter((f: any) => f.uid !== file.uid);
      setUploadFileList(newList);
      const urls = newList
        .filter((f: any) => f.status === 'done')
        .map((f: any) => f.response?.url || f.url);
      formImageToVideo.setFieldsValue({
        image_url: urls[0] || '',
        media: urls.map((url: string) => ({ type: 'image', url })),
      });
    },
  };

  const i2vImageUrls = () => assetSource === 'library'
    ? selectedLibraryAssets.map((a: any) => getUrl(a.image_url))
    : uploadFileList.filter((f: any) => f.status === 'done').map((f: any) => f.response?.url || f.url);
  const i2vHasImages = () => assetSource === 'library'
    ? selectedLibraryAssets.length > 0
    : uploadFileList.some((f: any) => f.status === 'done');

  const renderForm = (mode: string) => {
    switch (mode) {
      case 'text-to-image':
        return (
          <Form form={formTextToImage} layout="vertical" onFinish={(v) => doGenerate('/api/generate/text-to-image', v, formTextToImage)}>
            <Form.Item name="prompt" label="描述" rules={[{ required: true, message: '请输入图片描述' }]}>
              <TextArea rows={3} placeholder="描述你想要生成的图片内容..." />
            </Form.Item>
            <PromptPresets
              presets={IMAGE_PRESETS}
              onSelect={(v) => formTextToImage.setFieldsValue({ prompt: v })}
              smartPlan={() => generateSmartPlan(formTextToImage, [], 't2i')}
              prompt={promptTextToImage}
              smartPlanLoading={planLoading}
            />
            <Space style={{ width: '100%' }} size={12} wrap>
              <Form.Item name="style" label="风格" initialValue="realistic" style={{ flex: '1 1 130px', minWidth: 0 }}>
                <Select style={{ width: '100%' }} options={[{ label: '🎨 动漫', value: 'anime' }, { label: '📷 写实', value: 'realistic' }]} />
              </Form.Item>
              <Form.Item name="num_images" label="数量" initialValue={1} style={{ flex: '1 1 90px', minWidth: 0 }}>
                <Select style={{ width: '100%' }} options={[1, 2, 4].map(n => ({ label: `${n} 张`, value: n }))} />
              </Form.Item>
              <Text style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: '32px', flex: '1 1 260px' }}>1张=单图 / 2张=正面+背面 / 4张=正面+背面+左侧+右侧</Text>
            </Space>
            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={loading} size="large">生成图片</Button>
              <Tag color="blue" style={{ marginLeft: 8 }}>自动分配模型</Tag>
              {estimateCost('text-to-image') !== null && (
                <Text style={{ color: 'var(--text-secondary)', fontSize: 12, marginLeft: 8 }}>
                  预计扣费 {estimateCost('text-to-image')} 积分
                </Text>
              )}
            </Form.Item>
          </Form>
        );

      case 'text-to-video':
        return (
          <Form form={formTextToVideo} layout="vertical" onFinish={(v) => doGenerate('/api/generate/text-to-video', v, formTextToVideo)}>
            <Form.Item name="prompt" label="描述" rules={[{ required: true, message: '请输入视频描述' }]}>
              <TextArea rows={3} placeholder="描述视频画面内容、动作、风格..." />
            </Form.Item>
            <PromptPresets
              presets={VIDEO_PRESETS}
              onSelect={(v) => formTextToVideo.setFieldsValue({ prompt: v })}
              smartPlan={() => generateSmartPlan(formTextToVideo, [], 't2v')}
              prompt={promptTextToVideo}
              smartPlanLoading={planLoading}
            />
            <Space style={{ width: '100%' }} size={12} wrap>
              <Form.Item name="resolution" label="分辨率" initialValue="720p" style={{ flex: '1 1 110px', minWidth: 0 }}>
                <Select style={{ width: '100%' }} options={videoResolutions.map((r: string) => ({ label: r, value: r }))} />
              </Form.Item>
              <Form.Item name="ratio" label="宽高比" initialValue="9:16" style={{ flex: '1 1 130px', minWidth: 0 }}>
                <Select style={{ width: '100%' }} options={videoRatios.map((r: string) => ({ label: `${r} ${RATIO_LABELS[r] || ''}`, value: r }))} />
              </Form.Item>
              <Form.Item name="duration" label="时长" initialValue={5} style={{ flex: '1 1 90px', minWidth: 0 }}>
                <Select style={{ width: '100%' }} options={videoDurations.map((d: number) => ({ label: `${d}秒`, value: d }))} />
              </Form.Item>
              <Form.Item name="style" label="风格" initialValue="realistic" style={{ flex: '1 1 100px', minWidth: 0 }}>
                <Select style={{ width: '100%' }} options={[{ label: '🎨 动漫', value: 'anime' }, { label: '📷 写实', value: 'realistic' }]} />
              </Form.Item>
            </Space>
            <Form.Item name="voiceover" label="配音" valuePropName="checked" initialValue={true}>
              <Switch checkedChildren="开" unCheckedChildren="关" />
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.voiceover !== cur.voiceover}>
              {({ getFieldValue }) => getFieldValue('voiceover') !== false && (
                <>
                  <Form.Item name="voiceover_type" label="配音类型" initialValue="character">
                    <Radio.Group>
                      <Radio.Button value="character">🎭 角色台词</Radio.Button>
                      <Radio.Button value="narration">📢 旁白解说</Radio.Button>
                    </Radio.Group>
                  </Form.Item>
                  <Form.Item name="tts_voice" label="音色" initialValue="longxiaochun" style={{ maxWidth: 360 }}>
                    <Select style={{ width: '100%' }} options={voiceOptions} placeholder="选择音色" />
                  </Form.Item>
                  <Form.Item name="voiceover_text" label="配音内容（可留空）">
                    <TextArea rows={2} placeholder="留空时：点击「AI 智能规划」自动生成所选类型的台词或旁白；不规划则朗读提示词" />
                  </Form.Item>
                </>
              )}
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={loading} size="large">生成视频</Button>
              <Tag color="blue" style={{ marginLeft: 8 }}>自动分配T2V模型</Tag>
              {estimateCost('text-to-video') !== null && (
                <Text style={{ color: 'var(--text-secondary)', fontSize: 12, marginLeft: 8 }}>
                  预计扣费 {estimateCost('text-to-video')} 积分
                </Text>
              )}
            </Form.Item>
          </Form>
        );

      case 'image-to-video':
        return (
          <Form form={formImageToVideo} layout="vertical" onFinish={(v) => {
            const payload = { ...v };
            if (assetSource === 'library') {
              const media = selectedLibraryAssets.map((a: any) => ({ type: 'image', url: a.image_url }));
              payload.media = media;
              payload.image_url = media[0]?.url || '';
            }
            doGenerate('/api/generate/image-to-video', payload, formImageToVideo);
          }}>
            <Form.Item name="image_url" hidden>
              <Input />
            </Form.Item>

            <Form.Item label="图片来源" style={{ marginBottom: 8 }}>
              <Radio.Group value={assetSource} onChange={(e) => {
                setAssetSource(e.target.value);
                formImageToVideo.setFieldsValue({ image_url: '', media: [] });
                setUploadFileList([]);
                setSelectedLibraryAssets([]);
              }}>
                <Radio.Button value="library">📚 大资产库</Radio.Button>
                <Radio.Button value="upload">📁 本地上传</Radio.Button>
              </Radio.Group>
            </Form.Item>

            {assetSource === 'library' ? (
              <Form.Item style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space>
                    <Tag color="blue">{selectedLibraryAssets.length}/{MAX_LIBRARY_ASSETS}张图片</Tag>
                    {selectedLibraryAssets.length > 0 && (
                      <Button type="link" size="small" onClick={clearLibraryAssets}>
                        <DeleteOutlined /> 清空
                      </Button>
                    )}
                  </Space>
                </div>

                {selectedLibraryAssets.length > 0 && (
                  <div style={{ marginBottom: 12, padding: 8, background: 'var(--primary-bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <Text style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 4, display: 'block' }}>已选择的资产：</Text>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {selectedLibraryAssets.map((asset: any) => (
                        <div key={asset.id} style={{ position: 'relative' }}>
                          <Image
                            src={getUrl(asset.image_url)}
                            width={50}
                            height={50}
                            style={{ objectFit: 'cover', borderRadius: 4 }}
                            preview={false}
                          />
                          <Tooltip title="取消选择">
                            <CloseCircleOutlined
                              onClick={() => removeLibraryAsset(asset.id)}
                              style={{
                                position: 'absolute',
                                top: -4,
                                right: -4,
                                fontSize: 16,
                                color: 'var(--danger)',
                                cursor: 'pointer',
                                background: 'var(--bg)',
                                borderRadius: '50%'
                              }}
                            />
                          </Tooltip>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Card size="small" style={{ background: 'var(--bg-secondary)', border: '1px dashed var(--border)' }}>
                  <div style={{ marginBottom: 8 }}>
                    <Tag color={assetTab === 'character' ? 'blue' : 'default'} style={{ cursor: 'pointer' }} onClick={() => setAssetTab('character')}>👤 人物</Tag>
                    <Tag color={assetTab === 'scene' ? 'blue' : 'default'} style={{ cursor: 'pointer' }} onClick={() => setAssetTab('scene')}>🌄 场景</Tag>
                    <Tag color={assetTab === 'prop' ? 'blue' : 'default'} style={{ cursor: 'pointer' }} onClick={() => setAssetTab('prop')}>📦 道具</Tag>
                  </div>
                  {assetsLoading ? (
                    <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>加载中...</div>
                  ) : globalAssets.length === 0 ? (
                    <Empty description={`暂无${assetTab === 'character' ? '人物' : assetTab === 'scene' ? '场景' : '道具'}资产`} style={{ padding: 20 }} />
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                      {globalAssets.map((asset) => {
                        const imgUrl = getUrl(asset.image_url);
                        const isSelected = selectedLibraryAssets.some((a: any) => a.id === asset.id);
                        return (
                          <div
                            key={asset.id}
                            onClick={() => toggleLibraryAsset(asset)}
                            style={{
                              cursor: 'pointer',
                              border: isSelected ? '2px solid var(--primary)' : '2px solid transparent',
                              borderRadius: 12,
                              overflow: 'hidden',
                              transition: 'all 0.2s',
                              background: isSelected ? 'var(--primary-bg)' : 'var(--bg)',
                              padding: 4,
                              opacity: isSelected ? 1 : (selectedLibraryAssets.length >= MAX_LIBRARY_ASSETS ? 0.5 : 1),
                            }}
                          >
                            <Image
                              src={imgUrl}
                              alt={asset.name}
                              width={92}
                              height={92}
                              style={{ objectFit: 'cover', borderRadius: 4 }}
                              preview={false}
                            />
                            <div style={{ fontSize: 11, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                              {asset.name}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </Form.Item>
            ) : (
              <Form.Item style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 8 }}>
                  <Tag color="blue">{uploadFileList.length}/{MAX_LIBRARY_ASSETS}张图片</Tag>
                </div>
                <Dragger {...uploadProps} listType="picture">
                  <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                  <p className="ant-upload-text">点击或拖拽上传参考图片（最多{MAX_LIBRARY_ASSETS}张）</p>
                  <p className="ant-upload-hint">支持 JPG / PNG，建议使用角色图或场景图</p>
                </Dragger>
              </Form.Item>
            )}

            <Form.Item name="prompt" label="描述" rules={[{ required: true, message: '请输入描述' }]}>
              <TextArea rows={2} placeholder="描述角色的动作或镜头运动..." />
            </Form.Item>
            <div style={{ marginBottom: 8 }}>
              <PromptPresets
                presets={VIDEO_PRESETS}
                onSelect={(v) => formImageToVideo.setFieldsValue({ prompt: v })}
                smartGenerate={() => generateSmartDescription(formImageToVideo, i2vImageUrls())}
                hasImages={i2vHasImages()}
                smartPlan={() => generateSmartPlan(formImageToVideo, i2vImageUrls(), 'i2v')}
                prompt={promptImageToVideo}
                smartPlanLoading={planLoading}
              />
            </div>
            <Space style={{ width: '100%' }} size={12} wrap>
              <Form.Item name="resolution" label="分辨率" initialValue="720p" style={{ flex: '1 1 110px', minWidth: 0 }}>
                <Select style={{ width: '100%' }} options={videoResolutions.map((r: string) => ({ label: r, value: r }))} />
              </Form.Item>
              <Form.Item name="ratio" label="宽高比" initialValue="9:16" style={{ flex: '1 1 130px', minWidth: 0 }}>
                <Select style={{ width: '100%' }} options={videoRatios.map((r: string) => ({ label: `${r} ${RATIO_LABELS[r] || ''}`, value: r }))} />
              </Form.Item>
              <Form.Item name="duration" label="时长" initialValue={5} style={{ flex: '1 1 90px', minWidth: 0 }}>
                <Select style={{ width: '100%' }} options={videoDurations.map((d: number) => ({ label: `${d}秒`, value: d }))} />
              </Form.Item>
              <Form.Item name="style" label="风格" initialValue="realistic" style={{ flex: '1 1 100px', minWidth: 0 }}>
                <Select style={{ width: '100%' }} options={[{ label: '🎨 动漫', value: 'anime' }, { label: '📷 写实', value: 'realistic' }]} />
              </Form.Item>
            </Space>
            <Form.Item name="voiceover" label="配音" valuePropName="checked" initialValue={true}>
              <Switch checkedChildren="开" unCheckedChildren="关" />
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.voiceover !== cur.voiceover}>
              {({ getFieldValue }) => getFieldValue('voiceover') !== false && (
                <Form.Item name="voiceover_text" label="配音内容（可留空，默认朗读提示词）">
                  <TextArea rows={2} placeholder="例如：这是关于角色的一段故事..." />
                </Form.Item>
              )}
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={loading} size="large">生成视频</Button>
              <Tag color="blue" style={{ marginLeft: 8 }}>自动分配{selectedLibraryAssets.length > 1 ? 'R2V' : 'I2V'}模型</Tag>
            </Form.Item>
          </Form>
        );

      case 'image-merge':
        return (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
            <Text strong style={{ fontSize: 16 }}>多图合并</Text>
            <div style={{ marginTop: 8 }}>功能开发中，敬请期待</div>
          </div>
        );
      default:
        return null;
    }
  };

  const statusText: Record<string, string> = {
    pending: '排队中', processing: '生成中', completed: '已完成', failed: '失败',
  };
  const statusColor: Record<string, string> = {
    pending: 'default', processing: 'processing', completed: 'success', failed: 'error',
  };

  const resultRecords = resultIds
    .map(id => history.find(h => h.id === id))
    .filter(Boolean) as any[];

  // 轮播页：completed 图片任务按张数逐张展开，其余任务一任务一页
  const resultPages: any[] = resultRecords.flatMap((task: any) => {
    if (task.status === 'completed' && task.type === 'image') {
      try {
        const d = JSON.parse(task.output_data || 'null');
        const items = Array.isArray(d) ? d : [];
        if (items.length > 0) {
          return items.map((item: any, i: number) => ({ task, item, key: `p-${task.id}-${i}` }));
        }
      } catch { /* fallthrough */ }
    }
    return [{ task, item: null, key: `p-${task.id}` }];
  });

  useEffect(() => {
    if (resultPages.length === 0) {
      if (currentIdx !== 0) setCurrentIdx(0);
    } else if (currentIdx > resultPages.length - 1) {
      setCurrentIdx(resultPages.length - 1);
    }
  }, [resultPages.length, currentIdx]);

  const inputOf = (task: any) => {
    try { return JSON.parse(task.input_data || '{}'); } catch { return {}; }
  };
  const promptOf = (task: any) => {
    const input = inputOf(task);
    return (input.prompt || '').trim().slice(0, 40) || (task.type === 'image' ? '文生图' : '视频生成');
  };
  const briefOf = (task: any) => {
    const input = inputOf(task);
    const styleText = input.style === 'anime' ? '动漫' : '写实';
    return task.type === 'image'
      ? `${styleText} · ${input.num_images || 1}张`
      : `${styleText} · ${input.resolution || '720p'} · ${input.ratio || '9:16'} · ${input.duration || 5}秒`;
  };
  const videoUrlOf = (task: any) => {
    try {
      const o = JSON.parse(task.output_data || 'null');
      return o?.url ? getUrl(o.url) : '';
    } catch { return ''; }
  };

  const closeCurrent = () => {
    const task = resultPages[currentIdx]?.task;
    if (!task) return;
    setResultIds(prev => prev.filter(x => x !== task.id));
    // 若移除的是最后一页，索引同步回退，避免重渲染越界
    setCurrentIdx(i => Math.min(i, resultPages.length - 2));
  };

  const renderResultPage = (page: any) => {
    const task = page.task;
    if (task.status === 'pending') {
      return (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
          <LoadingOutlined style={{ fontSize: 22, marginRight: 8 }} />排队等待中，稍后自动开始生成…
        </div>
      );
    }
    if (task.status === 'processing') {
      return (
        <div style={{ padding: '20px 24px' }}>
          <Progress percent={task.progress || 5} status="active" />
          <Text style={{ color: 'var(--text-secondary)', fontSize: 12 }}>生成中，请稍候…（视频通常需要 1~3 分钟）</Text>
        </div>
      );
    }
    if (task.status === 'failed') {
      return (
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <Alert type="error" showIcon message="生成失败" description={task.error_msg || '未知错误'} style={{ marginBottom: 12 }} />
          <Space size={8}>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => handleRetry(task.id)}>重试</Button>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(task.id)}>删除</Button>
          </Space>
        </div>
      );
    }
    if (page.item) {
      return (
        <Image
          src={getUrl(page.item.url)}
          style={{ maxHeight: 360, maxWidth: '100%', borderRadius: 8 }}
          preview={{ src: getUrl(page.item.url) }}
        />
      );
    }
    const videoUrl = videoUrlOf(task);
    return videoUrl ? (
      <video
        src={videoUrl}
        controls
        playsInline
        preload="metadata"
        style={{ maxHeight: 360, maxWidth: '100%', borderRadius: 8, background: '#000' }}
      />
    ) : (
      <Empty description="暂无结果文件" style={{ padding: 30 }} />
    );
  };

  // 点击右侧历史项：已完成的任务打开预览弹窗
  const openPreviewFromHistory = (task: any) => {
    if (task.status !== 'completed') return;
    let item: any = undefined;
    if (task.type === 'image') {
      try {
        const d = JSON.parse(task.output_data || '[]');
        const arr = Array.isArray(d) ? d : [];
        if (arr.length > 0) item = arr[0];
      } catch { /* ignore */ }
    }
    setPreviewIdx(0);
    setPreview({ task, item });
  };

  const tabItems = [
    { key: 'text-to-image', label: '📝 文字生图片' },
    { key: 'text-to-video', label: '🎬 文字生视频' },
    { key: 'image-to-video', label: '🖼 图片生视频' },
    { key: 'image-merge', label: '🔀 多图合并' },
  ];
  const sidebarItems = history.slice(0, 10);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab 标签行 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: isMobile ? 0 : 16, marginBottom: 16,
        borderBottom: '1px solid var(--border)', paddingBottom: 0, flexShrink: 0,
        overflowX: isMobile ? 'auto' : undefined,
      }}>
        {tabItems.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTabKey(t.key)}
            style={{
              border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
              padding: isMobile ? '10px 4px' : '12px 12px', fontSize: isMobile ? 12 : 14,
              lineHeight: '22px', marginBottom: -1, whiteSpace: 'nowrap',
              flex: isMobile ? '1 1 0' : undefined,
              color: tabKey === t.key ? 'var(--primary)' : 'var(--text-secondary)',
              fontWeight: tabKey === t.key ? 600 : 400,
              borderBottom: tabKey === t.key ? '2px solid var(--primary)' : '2px solid transparent',
              transition: 'color 0.2s, border-color 0.2s',
            }}
          >{t.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flex: 1, gap: 0, overflow: 'hidden' }}>
        {/* 左侧：积分规则 + 表单 + 生成结果 */}
        <div style={{
          width: '75%', overflowY: 'auto', padding: '0 24px 24px 0',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          {creditRules && (
            <Alert
              type="info"
              showIcon
              style={{
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: 10, marginBottom: 0,
              }}
              message={<span style={{ color: 'var(--text)', fontSize: 13 }}>积分扣费规则</span>}
              description={
                <Space orientation="vertical" size={4}>
                  <Text style={{ color: 'var(--text-secondary)', fontSize: 12 }}>📝 文字生图片：{creditRules.image_per_image} 积分 / 张</Text>
                  <Text style={{ color: 'var(--text-secondary)', fontSize: 12 }}>🎬 文字生视频 / 🖼 图片生视频：480p = {creditRules.video_480p_per_5s} 积分、720p = {creditRules.video_720p_per_5s} 积分、1080p = {creditRules.video_1080p_per_5s} 积分 / 每 {creditRules.video_unit_seconds} 秒（不足 {creditRules.video_unit_seconds} 秒按 {creditRules.video_unit_seconds} 秒计，时长按每 {creditRules.video_unit_seconds} 秒叠加）</Text>
                  <Text style={{ color: 'var(--text-secondary)', fontSize: 12 }}>🔄 生成失败自动全额退还积分；提交时预扣，成功后不再重复扣费</Text>
                  <div style={{ marginTop: 4, padding: '8px 10px', background: 'rgba(250,173,20,0.08)', borderRadius: 6, border: '1px solid rgba(250,173,20,0.2)' }}>
                    <Text style={{ color: 'var(--warning, #d48806)', fontSize: 12, fontWeight: 600 }}>⚠️ 生成限制说明</Text>
                    <ul style={{ margin: '4px 0 0 0', paddingLeft: 16, color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.8 }}>
                      <li><b>时长</b>：可选 5/10/15 秒，但受模型限制——部分模型仅支持 5 秒，系统会自动选择最合适的模型；若支持长秒数的模型不可用（如免费额度用完），可能降级为 5 秒生成</li>
                      <li><b>宽高比</b>：可选 9:16（竖屏）/ 16:9（横屏）等，但受模型限制——部分模型不支持所有比例，系统会优先匹配支持所选比例的模型；若无匹配模型，可能使用默认比例生成</li>
                      <li><b>免费额度</b>：AI 模型有免费调用额度，额度用完后需等待刷新或充值，期间可能使用备选模型（能力和参数可能有差异）</li>
                    </ul>
                  </div>
                </Space>
              }
            />
          )}

          {/* 表单卡（4 个 Tab 面板 display 切换） */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: tabKey === 'text-to-image' ? 'block' : 'none' }}>{renderForm('text-to-image')}</div>
            <div style={{ display: tabKey === 'text-to-video' ? 'block' : 'none' }}>{renderForm('text-to-video')}</div>
            <div style={{ display: tabKey === 'image-to-video' ? 'block' : 'none' }}>{renderForm('image-to-video')}</div>
            <div style={{ display: tabKey === 'image-merge' ? 'block' : 'none' }}>{renderForm('image-merge')}</div>
          </div>

          {/* 生成结果 */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text strong style={{ fontSize: 14, color: 'var(--text)' }}>生成结果</Text>
              {resultPages.length > 0 && (
                <Text style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{currentIdx + 1} / {resultPages.length}</Text>
              )}
            </div>
            {resultPages.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                提交生成任务后，此处实时展示生成进度与结果
              </div>
            ) : (
              <div>
                <div style={{ background: 'var(--bg-secondary)', minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                  <Button
                    shape="circle"
                    icon={<LeftOutlined />}
                    disabled={currentIdx === 0}
                    onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
                    style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 10 }}
                  />
                  <Button
                    shape="circle"
                    icon={<RightOutlined />}
                    disabled={currentIdx >= resultPages.length - 1}
                    onClick={() => setCurrentIdx(i => Math.min(resultPages.length - 1, i + 1))}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 10 }}
                  />
                  <Button
                    type="text"
                    size="small"
                    icon={<CloseOutlined />}
                    onClick={closeCurrent}
                    style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, color: 'var(--text-muted)' }}
                    title="从结果区移除"
                  />
                  <div style={{ padding: '24px 56px', width: '100%', textAlign: 'center' }}>
                    {resultPages[currentIdx] ? renderResultPage(resultPages[currentIdx]) : null}
                  </div>
                </div>
                {resultPages[currentIdx] && (() => {
                  const task = resultPages[currentIdx].task;
                  const item = resultPages[currentIdx].item;
                  const isImage = task.type === 'image';
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                      <Tag icon={isImage ? <PictureOutlined /> : <VideoCameraOutlined />} style={{ margin: 0 }}>{isImage ? '图片' : '视频'}</Tag>
                      <Tag color={statusColor[task.status] || 'default'} style={{ margin: 0 }}>{statusText[task.status] || task.status}</Tag>
                      {item?.view && <Tag color="blue" style={{ margin: 0 }}>{item.view}</Tag>}
                      <Text style={{ color: 'var(--text-secondary)', flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 120 }} title={promptOf(task)}>{promptOf(task)}</Text>
                      <Text style={{ color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap' }}>{briefOf(task)}</Text>
                      <Space size={4}>
                        {task.status === 'completed' && (
                          <Button size="small" icon={<SaveOutlined />} onClick={() => openSaveModal(task)}>保存</Button>
                        )}
                        {task.status === 'failed' && (
                          <Button size="small" icon={<ReloadOutlined />} onClick={() => handleRetry(task.id)}>重试</Button>
                        )}
                        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(task.id)}>删除</Button>
                      </Space>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {/* 右侧：生成历史侧栏 */}
        <div style={{ width: '25%', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <Text strong style={{ fontSize: 13 }}>生成历史</Text>
            <Text style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{sidebarItems.length}条</Text>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
            {sidebarItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: 12 }}>暂无生成记录</div>
            ) : sidebarItems.map((task: any) => {
              const isImage = task.type === 'image';
              const title = (inputOf(task).prompt || '').trim().slice(0, 30) || (isImage ? '文生图' : '视频生成');
              const dot = task.status === 'completed' ? 'done'
                : (task.status === 'processing' || task.status === 'pending') ? 'active'
                : task.status === 'failed' ? 'fail' : '';
              const inResults = resultIds.includes(task.id);
              return (
                <div
                  key={task.id}
                  onClick={() => openPreviewFromHistory(task)}
                  style={{
                    display: 'flex', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                    background: inResults ? 'var(--primary-bg, #f5f0ff)' : 'transparent', marginBottom: 2,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!inResults) e.currentTarget.style.background = 'var(--hover, #f5f5f5)'; }}
                  onMouseLeave={(e) => { if (!inResults) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 6, flexShrink: 0, overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                    background: isImage ? 'linear-gradient(135deg, #7c3aed33, #22c55e33)' : 'linear-gradient(135deg, #ec489933, #f59e0b33)',
                  }}>
                    {isImage ? '🎨' : '🎬'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {title}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {isImage ? '文生图' : '文生视频'} · {timeAgo(task.created_at)}
                    </div>
                  </div>
                  {dot && (
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                      background: dot === 'done' ? '#22c55e' : dot === 'active' ? 'var(--primary)' : '#ef4444',
                      animation: dot === 'active' ? 'pulse 1.5s infinite' : undefined,
                    }} />
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', textAlign: 'center', flexShrink: 0 }}>
            <a onClick={() => navigate('/generate/history')} style={{ fontSize: 12, color: 'var(--primary)', cursor: 'pointer' }}>
              查看全部 →
            </a>
          </div>
        </div>
      </div>

      <Modal title="保存到大资产库" open={saveModal.visible}
        onOk={handleSaveToGlobal} onCancel={() => setSaveModal({ visible: false, record: null, name: '', type: 'character', description: '', promptCn: '' })}
        okText="保存" cancelText="取消" width={520}>
        <Space orientation="vertical" style={{ width: '100%' }} size={12}>
          <div>
            <Text style={{ display: 'block', marginBottom: 4 }}>资产类型</Text>
            <Select value={saveModal.type} onChange={(v) => setSaveModal(prev => ({ ...prev, type: v }))}
              style={{ width: '100%' }} options={[
                { label: '🎭 人物', value: 'character' },
                { label: '📦 物品', value: 'prop' },
                { label: '🌄 场景', value: 'scene' },
                { label: '🎬 视频', value: 'video' },
              ]} />
          </div>
          <div>
            <Text style={{ display: 'block', marginBottom: 4 }}>资产名称</Text>
            <Input value={saveModal.name} onChange={(e) => setSaveModal(prev => ({ ...prev, name: e.target.value }))}
              placeholder="输入资产名称" />
          </div>
          <div>
            <Text style={{ display: 'block', marginBottom: 4 }}>描述（可选）</Text>
            <Input.TextArea rows={2} value={saveModal.description}
              onChange={(e) => setSaveModal(prev => ({ ...prev, description: e.target.value }))}
              placeholder="人物定位、场景作用或物品用途" />
          </div>
          <div>
            <Text style={{ display: 'block', marginBottom: 4 }}>中文提示词描述（可选）</Text>
            <Input.TextArea rows={3} value={saveModal.promptCn}
              onChange={(e) => setSaveModal(prev => ({ ...prev, promptCn: e.target.value }))}
              placeholder="用中文描述该资产的画面表现" />
          </div>
          {saveModal.record?._url && (
            <div>
              <Text style={{ display: 'block', marginBottom: 4 }}>预览</Text>
              {saveModal.record.type === 'image'
                ? <Image src={saveModal.record._url} style={{ maxWidth: 200, borderRadius: 4 }} />
                : <video src={saveModal.record._url} controls playsInline preload="metadata" style={{ maxWidth: 200, borderRadius: 4 }} />
              }
            </div>
          )}
        </Space>
      </Modal>

      {/* 预览弹窗（点击右侧历史打开） */}
      <Modal
        title={preview ? (preview.task.type === 'image' ? '图片预览' : '视频预览') : '预览'}
        open={!!preview}
        onCancel={() => setPreview(null)}
        footer={null}
        width={preview?.task.type === 'image' ? 640 : 720}
        centered
        destroyOnClose
      >
        {preview && (() => {
          const task = preview.task;
          const isImage = task.type === 'image';
          const input = inputOf(task);
          let outputs: any[] = [];
          if (isImage) {
            try {
              const d = JSON.parse(task.output_data || '[]');
              outputs = Array.isArray(d) ? d : [];
            } catch { /* ignore */ }
          }
          const cur = outputs[previewIdx] || outputs[0];
          const src = isImage ? (cur ? getUrl(cur.url) : '') : videoUrlOf(task);
          const count = outputs.length;
          return (
            <div>
              {isImage ? (
                <div style={{
                  position: 'relative', textAlign: 'center', background: '#000', borderRadius: 8,
                  padding: '12px 48px', minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {count > 1 && (
                    <button
                      aria-label="上一张"
                      disabled={previewIdx <= 0}
                      onClick={() => setPreviewIdx(i => Math.max(0, i - 1))}
                      style={{ ...navBtnStyle(previewIdx <= 0), left: 10 }}
                    >‹</button>
                  )}
                  {src ? (
                    <Image src={src} style={{ maxHeight: 400, borderRadius: 4 }} preview={false} />
                  ) : (
                    <Empty description="暂无图片" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  )}
                  {count > 1 && (
                    <button
                      aria-label="下一张"
                      disabled={previewIdx >= count - 1}
                      onClick={() => setPreviewIdx(i => Math.min(count - 1, i + 1))}
                      style={{ ...navBtnStyle(previewIdx >= count - 1), right: 10 }}
                    >›</button>
                  )}
                  {count > 1 && (
                    <div style={{
                      position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                      background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, padding: '2px 10px', borderRadius: 10,
                    }}>{previewIdx + 1} / {count}</div>
                  )}
                </div>
              ) : (
                <video src={src} controls playsInline preload="auto" autoPlay muted
                  style={{ width: '100%', borderRadius: 8, background: '#000' }} />
              )}
              <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-secondary, #f5f5f5)', borderRadius: 8 }}>
                <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <Text style={{ color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}>描述</Text>
                    <Text style={{ color: 'var(--text)', fontSize: 12, flex: 1 }}>{input.prompt || '-'}</Text>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {isImage ? (
                      <>
                        <Tag color="blue" style={{ margin: 0 }}>{input.style === 'anime' ? '动漫' : '写实'}</Tag>
                        <Tag color="blue" style={{ margin: 0 }}>{input.num_images || 1} 张</Tag>
                      </>
                    ) : (
                      <>
                        <Tag color="blue" style={{ margin: 0 }}>{input.resolution || '720p'}</Tag>
                        <Tag color="blue" style={{ margin: 0 }}>{RATIO_LABELS[input.ratio || '9:16'] || input.ratio || '9:16'}</Tag>
                        <Tag color="blue" style={{ margin: 0 }}>{input.duration || 5} 秒</Tag>
                        <Tag color="blue" style={{ margin: 0 }}>{input.style === 'anime' ? '动漫' : '写实'}</Tag>
                      </>
                    )}
                  </div>
                </Space>
              </div>
            </div>
          );
        })()}
      </Modal>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}
