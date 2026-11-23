import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Form, Input, Typography, message, Tag, Select, Tooltip,
} from 'antd';
import {
  SaveOutlined, ArrowLeftOutlined, VideoCameraOutlined,
  ThunderboltOutlined, ScissorOutlined, NodeIndexOutlined,
  PlayCircleOutlined,
  SyncOutlined, ReloadOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import './script.css';   // 与列表/详情共用本页样式（作用域 .scr-root，详见文件头注释）

const { Title } = Typography;
const { TextArea } = Input;
const API_BASE = import.meta.env.VITE_API_BASE || '';
const getUrl = (p: string | null) => p ? (p.startsWith('http') ? p : API_BASE + p) : '';

const STATUS_META: Record<string, { color: string; label: string }> = {
  pending:    { color: 'default',    label: '待生成' },
  processing: { color: 'processing', label: '生成中' },
  completed:  { color: 'success',    label: '已完成' },
  failed:     { color: 'error',      label: '失败' },
};

export default function ScriptCreatePage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // Created script state
  const [scriptId, setScriptId] = useState<number | null>(null);
  const [script, setScript] = useState<any>(null);

  // Scene operations
  const [genLoading, setGenLoading] = useState(false);
  const [stitchLoading, setStitchLoading] = useState(false);
  const [stitchResult, setStitchResult] = useState<any>(null);
  const [resolution, setResolution] = useState('720p');
  const [ratio, setRatio] = useState('9:16');
  const [style, setStyle] = useState('anime');
  const [characters, setCharacters] = useState<any[]>([]);
  const [charOptions, setCharOptions] = useState<any[]>([]);

  const fetchScript = useCallback(async () => {
    if (!scriptId) return;
    try {
      const { data } = await api.get(`/api/script/${scriptId}`);
      setScript(data);
    } catch { message.error('加载失败'); }
  }, [scriptId]);

  useEffect(() => {
    (async () => {
      try {
        const { data: chars } = await api.get('/api/character/list');
        setCharOptions(chars || []);
      } catch {}
    })();
  }, []);

  // Poll scenes
  useEffect(() => {
    if (!script?.scenes || !Array.isArray(script.scenes)) return;
    const hasActive = script.scenes.some((s: any) => s.status === 'processing' || s.status === 'pending');
    if (!hasActive) return;
    const t = setInterval(fetchScript, 5000);
    return () => clearInterval(t);
  }, [script, fetchScript]);

  const onFinish = async (values: { title: string; content: string }) => {
    setSaving(true);
    try {
      if (scriptId) {
        const { data } = await api.put(`/api/script/${scriptId}`, values);
        setScript(data);
        message.success('剧本已保存');
      } else {
        const { data } = await api.post('/api/script', values);
        setScriptId(data.id);
        setScript(data);
        message.success('剧本创建成功');
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || (scriptId ? '保存失败' : '创建失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleSplit = async () => {
    if (!scriptId) return;
    try {
      const { data } = await api.post(`/api/script/${scriptId}/split`);
      setScript((prev: any) => ({ ...prev, scenes: data }));
      message.success(`已拆分为 ${data.length} 个场景`);
    } catch (err: any) {
      message.error(err.response?.data?.message || '拆分失败');
    }
  };

  const handleSceneUpdate = async (index: number, field: string, value: any) => {
    if (!scriptId) return;
    const copy = { ...script };
    copy.scenes[index][field] = value;
    setScript(copy);
    try {
      await api.put(`/api/script/${scriptId}/scene/${index}`, { [field]: value });
    } catch { /* ignore */ }
  };

  const handleGenerateAll = async () => {
    if (!scriptId) return;
    setGenLoading(true);
    try {
      const { data } = await api.post(`/api/script/${scriptId}/generate-all`, {
        resolution, ratio, style,
        characters: characters.map((cid: number) => {
          const ch = charOptions.find((c: any) => c.id === cid);
          return ch ? { character_id: ch.id, character_name: ch.name, character_desc: ch.description } : { character_id: cid };
        }),
      });
      message.success(`已提交 ${data.total} 个场景`);
      fetchScript();
    } catch (err: any) {
      message.error(err.response?.data?.message || '生成失败');
    } finally {
      setGenLoading(false);
    }
  };

  const handleStitchAll = async () => {
    if (!scriptId) return;
    setStitchLoading(true);
    setStitchResult(null);
    try {
      const { data } = await api.post(`/api/script/${scriptId}/stitch-all`);
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

  // Before creation — show form
  if (!scriptId) {
    return (
      <div className="scr-root" style={{ maxWidth: 800 }}>
        <div className="scr-topbar">
          <div className="scr-topbar__lead">
            <div className="scr-topbar__titles">
              <Title level={4} className="scr-topbar__title">新建剧本</Title>
              <span className="scr-topbar__sub">先写标题与正文，创建后才能拆分场景与生成视频</span>
            </div>
          </div>
        </div>
        <div className="scr-panel">
          <Form form={form} onFinish={onFinish} layout="vertical">
            <Form.Item name="title" label="剧本标题">
              <Input placeholder="输入剧本标题" />
            </Form.Item>
            <Form.Item name="content" label="剧本内容" rules={[{ required: true, message: '请输入剧本内容' }]}>
              <TextArea rows={12} placeholder="在此输入或粘贴剧本内容，场景之间用 --- 或空行分隔..." />
            </Form.Item>
            <div className="scr-form__foot">
              <Button type="primary" className="scr-btn-primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存并创建</Button>
              <Button onClick={() => navigate('/script')}>返回</Button>
            </div>
          </Form>
        </div>
      </div>
    );
  }

  // After creation — show scene panel
  return (
    <div className="scr-root">
      <div className="scr-topbar">
        <div className="scr-topbar__lead">
          <Button shape="circle" icon={<ArrowLeftOutlined />} onClick={() => navigate('/script')} />
          <div className="scr-topbar__titles">
            <Title level={4} className="scr-topbar__title">{script?.title || '未命名剧本'}</Title>
            <span className="scr-topbar__sub">写剧本 → 拆分场景 → 逐场景生成视频 → 拼接</span>
          </div>
          {hasActive && <Tag icon={<SyncOutlined spin />} color="processing">生成中...</Tag>}
        </div>
      </div>

      {/* 剧本正文：Card → 令牌面板；Form 与提交逻辑零改动 */}
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

      {/* 场景面板：Card(title/extra) → 令牌面板（标题区 + 动作区分列） */}
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
              disabled={scenes.length === 0} onClick={handleGenerateAll} loading={genLoading}>
              生成全部
            </Button>
            <Button icon={<ThunderboltOutlined />}
              disabled={completedCount < 2} loading={stitchLoading} onClick={handleStitchAll}>
              拼接全部
            </Button>
          </div>
        </div>

        {scenes.length === 0 ? (
          <div className="scr-stage">请先在剧本内容中编写剧本，点击「拆分场景」</div>
        ) : (
          <div className="scr-scenes">
            {scenes.map((scene: any, i: number) => (
              /* 状态色原先写死浅底 + 硬边框（暗色下三张卡全是白底）→ data-status + color-mix */
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
                      <Tooltip title="查看视频">
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

      {/* 生成设置：Row/Col xs8-sm4 魔法断点 → 自适应成对栅格 */}
      {scenes.length > 0 && (
        <div className="scr-panel">
          <div className="scr-panel__head"><div className="scr-panel__title"><span>生成设置</span></div></div>
          <div className="scr-opts">
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
              <span className="scr-opt__label">角色</span>
              <Select mode="multiple" value={characters} onChange={setCharacters} style={{ width: '100%' }}
                placeholder="选择角色" options={charOptions.map((c: any) => ({ value: c.id, label: c.name }))} />
            </div>
            <span className="scr-opts__note">每个场景会带上前一个场景的剧情提要作为上下文，保证连贯性</span>
          </div>
        </div>
      )}

      {/* 拼接结果：写死 border:1px solid #52c41a → .scr-stitch 令牌描边 */}
      {stitchResult && (
        <div className="scr-panel scr-stitch">
          <div className="scr-panel__head"><div className="scr-panel__title"><span>拼接结果</span></div></div>
          <video controls width="100%" src={getUrl(stitchResult.video_url)}>
            <source src={getUrl(stitchResult.video_url)} type="video/mp4" />
          </video>
        </div>
      )}
    </div>
  );
}
