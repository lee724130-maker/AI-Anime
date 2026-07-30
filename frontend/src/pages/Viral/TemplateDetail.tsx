import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Typography, Card, Spin, Button, Space, Tag, Row, Col, Input, Form, message, Divider, Descriptions, Image } from 'antd';
import { ArrowLeftOutlined, ThunderboltOutlined, ExperimentOutlined, FireOutlined, CopyOutlined, PictureOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../../services/api';
import GlobalAssetPicker from './components/GlobalAssetPicker';

const { Title, Text } = Typography;

// Category is dynamically set by AI during analysis

interface TemplateScene {
  name: string; duration: number; description: string; type: string;
}

interface TemplateVariable {
  key: string; label: string; type: string; placeholder: string; required: boolean; options?: string[];
}

interface TemplateDetail {
  id: number; name: string; description: string; category: string;
  tags: string[]; scenes: TemplateScene[]; variables: TemplateVariable[];
  reference_url: string; usage_count: number; thumbnail: string;
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
        // Pre-fill form defaults
        const defaults: Record<string, any> = {};
        for (const v of data.variables || []) {
          defaults[v.key] = v.options ? v.options[0] : '';
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

      const variables = Object.entries(values).map(([key, value]) => ({ key, value }));

      const { data } = await api.post('/api/viral/projects', {
        template_id: Number(id),
        name: values.project_name || template?.name || '未命名项目',
        variables: JSON.stringify(variables),
        media_refs: selectedImages.length > 0 ? JSON.stringify(selectedImages) : undefined,
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
    <div style={{ padding: '24px 32px' }}>
      {/* Back */}
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/viral')}
        style={{ marginBottom: 16, color: '#666' }}>返回模板集市</Button>

      <Row gutter={[24, 24]}>
        {/* Left: Template Info + Scenes */}
        <Col xs={24} lg={14}>
          <Card style={{ borderRadius: 14, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 16 }}>
            <div style={{
              height: 200, borderRadius: 10, marginBottom: 16,
              background: template.thumbnail ? `url(${template.thumbnail}) center/cover` : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {!template.thumbnail && <ExperimentOutlined style={{ fontSize: 60, color: 'rgba(255,255,255,0.3)' }} />}
            </div>
            <Title level={4} style={{ margin: '0 0 4px' }}>{template.name}</Title>
            <Space style={{ marginBottom: 12 }}>
              <Tag style={{ borderRadius: 6 }}>{template.category}</Tag>
              <Text type="secondary" style={{ fontSize: 12 }}><FireOutlined /> 使用 {template.usage_count} 次</Text>
              <Button type="text" size="small" icon={<CopyOutlined />} loading={duplicating}
                onClick={handleDuplicate} style={{ fontSize: 12 }}>复制模板</Button>
            </Space>
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>{template.description}</Text>

            <Divider style={{ margin: '12px 0' }} />

            <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>模板结构（{template.scenes.length} 个场景）</Text>
            {template.scenes.map((scene, i) => (
              <div key={i} style={{
                padding: '10px 14px', marginBottom: 8, borderRadius: 10,
                background: '#fafafa', border: '1px solid #f0f0f0',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <Text strong style={{ fontSize: 13 }}>场景 {i + 1}: {scene.name}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>{scene.description}</Text>
                </div>
                <Tag style={{ borderRadius: 6, flexShrink: 0 }}>{scene.duration}s</Tag>
              </div>
            ))}
          </Card>
        </Col>

        {/* Right: Create Project Form */}
        <Col xs={24} lg={10}>
          <Card style={{ borderRadius: 14, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <Title level={5} style={{ margin: '0 0 16px' }}>创建你的视频</Title>
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
              <Form.Item name="project_name" label="项目名称"
                rules={[{ required: true, message: '请输入项目名称' }]}>
                <Input placeholder={`${template.name} - 我的版本`} style={{ borderRadius: 8 }} />
              </Form.Item>

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
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>参考素材（可选）</Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {selectedImages.map((url, i) => (
                  <div key={i} style={{ position: 'relative', width: 60, height: 60, borderRadius: 8, overflow: 'hidden' }}>
                    <Image src={url} preview={false} style={{ width: 60, height: 60, objectFit: 'cover' }} />
                    <Button type="text" size="small" icon={<DeleteOutlined />}
                      onClick={() => setSelectedImages(selectedImages.filter((_, j) => j !== i))}
                      style={{ position: 'absolute', top: 0, right: 0, color: '#ff4d4f', fontSize: 11, background: 'rgba(255,255,255,0.8)' }} />
                  </div>
                ))}
                <Button icon={<PictureOutlined />} onClick={() => setAssetPickerOpen(true)}
                  style={{ width: 60, height: 60, borderRadius: 8, border: '1px dashed #d9d9d9' }} />
              </div>
              {selectedImages.length > 0 && (
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>已选 {selectedImages.length} 张参考图</Text>
              )}

              <GlobalAssetPicker
                open={assetPickerOpen}
                onClose={() => setAssetPickerOpen(false)}
                selected={selectedImages}
                onSelect={setSelectedImages}
              />

              <Button type="primary" block size="large" htmlType="submit" loading={submitting}
                icon={<ThunderboltOutlined />}
                style={{ borderRadius: 10, background: '#7c3aed', borderColor: '#7c3aed', height: 44, marginTop: 8 }}>
                创建并生成
              </Button>
            </Form>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
