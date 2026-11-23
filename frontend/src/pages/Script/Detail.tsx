import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button, Form, Input, Typography, message, Spin, Space, Tag, Modal, Select, Tooltip,
} from 'antd';
import {
  SaveOutlined, ArrowLeftOutlined, VideoCameraOutlined,
  ThunderboltOutlined, ScissorOutlined, NodeIndexOutlined,
  PlayCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
  ClockCircleOutlined, SyncOutlined, ReloadOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import './script.css';   // 与列表/新建共用本页样式（作用域 .scr-root，详见文件头注释）

const { Title } = Typography;
const { TextArea } = Input;
const API_BASE = import.meta.env.VITE_API_BASE || '';
const getUrl = (p: string | null) => p ? (p.startsWith('http') ? p : API_BASE + p) : '';

const STATUS_META: Record<string, { color: string; icon: any; label: string }> = {
  pending:    { color: 'default',    icon: <ClockCircleOutlined />,       label: '待生成' },
  processing: { color: 'processing', icon: <SyncOutlined spin />,         label: '生成中' },
  completed:  { color: 'success',    icon: <CheckCircleOutlined />,       label: '已完成' },
  failed:     { color: 'error',      icon: <CloseCircleOutlined />,       label: '失败' },
};

export default function ScriptDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [script, setScript] = useState<any>(null);
  const [form] = Form.useForm();

  // Generate options
  const [genOpen, setGenOpen] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [stitchLoading, setStitchLoading] = useState(false);
  const [resolution, setResolution] = useState('720p');
  const [ratio, setRatio] = useState('9:16');
  const [duration, setDuration] = useState(5);
  const [style, setStyle] = useState('anime');
  const [characters, setCharacters] = useState<any[]>([]);
  const [charOptions, setCharOptions] = useState<any[]>([]);
  const [stitchResult, setStitchResult] = useState<any>(null);

  const fetchScript = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/script/${id}`);
      setScript(data);
      form.setFieldsValue(data);
    } catch {
      message.error('加载失败');
    }
  }, [id, form]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchScript();
      try {
        const { data: chars } = await api.get('/api/character/list');
        setCharOptions(chars || []);
      } catch {}
      setLoading(false);
    })();
  }, [fetchScript]);

  // Poll scenes status every 5s if any scenes are pending/processing
  useEffect(() => {
    if (!script?.scenes || !Array.isArray(script.scenes)) return;
    const hasActive = script.scenes.some((s: any) => s.status === 'processing' || s.status === 'pending');
    if (!hasActive) return;
    const t = setInterval(fetchScript, 5000);
    return () => clearInterval(t);
  }, [script, fetchScript]);

  const onFinish = async (values: any) => {
    setSaving(true);
    try {
      await api.put(`/api/script/${id}`, values);
      setScript((prev: any) => ({ ...prev, ...values }));
      message.success('保存成功');
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSplit = async () => {
    try {
      const { data } = await api.post(`/api/script/${id}/split`);
      setScript((prev: any) => ({ ...prev, scenes: data }));
      message.success(`已拆分为 ${data.length} 个场景`);
    } catch (err: any) {
      message.error(err.response?.data?.message || '拆分失败');
    }
  };

  const handleSceneUpdate = async (index: number, field: string, value: any) => {
    const copy = { ...script };
    copy.scenes[index][field] = value;
    setScript(copy);
    try {
      await api.put(`/api/script/${id}/scene/${index}`, { [field]: value });
    } catch {
      message.error('更新失败');
    }
  };

  const handleGenerateAll = async () => {
    setGenLoading(true);
    try {
      const { data } = await api.post(`/api/script/${id}/generate-all`, {
        resolution, ratio, duration, style,
        characters: characters.map((cid: number) => {
          const ch = charOptions.find((c: any) => c.id === cid);
          return ch ? { character_id: ch.id, character_name: ch.name, character_desc: ch.description } : { character_id: cid };
        }),
      });
      message.success(`已提交 ${data.total} 个场景`);
      setGenOpen(false);
      fetchScript();
    } catch (err: any) {
      message.error(err.response?.data?.message || '生成失败');
    } finally {
      setGenLoading(false);
    }
  };

  const handleStitchAll = async () => {
    setStitchLoading(true);
    setStitchResult(null);
    try {
      const { data } = await api.post(`/api/script/${id}/stitch-all`);
      setStitchResult(data);
      message.success('拼接完成');
      fetchScript();
    } catch (err: any) {
      message.error(err.response?.data?.message || '拼接失败');
    } finally {
      setStitchLoading(false);
    }
  };

  const scenes: any[] = script?.scenes || [];
  const completedCount = scenes.filter((s: any) => s.status === 'completed').length;
  const hasActive = scenes.some((s: any) => s.status === 'processing' || s.status === 'pending');

  if (loading) return <Spin style={{ display: 'block', marginTop: 100 }} />;

  return (
    <div className="scr-root">
      {/* 顶栏：返回圆钮 + 标题 + 生成中标记（原「返回按钮 + level=2 大标题」） */}
      <div className="scr-topbar">
        <div className="scr-topbar__lead">
          <Button shape="circle" icon={<ArrowLeftOutlined />} onClick={() => navigate('/script')} />
          <div className="scr-topbar__titles">
            <Title level={4} className="scr-topbar__title">剧本详情</Title>
            <span className="scr-topbar__sub">改剧本 → 拆分场景 → 批量生成 → 拼接</span>
          </div>
          {hasActive && <Tag icon={<SyncOutlined spin />} color="processing">生成中...</Tag>}
        </div>
      </div>

      <div className="scr-panel">
        <Form form={form} onFinish={onFinish} layout="vertical">
          <Form.Item name="title" label="标题">
            <Input placeholder="剧本标题" />
          </Form.Item>
          <Form.Item name="content" label="剧本内容">
            <TextArea rows={6} placeholder="输入完整剧本，场景之间用 --- 或空行分隔" />
          </Form.Item>
          <div className="scr-form__foot">
            <Button type="primary" className="scr-btn-primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存修改</Button>
            <Button icon={<ScissorOutlined />} onClick={handleSplit}>拆分场景</Button>
          </div>
        </Form>
      </div>

      <div className="scr-panel">
        <div className="scr-panel__head">
          <div className="scr-panel__title">
            <NodeIndexOutlined />
            <span>场景列表</span>
            <Tag className="scr-panel__tag" color="purple">{scenes.length} 个场景</Tag>
            {completedCount > 0 && <Tag className="scr-panel__tag" color="success">{completedCount} 已完成</Tag>}
          </div>
          <div className="scr-panel__acts">
            <Button icon={<ReloadOutlined />} onClick={fetchScript} size="small">刷新</Button>
            <Button icon={<VideoCameraOutlined />} type="primary" className="scr-btn-primary"
              disabled={scenes.length === 0} onClick={() => setGenOpen(true)}>
              生成全部
            </Button>
            <Button icon={<ThunderboltOutlined />}
              disabled={completedCount < 2}
              loading={stitchLoading}
              onClick={handleStitchAll}>
              拼接全部
            </Button>
          </div>
        </div>

        {scenes.length === 0 ? (
          <div className="scr-stage">请先在剧本内容中编写剧本，点击「拆分场景」</div>
        ) : (
          <div className="scr-scenes">
            {scenes.map((scene: any, i: number) => (
              /* 状态底色原先写死 #f6fff6/#fff6f6/#fff（暗色下全是白卡）→ data-status + color-mix */
              <div className="scr-scene" key={i}
                data-status={scene.status || 'pending'}
                data-has-video={scene.video_url ? '1' : '0'}>
                <div className="scr-scene__head">
                  <span className="scr-scene__no">{i + 1}</span>
                  <span className="scr-scene__name">场景 {i + 1}</span>
                  <Tag className="scr-scene__tag" color={STATUS_META[scene.status]?.color}>{STATUS_META[scene.status]?.label}</Tag>
                  <span className="scr-scene__spacer" />
                  <span className="scr-scene__tail">
                    <span className="scr-scene__label">时长</span>
                    <Select size="small" value={scene.duration || 5}
                      onChange={(v) => handleSceneUpdate(i, 'duration', v)}
                      style={{ width: 80 }}
                      options={[5, 10, 15].map(d => ({ value: d, label: `${d}秒` }))}
                    />
                    {scene.task_id && (
                      <Tooltip title="查看视频详情">
                        <Button size="small" type="text" icon={<PlayCircleOutlined />}
                          onClick={() => navigate(`/video/${scene.task_id}`)} />
                      </Tooltip>
                    )}
                  </span>
                </div>
                <div className="scr-scene__body">
                  <TextArea className="scr-scene__prompt" size="small" rows={3}
                    value={scene.prompt} placeholder="场景 prompt"
                    onChange={(e) => handleSceneUpdate(i, 'prompt', e.target.value)}
                  />
                  {scene.video_url && (
                    <video className="scr-scene__video" controls width="100%"
                      src={getUrl(scene.video_url)}
                      poster={scene.cover_url ? getUrl(scene.cover_url) : undefined}
                    >
                      <source src={getUrl(scene.video_url)} type="video/mp4" />
                    </video>
                  )}
                </div>
                {scene.error_msg && <span className="scr-scene__err">{scene.error_msg}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {stitchResult && (
        <div className="scr-panel scr-stitch">
          <div className="scr-panel__head"><div className="scr-panel__title"><span>拼接结果</span></div></div>
          <video controls width="100%" src={getUrl(stitchResult.video_url)}>
            <source src={getUrl(stitchResult.video_url)} type="video/mp4" />
          </video>
        </div>
      )}

      {/* Generate Options Modal */}
      <Modal title={<Space><VideoCameraOutlined />批量生成场景视频</Space>}
        open={genOpen} onCancel={() => setGenOpen(false)}
        onOk={handleGenerateAll} confirmLoading={genLoading}
        okText={`开始生成 (${scenes.length} 个场景)`} width={500}
      >
        <div className="scr-modal">
          <div className="scr-modal__grid">
            <div className="scr-opt">
              <span className="scr-opt__label">分辨率</span>
              <Select value={resolution} onChange={setResolution} style={{ width: '100%' }}
                options={[{ value: '480p', label: '480p' }, { value: '720p', label: '720p' }, { value: '1080p', label: '1080p' }]} />
            </div>
            <div className="scr-opt">
              <span className="scr-opt__label">宽高比</span>
              <Select value={ratio} onChange={setRatio} style={{ width: '100%' }}
                options={[
                  { label: '9:16', value: '9:16' },
                  { label: '16:9', value: '16:9' },
                  { label: '1:1', value: '1:1' },
                  { label: '4:3', value: '4:3' },
                  { label: '3:4', value: '3:4' },
                  { label: '21:9', value: '21:9' },
                ]} />
            </div>
            <div className="scr-opt">
              <span className="scr-opt__label">风格</span>
              <Select value={style} onChange={setStyle} style={{ width: '100%' }}
                options={[{ value: 'anime', label: '动漫' }, { value: 'realistic', label: '真人' }]} />
            </div>
            <div className="scr-opt">
              <span className="scr-opt__label">默认时长</span>
              <Select value={duration} onChange={setDuration} style={{ width: '100%' }}
                options={[{ value: 5, label: '5秒' }, { value: 10, label: '10秒' }, { value: 15, label: '15秒' }]} />
            </div>
          </div>
          <div className="scr-opt">
            <span className="scr-opt__label">角色（可选）</span>
            <Select mode="multiple" value={characters} onChange={setCharacters}
              style={{ width: '100%' }} placeholder="选择角色（可多选）"
              options={charOptions.map((c: any) => ({ value: c.id, label: c.name }))}
              notFoundContent="暂无角色"
            />
          </div>
          <span className="scr-panel__hint">每个场景会带上前一个场景的剧情提要作为上下文，保证连贯性</span>
        </div>
      </Modal>
    </div>
  );
}
