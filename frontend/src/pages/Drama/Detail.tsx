import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Typography, Button, Tag, Spin, Descriptions, Steps, Alert, message } from 'antd';
import { ArrowLeftOutlined, FileTextOutlined, ThunderboltOutlined, CheckCircleOutlined, PictureOutlined, VideoCameraOutlined, RobotOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../services/api';
import CreditRulesAlert from '../../components/CreditRulesAlert';
import './detail.css';   // 本页质感改造样式（作用域 .ddn-，详见文件头注释）

const { Title, Text } = Typography;

const API_BASE = import.meta.env.VITE_API_BASE || '';
const getUrl = (p: string | null | undefined) => (p ? (p.startsWith('http') ? p : API_BASE + p) : '');
/* 与本页列表页 index.tsx 的 coverOf() 同一套：后端 cover_url 会回落到 video_url（drama.service.ts:113-117），
   可能是 mp4，必须按类型分流，否则当 CSS background 用永远画不出画面。 */
const coverOf = (p: Project): { kind: 'image' | 'video' | 'none'; src: string } => {
  const src = getUrl(p.cover_url);
  if (!src) return { kind: 'none', src: '' };
  return /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(src) ? { kind: 'video', src } : { kind: 'image', src };
};

const STATUS_MAP: Record<string, { color: string; label: string; step: number }> = {
  draft:          { color: 'default', label: '草稿', step: 0 },
  outline_pending: { color: 'processing', label: '待分析', step: 1 },
  analysis_done:  { color: 'success', label: '已分析', step: 2 },
  generating:     { color: 'processing', label: '生成中', step: 3 },
  completed:      { color: 'success', label: '已完成', step: 4 },
  failed:         { color: 'error', label: '失败', step: -1 },
};

interface Project {
  id: number; title: string; description: string | null; outline: string | null;
  cover_url: string | null; status: string; genre: string | null;
  episodes: number; duration: number | null;
  created_at: string; updated_at: string;
}

export default function DramaDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [modelInfo, setModelInfo] = useState<{ llm: string; image: string; videoR2V: string; videoI2V: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api.get(`/api/drama/${id}`),
      api.get(`/api/drama/${id}/episodes`).catch(() => ({ data: [] })),
      api.get(`/api/drama/${id}/assets`).catch(() => ({ data: [] })),
    ]).then(([proj, epRes, assetRes]) => {
      setProject(proj.data);
      setEpisodes(epRes.data || []);
      setAssets(assetRes.data || []);
    }).catch(() => { message.error('加载失败'); navigate('/drama'); })
      .finally(() => setLoading(false));
  }, [id]);

  const fetchEpisodes = async () => {
    if (!id) return;
    try {
      const { data } = await api.get(`/api/drama/${id}/episodes`);
      setEpisodes(data || []);
    } catch { /* ignore */ }
  };

  const fetchAssets = async () => {
    if (!id) return;
    try {
      const { data } = await api.get(`/api/drama/${id}/assets`);
      setAssets(data || []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!id) return;
    api.get('/api/drama/model-info').then(({ data }) => {
      setModelInfo(data);
    }).catch(() => { /* ignore */ });
  }, [id]);

  const handleAnalyze = async () => {
    if (!id) return;
    setAnalyzing(true);
    try {
      await api.post(`/api/drama/${id}/analyze`);
      message.success('分析完成');
      const { data } = await api.get(`/api/drama/${id}`);
      setProject(data);
    } catch (err: any) {
      message.error(err.response?.data?.message || '分析失败');
    }
    setAnalyzing(false);
  };

  const handleConfirm = async () => {
    if (!id) return;
    setConfirming(true);
    try {
      await api.post(`/api/drama/${id}/confirm-analysis`);
      message.success('已确认，生成分集和资产');
      const { data } = await api.get(`/api/drama/${id}`);
      setProject(data);
      fetchEpisodes();
      fetchAssets();
    } catch (err: any) {
      message.error(err.response?.data?.message || '确认失败');
    }
    setConfirming(false);
  };

  if (loading) return <div className="ddn-loading"><Spin size="large" /></div>;
  if (!project) return null;

  const s = STATUS_MAP[project.status] || STATUS_MAP.draft;
  const cv = coverOf(project);

  return (
    <div className="ddn-root">
      <div className="ddn-back">
        <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate('/drama')}>
          返回短剧列表
        </Button>
      </div>
      <CreditRulesAlert apiPath="/api/drama/credit-rules" />

      <div className="ddn-panel">
        <div className="ddn-panel__bd">
          <div className="ddn-hero">
            <div className="ddn-cover">
              {/* 占位层永远在底：媒体加载失败时自动露出图标，不留纯色空洞 */}
              <span className="ddn-cover__ph"><FileTextOutlined /></span>
              {cv.kind === 'image' && (
                <img className="ddn-cover__media" src={cv.src} alt="" loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
              )}
              {cv.kind === 'video' && (
                <video className="ddn-cover__media" src={`${cv.src}#t=0.1`} muted playsInline preload="metadata"
                  onError={(e) => { (e.target as HTMLVideoElement).style.visibility = 'hidden'; }} />
              )}
            </div>
            <div className="ddn-info">
              <div className="ddn-info__title">
                <Title level={4}>{project.title}</Title>
                <Tag color={s.color}>{s.label}</Tag>
              </div>
              {project.description && <Text className="ddn-desc">{project.description}</Text>}
              <Descriptions size="small" column={2}>
                {project.genre && <Descriptions.Item label="题材">{project.genre}</Descriptions.Item>}
                <Descriptions.Item label="集数">{project.episodes} 集</Descriptions.Item>
                {project.duration && <Descriptions.Item label="总时长">{project.duration} 秒</Descriptions.Item>}
                <Descriptions.Item label="创建时间">{dayjs(project.created_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
              </Descriptions>
            </div>
          </div>
        </div>
      </div>

      <div className="ddn-panel">
        <div className="ddn-panel__bd">
          <Steps current={s.step < 0 ? 0 : s.step} size="small" className="ddn-steps"
            items={[
              { title: '创建项目' },
              { title: '大纲分析' },
              { title: '编辑确认' },
              { title: '生成制作' },
              { title: '完成' },
            ]}
          />

          {project.status === 'draft' && project.outline && (
            <Alert type="info" showIcon icon={<ThunderboltOutlined />}
              title="剧本大纲已填写"
              description={
                <div>
                  <Text className="ddn-outline">{project.outline}</Text>
                  <Button type="primary" loading={analyzing} onClick={handleAnalyze}
                    className="ddn-btn-brand">
                    开始 AI 分析
                  </Button>
                </div>
              }
            />
          )}

          {project.status === 'analysis_done' && episodes.length === 0 && (
            <div className="ddn-stack">
              <Alert type="success" showIcon icon={<CheckCircleOutlined />}
                title="剧本分析已完成"
                description="AI 已分析剧本并生成结构化结果，确认后生成分集和资产。"
              />
              <div className="ddn-row">
                <Button type="primary" onClick={() => navigate(`/drama/${id}/edit-analysis`)}
                  className="ddn-btn-brand">
                  查看/编辑分析结果
                </Button>
                <Button type="primary" loading={confirming} onClick={handleConfirm}>
                  确认并生成分集
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {episodes.length > 0 && (
        <div className="ddn-panel">
          <div className="ddn-panel__hd">
            <Text>分集列表（{episodes.length} 集）</Text>
            <Button icon={<VideoCameraOutlined />} onClick={() => navigate(`/drama/${id}/episodes`)}>进入分集</Button>
          </div>
          <div className="ddn-panel__bd">
            <div className="ddn-eps">
              {episodes.map((ep: any) => (
                <div key={ep.id} className="ddn-ep">
                  <div className="ddn-ep__hd">
                    <Tag color="purple">第{ep.episode_no}集</Tag>
                    <Text strong>{ep.title}</Text>
                    {ep.duration && <Text className="ddn-ep__sub">{ep.duration}秒</Text>}
                  </div>
                  {ep.summary && <Text className="ddn-ep__summary">{ep.summary}</Text>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {assets.length > 0 && (
        <div className="ddn-panel">
          <div className="ddn-panel__hd">
            <Text>资产库（{assets.length} 个资产）</Text>
            <Button icon={<PictureOutlined />} onClick={() => navigate(`/drama/${id}/assets`)}>进入资产库</Button>
          </div>
          <div className="ddn-panel__bd">
            <div className="ddn-groups">
              {['character', 'prop', 'scene'].map((type) => {
                const filtered = assets.filter((a: any) => a.type === type);
                if (!filtered.length) return null;
                return (
                  <div key={type} className="ddn-group">
                    <Text className="ddn-group__label">
                      {type === 'character' ? '人物' : type === 'prop' ? '物品' : '场景'}
                    </Text>
                    <div className="ddn-chips">
                      {filtered.map((a: any) => (
                        <Tag key={a.id} color={type === 'character' ? 'blue' : type === 'prop' ? 'orange' : 'green'}>
                          {a.name} {a.image_url ? '✅' : '⏳'}
                        </Tag>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {modelInfo && (
        <div className="ddn-panel">
          <div className="ddn-panel__hd">
            <Text><RobotOutlined /> AI 模型配置</Text>
          </div>
          <div className="ddn-panel__bd">
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="剧本大纲解析">{modelInfo.llm}</Descriptions.Item>
              <Descriptions.Item label="素材库图片生成">{modelInfo.image}</Descriptions.Item>
              <Descriptions.Item label="视频生成（多图参考 R2V）">{modelInfo.videoR2V}</Descriptions.Item>
              <Descriptions.Item label="视频生成（单图参考 I2V）">{modelInfo.videoI2V}</Descriptions.Item>
            </Descriptions>
          </div>
        </div>
      )}
    </div>
  );
}
