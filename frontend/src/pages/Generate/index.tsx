import { useState, useEffect, useCallback } from 'react';
import {
  Tabs, Form, Select, Input, Button, Card, Table, Tag,
  message, Upload, Typography, Space, Image, Modal,
} from 'antd';
import { InboxOutlined, SendOutlined, ReloadOutlined, BulbOutlined, PictureOutlined, VideoCameraOutlined, SaveOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { TextArea } = Input;
const { Dragger } = Upload;
const { Title, Text } = Typography;

interface ModelItem {
  id: number; provider: string; capability: string;
  model_id: string; model_name: string; priority: number; status: string;
  supported_ratios: string | null; supported_resolutions: string | null;
  min_duration: number | null; max_duration: number | null;
}

const PROVIDER_LABELS: Record<string, string> = {
  volcengine: '火山引擎', aliyun: '阿里云', openai: 'OpenAI',
  runway: 'Runway', deepseek: 'DeepSeek',
};

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

function PromptPresets({ presets, onSelect }: { presets: typeof IMAGE_PRESETS; onSelect: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginBottom: 8 }}>
      <Button type="link" size="small" icon={<BulbOutlined />} onClick={() => setShow(!show)} style={{ padding: 0 }}>
        {show ? '收起提示词模板' : '💡 快速模板'}
      </Button>
      {show && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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
  const [videoModels, setVideoModels] = useState<ModelItem[]>([]);
  const [imageModels, setImageModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedVideoModel, setSelectedVideoModel] = useState<ModelItem | null>(null);
  const [, setSelectedImageModel] = useState<ModelItem | null>(null);
  const [uploadFileList, setUploadFileList] = useState<any[]>([]);
  const [saveModal, setSaveModal] = useState<{ visible: boolean; record: any; name: string; type: string; description: string; promptCn: string }>({ visible: false, record: null, name: '', type: 'character', description: '', promptCn: '' });

  const [formTextToImage] = Form.useForm();
  const [formTextToVideo] = Form.useForm();
  const [formImageToVideo] = Form.useForm();

  useEffect(() => {
    Promise.all([
      api.get('/api/admin/models', { params: { capability: 'video' } }),
      api.get('/api/admin/models', { params: { capability: 'image' } }),
    ]).then(([vRes, iRes]) => {
      setVideoModels(vRes.data || []);
      setImageModels(iRes.data || []);
    }).catch(() => message.error('加载模型列表失败'));
    fetchHistory();
  }, []);

  const fetchHistory = useCallback(async (page = 1) => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get('/api/generate/tasks', { params: { page, limit: 20 } });
      setHistory(data.items || []);
    } catch { /* ignore */ }
    setHistoryLoading(false);
  }, []);

  const buildModelOptions = (models: ModelItem[]) =>
    Object.entries(
      models.reduce((acc: Record<string, ModelItem[]>, m) => {
        const label = PROVIDER_LABELS[m.provider] || m.provider;
        (acc[label] = acc[label] || []).push(m);
        return acc;
      }, {}),
    ).map(([provider, items]) => ({
      label: provider,
      options: items.map((m) => ({ value: m.model_id, label: m.model_name })),
    }));

  const handleModelChange = (value: string, setter: (m: ModelItem | null) => void, models: ModelItem[], form: any, fields: string[]) => {
    const match = models.find((m) => m.model_id === value);
    setter(match || null);
    if (match) {
      const vals = form.getFieldsValue();
      const updates: any = {};
      const res = match.supported_resolutions ? JSON.parse(match.supported_resolutions) : null;
      const rat = match.supported_ratios ? JSON.parse(match.supported_ratios) : null;
      if (res && fields.includes('resolution') && !res.includes(vals.resolution)) updates.resolution = res[0];
      if (rat && fields.includes('ratio') && !rat.includes(vals.ratio)) updates.ratio = rat[0];
      if (fields.includes('duration')) {
        const minD = match.min_duration || 5;
        const maxD = match.max_duration || 15;
        if (vals.duration < minD || vals.duration > maxD) updates.duration = minD;
      }
      if (Object.keys(updates).length) form.setFieldsValue(updates);
    }
  };

  const doGenerate = async (url: string, body: any, form: any) => {
    setLoading(true);
    try {
      await api.post(url, body);
      message.success('生成任务已提交');
      form.resetFields();
      setUploadFileList([]);
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
      setSaveModal({ visible: true, record: { ...record, _url: url }, name: prompt.slice(0, 50) || '', type: 'character', description: '', promptCn: '' });
    } catch { message.error('无法获取生成结果'); }
  };

  const handleSaveToGlobal = async () => {
    try {
      const { record, name, type, description, promptCn } = saveModal;
      if (record?.type === 'video') {
        message.warning('视频资产暂不支持保存到大资产库');
        return;
      }
      const input = JSON.parse(record.input_data || '{}');
      const prompt = record.prompt || input.prompt || '';
      await api.post('/api/global-assets', {
        type, name, description: description || '', prompt, prompt_cn: promptCn || '',
        image_url: record._url, source_type: 'generate', tags: type,
      });
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

  const videoResolutions = selectedVideoModel?.supported_resolutions
    ? JSON.parse(selectedVideoModel.supported_resolutions) : ['480p', '720p', '1080p'];

  const videoRatios = selectedVideoModel?.supported_ratios
    ? JSON.parse(selectedVideoModel.supported_ratios) : ['9:16', '16:9', '1:1', '4:3', '3:4', '21:9'];

  const videoDurations: number[] = [];
  const minV = selectedVideoModel?.min_duration || 5;
  const maxV = selectedVideoModel?.max_duration || 15;
  for (let d = minV; d <= maxV; d += 5) videoDurations.push(d);
  if (!videoDurations.includes(maxV)) videoDurations.push(maxV);

  const imageModelOptions = buildModelOptions(imageModels);
  const videoModelOptions = buildModelOptions(videoModels);

  const uploadProps = {
    name: 'file',
    multiple: false,
    maxCount: 1,
    fileList: uploadFileList,
    onChange(info: any) {
      setUploadFileList(info.fileList.slice(-1));
      if (info.file.status === 'done') {
        const url = info.file.response?.url || '';
        formImageToVideo.setFieldsValue({ image_url: url });
      }
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
    onRemove: () => { formImageToVideo.setFieldsValue({ image_url: '' }); setUploadFileList([]); },
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
    { title: '模型', dataIndex: 'model_name', width: 120, ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => (
      <Tag color={statusColor[v] || 'default'}>{v === 'pending' ? '排队中' : v === 'processing' ? '生成中' : v === 'completed' ? '已完成' : '失败'}</Tag>
    )},
    { title: '创建时间', dataIndex: 'created_at', width: 160, render: (v: string) => new Date(v).toLocaleString() },
    { title: '结果', dataIndex: 'output_data', width: 200, render: (v: string, r: any) => {
      if (!v) return '-';
      try {
        const data = JSON.parse(v);
        const url = data.url || data[0]?.url;
        if (!url) return '-';
        if (r.type === 'image') return <Image src={url} width={60} preview />;
        return <video src={url} width={120} controls style={{ borderRadius: 4 }} />;
      } catch { return '-'; }
    }},
    { title: '错误', dataIndex: 'error_msg', width: 150, ellipsis: true, render: (v: string) => v ? <Text type="danger">{v}</Text> : '-' },
    { title: '操作', width: 120, render: (_: any, r: any) => (
      <Space size={0}>
        {r.status === 'failed' ? <Button type="link" size="small" icon={<ReloadOutlined />} onClick={() => handleRetry(r.id)}>重试</Button> : null}
        {r.status === 'completed' && r.output_data ? <Button type="link" size="small" icon={<SaveOutlined />} onClick={() => openSaveModal(r)}>保存</Button> : null}
      </Space>
    )},
  ];

  const renderForm = (mode: string) => {
    switch (mode) {
      case 'text-to-image':
        return (
          <Form form={formTextToImage} layout="vertical" onFinish={(v) => doGenerate('/api/generate/text-to-image', v, formTextToImage)}>
            <Form.Item name="model" label="模型">
              <Select allowClear placeholder="自动选择" size="large" options={imageModelOptions}
                onChange={(v) => handleModelChange(v, setSelectedImageModel, imageModels, formTextToImage, [])} />
            </Form.Item>
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>描述</Text>
              <PromptPresets presets={IMAGE_PRESETS} onSelect={(v) => formTextToImage.setFieldsValue({ prompt: v })} />
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
            </Space>
            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={loading} size="large">生成图片</Button>
            </Form.Item>
          </Form>
        );

      case 'text-to-video':
        return (
          <Form form={formTextToVideo} layout="vertical" onFinish={(v) => doGenerate('/api/generate/text-to-video', v, formTextToVideo)}>
            <Form.Item name="model" label="模型">
              <Select allowClear placeholder="自动选择" size="large" options={videoModelOptions}
                onChange={(v) => handleModelChange(v, setSelectedVideoModel, videoModels, formTextToVideo, ['resolution', 'ratio', 'duration'])} />
            </Form.Item>
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>描述</Text>
              <PromptPresets presets={VIDEO_PRESETS} onSelect={(v) => formTextToVideo.setFieldsValue({ prompt: v })} />
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
            </Form.Item>
          </Form>
        );

      case 'image-to-video':
        return (
          <Form form={formImageToVideo} layout="vertical" onFinish={(v) => doGenerate('/api/generate/image-to-video', v, formImageToVideo)}>
            <Form.Item name="image_url" label="参考图片" rules={[{ required: true, message: '请上传参考图片' }]}>
              <Input type="hidden" />
            </Form.Item>
            <Form.Item>
              <Dragger {...uploadProps} listType="picture">
                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                <p className="ant-upload-text">点击或拖拽上传参考图片</p>
                <p className="ant-upload-hint">支持 JPG / PNG，建议使用角色图或场景图</p>
              </Dragger>
            </Form.Item>
            <Form.Item name="model" label="模型">
              <Select allowClear placeholder="自动选择" size="large" options={videoModelOptions}
                onChange={(v) => handleModelChange(v, setSelectedVideoModel, videoModels, formImageToVideo, ['resolution', 'ratio', 'duration'])} />
            </Form.Item>
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>动作/镜头描述</Text>
              <PromptPresets presets={VIDEO_PRESETS} onSelect={(v) => formImageToVideo.setFieldsValue({ prompt: v })} />
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
                : <video src={saveModal.record._url} controls style={{ maxWidth: 200, borderRadius: 4 }} />
              }
            </div>
          )}
        </Space>
      </Modal>
    </div>
  );
}
