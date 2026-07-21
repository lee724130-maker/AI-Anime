import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Typography, Button, Card, Tag, Space, Spin, Input, InputNumber,
  Divider, message, Tabs,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined, CheckCircleOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;
const { TextArea } = Input;

export default function EditAnalysisPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.get(`/api/drama/${id}/analysis`)
      .then(({ data }) => setResult(data.structured_result || data))
      .catch(() => { message.error('加载分析结果失败'); navigate(`/drama/${id}`); })
      .finally(() => setLoading(false));
  }, [id]);

  const updateEpisode = (epIndex: number, field: string, value: any) => {
    const r = { ...result };
    r.episodes[epIndex] = { ...r.episodes[epIndex], [field]: value };
    setResult(r);
  };

  const updateSegment = (epIndex: number, segIndex: number, field: string, value: any) => {
    const r = { ...result };
    r.episodes[epIndex].segments[segIndex] = { ...r.episodes[epIndex].segments[segIndex], [field]: value };
    setResult(r);
  };

  const updateAsset = (type: string, index: number, field: string, value: any) => {
    const r = { ...result };
    r.assets[type][index] = { ...r.assets[type][index], [field]: value };
    setResult(r);
  };

  const addSegment = (epIndex: number) => {
    const r = { ...result };
    const segs = r.episodes[epIndex].segments || [];
    const lastNo = segs.length > 0 ? segs[segs.length - 1].segmentNo : 0;
    segs.push({ segmentNo: lastNo + 1, summary: '', prompt: '', prompt_cn: '', characters: [], props: [], scenes: [], duration: 5 });
    r.episodes[epIndex].segments = segs;
    setResult(r);
  };

  const removeSegment = (epIndex: number, segIndex: number) => {
    const r = { ...result };
    r.episodes[epIndex].segments = r.episodes[epIndex].segments.filter((_: any, i: number) => i !== segIndex);
    setResult(r);
  };

  const addAsset = (type: string) => {
    const r = { ...result };
    r.assets[type] = [...(r.assets[type] || []), { name: '', description: '', prompt: '', prompt_cn: '' }];
    setResult(r);
  };

  const removeAsset = (type: string, index: number) => {
    const r = { ...result };
    r.assets[type] = r.assets[type].filter((_: any, i: number) => i !== index);
    setResult(r);
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await api.put(`/api/drama/${id}/analysis`, { structured_result: result });
      message.success('已保存');
    } catch (err: any) {
      message.error(err.response?.data?.message || '保存失败');
    }
    setSaving(false);
  };

  const handleConfirm = async () => {
    if (!id) return;
    setConfirming(true);
    try {
      await api.put(`/api/drama/${id}/analysis`, { structured_result: result });
      await api.post(`/api/drama/${id}/confirm-analysis`);
      message.success('已确认并生成分集和资产');
      navigate(`/drama/${id}`);
    } catch (err: any) {
      message.error(err.response?.data?.message || '确认失败');
    }
    setConfirming(false);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  if (!result) return <div style={{ textAlign: 'center', padding: 80 }}><Text type="secondary">暂无分析结果</Text></div>;

  return (
    <div>
      <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/drama/${id}`)} style={{ padding: 0, marginBottom: 16 }}>
        返回项目详情
      </Button>
      <Title level={3} style={{ marginBottom: 4 }}>编辑剧本分析结果</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>查看、修改 AI 分析结果，确认后生成分集和资产</Text>

      <Tabs items={[
        {
          key: 'info', label: '项目信息',
          children: (
            <Card style={{ borderRadius: 12 }}>
              <Space orientation="vertical" style={{ width: '100%' }}>
                <div>
                  <Text type="secondary">标题</Text>
                  <Input value={result.title} onChange={(e) => setResult({ ...result, title: e.target.value })} size="large" />
                </div>
                <Space size={12}>
                  <div>
                    <Text type="secondary">题材</Text>
                    <Input value={result.genre} onChange={(e) => setResult({ ...result, genre: e.target.value })} style={{ width: 160 }} />
                  </div>
                  <div>
                    <Text type="secondary">集数</Text>
                    <InputNumber value={result.episodeCount} onChange={(v) => setResult({ ...result, episodeCount: v })} min={1} max={99} />
                  </div>
                </Space>
              </Space>
            </Card>
          ),
        },
        {
          key: 'episodes', label: `分集片段 (${(result.episodes || []).length}集)`,
          children: (
            <div>
              {(result.episodes || []).map((ep: any, epIndex: number) => (
                <Card key={epIndex} title={
                  <Space>
                    <Tag color="purple">第{ep.episodeNo}集</Tag>
                    <Input value={ep.title} onChange={(e) => updateEpisode(epIndex, 'title', e.target.value)}
                      style={{ width: 200 }} placeholder="集标题" />
                    <InputNumber value={ep.duration} onChange={(v) => updateEpisode(epIndex, 'duration', v)}
                      min={30} max={600} addonAfter="秒" style={{ width: 120 }} />
                  </Space>
                } style={{ borderRadius: 8, marginBottom: 12 }} size="small" extra={
                  <TextArea value={ep.summary} onChange={(e) => updateEpisode(epIndex, 'summary', e.target.value)}
                    rows={2} style={{ width: 400 }} placeholder="剧情概要" />
                }>
                  {(ep.segments || []).map((seg: any, segIndex: number) => (
                    <Card key={segIndex} type="inner" size="small" style={{ marginBottom: 8 }}
                      extra={
                        <Button type="link" danger size="small"
                          onClick={() => removeSegment(epIndex, segIndex)}>删除</Button>
                      }>
                      <Space orientation="vertical" style={{ width: '100%' }}>
                        <Space size={8}>
                          <Tag>片段 {seg.segmentNo}</Tag>
                          <InputNumber value={seg.duration} onChange={(v) => updateSegment(epIndex, segIndex, 'duration', v)}
                            min={3} max={30} addonAfter="秒" style={{ width: 100 }} />
                        </Space>
                        <TextArea value={seg.summary} onChange={(e) => updateSegment(epIndex, segIndex, 'summary', e.target.value)}
                          rows={1} placeholder="片段概述" />
                        <TextArea value={seg.prompt} onChange={(e) => updateSegment(epIndex, segIndex, 'prompt', e.target.value)}
                          rows={1} placeholder="英文提示词（给AI用）" />
                        <TextArea value={seg.prompt_cn} onChange={(e) => updateSegment(epIndex, segIndex, 'prompt_cn', e.target.value)}
                          rows={1} placeholder="中文提示词描述（给你看）" />
                        <Space size={4}>
                          <Text type="secondary" style={{ fontSize: 12 }}>角色:</Text>
                          {(seg.characters || []).map((c: string) => <Tag key={c} color="blue">{c}</Tag>)}
                          <Text type="secondary" style={{ fontSize: 12 }}>物品:</Text>
                          {(seg.props || []).map((p: string) => <Tag key={p} color="orange">{p}</Tag>)}
                          <Text type="secondary" style={{ fontSize: 12 }}>场景:</Text>
                          {(seg.scenes || []).map((s: string) => <Tag key={s} color="green">{s}</Tag>)}
                        </Space>
                      </Space>
                    </Card>
                  ))}
                  <Button type="dashed" size="small" onClick={() => addSegment(epIndex)}>+ 添加片段</Button>
                </Card>
              ))}
            </div>
          ),
        },
        {
          key: 'assets', label: `资产 (${(result.assets?.characters?.length||0)+(result.assets?.props?.length||0)+(result.assets?.scenes?.length||0)})`,
          children: (
            <div>
              {(['characters', 'props', 'scenes'] as const).map((type) => (
                <div key={type} style={{ marginBottom: 20 }}>
                  <Title level={5}>
                    {type === 'characters' ? '人物' : type === 'props' ? '物品' : '场景'}
                    <Button type="link" size="small" onClick={() => addAsset(type)}>+ 新增</Button>
                  </Title>
                  {(result.assets?.[type] || []).map((asset: any, idx: number) => (
                    <Card key={idx} size="small" style={{ marginBottom: 8 }}
                      extra={<Button type="link" danger size="small" onClick={() => removeAsset(type, idx)}>删除</Button>}>
                      <Space orientation="vertical" style={{ width: '100%' }}>
                        <Space>
                          <Input value={asset.name} onChange={(e) => updateAsset(type, idx, 'name', e.target.value)}
                            placeholder="名称" style={{ width: 160 }} />
                        </Space>
                        <TextArea value={asset.description} onChange={(e) => updateAsset(type, idx, 'description', e.target.value)}
                          rows={1} placeholder="描述" />
                        <TextArea value={asset.prompt} onChange={(e) => updateAsset(type, idx, 'prompt', e.target.value)}
                          rows={1} placeholder="英文提示词（给AI用）" />
                        <TextArea value={asset.prompt_cn} onChange={(e) => updateAsset(type, idx, 'prompt_cn', e.target.value)}
                          rows={1} placeholder="中文提示词描述（给你看）" />
                      </Space>
                    </Card>
                  ))}
                </div>
              ))}
            </div>
          ),
        },
      ]} />

      <Divider />
      <Space size={12}>
        <Button type="default" icon={<SaveOutlined />} loading={saving} onClick={handleSave} size="large">保存草稿</Button>
        <Button type="primary" icon={<CheckCircleOutlined />} loading={confirming} onClick={handleConfirm}
          style={{ background: '#7c3aed', borderColor: '#7c3aed' }} size="large">
          确认并生成
        </Button>
      </Space>
    </div>
  );
}
