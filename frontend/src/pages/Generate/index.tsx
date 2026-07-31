import { useState, useEffect, useCallback } from 'react';
import {
  Tabs, Form, Select, Input, Button, Card, Table, Tag,
  message, Upload, Typography, Space, Image, Modal, Empty, Radio, Tooltip,
} from 'antd';
import { InboxOutlined, SendOutlined, ReloadOutlined, BulbOutlined, PictureOutlined, VideoCameraOutlined, SaveOutlined, PlayCircleFilled, UserOutlined, EnvironmentOutlined, AppstoreOutlined, CloseCircleOutlined, DeleteOutlined, RobotOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { TextArea } = Input;
const { Dragger } = Upload;
const { Title, Text } = Typography;
const API_BASE = 'http://localhost:3000';
const getUrl = (p: string | null) => p ? (p.startsWith('http') ? p : API_BASE + p) : '';

const RATIO_LABELS: Record<string, string> = {
  '9:16': '竖屏', '16:9': '横屏', '1:1': '方屏', '4:3': '传统', '3:4': '海报', '21:9': '超宽',
};

const IMAGE_PRESETS = [
  { label: '角色立绘', value: '一个动漫风格的全身角色立绘，动态姿势，精致的服装细节，明亮的色彩，干净的线条，高品质，面部细节丰富，工作室灯光' },
  { label: '场景背景', value: '动漫风格的场景背景，广角视角，环境细节丰富，氛围光影，色彩鲜明，高分辨率' },
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

function PromptPresets({ presets, onSelect, smartGenerate, hasImages, smartPlan, prompt }: { 
  presets: typeof IMAGE_PRESETS; 
  onSelect: (v: string) => void;
  smartGenerate?: () => void;
  hasImages?: boolean;
  smartPlan?: () => void;
  prompt?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <Button type="link" size="small" icon={<BulbOutlined />} onClick={() => setShow(!show)} style={{ padding: 0 }}>
        {show ? '收起提示词模板' : '💡 快速模板'}
      </Button>
      {smartGenerate && (
        <Button 
          type="link" 
          size="small" 
          icon={<RobotOutlined />}
          onClick={smartGenerate}
          disabled={!hasImages}
          title={!hasImages ? '请先上传或选择图片' : '根据图片智能生成描述'}
        >
          🖼️ 根据图片描述
        </Button>
      )}
      {smartPlan && (
        <Button 
          type="link" 
          size="small" 
          icon={<RobotOutlined />}
          onClick={smartPlan}
          disabled={!prompt || prompt.trim().length < 2}
          title={!prompt || prompt.trim().length < 2 ? '请先输入创意描述' : 'AI 帮你扩展成详细视频描述'}
        >
          ✨ AI 智能规划
        </Button>
      )}
      {show && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, width: '100%' }}>
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

export default function GeneratePage() {
  const [tabKey, setTabKey] = useState('text-to-image');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [uploadFileList, setUploadFileList] = useState<any[]>([]);
  const [saveModal, setSaveModal] = useState<{ visible: boolean; record: any; name: string; type: string; description: string; promptCn: string }>({ visible: false, record: null, name: '', type: 'character', description: '', promptCn: '' });
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string>('');
  const [previewVideoVisible, setPreviewVideoVisible] = useState(false);

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

  const fetchHistory = useCallback(async (page = 1) => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get('/api/generate/tasks', { params: { page, limit: 20 } });
      setHistory(data.items || []);
    } catch { /* ignore */ }
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    fetchHistory();
  }, []);

  // 自动轮询：当有 pending/processing 任务时，每 5 秒刷新一次历史
  const hasActiveTask = history.some(r => r.status === 'pending' || r.status === 'processing');
  useEffect(() => {
    if (!hasActiveTask) return;
    const timer = setInterval(() => fetchHistory(), 5000);
    return () => clearInterval(timer);
  }, [hasActiveTask, fetchHistory]);

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
    const loadingText = mode === 't2i' ? 'AI 正在规划图片描述...' : 'AI 正在规划视频描述...';
    const hideLoading = message.loading(loadingText, 0);
    try {
      const { data } = await api.post('/api/generate/smart-plan', { 
        prompt,
        images: images.length > 0 ? images : undefined,
        mode,
      });
      form.setFieldsValue({ prompt: data.prompt });
      hideLoading();
      if (data.has_image_analysis) {
        message.success('智能规划完成（已结合图片分析）！');
      } else {
        message.success('智能规划完成！');
      }
    } catch (err: any) {
      hideLoading();
      message.error(err.response?.data?.message || '智能规划失败');
    }
  };

  const doGenerate = async (url: string, body: any, form: any) => {
    setLoading(true);
    try {
      await api.post(url, body);
      message.success('生成任务已提交');
      form.resetFields();
      setUploadFileList([]);
      setSelectedLibraryAssets([]);
      fetchHistory();
    } catch (err: any) {
      message.error(err.response?.data?.message || '生成失败');
    }
    setLoading(false);
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

  const statusColor: Record<string, string> = {
    pending: 'default', processing: 'processing', completed: 'success', failed: 'error',
  };

  const historyColumns = [
    { title: '类型', dataIndex: 'type', width: 80, render: (v: string) => (
      <Tag icon={v === 'image' ? <PictureOutlined /> : <VideoCameraOutlined />}>
        {v === 'image' ? '图片' : '视频'}
      </Tag>
    )},
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => (
      <Tag color={statusColor[v] || 'default'}>{v === 'pending' ? '排队中' : v === 'processing' ? '生成中' : v === 'completed' ? '已完成' : '失败'}</Tag>
    )},
    { title: '创建时间', dataIndex: 'created_at', width: 160, render: (v: string) => new Date(v).toLocaleString() },
    { title: '结果', dataIndex: 'output_data', width: 200, render: (v: string, r: any) => {
      if (!v) return '-';
      try {
        const data = JSON.parse(v);
        const items = Array.isArray(data) ? data : (data.url ? [data] : []);
        if (items.length === 0) return '-';
        if (r.type === 'image') return (
          <Space size={4} wrap>
            {items.map((item: any, i: number) => {
              const imgUrl = getUrl(item.url);
              const label = item.view || '';
              return (
                <div key={i} style={{ textAlign: 'center' }}>
                  <Image src={imgUrl} width={label ? 48 : 60} preview={{ src: imgUrl }} />
                  {label && <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>{label}</div>}
                </div>
              );
            })}
          </Space>
        );
        const videoUrl = getUrl(items[0]?.url);
        return (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <video
              src={videoUrl}
              width={160}
              height={90}
              controls
              playsInline
              preload="metadata"
              style={{ borderRadius: 4, background: '#1a1a1a', cursor: 'pointer', objectFit: 'contain' }}
              onClick={() => { setPreviewVideoUrl(videoUrl); setPreviewVideoVisible(true); }}
            />
            <Tooltip title="全屏预览">
              <PlayCircleFilled
                onClick={() => { setPreviewVideoUrl(videoUrl); setPreviewVideoVisible(true); }}
                style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 32, color: 'rgba(255,255,255,0.8)', cursor: 'pointer', opacity: 0.7 }}
              />
            </Tooltip>
          </div>
        );
      } catch { return '-'; }
    }},
    { title: '错误', dataIndex: 'error_msg', width: 150, ellipsis: true, render: (v: string) => v ? <Text type="danger">{v}</Text> : '-' },
    { title: '操作', width: 140, render: (_: any, r: any) => (
      <Space size={0}>
        {r.status === 'failed' ? <Button type="link" size="small" icon={<ReloadOutlined />} onClick={() => handleRetry(r.id)}>重试</Button> : null}
        {r.status === 'completed' && r.output_data ? <Button type="link" size="small" icon={<SaveOutlined />} onClick={() => openSaveModal(r)}>保存</Button> : null}
        <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id)}>删除</Button>
      </Space>
    )},
  ];

  const renderForm = (mode: string) => {
    switch (mode) {
      case 'text-to-image':
        return (
          <Form form={formTextToImage} layout="vertical" onFinish={(v) => doGenerate('/api/generate/text-to-image', v, formTextToImage)}>
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text type="secondary">描述</Text>
              <PromptPresets 
                presets={IMAGE_PRESETS} 
                onSelect={(v) => formTextToImage.setFieldsValue({ prompt: v })}
                smartPlan={() => generateSmartPlan(formTextToImage, [], 't2i')}
                prompt={promptTextToImage}
              />
            </div>
            <Form.Item name="prompt" rules={[{ required: true, message: '请输入图片描述' }]}>
              <TextArea rows={3} placeholder="描述你想要生成的图片内容..." />
            </Form.Item>
            <Space style={{ width: '100%' }} size={12}>
              <Form.Item name="style" label="风格" initialValue="anime">
                <Select style={{ width: 140 }} options={[{ label: '🎨 动漫', value: 'anime' }, { label: '📷 写实', value: 'realistic' }]} />
              </Form.Item>
              <Form.Item name="num_images" label="数量" initialValue={1}>
                <Select style={{ width: 100 }} options={[1, 2, 4].map(n => ({ label: `${n} 张`, value: n }))} />
              </Form.Item>
              <Text type="secondary" style={{ fontSize: 12, lineHeight: '32px' }}>1张=单图 / 2张=正面+背面 / 4张=正面+背面+左侧+右侧</Text>
            </Space>
            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={loading} size="large">生成图片</Button>
              <Tag color="blue" style={{ marginLeft: 8 }}>自动分配模型</Tag>
            </Form.Item>
          </Form>
        );

      case 'text-to-video':
        return (
          <Form form={formTextToVideo} layout="vertical" onFinish={(v) => doGenerate('/api/generate/text-to-video', v, formTextToVideo)}>
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text type="secondary">描述</Text>
              <PromptPresets 
                presets={VIDEO_PRESETS} 
                onSelect={(v) => formTextToVideo.setFieldsValue({ prompt: v })}
                smartPlan={() => generateSmartPlan(formTextToVideo, [], 't2v')}
                prompt={promptTextToVideo}
              />
            </div>
            <Form.Item name="prompt" rules={[{ required: true, message: '请输入视频描述' }]}>
              <TextArea rows={3} placeholder="描述视频画面内容、动作、风格..." />
            </Form.Item>
            <Space style={{ width: '100%' }} size={12}>
              <Form.Item name="resolution" label="分辨率" initialValue="720p">
                <Select style={{ width: 120 }} options={videoResolutions.map((r: string) => ({ label: r, value: r }))} />
              </Form.Item>
              <Form.Item name="ratio" label="宽高比" initialValue="9:16">
                <Select style={{ width: 140 }} options={videoRatios.map((r: string) => ({ label: `${r} ${RATIO_LABELS[r] || ''}`, value: r }))} />
              </Form.Item>
              <Form.Item name="duration" label="时长" initialValue={5}>
                <Select style={{ width: 100 }} options={videoDurations.map((d: number) => ({ label: `${d}秒`, value: d }))} />
              </Form.Item>
              <Form.Item name="style" label="风格" initialValue="anime">
                <Select style={{ width: 110 }} options={[{ label: '🎨 动漫', value: 'anime' }, { label: '📷 写实', value: 'realistic' }]} />
              </Form.Item>
            </Space>
            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={loading} size="large">生成视频</Button>
              <Tag color="blue" style={{ marginLeft: 8 }}>自动分配T2V模型</Tag>
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
                  <div style={{ marginBottom: 12, padding: 8, background: '#f0f5ff', borderRadius: 8, border: '1px solid #d6e4ff' }}>
                    <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>已选择的资产：</Text>
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
                                color: '#ff4d4f',
                                cursor: 'pointer',
                                background: '#fff',
                                borderRadius: '50%'
                              }} 
                            />
                          </Tooltip>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Card size="small" style={{ background: '#fafafa', border: '1px dashed #d9d9d9' }}>
                  <div style={{ marginBottom: 8 }}>
                    <Tabs
                      activeKey={assetTab}
                      onChange={(k) => setAssetTab(k as any)}
                      size="small"
                      items={[
                        { key: 'character', label: <span><UserOutlined /> 人物</span> },
                        { key: 'scene', label: <span><EnvironmentOutlined /> 场景</span> },
                        { key: 'prop', label: <span><AppstoreOutlined /> 道具</span> },
                      ]}
                    />
                  </div>
                  {assetsLoading ? (
                    <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>加载中...</div>
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
                              border: isSelected ? '2px solid #1677ff' : '2px solid transparent',
                              borderRadius: 8,
                              overflow: 'hidden',
                              transition: 'all 0.2s',
                              background: isSelected ? '#e6f4ff' : '#fff',
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

            <div style={{ marginBottom: 8 }}>
              <PromptPresets 
                presets={VIDEO_PRESETS} 
                onSelect={(v) => formImageToVideo.setFieldsValue({ prompt: v })}
                smartGenerate={() => {
                  const urls = assetSource === 'library'
                    ? selectedLibraryAssets.map((a: any) => getUrl(a.image_url))
                    : uploadFileList.filter((f: any) => f.status === 'done').map((f: any) => f.response?.url || f.url);
                  generateSmartDescription(formImageToVideo, urls);
                }}
                hasImages={assetSource === 'library' 
                  ? selectedLibraryAssets.length > 0 
                  : uploadFileList.some((f: any) => f.status === 'done')}
                smartPlan={() => {
                  const urls = assetSource === 'library'
                    ? selectedLibraryAssets.map((a: any) => getUrl(a.image_url))
                    : uploadFileList.filter((f: any) => f.status === 'done').map((f: any) => f.response?.url || f.url);
                  generateSmartPlan(formImageToVideo, urls, 'i2v');
                }}
                prompt={promptImageToVideo}
              />
            </div>
            <Form.Item name="prompt">
              <TextArea rows={2} placeholder="描述角色的动作或镜头运动..." />
            </Form.Item>
            <Space style={{ width: '100%' }} size={12}>
              <Form.Item name="resolution" label="分辨率" initialValue="720p">
                <Select style={{ width: 120 }} options={videoResolutions.map((r: string) => ({ label: r, value: r }))} />
              </Form.Item>
              <Form.Item name="ratio" label="宽高比" initialValue="9:16">
                <Select style={{ width: 140 }} options={videoRatios.map((r: string) => ({ label: `${r} ${RATIO_LABELS[r] || ''}`, value: r }))} />
              </Form.Item>
              <Form.Item name="duration" label="时长" initialValue={5}>
                <Select style={{ width: 100 }} options={videoDurations.map((d: number) => ({ label: `${d}秒`, value: d }))} />
              </Form.Item>
              <Form.Item name="style" label="风格" initialValue="anime">
                <Select style={{ width: 110 }} options={[{ label: '🎨 动漫', value: 'anime' }, { label: '📷 写实', value: 'realistic' }]} />
              </Form.Item>
            </Space>
            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={loading} size="large">生成视频</Button>
              <Tag color="blue" style={{ marginLeft: 8 }}>自动分配{selectedLibraryAssets.length > 1 ? 'R2V' : 'I2V'}模型</Tag>
            </Form.Item>
          </Form>
        );

      case 'image-merge':
        return (
          <Card style={{ textAlign: 'center', padding: 60 }}>
            <Title level={4} type="secondary">多图合并</Title>
            <Text type="secondary">功能开发中，敬请期待</Text>
          </Card>
        );
    }
  };

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>AI 生成中心</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>选择生成模式，AI 将自动为您创作</Text>

      <Card style={{ borderRadius: 12, marginBottom: 24 }}>
        <Tabs activeKey={tabKey} onChange={setTabKey} items={[
          { key: 'text-to-image', label: '📝 文字生图片', children: renderForm('text-to-image') },
          { key: 'text-to-video', label: '🎬 文字生视频', children: renderForm('text-to-video') },
          { key: 'image-to-video', label: '🖼 图片生视频', children: renderForm('image-to-video') },
          { key: 'image-merge', label: '🔀 多图合并', children: renderForm('image-merge') },
        ]} />
      </Card>

      <Title level={4}>生成历史</Title>
      <Card style={{ borderRadius: 12 }}>
        <Table rowKey="id" columns={historyColumns} dataSource={history} loading={historyLoading}
          pagination={false} scroll={{ x: 950 }} size="small" />
      </Card>

      <Modal title="保存到大资产库" open={saveModal.visible}
        onOk={handleSaveToGlobal} onCancel={() => setSaveModal({ visible: false, record: null, name: '', type: 'character', description: '', promptCn: '' })}
        okText="保存" cancelText="取消" width={520}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
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

      <Modal 
        title="视频预览" 
        open={previewVideoVisible}
        onCancel={() => { setPreviewVideoVisible(false); setPreviewVideoUrl(''); }}
        footer={[
          <Button key="close" onClick={() => { setPreviewVideoVisible(false); setPreviewVideoUrl(''); }}>
            关闭
          </Button>,
          <Button key="open" type="link" href={previewVideoUrl} target="_blank">
            在新窗口打开
          </Button>,
        ]}
        width={720}
        centered
        destroyOnClose
      >
        {previewVideoUrl && (
          <video 
            src={previewVideoUrl} 
            controls 
            playsInline 
            preload="auto"
            autoPlay
            style={{ width: '100%', borderRadius: 8, background: '#000' }}
          />
        )}
      </Modal>
    </div>
  );
}
