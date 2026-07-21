import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Typography, Button, Card, Tag, Space, Spin, message, Row, Col, Progress, Select, Modal, Tooltip,
} from 'antd';
import { ArrowLeftOutlined, VideoCameraOutlined, SettingOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;

const STYLE_LABEL: Record<string, string> = { anime: '动漫', realistic: '写实' };
const STYLES = [
  { label: '动漫', value: 'anime' },
  { label: '写实', value: 'realistic' },
];
const RATIOS = [
  { label: '9:16 竖屏', value: '9:16' },
  { label: '16:9 横屏', value: '16:9' },
  { label: '1:1 方形', value: '1:1' },
  { label: '4:3 横版', value: '4:3' },
  { label: '3:4 竖版', value: '3:4' },
];
const RESOLUTIONS = ['480p', '720p', '1080p'];

interface Episode {
  id: number; episode_no: number; title: string; summary: string | null;
  duration: number | null; project_id: number;
  style: string | null; ratio: string | null; resolution: string | null;
  created_at: string; updated_at: string;
}

interface SegmentCounts {
  total: number; completed: number; pending: number; failed: number;
}

export default function DramaEpisodesPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [projectTitle, setProjectTitle] = useState('');
  const [segCounts, setSegCounts] = useState<Record<number, SegmentCounts>>({});
  const [loading, setLoading] = useState(true);
  const [settingsModal, setSettingsModal] = useState<{ visible: boolean; ep: Episode | null; style: string; ratio: string; resolution: string }>({ visible: false, ep: null, style: 'anime', ratio: '9:16', resolution: '720p' });

  const fetchData = async () => {
    if (!id) return;
    try {
      const [epRes, projRes] = await Promise.all([
        api.get(`/api/drama/${id}/episodes`),
        api.get(`/api/drama/${id}`),
      ]);
      const eps: Episode[] = epRes.data || [];
      setEpisodes(eps);
      setProjectTitle(projRes.data?.title || '');

      const counts: Record<number, SegmentCounts> = {};
      await Promise.all(eps.map(async (ep) => {
        try {
          const { data: segments } = await api.get(`/api/drama/episodes/${ep.id}/segments`);
          if (Array.isArray(segments)) {
            counts[ep.id] = {
              total: segments.length,
              completed: segments.filter((s: any) => s.status === 'completed').length,
              pending: segments.filter((s: any) => s.status === 'pending').length,
              failed: segments.filter((s: any) => s.status === 'failed').length,
            };
          }
        } catch { /* ignore */ }
      }));
      setSegCounts(counts);
    } catch { message.error('加载分集列表失败'); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id]);

  const openSettings = (ep: Episode) => {
    setSettingsModal({
      visible: true, ep,
      style: ep.style || 'anime',
      ratio: ep.ratio || '9:16',
      resolution: ep.resolution || '720p',
    });
  };

  const saveSettings = async () => {
    const { ep, style, ratio, resolution } = settingsModal;
    if (!ep) return;
    try {
      await api.put(`/api/drama/episodes/${ep.id}/settings`, { style, ratio, resolution });
      message.success('设置已保存');
      setSettingsModal(prev => ({ ...prev, visible: false }));
      fetchData();
    } catch { message.error('保存失败'); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;

  return (
    <div>
      <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/drama/${id}`)} style={{ padding: 0, marginBottom: 16 }}>
        返回项目详情
      </Button>

      <Card style={{ borderRadius: 12, marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>分集列表 · {projectTitle}</Title>
        <Text type="secondary">共 {episodes.length} 集 · 点击「制作」进入片段编辑</Text>
      </Card>

      <Row gutter={[12, 12]}>
        {episodes.map(ep => {
          const cnt = segCounts[ep.id] || { total: 0, completed: 0, pending: 0, failed: 0 };
          const pct = cnt.total > 0 ? Math.round((cnt.completed / cnt.total) * 100) : 0;
          return (
            <Col key={ep.id} xs={24} sm={12} lg={8}>
              <Card
                style={{ borderRadius: 12 }}
                actions={[
                  <Tooltip title="画面设置（风格/比例/清晰度）">
                    <Button type="text" size="small" icon={<SettingOutlined />}
                      onClick={() => openSettings(ep)}>画面设置</Button>
                  </Tooltip>,
                  <Button type="text" size="small" icon={<VideoCameraOutlined />}
                    onClick={() => navigate(`/drama/${id}/episodes/${ep.id}`)}>
                    制作
                  </Button>,
                ]}
              >
                <Space style={{ marginBottom: 8 }}>
                  <Tag color="purple">第{ep.episode_no}集</Tag>
                  <Text strong>{ep.title}</Text>
                </Space>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                  <Tag style={{ fontSize: 11 }}>{STYLE_LABEL[ep.style || ''] || '动漫'}</Tag>
                  <Tag style={{ fontSize: 11 }}>{ep.ratio || '9:16'}</Tag>
                  <Tag style={{ fontSize: 11 }}>{ep.resolution || '720p'}</Tag>
                </div>
                {ep.summary && (
                  <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 13, lineHeight: 1.5 }}>
                    {ep.summary.length > 80 ? ep.summary.slice(0, 80) + '...' : ep.summary}
                  </Text>
                )}
                <div style={{ marginTop: 8 }}>
                  <Space size={4}>
                    <Tag color="purple">{cnt.total} 片段</Tag>
                    {cnt.completed > 0 && <Tag color="success">{cnt.completed} 完成</Tag>}
                    {cnt.pending > 0 && <Tag>{cnt.pending} 待生成</Tag>}
                    {cnt.failed > 0 && <Tag color="error">{cnt.failed} 失败</Tag>}
                  </Space>
                  {cnt.total > 0 && (
                    <Progress percent={pct} size="small" style={{ marginTop: 8 }}
                      strokeColor={pct === 100 ? '#52c41a' : '#7c3aed'} />
                  )}
                </div>
              </Card>
            </Col>
          );
        })}
      </Row>

      <Modal title="画面设置" open={settingsModal.visible} onOk={saveSettings}
        onCancel={() => setSettingsModal(prev => ({ ...prev, visible: false }))}
        okText="保存" cancelText="取消">
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong>画面风格</Text>
            <Select value={settingsModal.style} onChange={v => setSettingsModal(prev => ({ ...prev, style: v }))}
              style={{ width: '100%', marginTop: 4 }} options={STYLES} />
          </div>
          <div>
            <Text strong>画面比例</Text>
            <Select value={settingsModal.ratio} onChange={v => setSettingsModal(prev => ({ ...prev, ratio: v }))}
              style={{ width: '100%', marginTop: 4 }} options={RATIOS} />
          </div>
          <div>
            <Text strong>清晰度</Text>
            <Select value={settingsModal.resolution} onChange={v => setSettingsModal(prev => ({ ...prev, resolution: v }))}
              style={{ width: '100%', marginTop: 4 }} options={RESOLUTIONS.map(r => ({ label: r, value: r }))} />
          </div>
        </Space>
      </Modal>
    </div>
  );
}
