import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Checkbox, List, Typography, message, Space, InputNumber, Spin, Empty, Alert } from 'antd';
import { ScissorOutlined, ArrowUpOutlined, ArrowDownOutlined, DeleteOutlined, DownloadOutlined, VideoCameraOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

interface VideoItem {
  id: number;
  video_url: string;
  scriptTitle: string | null;
  resolution: string;
  duration: number;
  style: string;
  status: string;
  created_at: string;
}

interface SelectedClip {
  id: number;
  video_url: string;
  label: string;
  start?: number;
  end?: number;
}

export default function VideoStitchPage() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [stitching, setStitching] = useState(false);
  const [selected, setSelected] = useState<SelectedClip[]>([]);
  const [resultUrl, setResultUrl] = useState('');
  const navigate = useNavigate();

  const fetchVideos = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/video/list', { params: { limit: 100 } });
      const completed = (data.items || []).filter((v: VideoItem) => v.status === 'completed' && v.video_url);
      setVideos(completed);
    } catch { message.error('获取视频列表失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchVideos(); }, []);

  const toggleVideo = (video: VideoItem, checked: boolean) => {
    if (checked) {
      setSelected(prev => [...prev, {
        id: video.id,
        video_url: video.video_url,
        label: `#${video.id} ${video.scriptTitle || ''}`.trim(),
      }]);
    } else {
      setSelected(prev => prev.filter(s => s.id !== video.id));
    }
    setResultUrl('');
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const copy = [...selected];
    [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]];
    setSelected(copy);
  };

  const moveDown = (index: number) => {
    if (index >= selected.length - 1) return;
    const copy = [...selected];
    [copy[index], copy[index + 1]] = [copy[index + 1], copy[index]];
    setSelected(copy);
  };

  const removeClip = (index: number) => {
    setSelected(prev => prev.filter((_, i) => i !== index));
    setResultUrl('');
  };

  const updateTrim = (index: number, field: 'start' | 'end', value: number | null) => {
    const copy = [...selected];
    copy[index] = { ...copy[index], [field]: value ?? undefined };
    setSelected(copy);
  };

  const handleStitch = async () => {
    if (selected.length < 2) {
      message.warning('至少选择 2 个视频');
      return;
    }
    setStitching(true);
    setResultUrl('');
    try {
      const clips = selected.map(s => ({
        id: s.id,
        start: s.start,
        end: s.end,
      }));
      const { data } = await api.post('/api/video/stitch', {
        video_ids: selected.map(s => s.id),
        clips: clips.some(c => c.start !== undefined || c.end !== undefined) ? clips : undefined,
      });
      setResultUrl(data.video_url);
      message.success(`拼接完成！共合并 ${data.merged_from} 个视频`);
    } catch (err: any) {
      message.error(err.response?.data?.message || '拼接失败');
    } finally {
      setStitching(false);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={2}><VideoCameraOutlined /> 视频拼接</Title>
        <Text type="secondary">选择多个已完成视频，调整顺序和裁剪时间，合并为一个长视频</Text>
      </div>

      {resultUrl && (
        <Alert
          type="success"
          showIcon
          title="拼接完成"
          description={
            <Space orientation="vertical">
              <span>已生成拼接视频，可以预览或下载。</span>
              <Space>
                <a href={`${API_BASE}${resultUrl}`} target="_blank" rel="noreferrer">
                  <Button type="primary" icon={<VideoCameraOutlined />}>预览视频</Button>
                </a>
                <a href={`${API_BASE}${resultUrl}?download=1`}>
                  <Button icon={<DownloadOutlined />}>下载视频</Button>
                </a>
              </Space>
            </Space>
          }
          style={{ marginBottom: 20, borderRadius: 12 }}
        />
      )}

      <Card title="选择已完成视频" style={{ marginBottom: 20, borderRadius: 12 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : videos.length === 0 ? (
          <Empty description="暂无已完成视频" />
        ) : (
          <List
            dataSource={videos}
            renderItem={(video) => {
              const isSelected = selected.some(s => s.id === video.id);
              return (
                <List.Item
                  style={{ padding: '8px 0' }}
                  actions={[
                    <Checkbox
                      checked={isSelected}
                      onChange={(e) => toggleVideo(video, e.target.checked)}
                    />,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        <Text strong>#{video.id} {video.scriptTitle || ''}</Text>
                      </Space>
                    }
                    description={
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {video.resolution} · {video.duration}s · {video.style === 'anime' ? '动漫' : '真人'}
                        · {new Date(video.created_at).toLocaleString()}
                      </Text>
                    }
                  />
                </List.Item>
              );
            }}
          />
        )}
      </Card>

      {selected.length > 0 && (
        <Card
          title={`已选 ${selected.length} 个视频`}
          style={{ marginBottom: 20, borderRadius: 12 }}
          extra={
            <Space>
              <Button type="primary" onClick={handleStitch} loading={stitching} icon={<ScissorOutlined />}>
                开始拼接
              </Button>
              <Button onClick={() => { setSelected([]); setResultUrl(''); }}>清空</Button>
            </Space>
          }
        >
          <List
            dataSource={selected}
            renderItem={(clip, index) => (
              <List.Item
                style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}
                actions={[
                  <Button size="small" icon={<ArrowUpOutlined />} onClick={() => moveUp(index)} disabled={index === 0} />,
                  <Button size="small" icon={<ArrowDownOutlined />} onClick={() => moveDown(index)} disabled={index === selected.length - 1} />,
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeClip(index)} />,
                ]}
              >
                <div style={{ width: '100%' }}>
                  <Text strong>{index + 1}. {clip.label}</Text>
                  <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>裁剪：</Text>
                    <InputNumber
                      size="small" min={0} placeholder="开始(秒)"
                      style={{ width: 110 }}
                      value={clip.start}
                      onChange={(v) => updateTrim(index, 'start', v)}
                    />
                    <Text type="secondary">~</Text>
                    <InputNumber
                      size="small" min={0} placeholder="结束(秒)"
                      style={{ width: 110 }}
                      value={clip.end}
                      onChange={(v) => updateTrim(index, 'end', v)}
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>（留空则保留完整片段）</Text>
                  </div>
                </div>
              </List.Item>
            )}
          />
        </Card>
      )}

      <Space>
        <Button onClick={() => navigate('/video')}>返回视频列表</Button>
      </Space>
    </div>
  );
}