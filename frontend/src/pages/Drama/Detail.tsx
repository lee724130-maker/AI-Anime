import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Typography, Button, Card, Tag, Space, Spin, Descriptions, Steps, Alert, message } from 'antd';
import { ArrowLeftOutlined, FileTextOutlined, ThunderboltOutlined, CheckCircleOutlined, PictureOutlined, VideoCameraOutlined, RobotOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../services/api';

const { Title, Text } = Typography;

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

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  if (!project) return null;

  const s = STATUS_MAP[project.status] || STATUS_MAP.draft;

  return (
    <div>
      <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate('/drama')} style={{ padding: 0, marginBottom: 16 }}>
        返回短剧列表
      </Button>

      <Card style={{ borderRadius: 12, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{
            width: 200, height: 150, borderRadius: 8, flexShrink: 0,
            background: project.cover_url
              ? `url(${project.cover_url}) center/cover`
              : 'linear-gradient(135deg, #7c3aed20, #ec489920)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {!project.cover_url && <FileTextOutlined style={{ fontSize: 48, color: '#7c3aed40' }} />}
          </div>
          <div style={{ flex: 1 }}>
            <Space style={{ marginBottom: 12 }}>
              <Title level={4} style={{ margin: 0 }}>{project.title}</Title>
              <Tag color={s.color}>{s.label}</Tag>
            </Space>
            {project.description && <Text style={{ display: 'block', marginBottom: 12, color: '#595959' }}>{project.description}</Text>}
            <Descriptions size="small" column={2}>
              {project.genre && <Descriptions.Item label="题材">{project.genre}</Descriptions.Item>}
              <Descriptions.Item label="集数">{project.episodes} 集</Descriptions.Item>
              {project.duration && <Descriptions.Item label="总时长">{project.duration} 秒</Descriptions.Item>}
              <Descriptions.Item label="创建时间">{dayjs(project.created_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
            </Descriptions>
          </div>
        </div>
      </Card>

      <Card style={{ borderRadius: 12, marginBottom: 24 }}>
        <Steps current={s.step < 0 ? 0 : s.step} size="small" style={{ marginBottom: 24 }}
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
                <Text style={{ whiteSpace: 'pre-wrap', display: 'block', marginBottom: 12 }}>{project.outline}</Text>
                <Button type="primary" loading={analyzing} onClick={handleAnalyze}
                  style={{ background: '#7c3aed', borderColor: '#7c3aed' }}>
                  开始 AI 分析
                </Button>
              </div>
            }
          />
        )}

        {project.status === 'analysis_done' && episodes.length === 0 && (
          <Space orientation="vertical" style={{ width: '100%' }}>
            <Alert type="success" showIcon icon={<CheckCircleOutlined />}
              title="剧本分析已完成"
              description="AI 已分析剧本并生成结构化结果，确认后生成分集和资产。"
            />
            <Space>
              <Button type="primary" onClick={() => navigate(`/drama/${id}/edit-analysis`)}
                style={{ background: '#7c3aed', borderColor: '#7c3aed' }}>
                查看/编辑分析结果
              </Button>
              <Button type="primary" loading={confirming} onClick={handleConfirm}>
                确认并生成分集
              </Button>
            </Space>
          </Space>
        )}
      </Card>

      {episodes.length > 0 && (
        <Card title={`分集列表（${episodes.length} 集）`} style={{ borderRadius: 12, marginBottom: 24 }}
          extra={<Button icon={<VideoCameraOutlined />} onClick={() => navigate(`/drama/${id}/episodes`)}>进入分集</Button>}>
          {episodes.map((ep: any) => (
            <Card key={ep.id} type="inner" size="small" style={{ marginBottom: 8 }}>
              <Space>
                <Tag color="purple">第{ep.episode_no}集</Tag>
                <Text strong>{ep.title}</Text>
                {ep.duration && <Text type="secondary">{ep.duration}秒</Text>}
              </Space>
              {ep.summary && <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>{ep.summary}</Text>}
            </Card>
          ))}
        </Card>
      )}

      {assets.length > 0 && (
        <Card title={`资产库（${assets.length} 个资产）`} style={{ borderRadius: 12 }}
          extra={<Button icon={<PictureOutlined />} onClick={() => navigate(`/drama/${id}/assets`)}>进入资产库</Button>}>
          {['character', 'prop', 'scene'].map((type) => {
            const filtered = assets.filter((a: any) => a.type === type);
            if (!filtered.length) return null;
            return (
              <div key={type} style={{ marginBottom: 12 }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                  {type === 'character' ? '人物' : type === 'prop' ? '物品' : '场景'}
                </Text>
                <Space wrap>
                  {filtered.map((a: any) => (
                    <Tag key={a.id} color={type === 'character' ? 'blue' : type === 'prop' ? 'orange' : 'green'}>
                      {a.name} {a.image_url ? '✅' : '⏳'}
                    </Tag>
                  ))}
                </Space>
              </div>
            );
          })}
        </Card>
      )}

      {modelInfo && (
        <Card title={<span><RobotOutlined /> AI 模型配置</span>} style={{ borderRadius: 12, marginTop: 24 }}>
          <Descriptions size="small" column={1}>
            <Descriptions.Item label="剧本大纲解析">{modelInfo.llm}</Descriptions.Item>
            <Descriptions.Item label="素材库图片生成">{modelInfo.image}</Descriptions.Item>
            <Descriptions.Item label="视频生成（多图参考 R2V）">{modelInfo.videoR2V}</Descriptions.Item>
            <Descriptions.Item label="视频生成（单图参考 I2V）">{modelInfo.videoI2V}</Descriptions.Item>
          </Descriptions>
        </Card>
      )}
    </div>
  );
}
