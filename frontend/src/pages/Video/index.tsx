import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Typography, Tag, Popconfirm, message, Empty, Progress, Segmented, Tooltip, Input, Select } from 'antd';
import {
  PlusOutlined, DeleteOutlined, VideoCameraOutlined,
  ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
  SyncOutlined, EyeOutlined, ArrowLeftOutlined, DownloadOutlined,
  AppstoreOutlined, UnorderedListOutlined, ReloadOutlined, SearchOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import { withDownload } from '../../utils/staticUrl';
import './video.css';   // 本页质感改造样式（作用域 .vid-root，详见文件头注释）

const { Title } = Typography;
const API_BASE = import.meta.env.VITE_API_BASE || '';
const getUrl = (p: string | null) => p ? (p.startsWith('http') ? p : API_BASE + p) : '';

const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  pending: { color: 'default', icon: <ClockCircleOutlined />, label: '等待中' },
  processing: { color: 'processing', icon: <SyncOutlined spin />, label: '生成中' },
  completed: { color: 'success', icon: <CheckCircleOutlined />, label: '已完成' },
  failed: { color: 'error', icon: <CloseCircleOutlined />, label: '失败' },
};

const FILTER_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '等待中', value: 'pending' },
  { label: '生成中', value: 'processing' },
  { label: '已完成', value: 'completed' },
  { label: '失败', value: 'failed' },
];

const RESOLUTION_OPTIONS = [
  { label: '全部', value: '' },
  { label: '480p', value: '480p' },
  { label: '720p', value: '720p' },
  { label: '1080p', value: '1080p' },
];

export default function VideoListPage() {
  const [videos, setVideos] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchText, setSearchText] = useState('');
  const [resolutionFilter, setResolutionFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [sortBy, setSortBy] = useState('created_at');
  const navigate = useNavigate();
  const seqRef = useRef(0);

  const fetchVideos = async (qs?: string) => {
    const seq = ++seqRef.current;
    try {
      const kw = qs !== undefined ? qs : searchText;
      const params: any = {};
      if (filter !== 'all') params.status = filter;
      if (resolutionFilter) params.resolution = resolutionFilter;
      if (kw) params.search = kw;
      if (sortBy) params.sort_by = sortBy;
      const { data } = await api.get('/api/video/list', { params });
      if (seq !== seqRef.current) return;
      setVideos(data.items || []);
    } catch {
      if (seq !== seqRef.current) return;
      message.error('获取视频列表失败');
    }
  };

  useEffect(() => { fetchVideos(); }, [filter, resolutionFilter, sortBy]);

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api/video/${id}`);
      message.success('删除成功');
      fetchVideos();
    } catch {
      message.error('删除失败');
    }
  };

  const handleRetry = async (id: number) => {
    try {
      await api.post(`/api/video/${id}/retry`);
      message.success('已重新提交任务');
      fetchVideos();
    } catch {
      message.error('重试失败');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) { message.warning('请先选择视频'); return; }
    try {
      await api.post('/api/video/batch-delete', { ids: selectedIds });
      message.success(`已删除 ${selectedIds.length} 个视频`);
      setSelectedIds([]);
      fetchVideos();
    } catch {
      message.error('批量删除失败');
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  const selectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(v => v.id));
    }
  };

  useEffect(() => {
    const hasProcessing = videos.some((v) => v.status === 'pending' || v.status === 'processing');
    if (!hasProcessing) return;
    const timer = setInterval(() => fetchVideos(), 5000);
    return () => clearInterval(timer);
  }, [videos, searchText]);

  const filtered = useMemo(
    () => filter === 'all' ? videos : videos.filter(v => v.status === filter),
    [videos, filter],
  );

  const renderCard = (item: any) => {
    const cfg = statusConfig[item.status] || statusConfig.pending;
    const videoUrl = getUrl(item.video_url);
    const posterUrl = getUrl(item.cover_url);
    const isSelected = selectedIds.includes(item.id);

    return (
      <div
        className="vid-card"
        key={item.id}
        data-selected={isSelected ? '1' : '0'}
        onClick={() => item.status === 'completed' && !isSelected && navigate(`/video/${item.id}`)}
      >
        {/* 缩略图：点击区是「选中」，与整卡点击进详情分开（逻辑不变） */}
        <div className="vid-card__thumb" onClick={e => { e.stopPropagation(); toggleSelect(item.id); }}>
          {item.status === 'completed' && videoUrl ? (
            posterUrl ? (
              /* 同 /studio：封面→视频首帧→都失败就藏掉，不露浏览器裂图图标 */
              <img src={posterUrl} alt="封面"
                onError={(e) => {
                  const el = e.target as HTMLImageElement;
                  if (el.dataset.fallback === '1') { el.style.visibility = 'hidden'; return; }
                  el.dataset.fallback = '1';
                  el.src = videoUrl;
                }} />
            ) : (
              <video src={videoUrl} preload="metadata" muted
                onError={(e) => { (e.target as HTMLVideoElement).style.visibility = 'hidden'; }} />
            )
          ) : (
            <VideoCameraOutlined className="vid-card__ph" />
          )}
          <Tag className="vid-card__status" color={cfg.color}>{cfg.label}</Tag>
          {item.status === 'processing' && (
            <div className="vid-card__bar">
              <Progress percent={item.progress || 0} size="small" showInfo={false} />
            </div>
          )}
        </div>

        <div className="vid-card__body">
          <span className="vid-card__name">{item.scriptTitle || '未命名'}</span>
          <span className="vid-card__meta">
            {item.style === 'realistic' ? '📷 真人' : '🎨 动漫'} · {item.resolution || '720p'} · {item.duration || 5}秒 · ⚡{item.credit_cost || 0}
          </span>
          <div className="vid-card__foot">
            <span className="vid-card__date">{new Date(item.created_at).toLocaleDateString('zh-CN')}</span>
            <span className="vid-card__acts" onClick={e => e.stopPropagation()}>
              {item.status === 'failed' && (
                <Tooltip title="重试">
                  <Button size="small" type="text" icon={<ReloadOutlined />}
                    onClick={() => handleRetry(item.id)} />
                </Tooltip>
              )}
              {item.status === 'completed' && videoUrl && (
                <>
                  <Tooltip title="查看">
                    <Button size="small" type="text" icon={<EyeOutlined />}
                      onClick={() => navigate(`/video/${item.id}`)} />
                  </Tooltip>
                  <Tooltip title="下载">
                    <Button size="small" type="text" icon={<DownloadOutlined />}
                      href={withDownload(getUrl(item.video_url))} target="_blank" />
                  </Tooltip>
                </>
              )}
              <Popconfirm title="确定删除？" onConfirm={() => handleDelete(item.id)}>
                <Tooltip title="删除">
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="vid-root">
      {/* 顶栏：返回圆钮 + 标题 | 新建 / 拼接（原「居中大标题 + 下面一个返回钮」，
          且页底写死 #f8f9fb 导致暗色整页亮底） */}
      <div className="vid-topbar">
        <div className="vid-topbar__lead">
          <Button shape="circle" icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')} />
          <div className="vid-topbar__titles">
            <Title level={4} className="vid-topbar__title">作品管理</Title>
            <span className="vid-topbar__sub">共 {filtered.length} 个任务 · 点缩略图可多选批量删除</span>
          </div>
        </div>
        <div className="vid-toolbar__right">
          <Button type="primary" className="vid-btn-primary" icon={<PlusOutlined />} onClick={() => navigate('/video/create')}>
            新建任务
          </Button>
          <Button icon={<VideoCameraOutlined />} onClick={() => navigate('/video/stitch')}>
            视频拼接
          </Button>
        </div>
      </div>

      {/* 工具条：筛选分段 + 搜索 + 分辨率 + 排序 + 视图切换 + 批量操作 */}
      <div className="vid-toolbar">
        <Segmented value={filter} onChange={(v) => setFilter(v as string)} options={FILTER_OPTIONS} />
        <div className="vid-toolbar__right">
          <Input
            placeholder="搜索任务ID/剧本..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            onPressEnter={() => fetchVideos()}
            style={{ width: 160 }}
            allowClear
            onClear={() => { setSearchText(''); fetchVideos(''); }}
          />
          <Select value={resolutionFilter} onChange={v => setResolutionFilter(v)}
            options={RESOLUTION_OPTIONS} style={{ width: 90 }} />
          <Select value={sortBy} onChange={v => setSortBy(v)} style={{ width: 110 }}
            options={[
              { label: '最新创建', value: 'created_at' },
              { label: '时长升序', value: 'duration' },
            ]} />
          <Segmented value={viewMode} onChange={(v) => setViewMode(v as 'grid' | 'list')}
            options={[
              { label: <AppstoreOutlined />, value: 'grid' },
              { label: <UnorderedListOutlined />, value: 'list' },
            ]} />
          {selectedIds.length > 0 && (
            <>
              <Button size="small" onClick={selectAll}>
                {selectedIds.length === filtered.length ? '取消全选' : '全选'}
              </Button>
              <span className="vid-toolbar__count">已选 {selectedIds.length} 个</span>
              <Popconfirm title={`确定删除选中的 ${selectedIds.length} 个视频？`} onConfirm={handleBatchDelete}>
                <Button danger icon={<DeleteOutlined />}>批量删除</Button>
              </Popconfirm>
            </>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="vid-stage">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无视频任务" />
          <Button type="primary" className="vid-btn-primary" icon={<PlusOutlined />} onClick={() => navigate('/video/create')}>
            创建第一个任务
          </Button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="vid-grid">
          {filtered.map(item => renderCard(item))}
        </div>
      ) : (
        <div className="vid-rows">
          {filtered.map(item => {
            const cfg = statusConfig[item.status] || statusConfig.pending;
            const isSelected = selectedIds.includes(item.id);
            return (
              <div className="vid-row" key={item.id} data-selected={isSelected ? '1' : '0'}
                onClick={() => { if (item.status === 'completed' && !isSelected) navigate(`/video/${item.id}`); }}>
                <div className="vid-row__lead">
                  <span className="vid-row__pick" onClick={e => { e.stopPropagation(); toggleSelect(item.id); }}
                    role="button" aria-label={isSelected ? '取消选择' : '选择'}>
                    {isSelected ? '☑' : '☐'}
                  </span>
                  <Tag className="vid-row__status" icon={cfg.icon} color={cfg.color}>{cfg.label}</Tag>
                  <span className="vid-row__name">{item.scriptTitle || '未命名'}</span>
                  <span className="vid-row__meta">
                    {item.style === 'realistic' ? '📷 真人' : '🎨 动漫'} · {item.resolution} · {item.duration}秒 · ⚡{item.credit_cost}
                  </span>
                </div>
                <div className="vid-row__acts" onClick={e => e.stopPropagation()}>
                  {item.status === 'failed' && (
                    <Tooltip title="重试">
                      <Button size="small" type="text" icon={<ReloadOutlined />}
                        onClick={() => handleRetry(item.id)} />
                    </Tooltip>
                  )}
                  {item.status === 'completed' && (
                    <>
                      <Button size="small" type="text" icon={<EyeOutlined />}
                        onClick={() => navigate(`/video/${item.id}`)} />
                      <Button size="small" type="text" icon={<DownloadOutlined />}
                        href={withDownload(getUrl(item.video_url))} target="_blank" />
                    </>
                  )}
                  <Popconfirm title="确定删除？" onConfirm={() => handleDelete(item.id)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
