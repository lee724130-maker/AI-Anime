import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Typography, Tag, Space, Popconfirm, message, Empty, Progress, Segmented, Row, Col, Tooltip, Input, Select } from 'antd';
import {
  PlusOutlined, DeleteOutlined, VideoCameraOutlined,
  ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
  SyncOutlined, EyeOutlined, ArrowLeftOutlined, DownloadOutlined,
  AppstoreOutlined, UnorderedListOutlined, ReloadOutlined, SearchOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import AppHeader from '../../components/AppHeader';

const { Title, Text } = Typography;
const API_BASE = 'http://localhost:3000';
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

  const fetchVideos = async () => {
    try {
      const params: any = {};
      if (filter !== 'all') params.status = filter;
      if (resolutionFilter) params.resolution = resolutionFilter;
      if (searchText) params.search = searchText;
      if (sortBy) params.sort_by = sortBy;
      const { data } = await api.get('/api/video/list', { params });
      setVideos(data.items || []);
    } catch {
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
    const timer = setInterval(fetchVideos, 5000);
    return () => clearInterval(timer);
  }, [videos]);

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
      <Card
        key={item.id}
        hoverable
        style={{
          borderRadius: 12, overflow: 'hidden',
          border: isSelected ? '2px solid #7c3aed' : '1px solid #f0f0f0',
        }}
        styles={{ body: { padding: 0 } }}
        onClick={() => item.status === 'completed' && !isSelected && navigate(`/video/${item.id}`)}
      >
        {/* Thumbnail */}
        <div style={{
          position: 'relative', width: '100%', aspectRatio: '16/9',
          background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}
          onClick={e => { e.stopPropagation(); toggleSelect(item.id); }}>
          {item.status === 'completed' && videoUrl ? (
            posterUrl ? (
              <img src={posterUrl} alt="封面"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => { (e.target as HTMLImageElement).src = videoUrl; }} />
            ) : (
              <video src={videoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                preload="metadata" muted />
            )
          ) : (
            <VideoCameraOutlined style={{ fontSize: 40, color: '#333' }} />
          )}
          {isSelected && <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(124, 58, 237, 0.15)',
          }} />}
          <Tag color={cfg.color} style={{
            position: 'absolute', top: 8, left: 8, margin: 0, fontSize: 11,
          }}>{cfg.label}</Tag>
          {item.status === 'processing' && (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              padding: '0 8px 6px',
            }}>
              <Progress percent={item.progress || 0} size="small" showInfo={false}
                strokeColor="#7c3aed" trailColor="rgba(255,255,255,0.2)" />
            </div>
          )}
        </div>

        <div style={{ padding: '10px 14px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 13, fontWeight: 600, display: 'block' }} ellipsis>
                {item.scriptTitle || '未命名'}
              </Text>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {item.style === 'realistic' ? '📷 真人' : '🎨 动漫'} · {item.resolution || '720p'} · {item.duration || 5}秒 · ⚡{item.credit_cost || 0}
              </Text>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {new Date(item.created_at).toLocaleDateString('zh-CN')}
            </Text>
            <Space size={4} onClick={e => e.stopPropagation()}>
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
                      href={`${API_BASE}${item.video_url}?download=1`} target="_blank" />
                  </Tooltip>
                </>
              )}
              <Popconfirm title="确定删除？" onConfirm={() => handleDelete(item.id)}>
                <Tooltip title="删除">
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            </Space>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fb' }}>
      <AppHeader />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 24px 0' }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <Title level={2} style={{ margin: 0 }}>作品管理</Title>
        </div>
        <Button className="back-btn" icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')} style={{ marginBottom: 16 }}>返回</Button>
      </div>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 32px' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <Segmented value={filter} onChange={(v) => setFilter(v as string)}
            options={FILTER_OPTIONS} />
          <Space wrap>
            <Input
              placeholder="搜索任务ID/剧本..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              onPressEnter={fetchVideos}
              style={{ width: 160 }}
              allowClear
              onClear={() => { setSearchText(''); setTimeout(fetchVideos, 0); }}
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
                <Text type="secondary" style={{ fontSize: 12 }}>已选 {selectedIds.length} 个</Text>
                <Popconfirm title={`确定删除选中的 ${selectedIds.length} 个视频？`} onConfirm={handleBatchDelete}>
                  <Button danger icon={<DeleteOutlined />}>批量删除</Button>
                </Popconfirm>
              </>
            )}
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/video/create')}>
              新建任务
            </Button>
            <Button icon={<VideoCameraOutlined />} onClick={() => navigate('/video/stitch')}>
              视频拼接
            </Button>
          </Space>
        </div>

        {filtered.length === 0 ? (
          <Empty description="暂无视频任务" style={{ padding: 60 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/video/create')}>
              创建第一个任务
            </Button>
          </Empty>
        ) : viewMode === 'grid' ? (
          <Row gutter={[16, 16]}>
            {filtered.map(item => (
              <Col xs={24} sm={12} md={8} lg={6} key={item.id}>
                {renderCard(item)}
              </Col>
            ))}
          </Row>
        ) : (
          filtered.map(item => {
            const cfg = statusConfig[item.status] || statusConfig.pending;
            const isSelected = selectedIds.includes(item.id);
            return (
              <Card key={item.id} style={{
                marginBottom: 8, borderRadius: 10,
                border: isSelected ? '2px solid #7c3aed' : '1px solid #f0f0f0',
              }} hoverable
                onClick={() => { if (item.status === 'completed' && !isSelected) navigate(`/video/${item.id}`); }}
                styles={{ body: { padding: '14px 20px' } }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space>
                    <span onClick={e => { e.stopPropagation(); toggleSelect(item.id); }}
                      style={{ cursor: 'pointer', color: isSelected ? '#7c3aed' : '#ccc', fontSize: 18 }}>
                      {isSelected ? '☑' : '☐'}
                    </span>
                    <Tag icon={cfg.icon} color={cfg.color} style={{ margin: 0 }}>{cfg.label}</Tag>
                    <Text style={{ fontWeight: 500 }}>{item.scriptTitle || '未命名'}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {item.style === 'realistic' ? '📷 真人' : '🎨 动漫'} · {item.resolution} · {item.duration}秒 · ⚡{item.credit_cost}
                    </Text>
                  </Space>
                  <Space size={4} onClick={e => e.stopPropagation()}>
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
                          href={`${API_BASE}${item.video_url}?download=1`} target="_blank" />
                      </>
                    )}
                    <Popconfirm title="确定删除？" onConfirm={() => handleDelete(item.id)}>
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
