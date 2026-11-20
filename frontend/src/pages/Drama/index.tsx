import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Button, Tag, Empty, Spin, Popconfirm, message } from 'antd';
import { PlusOutlined, FileTextOutlined, DeleteOutlined, VideoCameraOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../services/api';
import './drama.css';   // 本页质感改造样式（作用域 .drama-root，详见文件头注释）

const { Title } = Typography;

const API_BASE = import.meta.env.VITE_API_BASE || '';
const getUrl = (p: string | null | undefined) => (p ? (p.startsWith('http') ? p : API_BASE + p) : '');

/** 封面数据映射（本轮另建的小函数，不改接口字段）：
 *  后端 GET /api/drama 的 cover_url 会回落到「分集/片段的 video_url」（见 drama.service.ts:113-117），
 *  所以它可能是 mp4。原实现当 CSS background 用 → 视频路径渲染不出任何画面。按类型分别出图/出帧。 */
const coverOf = (p: Project): { kind: 'image' | 'video' | 'none'; src: string } => {
  const src = getUrl(p.cover_url);
  if (!src) return { kind: 'none', src: '' };
  return /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(src) ? { kind: 'video', src } : { kind: 'image', src };
};

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  draft:          { color: 'default', label: '草稿' },
  outline_pending: { color: 'processing', label: '待分析' },
  analysis_done:  { color: 'success', label: '已分析' },
  generating:     { color: 'processing', label: '生成中' },
  completed:      { color: 'success', label: '已完成' },
  failed:         { color: 'error', label: '失败' },
};

interface Project {
  id: number;
  title: string;
  description: string | null;
  cover_url: string | null;
  status: string;
  genre: string | null;
  episodes: number;
  duration: number | null;
  updated_at: string;
  created_at: string;
}

export default function DramaListPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  const fetchList = () => {
    setLoading(true);
    api.get('/api/drama').then(({ data }) => setProjects(data.items)).finally(() => setLoading(false));
  };

  useEffect(() => { fetchList(); }, []);

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api/drama/${id}`);
      message.success('已删除');
      fetchList();
    } catch { message.error('删除失败'); }
  };

  return (
    <div className="drama-root">
      {/* 顶栏：品牌图标块 + 标题（含一行说明） | 新建钮（走 var(--grad-brand)，不再写死 #7c3aed） */}
      <div className="drama-topbar">
        <div className="drama-topbar__lead">
          <span className="drama-topbar__icon"><VideoCameraOutlined /></span>
          <div className="drama-topbar__titles">
            <Title level={4} className="drama-topbar__title">短剧工作室</Title>
            <span className="drama-topbar__sub">管理和创作您的 AI 短剧项目</span>
          </div>
        </div>
        <Button type="primary" size="large" className="drama-btn-new" icon={<PlusOutlined />}
          onClick={() => navigate('/drama/create')}>
          新建短剧
        </Button>
      </div>

      {loading ? (
        <div className="drama-stage"><Spin size="large" /></div>
      ) : projects.length === 0 ? (
        <div className="drama-stage">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无短剧项目">
            <Button type="primary" className="drama-btn-new" icon={<PlusOutlined />}
              onClick={() => navigate('/drama/create')}>
              新建短剧
            </Button>
          </Empty>
        </div>
      ) : (
        <div className="drama-grid">
          {projects.map((p) => {
            const s = STATUS_MAP[p.status] || STATUS_MAP.draft;
            const cv = coverOf(p);
            return (
              <div className="drama-card" key={p.id} onClick={() => navigate(`/drama/${p.id}`)}>
                <div className="drama-card__cover">
                  {/* 占位层永远在底：媒体加载失败时（图挂了 / 视频取不到帧）自动露出图标，不留纯色空洞 */}
                  <span className="drama-card__cover-ph"><FileTextOutlined /></span>
                  {cv.kind === 'image' && (
                    <img className="drama-card__cover-img" src={cv.src} alt="" loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                  )}
                  {cv.kind === 'video' && (
                    <video className="drama-card__cover-img" src={`${cv.src}#t=0.1`} muted playsInline preload="metadata"
                      onError={(e) => { (e.target as HTMLVideoElement).style.visibility = 'hidden'; }} />
                  )}
                  <Tag className="drama-card__status" color={s.color}>{s.label}</Tag>
                  <Popconfirm title="确定删除此项目？此操作不可恢复。" onConfirm={(e) => { e?.stopPropagation(); handleDelete(p.id); }} onCancel={(e) => e?.stopPropagation()}
                    okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                    <Button className="drama-card__del" type="text" size="small" danger icon={<DeleteOutlined />}
                      aria-label="删除项目" onClick={(e) => e.stopPropagation()} />
                  </Popconfirm>
                </div>
                <div className="drama-card__body">
                  <span className="drama-card__name">{p.title}</span>
                  {p.description && <span className="drama-card__desc">{p.description}</span>}
                  <div className="drama-card__meta">
                    {p.genre && <span className="drama-chip"><i>题材</i>{p.genre}</span>}
                    <span className="drama-chip"><i>集数</i>{p.episodes} 集</span>
                    <span className="drama-chip"><i>创建时间</i>{dayjs(p.created_at).format('YYYY-MM-DD HH:mm')}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
