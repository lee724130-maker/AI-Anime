import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Table, Tag, Button, Space, Image, Modal, Input, Select, Typography, Tooltip, message,
} from 'antd';
import {
  PictureOutlined, VideoCameraOutlined, ReloadOutlined, SaveOutlined, PlayCircleFilled, DeleteOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import { formatDateSafe } from '../../utils/date';

const { Text } = Typography;
const API_BASE = import.meta.env.VITE_API_BASE || '';
const getUrl = (p: string | null) => p ? (p.startsWith('http') ? p : API_BASE + p) : '';

const statusColor: Record<string, string> = {
  pending: 'default', processing: 'processing', completed: 'success', failed: 'error',
};
const statusLabel: Record<string, string> = {
  pending: '排队中', processing: '生成中', completed: '已完成', failed: '失败',
};

export default function HistoryTable({ pageSize = 8, showFilters = false, showPagination = false, refreshKey = 0, active = false }: {
  pageSize?: number;
  showFilters?: boolean;
  showPagination?: boolean;
  refreshKey?: number;
  active?: boolean;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [saveModal, setSaveModal] = useState<{ visible: boolean; record: any; name: string; type: string; description: string; promptCn: string }>({ visible: false, record: null, name: '', type: 'character', description: '', promptCn: '' });
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const seqRef = useRef(0);

  const fetch = useCallback(async (silent = false) => {
    const seq = ++seqRef.current;
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/api/generate/tasks', {
        params: { page, limit: pageSize, type: filterType, status: filterStatus },
      });
      if (seq !== seqRef.current) return;
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch { /* ignore */ }
    if (seq !== seqRef.current) return;
    if (!silent) setLoading(false);
  }, [page, pageSize, filterType, filterStatus]);

  useEffect(() => { fetch(); }, [fetch, refreshKey]);

  // 有活跃任务（排队/生成中）时每 3 秒静默刷新，与生成页轮询保持同步
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => fetch(true), 3000);
    return () => clearInterval(timer);
  }, [active, fetch]);

  const handleRetry = async (id: number) => {
    try {
      await api.post(`/api/generate/tasks/${id}/retry`);
      message.success('任务已重新提交');
      fetch();
    } catch (err: any) {
      message.error(err.response?.data?.message || '重试失败');
    }
  };

  const handleDelete = (id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除后数据无法恢复！',
      okText: '确认',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.delete(`/api/generate/tasks/${id}`);
          message.success('删除成功');
          fetch();
        } catch (err: any) {
          message.error(err.response?.data?.message || '删除失败');
        }
      },
    });
  };

  const openSaveModal = (record: any) => {
    try {
      const data = JSON.parse(record.output_data || '{}');
      const url = data.url || data[0]?.url;
      const input = JSON.parse(record.input_data || '{}');
      const prompt = record.prompt || input.prompt || '';
      const defaultType = record.type === 'video' ? 'video' : 'character';
      setSaveModal({ visible: true, record: { ...record, _url: url }, name: prompt.slice(0, 50) || '', type: defaultType, description: '', promptCn: '' });
    } catch { message.error('无法获取生成结果'); }
  };

  const handleSaveToGlobal = async () => {
    try {
      const { record, name, type, description, promptCn } = saveModal;
      const input = JSON.parse(record.input_data || '{}');
      const prompt = record.prompt || input.prompt || '';
      const isVideo = type === 'video';
      const payload: any = {
        type, name, description: description || '', prompt, prompt_cn: promptCn || '',
        source_type: 'generate', tags: type,
      };
      if (isVideo) {
        payload.video_url = record._url;
        payload.image_url = null;
      } else {
        payload.image_url = record._url;
      }
      await api.post('/api/global-assets', payload);
      message.success('已保存到大资产库');
      setSaveModal({ visible: false, record: null, name: '', type: 'character', description: '', promptCn: '' });
    } catch (err: any) {
      message.error(err.response?.data?.message || '保存失败');
    }
  };

  const columns = [
    { title: '类型', dataIndex: 'type', width: 80, render: (v: string) => (
      <Tag icon={v === 'image' ? <PictureOutlined /> : <VideoCameraOutlined />}>
        {v === 'image' ? '图片' : '视频'}
      </Tag>
    )},
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => (
      <Tag color={statusColor[v] || 'default'}>{statusLabel[v] || v}</Tag>
    )},
    { title: '创建时间', dataIndex: 'created_at', width: 160, render: (v: string) => formatDateSafe(v) },
    { title: '结果', dataIndex: 'output_data', width: 200, render: (v: string, r: any) => {
      if (!v) return '-';
      try {
        const data = JSON.parse(v);
        const itemsArr = Array.isArray(data) ? data : (data.url ? [data] : []);
        if (itemsArr.length === 0) return '-';
        if (r.type === 'image') return (
          <Space size={4} wrap>
            {itemsArr.map((item: any, i: number) => {
              const imgUrl = getUrl(item.url);
              const label = item.view || '';
              return (
                <div key={i} style={{ textAlign: 'center' }}>
                  <Image src={imgUrl} width={label ? 48 : 60} preview={{ src: imgUrl }} />
                  {label && <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>{label}</div>}
                </div>
              );
            })}
          </Space>
        );
        const videoUrl = getUrl(itemsArr[0]?.url);
        return (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <video
              src={videoUrl}
              width={160}
              height={90}
              controls
              playsInline
              preload="metadata"
              style={{ borderRadius: 4, background: '#1a1a1a', cursor: 'pointer', objectFit: 'contain' }}
              onClick={() => { setPreviewUrl(videoUrl); setPreviewVisible(true); }}
            />
            <Tooltip title="全屏预览">
              <PlayCircleFilled
                onClick={() => { setPreviewUrl(videoUrl); setPreviewVisible(true); }}
                style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 32, color: 'rgba(255,255,255,0.8)', cursor: 'pointer', opacity: 0.7 }}
              />
            </Tooltip>
          </div>
        );
      } catch { return '-'; }
    }},
    { title: '错误', dataIndex: 'error_msg', width: 150, ellipsis: true, render: (v: string) => v ? <Text type="danger">{v}</Text> : '-' },
    { title: '操作', width: 140, render: (_: any, r: any) => (
      <Space size={0}>
        {r.status === 'failed' ? <Button type="link" size="small" icon={<ReloadOutlined />} onClick={() => handleRetry(r.id)}>重试</Button> : null}
        {r.status === 'completed' && r.output_data ? <Button type="link" size="small" icon={<SaveOutlined />} onClick={() => openSaveModal(r)}>保存</Button> : null}
        <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id)}>删除</Button>
      </Space>
    )},
  ];

  return (
    <div>
      {showFilters && (
        <Space size={8} style={{ marginBottom: 12 }}>
          <Select
            value={filterType}
            onChange={(v) => { setFilterType(v); setPage(1); }}
            style={{ width: 120 }}
            options={[
              { label: '全部类型', value: '' },
              { label: '图片', value: 'image' },
              { label: '视频', value: 'video' },
            ]}
          />
          <Select
            value={filterStatus}
            onChange={(v) => { setFilterStatus(v); setPage(1); }}
            style={{ width: 140 }}
            options={[
              { label: '全部状态', value: '' },
              { label: '排队中', value: 'pending' },
              { label: '生成中', value: 'processing' },
              { label: '已完成', value: 'completed' },
              { label: '失败', value: 'failed' },
            ]}
          />
          <Text type="secondary">共 {total} 条</Text>
        </Space>
      )}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={items}
        loading={loading}
        pagination={showPagination ? {
          current: page,
          pageSize,
          total,
          onChange: setPage,
          showSizeChanger: false,
          showTotal: (t: number) => `共 ${t} 条`,
        } : false}
        scroll={{ x: 950 }}
        size="small"
      />

      <Modal title="保存到大资产库" open={saveModal.visible}
        onOk={handleSaveToGlobal} onCancel={() => setSaveModal({ visible: false, record: null, name: '', type: 'character', description: '', promptCn: '' })}
        okText="保存" cancelText="取消" width={520}>
        <Space orientation="vertical" style={{ width: '100%' }} size={12}>
          <div>
            <Text style={{ display: 'block', marginBottom: 4 }}>资产类型</Text>
            <Select value={saveModal.type} onChange={(v) => setSaveModal(prev => ({ ...prev, type: v }))}
              style={{ width: '100%' }} options={[
                { label: '🎭 人物', value: 'character' },
                { label: '📦 物品', value: 'prop' },
                { label: '🌄 场景', value: 'scene' },
                { label: '🎬 视频', value: 'video' },
              ]} />
          </div>
          <div>
            <Text style={{ display: 'block', marginBottom: 4 }}>资产名称</Text>
            <Input value={saveModal.name} onChange={(e) => setSaveModal(prev => ({ ...prev, name: e.target.value }))}
              placeholder="输入资产名称" />
          </div>
          <div>
            <Text style={{ display: 'block', marginBottom: 4 }}>描述（可选）</Text>
            <Input.TextArea rows={2} value={saveModal.description}
              onChange={(e) => setSaveModal(prev => ({ ...prev, description: e.target.value }))}
              placeholder="人物定位、场景作用或物品用途" />
          </div>
          <div>
            <Text style={{ display: 'block', marginBottom: 4 }}>中文提示词描述（可选）</Text>
            <Input.TextArea rows={3} value={saveModal.promptCn}
              onChange={(e) => setSaveModal(prev => ({ ...prev, promptCn: e.target.value }))}
              placeholder="用中文描述该资产的画面表现" />
          </div>
          {saveModal.record?._url && (
            <div>
              <Text style={{ display: 'block', marginBottom: 4 }}>预览</Text>
              {saveModal.record.type === 'image'
                ? <Image src={getUrl(saveModal.record._url)} style={{ maxWidth: 200, borderRadius: 4 }} />
                : <video src={getUrl(saveModal.record._url)} controls playsInline preload="metadata" style={{ maxWidth: 200, borderRadius: 4 }} />
              }
            </div>
          )}
        </Space>
      </Modal>

      <Modal
        title="视频预览"
        open={previewVisible}
        onCancel={() => { setPreviewVisible(false); setPreviewUrl(''); }}
        footer={[
          <Button key="close" onClick={() => { setPreviewVisible(false); setPreviewUrl(''); }}>
            关闭
          </Button>,
          <Button key="open" type="link" href={previewUrl} target="_blank">
            在新窗口打开
          </Button>,
        ]}
        width={720}
        centered
        destroyOnHidden
      >
        {previewUrl && (
          <video
            src={previewUrl}
            controls
            playsInline
            preload="auto"
            autoPlay
            style={{ width: '100%', borderRadius: 8, background: '#000' }}
          />
        )}
      </Modal>
    </div>
  );
}
