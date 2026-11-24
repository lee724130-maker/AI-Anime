import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Checkbox, Typography, message, InputNumber, Spin, Empty } from 'antd';
import { ScissorOutlined, ArrowUpOutlined, ArrowDownOutlined, DeleteOutlined, DownloadOutlined, VideoCameraOutlined, ArrowLeftOutlined, CheckCircleOutlined } from '@ant-design/icons';
import api from '../../services/api';
import { withDownload } from '../../utils/staticUrl';
import './video.css';   // 与列表/详情/新建共用本页样式（作用域 .vid-root）

const { Title } = Typography;
const API_BASE = import.meta.env.VITE_API_BASE || '';

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
    <div className="vid-root">
      <div className="vid-topbar">
        <div className="vid-topbar__lead">
          <Button shape="circle" icon={<ArrowLeftOutlined />} onClick={() => navigate('/video')} />
          <div className="vid-topbar__titles">
            <Title level={4} className="vid-topbar__title">视频拼接</Title>
            <span className="vid-topbar__sub">选择多个已完成视频，调整顺序和裁剪时间，合并为一个长视频</span>
          </div>
        </div>
      </div>

      {resultUrl && (
        <div className="vid-panel">
          <div className="vid-panel__head">
            <div className="vid-panel__title"><CheckCircleOutlined /><span>拼接完成</span></div>
            <div className="vid-panel__acts">
              <a href={`${API_BASE}${resultUrl}`} target="_blank" rel="noreferrer">
                <Button type="primary" className="vid-btn-primary" icon={<VideoCameraOutlined />}>预览视频</Button>
              </a>
              <a href={withDownload(`${API_BASE}${resultUrl}`)}>
                <Button icon={<DownloadOutlined />}>下载视频</Button>
              </a>
            </div>
          </div>
          <p className="vid-panel__hint">已生成拼接视频，可以预览或下载。</p>
        </div>
      )}

      <div className="vid-panel">
        <div className="vid-panel__head">
          <div className="vid-panel__title"><span>选择已完成视频</span></div>
        </div>
        {loading ? (
          <div className="vid-loading"><Spin /></div>
        ) : videos.length === 0 ? (
          <div className="vid-stage"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无已完成视频" /></div>
        ) : (
          <div className="vid-picks">
            {videos.map((video) => {
              const isSelected = selected.some(s => s.id === video.id);
              return (
                <div className="vid-pick" key={video.id}>
                  <div className="vid-pick__lead">
                    <Checkbox checked={isSelected} onChange={(e) => toggleVideo(video, e.target.checked)} />
                    <span className="vid-pick__name">#{video.id} {video.scriptTitle || ''}</span>
                    <span className="vid-pick__meta">
                      {video.resolution} · {video.duration}s · {video.style === 'anime' ? '动漫' : '真人'}
                      · {new Date(video.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="vid-panel">
          <div className="vid-panel__head">
            <div className="vid-panel__title"><span>已选 {selected.length} 个视频</span></div>
            <div className="vid-panel__acts">
              <Button type="primary" className="vid-btn-primary" onClick={handleStitch} loading={stitching} icon={<ScissorOutlined />}>
                开始拼接
              </Button>
              <Button onClick={() => { setSelected([]); setResultUrl(''); }}>清空</Button>
            </div>
          </div>
          <div className="vid-clips">
            {selected.map((clip, index) => (
              <div className="vid-clip" key={clip.id}>
                <div className="vid-clip__head">
                  <span className="vid-clip__name">{index + 1}. {clip.label}</span>
                  <div className="vid-clip__acts">
                    <Button size="small" icon={<ArrowUpOutlined />} onClick={() => moveUp(index)} disabled={index === 0} />
                    <Button size="small" icon={<ArrowDownOutlined />} onClick={() => moveDown(index)} disabled={index === selected.length - 1} />
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeClip(index)} />
                  </div>
                </div>
                <div className="vid-clip__trim">
                  <span className="vid-clip__label">裁剪：</span>
                  <InputNumber
                    size="small" min={0} placeholder="开始(秒)"
                    style={{ width: 110 }}
                    value={clip.start}
                    onChange={(v) => updateTrim(index, 'start', v)}
                  />
                  <span className="vid-clip__label">~</span>
                  <InputNumber
                    size="small" min={0} placeholder="结束(秒)"
                    style={{ width: 110 }}
                    value={clip.end}
                    onChange={(v) => updateTrim(index, 'end', v)}
                  />
                  <span className="vid-clip__hint">（留空则保留完整片段）</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="vid-panel__foot">
        <Button onClick={() => navigate('/video')}>返回视频列表</Button>
      </div>
    </div>
  );
}