import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Typography, Spin, Button, Tag, Row, Col, Input, InputNumber, Form, message, Divider, Image, Select, Tooltip, Switch } from 'antd';
import { ArrowLeftOutlined, ThunderboltOutlined, FireOutlined, CopyOutlined, PictureOutlined, DeleteOutlined, LinkOutlined } from '@ant-design/icons';
import api from '../../services/api';
import GlobalAssetPicker from './components/GlobalAssetPicker';
import CoverThumb from './CoverThumb';
import './template-detail.css';   // 本页 + GlobalAssetPicker 样式（作用域 .vtd-/.vgp-）

const { Title, Text } = Typography;
const API_BASE = import.meta.env.VITE_API_BASE || '';

// Category is dynamically set by AI during analysis

interface TemplateScene {
  name: string; duration: number; description: string; type: string;
}

interface TemplateVariable {
  key: string; label: string; type: string; placeholder: string; required: boolean; default_value?: string; options?: string[];
}

interface TemplateDetail {
  id: number; name: string; description: string; category: string;
  tags: string[]; scenes: TemplateScene[]; variables: TemplateVariable[];
  reference_url: string; usage_count: number; thumbnail: string;
  reference_frames?: string[]; cover_url?: string; ratio?: string;
}

export default function ViralTemplateDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/api/viral/templates/${id}`);
        setTemplate(data);
        // Pre-fill form defaults: project name auto-filled, variables use AI suggested values
        const defaults: Record<string, any> = {
          project_name: `${data.name} - 我的版本`,
        };
        for (const v of data.variables || []) {
          defaults[v.key] = v.default_value || (v.options ? v.options[0] : '');
        }
        form.setFieldsValue(defaults);
      } catch { message.error('模板加载失败'); }
      setLoading(false);
    })();
  }, [id]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const variables = Object.entries(values)
        .filter(([key]) => !['project_name', 'project_ratio', 'project_resolution', 'project_style', 'project_language', 'project_target_duration', 'project_voiceover_enabled'].includes(key))
        .map(([key, value]) => ({ key, value }));

      const { data } = await api.post('/api/viral/projects', {
        template_id: Number(id),
        name: values.project_name || template?.name || '未命名项目',
        variables: JSON.stringify(variables),
        media_refs: selectedImages.length > 0 ? JSON.stringify(selectedImages) : undefined,
        target_duration: values.project_target_duration ? Number(values.project_target_duration) : undefined,
        voiceover_enabled: values.project_voiceover_enabled ?? true,
        ratio: values.project_ratio || '9:16',
        resolution: values.project_resolution || '720p',
        style: values.project_style || 'realistic',
        language: values.project_language || 'zh',
      });

      message.success('创作项目已创建！');
      navigate(`/viral/projects/${data.id}`);
    } catch (err: any) {
      if (err?.errorFields) return; // form validation
      message.error('创建失败: ' + (err?.response?.data?.message || err.message));
    }
    setSubmitting(false);
  };

  const handleDuplicate = async () => {
    setDuplicating(true);
    try {
      await api.post(`/api/viral/templates/${id}/duplicate`);
      message.success('模板已复制到你的模板库！');
      navigate('/viral');
    } catch (err: any) {
      message.error('复制失败: ' + (err?.response?.data?.message || err.message));
    }
    setDuplicating(false);
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '100px 0' }}><Spin size="large" /></div>;
  }
  if (!template) {
    return (
      <div style={{ padding: '24px 32px' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/viral')}>返回</Button>
        <div style={{ textAlign: 'center', padding: '60px 0' }}>模板不存在</div>
      </div>
    );
  }

  return (
    <div className="vtd-root">
      {/* Back */}
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/viral')}
        className="vtd-back">返回模板集市</Button>

      <div className="vtd-split">
        {/* Left: Template Info + Scenes */}
        <div className="vtd-panel">
          <div className="vtd-cover">
            <CoverThumb src={template.cover_url || template.thumbnail} height={200} />
          </div>
          <Title level={4} className="vtd-name">{template.name}</Title>
          <div className="vtd-metarow">
            <Tag style={{ borderRadius: 6 }}>{template.category}</Tag>
            <Text className="vtd-usage"><FireOutlined /> 使用 {template.usage_count} 次</Text>
            <Button type="text" size="small" icon={<CopyOutlined />} loading={duplicating}
              onClick={handleDuplicate} className="vtd-copy">复制模板</Button>
          </div>
          <Text className="vtd-desc">{template.description}</Text>

          {template.reference_url && (
            <div className="vtd-ref">
              <LinkOutlined className="anticon-link" />
              <Text className="vtd-ref__text" ellipsis={{ tooltip: template.reference_url }}>
                参考视频: {template.reference_url}
              </Text>
              <a href={template.reference_url} target="_blank" rel="noopener noreferrer"
                className="vtd-ref__open">打开</a>
            </div>
          )}

          <Divider />

          <Text className="vtd-section-title">模板结构（{template.scenes.length} 个场景）</Text>
          {template.scenes.map((scene, i) => (
            <div key={i} className="vtd-scene">
              <div>
                <Text className="vtd-scene__name">场景 {i + 1}: {scene.name}</Text>
                <br />
                <Text className="vtd-scene__desc">{scene.description}</Text>
              </div>
              <Tag style={{ borderRadius: 6, flexShrink: 0 }}>{scene.duration}s</Tag>
            </div>
          ))}
        </div>

        {/* Right: Create Project Form */}
        <div className="vtd-panel">
          <Title level={5} className="vtd-panel__title">创建你的视频</Title>
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
              <Form.Item name="project_name" label="项目名称"
                rules={[{ required: true, message: '请输入项目名称' }]}>
                <Input placeholder={`${template.name} - 我的版本`} style={{ borderRadius: 8 }} />
              </Form.Item>

              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="project_ratio" label="视频比例" initialValue={template.ratio || '9:16'}>
                    <Select
                      options={[
                        { label: '竖屏 9:16', value: '9:16' },
                        { label: '横屏 16:9', value: '16:9' },
                        { label: '方形 1:1', value: '1:1' },
                        { label: '3:4 竖版', value: '3:4' },
                        { label: '2:3 竖版', value: '2:3' },
                        { label: '4:3 横版', value: '4:3' },
                      ]}
                      style={{ borderRadius: 8 }}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="project_resolution" label="分辨率" initialValue="720p">
                    <Select
                      options={['480p', '720p', '1080p'].map(r => ({ label: r, value: r }))}
                      style={{ borderRadius: 8 }}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="project_style" label="风格" initialValue="realistic">
                    <Select
                      options={[
                        { label: '写实', value: 'realistic' },
                        { label: '动漫', value: 'anime' },
                      ]}
                      style={{ borderRadius: 8 }}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="project_language" label="语言" initialValue="zh">
                    <Select
                      options={[
                        { label: '中文', value: 'zh' },
                        { label: '英文', value: 'en' },
                        { label: '日文', value: 'ja' },
                      ]}
                      style={{ borderRadius: 8 }}
                    />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item name="project_target_duration"
                    label={<span>目标时长（秒）<Tooltip title="留空则按模板默认时长（8~15s）。视频模型单段最长 15s，超长时自动在多个场景间平均分配并逐段对齐到精确秒数，成片总时长 = 你填的数值（上限 60s）"><Text type="secondary" style={{ fontSize: 12 }}> ⓘ</Text></Tooltip></span>}>
                    <InputNumber
                      min={1} max={60} placeholder="留空 = 模板默认" style={{ width: '100%', borderRadius: 8 }}
                    />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item name="project_voiceover_enabled" label="生成配音（AI 朗读每个场景的描述作为旁白）" valuePropName="checked" initialValue={true}>
                    <Switch checkedChildren="开" unCheckedChildren="关" />
                  </Form.Item>
                </Col>
              </Row>

              <Divider style={{ margin: '12px 0' }} />
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>替换内容</Text>

              {template.variables.map(v => (
                <Form.Item
                  key={v.key}
                  name={v.key}
                  label={v.label}
                  rules={v.required ? [{ required: true, message: `请输入${v.label}` }] : []}
                >
                  {v.type === 'textarea' ? (
                    <Input.TextArea rows={3} placeholder={v.placeholder} style={{ borderRadius: 8 }} />
                  ) : v.type === 'select' ? (
                    <Input placeholder={v.placeholder} style={{ borderRadius: 8 }} />
                  ) : (
                    <Input placeholder={v.placeholder} style={{ borderRadius: 8 }} />
                  )}
                </Form.Item>
              ))}

              <Divider style={{ margin: '12px 0' }} />
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>参考素材（可选）</Text>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                点击视频截图选择，或从大资产库添加（图片将作为 AI 生成时的参考）
              </Text>

              {template.reference_frames && template.reference_frames.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                    视频截图（点击选择/取消）
                  </Text>
                  <div className="vtd-frames">
                    {template.reference_frames.map((frame, i) => {
                      const frameUrl = frame.startsWith('http') ? frame : API_BASE + frame;
                      const isSelected = selectedImages.includes(frameUrl);
                      return (
                        <div key={i} className="vtd-frame" data-on={isSelected ? '1' : '0'}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedImages(selectedImages.filter(u => u !== frameUrl));
                            } else {
                              setSelectedImages([...selectedImages, frameUrl]);
                            }
                          }}>
                          <Image src={frameUrl} preview={false}
                            onError={(e) => {
                              /* 库里登记的参考帧可能已被清理（实测生产 viral_frames_* 目录缺失 → 6 张 404）；
                                 不兜底就会露出浏览器裂图图标。藏掉图本身，由 ::after 出「无截图」占位。 */
                              (e.target as HTMLImageElement).style.visibility = 'hidden';
                              (e.target as HTMLImageElement).closest('.vtd-frame')?.setAttribute('data-broken', '1');
                            }} />
                          {isSelected && (
                            <div className="vtd-frame__mask">
                              <span className="vtd-frame__check">✓</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="vtd-picked">
                {selectedImages.map((url, i) => (
                  <div key={i} className="vtd-picked__cell">
                    <Image src={url} preview={false}
                      onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                    <Button type="text" size="small" icon={<DeleteOutlined />}
                      onClick={() => setSelectedImages(selectedImages.filter((_, j) => j !== i))}
                      className="vtd-picked__del" aria-label="移除该参考图" />
                  </div>
                ))}
                <Button icon={<PictureOutlined />} onClick={() => setAssetPickerOpen(true)}
                  className="vtd-add-frame" aria-label="从大资产库添加参考图" />
              </div>
              {selectedImages.length > 0 && (
                <Text className="vtd-count">已选 {selectedImages.length} 张参考图</Text>
              )}

              <GlobalAssetPicker
                open={assetPickerOpen}
                onClose={() => setAssetPickerOpen(false)}
                selected={selectedImages}
                onSelect={setSelectedImages}
              />

              <Button type="primary" block size="large" htmlType="submit" loading={submitting}
                icon={<ThunderboltOutlined />}
                className="vtd-btn-brand vtd-submit">
                创建并生成
              </Button>
            </Form>
        </div>
      </div>
    </div>
  );
}
