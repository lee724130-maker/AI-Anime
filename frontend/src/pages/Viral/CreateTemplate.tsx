import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Card, Input, Button, Space, Tag, message, Spin, Divider, Row, Col, Select, Form, Alert, Steps } from 'antd';
import { ArrowLeftOutlined, LinkOutlined, ThunderboltOutlined, PlusOutlined, SettingOutlined, CheckCircleOutlined, ExperimentOutlined } from '@ant-design/icons';
import api from '../../services/api';
import SceneEditor from './components/SceneEditor';
import type { SceneItem } from './components/SceneEditor';

const { Title, Text } = Typography;

// Category is now dynamically determined by LLM during video analysis

interface VariableItem {
  key: string; label: string; type: string; placeholder: string; required: boolean;
}

export default function CreateTemplate() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [step, setStep] = useState<'input' | 'analyzing' | 'edit'>('input');
  const [videoUrl, setVideoUrl] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [variables, setVariables] = useState<VariableItem[]>([]);
  const [saving, setSaving] = useState(false);

  const handleAnalyze = async () => {
    if (!videoUrl.trim()) {
      message.warning('请输入视频链接');
      return;
    }
    setStep('analyzing');
    try {
      const { data } = await api.post('/api/viral/templates/analyze', {
        videoUrl: videoUrl.trim(),
        name: name || undefined,
        category: category || undefined,
        description: description || undefined,
      });
      setName(data.name || '');
      setDescription(data.description || '');
      setCategory(data.category || '');
      setScenes(data.scenes || []);
      setVariables(data.variables || []);
      setStep('edit');
      message.success('视频分析完成！可编辑后保存为模板');
    } catch (err: any) {
      message.error('分析失败: ' + (err?.response?.data?.message || err.message));
      setStep('input');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/api/viral/templates', {
        name,
        description,
        category,
        scenes: JSON.stringify(scenes),
        variables: JSON.stringify(variables),
        reference_url: videoUrl,
        tags: JSON.stringify([]),
      });
      message.success('模板保存成功！');
      navigate('/viral');
    } catch (err: any) {
      message.error('保存失败: ' + (err?.response?.data?.message || err.message));
    }
    setSaving(false);
  };

  const addVariable = () => {
    setVariables([...variables, { key: '', label: '', type: 'text', placeholder: '', required: false }]);
  };

  const updateVariable = (i: number, field: string, value: any) => {
    const copy = [...variables];
    (copy[i] as any)[field] = value;
    setVariables(copy);
  };

  const removeVariable = (i: number) => {
    setVariables(variables.filter((_, idx) => idx !== i));
  };

  const cardStyle = { borderRadius: 14, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' };

  if (step === 'analyzing') {
    return (
      <div style={{ padding: '24px 32px' }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setStep('input')}
          style={{ marginBottom: 16, color: '#666' }}>返回</Button>
        <Card style={{ ...cardStyle, textAlign: 'center', padding: '80px 0' }}>
          <Spin size="large" />
          <Title level={4} style={{ marginTop: 24 }}>AI 正在分析视频...</Title>
          <Text type="secondary">下载视频 → 提取关键帧 → 识别场景结构 → 生成模板</Text>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 900 }}>
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/viral')}
        style={{ marginBottom: 16, color: '#666' }}>返回模板集市</Button>

      <Steps
        current={step === 'edit' ? 2 : 0}
        style={{ marginBottom: 28, maxWidth: 600 }}
        items={[
          { title: '输入视频', icon: <LinkOutlined /> },
          { title: 'AI 分析', icon: <ExperimentOutlined /> },
          { title: '编辑保存', icon: <CheckCircleOutlined /> },
        ]}
      />

      {step === 'input' && (
        <Card style={cardStyle}>
          <Title level={4} style={{ marginBottom: 20 }}>创建新模板</Title>
          <Alert
            message="支持抖音、B站、YouTube 等平台的视频链接，也可以直接粘贴 MP4 直链"
            type="info" showIcon style={{ borderRadius: 10, marginBottom: 20 }}
          />

          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>视频链接 *</Text>
            <Input
              size="large"
              placeholder="粘贴视频链接（抖音/B站/YouTube/MP4直链）"
              prefix={<LinkOutlined />}
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              style={{ borderRadius: 10 }}
            />
          </div>

          <Row gutter={16}>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>模板名称</Text>
              <Input
                placeholder="留空由 AI 自动生成"
                value={name}
                onChange={e => setName(e.target.value)}
                style={{ borderRadius: 8 }}
              />
            </Col>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>分类（AI 将自动分析，可手动修改）</Text>
              <Input
                placeholder="留空由 AI 自动分类"
                value={category}
                onChange={e => setCategory(e.target.value)}
                style={{ borderRadius: 8 }}
              />
            </Col>
          </Row>

          <div style={{ marginTop: 16, marginBottom: 24 }}>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>描述</Text>
            <Input.TextArea
              rows={2}
              placeholder="模板简短描述（可选）"
              value={description}
              onChange={e => setDescription(e.target.value)}
              style={{ borderRadius: 8 }}
            />
          </div>

          <Button type="primary" size="large" block
            icon={<ExperimentOutlined />}
            onClick={handleAnalyze}
            style={{ borderRadius: 10, background: '#7c3aed', borderColor: '#7c3aed', height: 44 }}>
            AI 分析视频结构
          </Button>

          <Divider>或</Divider>

          <Button block icon={<SettingOutlined />}
            onClick={() => { setStep('edit'); setName(name || '手动创建模板'); }}
            style={{ borderRadius: 10, height: 44 }}>
            手动创建模板
          </Button>
        </Card>
      )}

      {step === 'edit' && (
        <>
          {/* Template Info */}
          <Card style={{ ...cardStyle, marginBottom: 16 }}>
            <Title level={5} style={{ marginBottom: 16 }}>模板信息</Title>
            <Row gutter={16}>
              <Col span={8}>
                <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>名称</Text>
                <Input value={name} onChange={e => setName(e.target.value)} style={{ borderRadius: 8 }} />
              </Col>
              <Col span={8}>
                <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>分类</Text>
                <Input value={category} onChange={e => setCategory(e.target.value)} style={{ borderRadius: 8 }} />
              </Col>
              <Col span={8}>
                <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>参考视频</Text>
                <Input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} style={{ borderRadius: 8 }} />
              </Col>
            </Row>
            <div style={{ marginTop: 12 }}>
              <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>描述</Text>
              <Input.TextArea value={description} onChange={e => setDescription(e.target.value)} rows={2} style={{ borderRadius: 8 }} />
            </div>
          </Card>

          <SceneEditor scenes={scenes} onChange={setScenes} />

          {/* Variables */}
          <Card style={{ ...cardStyle, marginBottom: 24 }}
            title={<Space><div style={{ width: 3, height: 16, background: '#ec4899', borderRadius: 2 }} />替换变量</Space>}
            extra={<Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addVariable}>添加变量</Button>}>
            {variables.map((v, i) => (
              <div key={i} style={{
                padding: 12, marginBottom: 8, borderRadius: 10,
                background: '#fafafa', border: '1px solid #f0f0f0',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text strong style={{ fontSize: 13 }}>变量 {i + 1}</Text>
                  <Button type="text" size="small" danger onClick={() => removeVariable(i)}>删除</Button>
                </div>
                <Row gutter={8}>
                  <Col span={6}>
                    <Input size="small" placeholder="key (英文)" value={v.key}
                      onChange={e => updateVariable(i, 'key', e.target.value)} style={{ borderRadius: 6 }} />
                  </Col>
                  <Col span={6}>
                    <Input size="small" placeholder="标签 (中文)" value={v.label}
                      onChange={e => updateVariable(i, 'label', e.target.value)} style={{ borderRadius: 6 }} />
                  </Col>
                  <Col span={4}>
                    <Select size="small" value={v.type} onChange={val => updateVariable(i, 'type', val)}
                      style={{ width: '100%' }}
                      options={[
                        { value: 'text', label: '文本' },
                        { value: 'textarea', label: '多行' },
                        { value: 'select', label: '选择' },
                      ]} />
                  </Col>
                  <Col span={5}>
                    <Input size="small" placeholder="占位提示" value={v.placeholder}
                      onChange={e => updateVariable(i, 'placeholder', e.target.value)} style={{ borderRadius: 6 }} />
                  </Col>
                  <Col span={3} style={{ display: 'flex', alignItems: 'center' }}>
                    <Button size="small" type={v.required ? 'primary' : 'default'}
                      onClick={() => updateVariable(i, 'required', !v.required)}
                      style={{ borderRadius: 6, fontSize: 11 }}>
                      {v.required ? '必填' : '选填'}
                    </Button>
                  </Col>
                </Row>
              </div>
            ))}
            {variables.length === 0 && (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <Text type="secondary">暂无变量，点击"添加变量"创建替换内容字段</Text>
              </div>
            )}
          </Card>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <Button onClick={() => navigate('/viral')} style={{ borderRadius: 10, height: 44, padding: '0 24px' }}>
              取消
            </Button>
            <Button type="primary" size="large" icon={<ThunderboltOutlined />}
              loading={saving} onClick={handleSave}
              style={{ borderRadius: 10, background: '#7c3aed', borderColor: '#7c3aed', height: 44, padding: '0 24px' }}>
              保存模板
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
