import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Input, Button, message, Spin, Divider, Select, Alert, Steps, Upload } from 'antd';
import { ArrowLeftOutlined, LinkOutlined, ThunderboltOutlined, PlusOutlined, SettingOutlined, CheckCircleOutlined, ExperimentOutlined, InboxOutlined } from '@ant-design/icons';
import api from '../../services/api';
import SceneEditor from './components/SceneEditor';
import type { SceneItem } from './components/SceneEditor';
import CreditRulesAlert from '../../components/CreditRulesAlert';
import './create-template.css';   // 本页 + SceneEditor 样式（作用域 .vct-/.vse-）

const { Title, Text } = Typography;
const { Dragger } = Upload;

// Category is now dynamically determined by LLM during video analysis

interface VariableItem {
  key: string; label: string; type: string; placeholder: string; required: boolean; default_value?: string;
}

export default function CreateTemplate() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'input' | 'analyzing' | 'edit'>('input');
  const [videoUrl, setVideoUrl] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [variables, setVariables] = useState<VariableItem[]>([]);
  const [referenceFrames, setReferenceFrames] = useState<string[]>([]);
  const [sourceUrl, setSourceUrl] = useState('');
  const [ratio, setRatio] = useState('');
  const [saving, setSaving] = useState(false);

  const applyResult = (data: any) => {
    setName(data.name || '');
    setDescription(data.description || '');
    setCategory(data.category || '');
    setScenes(data.scenes || []);
    setVariables(data.variables || []);
    setReferenceFrames(data.reference_frames || []);
    setRatio(data.ratio || '');
    if (data.reference_url) setVideoUrl(data.reference_url);
    if (data.source_url) setSourceUrl(data.source_url);
    setStep('edit');
  };

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
      applyResult(data);
      message.success('视频分析完成！可编辑后保存为模板');
    } catch (err: any) {
      message.error('分析失败: ' + (err?.response?.data?.message || err.message));
      setStep('input');
    }
  };

  const handleUpload = async (file: File) => {
    if (!/\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(file.name)) {
      message.error('仅支持 mp4/mov/webm/mkv/avi/m4v 视频文件');
      return Upload.LIST_IGNORE;
    }
    if (file.size > 300 * 1024 * 1024) {
      message.error('文件不能超过 300MB');
      return Upload.LIST_IGNORE;
    }
    setStep('analyzing');
    try {
      const form = new FormData();
      form.append('file', file);
      if (name) form.append('name', name);
      if (category) form.append('category', category);
      if (description) form.append('description', description);
      const { data } = await api.post('/api/viral/templates/analyze-upload', form);
      applyResult(data);
      message.success('视频分析完成！可编辑后保存为模板');
    } catch (err: any) {
      message.error('分析失败: ' + (err?.response?.data?.message || err.message));
      setStep('input');
    }
    return false;
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
        reference_frames: JSON.stringify(referenceFrames),
        source_url: sourceUrl || undefined,
        ratio: ratio || undefined,
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
    setVariables([...variables, { key: '', label: '', type: 'text', placeholder: '', default_value: '', required: false }]);
  };

  const updateVariable = (i: number, field: string, value: any) => {
    const copy = [...variables];
    (copy[i] as any)[field] = value;
    setVariables(copy);
  };

  const removeVariable = (i: number) => {
    setVariables(variables.filter((_, idx) => idx !== i));
  };

  if (step === 'analyzing') {
    return (
      <div className="vct-root">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setStep('input')}
          className="vct-back">返回</Button>
        <div className="vct-panel vct-panel--center">
          <Spin size="large" />
          <Title level={4} className="vct-analyzing__title">AI 正在分析视频...</Title>
          <Text className="vct-analyzing__sub">下载视频 → 提取关键帧 → 识别场景结构 → 生成模板</Text>
        </div>
      </div>
    );
  }

  return (
    <div className="vct-root">
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/viral')}
        className="vct-back">返回模板集市</Button>
      <CreditRulesAlert apiPath="/api/viral/credit-rules" />
      <Steps
        current={step === 'edit' ? 2 : 0}
        className="vct-steps"
        items={[
          { title: '输入视频', icon: <LinkOutlined /> },
          { title: 'AI 分析', icon: <ExperimentOutlined /> },
          { title: '编辑保存', icon: <CheckCircleOutlined /> },
        ]}
      />

      {step === 'input' && (
        <div className="vct-panel">
          <Title level={4} className="vct-h4">创建新模板</Title>
          <Alert
            message="支持抖音、B站视频链接；也可以上传本地视频。仅支持 5 分钟以内的视频解析，不支持长视频"
            type="info" showIcon
          />

          <div className="vct-field">
            <Text className="vct-field__label">视频链接</Text>
            <Input
              size="large"
              className="vct-input vct-input--lg"
              placeholder="粘贴抖音/B站视频链接"
              prefix={<LinkOutlined />}
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
            />
          </div>

          <Dragger
            accept=".mp4,.mov,.webm,.mkv,.avi,.m4v"
            beforeUpload={handleUpload}
            showUploadList={false}
            className="vct-drigger"
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">点击或拖拽本地视频到此处</p>
            <p className="ant-upload-hint">支持 mp4/mov/webm/mkv/avi/m4v，最大 300MB，仅支持 5 分钟以内视频</p>
          </Dragger>

          <div className="vct-grid2">
            <div>
              <Text className="vct-field__label">模板名称</Text>
              <Input
                className="vct-input"
                placeholder="留空由 AI 自动生成"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div>
              <Text className="vct-field__label">分类（AI 将自动分析，可手动修改）</Text>
              <Input
                className="vct-input"
                placeholder="留空由 AI 自动分类"
                value={category}
                onChange={e => setCategory(e.target.value)}
              />
            </div>
          </div>

          <div className="vct-desc">
            <Text className="vct-field__label">描述</Text>
            <Input.TextArea
              rows={2}
              className="vct-input"
              placeholder="模板简短描述（可选）"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <Button type="primary" size="large" block
            icon={<ExperimentOutlined />}
            onClick={handleAnalyze}
            className="vct-btn-brand vct-btn-lg">
            AI 分析视频结构
          </Button>

          <Divider>或</Divider>

          <Button block icon={<SettingOutlined />}
            onClick={() => { setStep('edit'); setName(name || '手动创建模板'); }}
            className="vct-btn-ghost">
            手动创建模板
          </Button>
        </div>
      )}

      {step === 'edit' && (
        <>
          {/* Template Info */}
          <div className="vct-panel">
            <Title level={5} className="vct-h5">模板信息</Title>
            <div className="vct-grid3">
              <div>
                <Text className="vct-field__label vct-field__label--sm">名称</Text>
                <Input className="vct-input" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div>
                <Text className="vct-field__label vct-field__label--sm">分类</Text>
                <Input className="vct-input" value={category} onChange={e => setCategory(e.target.value)} />
              </div>
              <div>
                <Text className="vct-field__label vct-field__label--sm">参考视频</Text>
                <Input className="vct-input" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} />
              </div>
            </div>
            <div className="vct-desc">
              <Text className="vct-field__label vct-field__label--sm">描述</Text>
              <Input.TextArea className="vct-input" value={description} onChange={e => setDescription(e.target.value)} rows={2} />
            </div>
            {ratio && (
              <Alert type="info" showIcon className="vct-alert-ratio"
                message={
                  <span>
                    已自动检测视频比例：<b className="vct-ratio-strong">{ratio}</b>（创建项目时会默认使用该比例，可在创建页面手动改）
                  </span>
                } />
            )}
          </div>

          <SceneEditor scenes={scenes} onChange={setScenes} />

          {/* Variables */}
          <div className="vct-panel" style={{ marginBottom: 24 }}>
            <div className="vct-panel__hd">
              <div className="vct-panel__title"><span className="vct-bar vct-bar--var" />替换变量</div>
              <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addVariable}>添加变量</Button>
            </div>
            {variables.length === 0 ? (
              <div className="vct-blank">暂无变量，点击“添加变量”创建替换内容字段</div>
            ) : (
              <div className="vct-rows">
                {variables.map((v, i) => (
                  <div key={i} className="vct-row">
                    <div className="vct-row__hd">
                      <Text className="vct-row__name">变量 {i + 1}</Text>
                      <Button type="text" size="small" danger onClick={() => removeVariable(i)}>删除</Button>
                    </div>
                    <div className="vct-row__grid">
                      <Input size="small" placeholder="key (英文)" value={v.key}
                        onChange={e => updateVariable(i, 'key', e.target.value)} />
                      <Input size="small" placeholder="标签 (中文)" value={v.label}
                        onChange={e => updateVariable(i, 'label', e.target.value)} />
                      <Select size="small" value={v.type} onChange={val => updateVariable(i, 'type', val)}
                        style={{ width: '100%' }}
                        options={[
                          { value: 'text', label: '文本' },
                          { value: 'textarea', label: '多行' },
                          { value: 'select', label: '选择' },
                        ]} />
                      <Input size="small" placeholder="建议值" value={v.default_value}
                        onChange={e => updateVariable(i, 'default_value', e.target.value)} />
                      <Input size="small" placeholder="提示" value={v.placeholder}
                        onChange={e => updateVariable(i, 'placeholder', e.target.value)} />
                      <Button size="small" type={v.required ? 'primary' : 'default'}
                        onClick={() => updateVariable(i, 'required', !v.required)}
                        className="vct-row__flag">
                        {v.required ? '必填' : '选填'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="vct-actions">
            <Button onClick={() => navigate('/viral')}>
              取消
            </Button>
            <Button type="primary" size="large" icon={<ThunderboltOutlined />}
              loading={saving} onClick={handleSave}
              className="vct-btn-brand">
              保存模板
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
