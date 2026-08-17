import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Button, Spin, Tag, message, Modal } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined } from '@ant-design/icons';
import api from '../../services/api';
import { toStaticUrl } from './types';

const { Text, Title } = Typography;

interface EditorProjectItem {
  id: number;
  name: string;
  ratio: string;
  resolution: string;
  status: string;
  progress: number;
  result_url?: string | null;
  cover_url?: string | null;
  error_msg?: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  pending: { color: 'default', label: '草稿' },
  rendering: { color: 'processing', label: '渲染中' },
  completed: { color: 'success', label: '已导出' },
  failed: { color: 'error', label: '失败' },
};

export default function EditorList() {
  const navigate = useNavigate();
  const [items, setItems] = useState<EditorProjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/editor/projects');
      setItems(res.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = (p: EditorProjectItem) => {
    Modal.confirm({
      title: '确认删除',
      content: `删除「${p.name}」后数据无法恢复！`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.delete(`/api/editor/projects/${p.id}`);
          message.success('已删除');
          load();
        } catch (err: any) {
          message.error('删除失败: ' + (err?.response?.data?.message || err.message));
        }
      },
    });
  };

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>视频剪辑</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            多轨时间线剪辑：视频 / 音频 / 文字 + 转场 / 滤镜 / 配乐，免费导出（总长 ≤60 秒）
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/editor/new')}
          style={{ background: '#7c3aed', borderColor: '#7c3aed', borderRadius: 10 }}>
          新建剪辑项目
        </Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}><Spin size="large" /></div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '100px 0', background: '#fff', borderRadius: 14, border: '1px dashed #e5e7eb' }}>
          <PlayCircleOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />
          <div style={{ fontSize: 15, color: '#666', marginTop: 12 }}>还没有剪辑项目</div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', margin: '8px 0 20px' }}>
            把 AI 生成的视频 / 图片 / 短剧片段拖进时间线，加文字、配乐、转场，一键导出成片
          </Text>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/editor/new')}
            style={{ background: '#7c3aed', borderColor: '#7c3aed', borderRadius: 10 }}>
            创建第一个项目
          </Button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {items.map((p) => (
            <div key={p.id} onClick={() => navigate(`/editor/${p.id}`)}
              style={{ background: '#fff', borderRadius: 14, border: '1px solid #eceef1', overflow: 'hidden', cursor: 'pointer', transition: 'all .2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 6px 18px rgba(124,58,237,.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}>
              <div style={{ aspectRatio: '9/16', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', maxHeight: 200 }}>
                {p.cover_url ? (
                  <video src={toStaticUrl(p.cover_url)} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <PlayCircleOutlined style={{ fontSize: 36, color: '#444' }} />
                )}
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <Text strong ellipsis style={{ fontSize: 13, flex: 1 }}>{p.name}</Text>
                  <Tag color={STATUS_TAG[p.status]?.color || 'default'} style={{ margin: 0, flexShrink: 0 }}>{STATUS_TAG[p.status]?.label || p.status}</Tag>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>{p.ratio} · {p.resolution}</Text>
                  <div style={{ flex: 1 }} />
                  <Button size="small" type="text" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); navigate(`/editor/${p.id}`); }} />
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={(e) => { e.stopPropagation(); handleDelete(p); }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}