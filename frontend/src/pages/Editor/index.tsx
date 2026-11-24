import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Button, Spin, Tag, message, Modal } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined } from '@ant-design/icons';
import api from '../../services/api';
import { toStaticUrl } from './types';
import './editor.css';   // 批次F：/editor 与 /editor/:id 共用样式（作用域 .edl-root / .ed-root）

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
    <div className="edl-root">
      <div className="edl-head">
        <div>
          <Title level={4} style={{ margin: 0 }}>视频剪辑</Title>
          <Text type="secondary" className="edl-head__sub">
            多轨时间线剪辑：视频 / 音频 / 文字 + 转场 / 滤镜 / 配乐，免费导出（总长 ≤60 秒）
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} className="edl-btn-new" onClick={() => navigate('/editor/new')}>
          新建剪辑项目
        </Button>
      </div>

      {loading ? (
        <div className="edl-loading"><Spin size="large" /></div>
      ) : items.length === 0 ? (
        <div className="edl-empty">
          <PlayCircleOutlined className="edl-empty__icon" />
          <div className="edl-empty__title">还没有剪辑项目</div>
          <Text type="secondary" className="edl-empty__desc">
            把 AI 生成的视频 / 图片 / 短剧片段拖进时间线，加文字、配乐、转场，一键导出成片
          </Text>
          <Button type="primary" icon={<PlusOutlined />} className="edl-btn-new" onClick={() => navigate('/editor/new')}>
            创建第一个项目
          </Button>
        </div>
      ) : (
        <div className="edl-grid">
          {items.map((p) => (
            <div key={p.id} className="edl-card" onClick={() => navigate(`/editor/${p.id}`)}>
              <div className="edl-card__thumb">
                {p.cover_url ? (
                  <video src={toStaticUrl(p.cover_url)} muted playsInline preload="metadata" />
                ) : (
                  <PlayCircleOutlined className="edl-card__ph" />
                )}
              </div>
              <div className="edl-card__body">
                <div className="edl-card__row">
                  <Text strong ellipsis className="edl-card__name">{p.name}</Text>
                  <Tag color={STATUS_TAG[p.status]?.color || 'default'} className="edl-card__tag">{STATUS_TAG[p.status]?.label || p.status}</Tag>
                </div>
                <div className="edl-card__row">
                  <Text type="secondary" className="edl-card__meta">{p.ratio} · {p.resolution}</Text>
                  <div className="edl-card__spacer" />
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