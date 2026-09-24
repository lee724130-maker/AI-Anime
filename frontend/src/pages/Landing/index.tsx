import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, Button, Typography, Avatar, message } from 'antd';
import {
  VideoCameraOutlined, WalletOutlined, MoonOutlined, SunOutlined,
  UserOutlined, DownOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../theme/ThemeContext';
import api from '../../services/api';

const { Text } = Typography;

// FAQ items (prod KF)
const FAQ_ITEMS = [
  { q: '需要绘画基础吗？', a: '完全不需要。输入文字描述，AI 自动生成角色图和视频。' },
  { q: '生成一个视频需要多久？', a: '单个片段 30~90 秒，批量场景自动排队，完成后自动拼接。' },
  { q: '角色形象能保持一致吗？', a: '可以。创建角色时生成参考图，后续所有场景自动引用，确保跨场景统一。' },
  { q: '算力怎么算？', a: '按分辨率和时长计费，480p 5 分/次，720p 10 分/次，1080p 20 分/次。' },
];

// Showcase items (prod qF)
const SHOWCASE_ITEMS = [
  { emoji: '⚔️', title: '仙侠短剧', desc: '多角色长篇故事，AI 逐集拆分场景生成', gradient: 'linear-gradient(135deg, #667eea, #764ba2)' },
  { emoji: '🌸', title: '校园恋爱', desc: '青春画风，角色跨场景形象统一', gradient: 'linear-gradient(135deg, #f093fb, #f5576c)' },
  { emoji: '🔮', title: '奇幻冒险', desc: '宏大世界观，批量生成多场景片段', gradient: 'linear-gradient(135deg, #4facfe, #00f2fe)' },
  { emoji: '🎤', title: '音乐 MV', desc: '为歌曲生成视觉画面，歌词驱动镜头语言', gradient: 'linear-gradient(135deg, #fa709a, #fee140)' },
  { emoji: '📖', title: '有声绘本', desc: '故事文字自动生成插画风格视频', gradient: 'linear-gradient(135deg, #a18cd1, #fbc2eb)' },
  { emoji: '🎬', title: '品牌宣传', desc: '快速出分镜草图，验证创意再投入制作', gradient: 'linear-gradient(135deg, #43e97b, #38f9d7)' },
];

type ContactType = 'phone' | 'wechat' | 'email';

function SectionTitle({ badge, title, desc }: { badge: string; title: string; desc?: string }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 48 }}>
      <div
        style={{
          display: 'inline-block', padding: '4px 14px', borderRadius: 999,
          background: 'var(--primary-bg, rgba(124,58,237,0.08))', color: 'var(--primary)',
          fontSize: 13, fontWeight: 600, marginBottom: 16,
        }}
      >
        {badge}
      </div>
      <h2
        style={{
          fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 700, margin: '0 0 8px',
          color: 'var(--text)',
        }}
      >
        {title}
      </h2>
      {desc && <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: 0 }}>{desc}</p>}
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const isAuthed = useAuthStore((s) => !!s.token);
  const { isDark, toggleTheme } = useTheme();
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia('(max-width: 768px)').matches,
  );
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [contactType, setContactType] = useState<ContactType>('phone');
  const [contact, setContact] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = () => setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem('notice_shown')) return;
    api
      .get('/api/admin/site/config')
      .then(({ data }) => {
        if (data.site_notice) {
          setNotice(data.site_notice);
          setNoticeOpen(true);
          sessionStorage.setItem('notice_shown', '1');
        }
      })
      .catch(() => {});
  }, []);

  const submitContact = async () => {
    if (!name.trim()) {
      message.warning('请填写您的称呼');
      return;
    }
    if (!contact.trim()) {
      message.warning('请填写联系方式');
      return;
    }
    if (contactType === 'phone' && !/^1[3-9]\d{9}$/.test(contact.trim())) {
      message.warning('请输入正确的11位手机号');
      return;
    }
    if (contactType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.trim())) {
      message.warning('请输入正确的邮箱地址');
      return;
    }
    if (contactType === 'wechat' && contact.trim().length < 3) {
      message.warning('微信号至少3个字符');
      return;
    }
    if (!description.trim()) {
      message.warning('请填写需求描述');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/contact', {
        name: name.trim(),
        contact: contact.trim(),
        contactType,
        description: description.trim(),
      });
      message.success('提交成功，感谢您的反馈');
      setName('');
      setContact('');
      setDescription('');
    } catch (err: any) {
      message.error(err?.response?.data?.message || '提交失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  };

  const contactInputStyle: React.CSSProperties = {
    width: '100%',
    height: 48,
    borderRadius: 10,
    border: '1.5px solid var(--border)',
    padding: '0 16px',
    fontSize: 14,
    background: 'var(--bg-secondary)',
    color: 'var(--text)',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'all 0.25s',
  };

  return (
    <div className="page-fade-in" style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* 站点公告 */}
      <Modal
        title="📢 站点公告"
        open={noticeOpen}
        onCancel={() => setNoticeOpen(false)}
        footer={
          <Button type="primary" onClick={() => setNoticeOpen(false)}>
            我知道了
          </Button>
        }
      >
        <div style={{ lineHeight: 1.8, fontSize: 14, whiteSpace: 'pre-wrap' }}>{notice}</div>
      </Modal>

      {/* Topbar */}
      <div
        className="landing-topbar"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'var(--bg)',
          backdropFilter: 'blur(10px)',
          padding: '0 32px',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          <VideoCameraOutlined style={{ fontSize: 22, color: 'var(--primary)' }} />
          <Text strong style={{ fontSize: 18, color: 'var(--text)', letterSpacing: '-0.5px' }}>
            AI Anime
          </Text>
        </div>
        <div className="topbar-right" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            type="text"
            icon={isDark ? <SunOutlined /> : <MoonOutlined />}
            onClick={toggleTheme}
            style={{ color: 'var(--text-muted)', fontSize: 18 }}
            title={isDark ? '浅色模式' : '深色模式'}
          />
          {isAuthed ? (
            <>
              <div
                className="topbar-user-info"
                onClick={() => navigate('/dashboard')}
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '4px 16px 4px 4px',
                  borderRadius: 30,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                }}
              >
                <Avatar
                  size={32}
                  icon={<UserOutlined />}
                  style={{ backgroundColor: 'var(--primary)' }}
                />
                <div style={{ lineHeight: 1.2 }}>
                  <div
                    className="topbar-username"
                    style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}
                  >
                    {user?.username}
                  </div>
                  <div
                    className="topbar-credits-text"
                    style={{ fontSize: 11, color: 'var(--warning)', fontWeight: 500 }}
                  >
                    ⚡ {user?.credits ?? 0}
                  </div>
                </div>
              </div>
              <Button
                type="text"
                icon={<WalletOutlined />}
                onClick={() => navigate('/order')}
              >
                充值
              </Button>
              <Button
                type="text"
                danger
                onClick={() => {
                  logout();
                  navigate('/');
                }}
              >
                退出
              </Button>
            </>
          ) : (
            <>
              <Button type="text" onClick={() => navigate('/login')}>
                登录
              </Button>
              <Button
                type="primary"
                style={{ background: 'var(--primary)', border: 'none', borderRadius: 8 }}
                onClick={() => navigate('/register')}
              >
                免费注册
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Hero */}
      <div
        className="landing-hero"
        style={{
          position: 'relative',
          overflow: 'hidden',
          background:
            'linear-gradient(160deg, #0f0a1e 0%, #1e1145 35%, #3b1a7a 65%, #6d28d9 100%)',
          padding: '80px 24px 64px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -100,
            right: -100,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'rgba(139,92,246,0.12)',
            filter: 'blur(80px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -80,
            left: -80,
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: 'rgba(236,72,153,0.08)',
            filter: 'blur(60px)',
          }}
        />
        <div
          style={{
            maxWidth: 720,
            margin: '0 auto',
            position: 'relative',
            zIndex: 1,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              padding: '6px 18px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#d4bffc',
              fontSize: 13,
              marginBottom: 32,
              animation: 'fadeIn 0.6s ease',
            }}
          >
            🎬 面向短剧创作团队
          </div>
          <h1
            style={{
              fontSize: 'clamp(34px, 5.5vw, 56px)',
              fontWeight: 800,
              margin: '0 0 20px',
              lineHeight: 1.12,
              color: '#fff',
              letterSpacing: '-1px',
              animation: 'fadeIn 0.6s ease 0.1s both',
            }}
          >
            把文字变成
            <span style={{ color: '#c084fc' }}>动漫短剧</span>
          </h1>
          <p
            style={{
              fontSize: 'clamp(15px, 2vw, 18px)',
              color: 'rgba(255,255,255,0.6)',
              maxWidth: 500,
              margin: '0 auto 40px',
              lineHeight: 1.7,
              animation: 'fadeIn 0.6s ease 0.2s both',
            }}
          >
            输入一段故事大纲，AI 自动拆分场景、生成角色、合成视频
          </p>
          <div
            className="hero-buttons"
            style={{
              display: 'flex',
              gap: 14,
              justifyContent: 'center',
              flexWrap: 'wrap',
              animation: 'fadeIn 0.6s ease 0.3s both',
            }}
          >
            {isAuthed ? (
              <button
                className="hero-btn"
                onClick={() => navigate('/dashboard')}
                style={{
                  height: 50,
                  padding: '0 40px',
                  borderRadius: 10,
                  fontSize: 16,
                  fontWeight: 600,
                  background: '#fff',
                  color: '#6d28d9',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.2)';
                }}
              >
                进入工作台 →
              </button>
            ) : (
              <>
                <button
                  className="hero-btn"
                  onClick={() => navigate('/register')}
                  style={{
                    height: 50,
                    padding: '0 40px',
                    borderRadius: 10,
                    fontSize: 16,
                    fontWeight: 600,
                    background: '#fff',
                    color: '#6d28d9',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.2)';
                  }}
                >
                  免费开始创作
                </button>
                <button
                  className="hero-btn"
                  onClick={() => navigate('/login')}
                  style={{
                    height: 50,
                    padding: '0 32px',
                    borderRadius: 10,
                    fontSize: 16,
                    background: 'transparent',
                    color: 'rgba(255,255,255,0.75)',
                    cursor: 'pointer',
                    border: '1px solid rgba(255,255,255,0.2)',
                    transition: 'background 0.2s, color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                    e.currentTarget.style.color = '#fff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.75)';
                  }}
                >
                  已有账号？登录
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Workflow strip */}
      <div style={{ maxWidth: 880, margin: '-24px auto 0', padding: '0 24px', position: 'relative', zIndex: 2 }}>
        <div
          className="landing-workflow"
          style={{
            display: 'flex',
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          }}
        >
          {[
            { emoji: '📝', num: '01', title: '输入故事', desc: '一段文字大纲，AI 自动拆分场景' },
            { emoji: '🎨', num: '02', title: '生成角色', desc: 'AI 设定人物形象，跨场景一致' },
            { emoji: '🎬', num: '03', title: '输出成片', desc: '批量生成视频，自动拼接下载' },
          ].map((step, i, arr) => (
            <div
              key={step.num}
              style={{
                flex: 1,
                padding: '28px 24px',
                textAlign: 'center',
                ...(i < arr.length - 1 ? { borderRight: '1px solid var(--border)' } : {}),
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 10 }}>{step.emoji}</div>
              <div
                style={{
                  display: 'inline-block',
                  padding: '2px 10px',
                  borderRadius: 6,
                  background: 'var(--primary-bg, rgba(124,58,237,0.08))',
                  color: 'var(--primary)',
                  fontSize: 11,
                  fontWeight: 700,
                  marginBottom: 8,
                  letterSpacing: 0.5,
                }}
              >
                {step.num}
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                {step.title}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {step.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comparison */}
      <div
        className="landing-section-py"
        style={{ maxWidth: 880, margin: '0 auto', padding: '72px 24px' }}
      >
        <SectionTitle badge="为什么选 AI Anime" title="传统方式 vs AI Anime" />
        <div
          className="landing-comparison"
          style={{ display: 'flex', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)' }}
        >
          <div style={{ flex: 1, padding: '28px 28px', background: 'var(--bg-secondary)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#ef4444', marginBottom: 14, letterSpacing: 0.5 }}>
              ❌ 传统方式
            </div>
            {[
              '需要会画画或找画师',
              '一个角色画几天，跨场景容易走样',
              '手动剪辑拼接，学软件就要几周',
              '修改一个镜头要从头来过',
              '一条 1 分钟短剧做一个月',
            ].map((item, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 10,
                  marginBottom: 11,
                  fontSize: 14,
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: '#ef4444', flexShrink: 0 }}>·</span>
                {item}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, padding: '28px 28px', background: 'var(--bg)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#22c55e', marginBottom: 14, letterSpacing: 0.5 }}>
              ✅ AI Anime
            </div>
            {[
              '输入文字就行，AI 自动生成画面',
              '角色参考图锁定，跨场景形象一致',
              '一键合成视频，拖拽调整片段',
              '改提示词重新生成，几秒搞定',
              '10 分钟出一条完整短剧',
            ].map((item, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 10,
                  marginBottom: 11,
                  fontSize: 14,
                  color: 'var(--text)',
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: '#22c55e', flexShrink: 0 }}>·</span>
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 四步出片 */}
      <div className="landing-section-py" style={{ background: 'var(--bg-secondary)', padding: '72px 24px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <SectionTitle badge="创作流程" title="四步出片" desc="从想法到成片" />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 16,
            }}
          >
            {[
              { num: '01', title: '输入故事大纲', desc: '写一段文字描述你的故事，支持中英文。', gradient: 'linear-gradient(135deg, #ede9fe, #ddd6fe)', emoji: '✍️', color: '#7c3aed' },
              { num: '02', title: 'AI 分析剧本', desc: '自动拆分成集、分场景、设定角色。', gradient: 'linear-gradient(135deg, #fce7f3, #fbcfe8)', emoji: '🤖', color: '#db2777' },
              { num: '03', title: '生成角色与场景', desc: '为每个角色生成参考图，场景自动匹配。', gradient: 'linear-gradient(135deg, #d1fae5, #a7f3d0)', emoji: '🎨', color: '#059669' },
              { num: '04', title: '批量生成视频', desc: '每个片段独立生成，完成后一键拼接。', gradient: 'linear-gradient(135deg, #dbeafe, #bfdbfe)', emoji: '🎬', color: '#2563eb' },
            ].map((card) => (
              <div
                key={card.num}
                style={{
                  borderRadius: 14,
                  overflow: 'hidden',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div
                  className="landing-visual-card-gradient"
                  style={{
                    height: 100,
                    background: card.gradient,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}
                >
                  <span className="landing-visual-card-emoji" style={{ fontSize: 36 }}>
                    {card.emoji}
                  </span>
                  <div
                    style={{
                      position: 'absolute',
                      top: 10,
                      left: 10,
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(255,255,255,0.85)',
                      fontSize: 12,
                      fontWeight: 700,
                      color: card.color,
                    }}
                  >
                    {card.num}
                  </div>
                </div>
                <div style={{ padding: '16px 18px' }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                    {card.title}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {card.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 展示 */}
      <div
        className="landing-section-py"
        style={{ maxWidth: 880, margin: '0 auto', padding: '72px 24px' }}
      >
        <SectionTitle badge="创作可能" title="能做什么" desc="不只是动漫短剧" />
        <div
          className="landing-showcase"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 14,
          }}
        >
          {SHOWCASE_ITEMS.map((item) => (
            <div
              key={item.title}
              style={{
                borderRadius: 14,
                overflow: 'hidden',
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div
                style={{
                  height: 64,
                  background: item.gradient,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: 28 }}>{item.emoji}</span>
              </div>
              <div style={{ padding: '14px 18px' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {item.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div
        className="landing-section-py"
        style={{ maxWidth: 880, margin: '0 auto', padding: '0 24px 72px' }}
      >
        <div
          className="landing-stats"
          style={{
            display: 'flex',
            gap: 0,
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
          }}
        >
          {[
            { value: '9+', label: 'AI 模型', desc: '自动降级兜底' },
            { value: '10min', label: '一条短剧', desc: '从大纲到成片' },
            { value: '6种', label: '画面比例', desc: '9:16 / 16:9 / 1:1 等' },
          ].map((stat, i, arr) => (
            <div
              key={stat.label}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '32px 16px',
                ...(i < arr.length - 1 ? { borderRight: '1px solid var(--border)' } : {}),
              }}
            >
              <div
                className="landing-stats-val"
                style={{ fontSize: 32, fontWeight: 800, color: 'var(--primary)', marginBottom: 6 }}
              >
                {stat.value}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{stat.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div className="landing-section-py" style={{ background: 'var(--bg-secondary)', padding: '72px 24px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <SectionTitle badge="算力套餐" title="按需选择" desc="用完可续，失败退款" />
          <div
            className="landing-pricing"
            style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}
          >
            {[
              { name: '入门包', price: '¥19.9', credits: 200, highlight: false },
              { name: '创作者包', price: '¥59.9', credits: 700, highlight: true },
              { name: '工作室包', price: '¥199', credits: 2500, highlight: false },
            ].map((plan) => (
              <div
                key={plan.name}
                style={{
                  flex: '1 1 220px',
                  maxWidth: 260,
                  borderRadius: 16,
                  padding: '28px 24px',
                  textAlign: 'center',
                  border: plan.highlight ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: 'var(--bg)',
                  position: 'relative',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  ...(plan.highlight ? { boxShadow: '0 4px 20px rgba(124,58,237,0.12)' } : {}),
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {plan.highlight && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -12,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'var(--primary)',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 14px',
                      borderRadius: 999,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    最受欢迎
                  </div>
                )}
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'var(--text)',
                    marginBottom: 10,
                    marginTop: plan.highlight ? 8 : 0,
                  }}
                >
                  {plan.name}
                </div>
                <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--primary)', marginBottom: 4 }}>
                  {plan.price}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
                  {plan.credits} 算力
                </div>
                <button
                  onClick={() => navigate(isAuthed ? '/order' : '/register')}
                  style={{
                    width: '100%',
                    height: 42,
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: plan.highlight ? 'var(--primary)' : 'transparent',
                    color: plan.highlight ? '#fff' : 'var(--primary)',
                    border: plan.highlight ? 'none' : '1px solid var(--primary)',
                    transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '0.85';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '1';
                  }}
                >
                  立即购买
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="landing-faq" style={{ maxWidth: 700, margin: '0 auto', padding: '72px 24px' }}>
        <SectionTitle badge="常见问题" title="有疑问？" />
        {FAQ_ITEMS.map((item, i) => {
          const open = openFaq === i;
          return (
            <div
              key={i}
              style={{
                borderRadius: 12,
                marginBottom: 8,
                overflow: 'hidden',
                border: '1px solid var(--border)',
                borderLeft: `3px solid ${open ? 'var(--primary)' : 'transparent'}`,
                background: 'var(--bg)',
                transition: 'border-color 0.2s',
              }}
            >
              <div
                onClick={() => setOpenFaq(open ? null : i)}
                tabIndex={0}
                role="button"
                aria-expanded={open}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    setOpenFaq(open ? null : i);
                  }
                }}
                style={{
                  padding: '16px 20px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  userSelect: 'none',
                }}
              >
                <Text strong style={{ fontSize: 15, color: 'var(--text)' }}>
                  {item.q}
                </Text>
                <DownOutlined
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    flexShrink: 0,
                    marginLeft: 12,
                    transition: 'transform 0.25s, color 0.25s',
                    transform: open ? 'rotate(-180deg)' : 'rotate(0deg)',
                    ...(open ? { color: 'var(--primary)' } : {}),
                  }}
                />
              </div>
              {open && (
                <div style={{ padding: '0 20px 16px', animation: 'fadeIn 0.15s ease' }}>
                  <Text style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text-muted)' }}>
                    {item.a}
                  </Text>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Contact */}
      <div
        className="landing-contact"
        style={{
          background: 'var(--bg-secondary)',
          padding: '72px 24px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 120,
            height: 3,
            background: 'linear-gradient(90deg, transparent, var(--primary), transparent)',
            borderRadius: 2,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: -100,
            right: -60,
            width: 280,
            height: 280,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(124,58,237,0.06) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -60,
            left: -40,
            width: 200,
            height: 200,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(124,58,237,0.04) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ maxWidth: 620, margin: '0 auto', position: 'relative' }}>
          <SectionTitle badge="反馈与建议" title="帮我们做得更好" desc="您的意见会直接影响产品方向" />
          <div
            className="landing-contact-card"
            style={{
              borderRadius: 16,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              padding: '36px 32px',
              boxShadow: '0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 2,
                background: 'linear-gradient(90deg, var(--primary), #a855f7, var(--primary))',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* 您的称呼 */}
              <div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--text)',
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'var(--primary)',
                      flexShrink: 0,
                    }}
                  />
                  您的称呼
                </label>
                <input
                  placeholder="请输入您的称呼"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={contactInputStyle}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--primary)';
                    e.currentTarget.style.boxShadow =
                      '0 0 0 3px rgba(124,58,237,0.12), inset 0 1px 2px rgba(124,58,237,0.06)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              {/* 联系方式 */}
              <div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--text)',
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'var(--primary)',
                      flexShrink: 0,
                    }}
                  />
                  联系方式
                </label>
                <div style={{ display: 'flex', gap: 0, marginBottom: 10 }}>
                  {([
                    ['phone', '手机号'],
                    ['wechat', '微信号'],
                    ['email', '邮箱'],
                  ] as [ContactType, string][]).map(([value, label]) => (
                    <div
                      key={value}
                      onClick={() => setContactType(value)}
                      style={{
                        flex: 1,
                        textAlign: 'center',
                        padding: '10px 0',
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        background: contactType === value ? 'var(--primary)' : 'var(--bg-secondary)',
                        color: contactType === value ? '#fff' : 'var(--text-muted)',
                        border: `1.5px solid ${contactType === value ? 'var(--primary)' : 'var(--border)'}`,
                        ...(value === 'phone'
                          ? { borderRadius: '10px 0 0 10px' }
                          : value === 'email'
                            ? { borderRadius: '0 10px 10px 0' }
                            : {}),
                      }}
                    >
                      {label}
                    </div>
                  ))}
                </div>
                <input
                  placeholder={
                    contactType === 'phone'
                      ? '请输入手机号'
                      : contactType === 'wechat'
                        ? '请输入微信号'
                        : '请输入邮箱'
                  }
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  style={contactInputStyle}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--primary)';
                    e.currentTarget.style.boxShadow =
                      '0 0 0 3px rgba(124,58,237,0.12), inset 0 1px 2px rgba(124,58,237,0.06)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              {/* 需求描述 */}
              <div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--text)',
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'var(--primary)',
                      flexShrink: 0,
                    }}
                  />
                  需求描述
                </label>
                <textarea
                  placeholder="简单描述您的需求，如：团队人数、使用场景、期望功能"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{
                    width: '100%',
                    borderRadius: 10,
                    border: '1.5px solid var(--border)',
                    padding: '14px 16px',
                    fontSize: 14,
                    background: 'var(--bg-secondary)',
                    color: 'var(--text)',
                    outline: 'none',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    lineHeight: 1.6,
                    fontFamily: 'inherit',
                    transition: 'all 0.25s',
                    minHeight: 100,
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--primary)';
                    e.currentTarget.style.boxShadow =
                      '0 0 0 3px rgba(124,58,237,0.12), inset 0 1px 2px rgba(124,58,237,0.06)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              {/* 提交 */}
              <button
                disabled={submitting}
                style={{
                  height: 48,
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg, var(--primary), #a855f7)',
                  color: '#fff',
                  border: 'none',
                  transition: 'all 0.25s',
                  marginTop: 4,
                  opacity: submitting ? 0.6 : 1,
                  boxShadow: '0 4px 14px rgba(124,58,237,0.3)',
                  letterSpacing: 1,
                }}
                onMouseEnter={(e) => {
                  if (submitting) return;
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(124,58,237,0.4)';
                }}
                onMouseLeave={(e) => {
                  if (submitting) return;
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 14px rgba(124,58,237,0.3)';
                }}
                onClick={submitContact}
              >
                {submitting ? '提交中...' : '提 交'}
              </button>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  marginTop: -4,
                }}
              >
                提交即表示您同意我们的隐私政策
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile bottom bar */}
      {isMobile && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 200,
            background: 'var(--bg)',
            borderTop: '1px solid var(--border)',
            padding: '8px 16px',
            display: 'flex',
            gap: 8,
            boxShadow: '0 -4px 16px rgba(0,0,0,0.1)',
          }}
        >
          {isAuthed ? (
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                flex: 1,
                height: 44,
                borderRadius: 10,
                border: 'none',
                background: 'var(--primary)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(124,58,237,0.3)',
              }}
            >
              进入工作台
            </button>
          ) : (
            <>
              <button
                onClick={() => navigate('/register')}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--primary)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(124,58,237,0.3)',
                }}
              >
                免费开始创作
              </button>
              <button
                onClick={() => navigate('/login')}
                style={{
                  height: 44,
                  borderRadius: 10,
                  border: '1px solid var(--primary)',
                  background: 'transparent',
                  color: 'var(--primary)',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  padding: '0 16px',
                }}
              >
                登录
              </button>
            </>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ borderTop: '1px solid var(--border)', textAlign: 'center', padding: '20px 24px' }}>
        <div
          className="landing-footer-inner"
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            display: 'flex',
            justifyContent: 'center',
            gap: 32,
          }}
        >
          <span>{`© ${new Date().getFullYear()} AI Anime · AI 动漫短剧创作平台`}</span>
          <span>粤ICP备2026069716号-1</span>
        </div>
      </div>
    </div>
  );
}
