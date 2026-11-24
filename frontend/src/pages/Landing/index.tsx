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
import './landing.css';   // 本页质感改造样式（作用域 .lp-root，详见文件头注释）

const { Text } = Typography;

// FAQ items (prod KF)
const FAQ_ITEMS = [
  { q: '需要绘画基础吗？', a: '完全不需要。输入文字描述，AI 自动生成角色图和视频。' },
  { q: '生成一个视频需要多久？', a: '单个片段 30~90 秒，批量场景自动排队，完成后自动拼接。' },
  { q: '角色形象能保持一致吗？', a: '可以。创建角色时生成参考图，后续所有场景自动引用，确保跨场景统一。' },
  { q: '算力怎么算？', a: '按分辨率和时长计费，480p 5 分/次，720p 10 分/次，1080p 20 分/次。' },
];

// Showcase items (prod qF)
// accent 只作「取哪条色带」的键，具体渐变与序号字色统一定义在 landing.css 的 [data-accent] 里，
// 避免同一套色值散落在 JSX 数据数组和 CSS 两处。
const SHOWCASE_ITEMS = [
  { emoji: '⚔️', title: '仙侠短剧', desc: '多角色长篇故事，AI 逐集拆分场景生成', accent: 'indigo' },
  { emoji: '🌸', title: '校园恋爱', desc: '青春画风，角色跨场景形象统一', accent: 'rose' },
  { emoji: '🔮', title: '奇幻冒险', desc: '宏大世界观，批量生成多场景片段', accent: 'cyan' },
  { emoji: '🎤', title: '音乐 MV', desc: '为歌曲生成视觉画面，歌词驱动镜头语言', accent: 'amber' },
  { emoji: '📖', title: '有声绘本', desc: '故事文字自动生成插画风格视频', accent: 'lilac' },
  { emoji: '🎬', title: '品牌宣传', desc: '快速出分镜草图，验证创意再投入制作', accent: 'mint' },
];

type ContactType = 'phone' | 'wechat' | 'email';

function SectionTitle({ badge, title, desc }: { badge: string; title: string; desc?: string }) {
  return (
    <div className="lp-st">
      <div className="lp-st__badge">{badge}</div>
      <h2 className="lp-st__title">{title}</h2>
      {desc && <p className="lp-st__desc">{desc}</p>}
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

  return (
    <div className="page-fade-in lp-root">
      {/* 站点公告：Modal 渲染在 body  portal 里，会逃出 .lp-root 作用域，
          所以把类挂在弹窗自身（.lp-notice-modal）再往下作用域，而不是依赖 .lp-root */}
      <Modal
        className="lp-notice-modal"
        title="📢 站点公告"
        open={noticeOpen}
        onCancel={() => setNoticeOpen(false)}
        footer={
          <Button type="primary" onClick={() => setNoticeOpen(false)}>
            我知道了
          </Button>
        }
      >
        <div className="lp-notice">{notice}</div>
      </Modal>

      {/* Topbar */}
      <div className="lp-topbar">
        <div className="lp-topbar__brand" onClick={() => navigate('/')}>
          <VideoCameraOutlined className="lp-topbar__logo" />
          <Text strong className="lp-topbar__name">AI Anime</Text>
        </div>
        <div className="topbar-right lp-topbar__right">
          <Button
            type="text"
            icon={isDark ? <SunOutlined /> : <MoonOutlined />}
            onClick={toggleTheme}
            className="lp-topbar__theme"
            title={isDark ? '浅色模式' : '深色模式'}
          />
          {isAuthed ? (
            <>
              <div className="topbar-user-info lp-topbar__user" onClick={() => navigate('/dashboard')}>
                <Avatar size={32} icon={<UserOutlined />} className="lp-topbar__avatar" />
                <div className="lp-topbar__meta">
                  <div className="topbar-username lp-topbar__username">{user?.username}</div>
                  <div className="topbar-credits-text lp-topbar__credits">⚡ {user?.credits ?? 0}</div>
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
              <Button type="primary" className="lp-topbar__signup" onClick={() => navigate('/register')}>
                免费注册
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Hero —— 固定深色品牌带，两主题都保持深色，理由见 landing.css 文件头 */}
      <div className="lp-hero">
        <div className="lp-hero__glow lp-hero__glow--a" />
        <div className="lp-hero__glow lp-hero__glow--b" />
        <div className="lp-hero__inner">
          <div className="lp-hero__pill">🎬 面向短剧创作团队</div>
          <h1>
            把文字变成<em>动漫短剧</em>
          </h1>
          <p className="lp-hero__sub">输入一段故事大纲，AI 自动拆分场景、生成角色、合成视频</p>
          <div className="lp-hero__cta">
            {isAuthed ? (
              <button className="lp-hero__btn" onClick={() => navigate('/dashboard')}>
                进入工作台 →
              </button>
            ) : (
              <>
                <button className="lp-hero__btn" onClick={() => navigate('/register')}>
                  免费开始创作
                </button>
                <button className="lp-hero__btn lp-hero__btn--ghost" onClick={() => navigate('/login')}>
                  已有账号？登录
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Workflow strip */}
      <div className="lp-flow">
        <div className="lp-flow__card">
          {[
            { emoji: '📝', num: '01', title: '输入故事', desc: '一段文字大纲，AI 自动拆分场景' },
            { emoji: '🎨', num: '02', title: '生成角色', desc: 'AI 设定人物形象，跨场景一致' },
            { emoji: '🎬', num: '03', title: '输出成片', desc: '批量生成视频，自动拼接下载' },
          ].map((step) => (
            <div key={step.num} className="lp-flow__item">
              <div className="lp-flow__emoji">{step.emoji}</div>
              <div className="lp-flow__num">{step.num}</div>
              <div className="lp-flow__title">{step.title}</div>
              <div className="lp-flow__desc">{step.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Comparison */}
      <div className="lp-wrap lp-wrap--mid">
        <SectionTitle badge="为什么选 AI Anime" title="传统方式 vs AI Anime" />
        <div className="lp-cmp">
          <div className="lp-cmp__col lp-cmp__col--old">
            <div className="lp-cmp__head lp-cmp__head--old">❌ 传统方式</div>
            {[
              '需要会画画或找画师',
              '一个角色画几天，跨场景容易走样',
              '手动剪辑拼接，学软件就要几周',
              '修改一个镜头要从头来过',
              '一条 1 分钟短剧做一个月',
            ].map((item, i) => (
              <div key={i} className="lp-cmp__row lp-cmp__row--old">
                <span className="lp-cmp__dot lp-cmp__dot--old">·</span>
                {item}
              </div>
            ))}
          </div>
          <div className="lp-cmp__col lp-cmp__col--new">
            <div className="lp-cmp__head lp-cmp__head--new">✅ AI Anime</div>
            {[
              '输入文字就行，AI 自动生成画面',
              '角色参考图锁定，跨场景形象一致',
              '一键合成视频，拖拽调整片段',
              '改提示词重新生成，几秒搞定',
              '10 分钟出一条完整短剧',
            ].map((item, i) => (
              <div key={i} className="lp-cmp__row lp-cmp__row--new">
                <span className="lp-cmp__dot lp-cmp__dot--new">·</span>
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 四步出片 */}
      <div className="lp-band">
        <div className="lp-wrap lp-wrap--mid">
          <SectionTitle badge="创作流程" title="四步出片" desc="从想法到成片" />
          <div className="lp-steps">
            {[
              { num: '01', title: '输入故事大纲', desc: '写一段文字描述你的故事，支持中英文。', accent: 'violet', emoji: '✍️' },
              { num: '02', title: 'AI 分析剧本', desc: '自动拆分成集、分场景、设定角色。', accent: 'pink', emoji: '🤖' },
              { num: '03', title: '生成角色与场景', desc: '为每个角色生成参考图，场景自动匹配。', accent: 'green', emoji: '🎨' },
              { num: '04', title: '批量生成视频', desc: '每个片段独立生成，完成后一键拼接。', accent: 'blue', emoji: '🎬' },
            ].map((card) => (
              <div key={card.num} className="lp-step lp-lift">
                <div className="lp-step__band" data-accent={card.accent}>
                  <span className="lp-step__emoji">{card.emoji}</span>
                  <div className="lp-step__badge">{card.num}</div>
                </div>
                <div className="lp-step__body">
                  <div className="lp-step__title">{card.title}</div>
                  <div className="lp-step__desc">{card.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 展示 */}
      <div className="lp-wrap lp-wrap--mid">
        <SectionTitle badge="创作可能" title="能做什么" desc="不只是动漫短剧" />
        <div className="lp-sc">
          {SHOWCASE_ITEMS.map((item) => (
            <div key={item.title} className="lp-sc__card lp-lift">
              <div className="lp-sc__band" data-accent={item.accent}>
                <span className="lp-sc__emoji">{item.emoji}</span>
              </div>
              <div className="lp-sc__body">
                <div className="lp-sc__title">{item.title}</div>
                <div className="lp-sc__desc">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="lp-wrap lp-wrap--mid lp-wrap--tight-top">
        <div className="lp-stats">
          {[
            { value: '9+', label: 'AI 模型', desc: '自动降级兜底' },
            { value: '10min', label: '一条短剧', desc: '从大纲到成片' },
            { value: '6种', label: '画面比例', desc: '9:16 / 16:9 / 1:1 等' },
          ].map((stat) => (
            <div key={stat.label} className="lp-stats__item">
              <div className="lp-stats__val">{stat.value}</div>
              <div className="lp-stats__label">{stat.label}</div>
              <div className="lp-stats__desc">{stat.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div className="lp-band">
        <div className="lp-wrap lp-wrap--mid">
          <SectionTitle badge="算力套餐" title="按需选择" desc="用完可续，失败退款" />
          <div className="lp-plans">
            {[
              { name: '入门包', price: '¥19.9', credits: 200, highlight: false },
              { name: '创作者包', price: '¥59.9', credits: 700, highlight: true },
              { name: '工作室包', price: '¥199', credits: 2500, highlight: false },
            ].map((plan) => (
              <div key={plan.name} className={`lp-plan lp-lift${plan.highlight ? ' lp-plan--hot' : ''}`}>
                {plan.highlight && <div className="lp-plan__tag">最受欢迎</div>}
                <div className="lp-plan__name">{plan.name}</div>
                <div className="lp-plan__price">{plan.price}</div>
                <div className="lp-plan__credits">{plan.credits} 算力</div>
                <button
                  className="lp-plan__buy"
                  onClick={() => navigate(isAuthed ? '/order' : '/register')}
                >
                  立即购买
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="lp-faq lp-wrap lp-wrap--narrow">
        <SectionTitle badge="常见问题" title="有疑问？" />
        {FAQ_ITEMS.map((item, i) => {
          const open = openFaq === i;
          return (
            <div key={i} className="lp-faq__item" data-open={open ? '1' : '0'}>
              <div
                className="lp-faq__q"
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
              >
                <Text strong className="lp-faq__qt">{item.q}</Text>
                <DownOutlined className="lp-faq__icon" />
              </div>
              {open && (
                <div className="lp-faq__a">
                  <Text className="lp-faq__at">{item.a}</Text>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Contact */}
      <div className="lp-contact">
        <div className="lp-contact__beam" />
        <div className="lp-contact__glow lp-contact__glow--a" />
        <div className="lp-contact__glow lp-contact__glow--b" />
        <div className="lp-contact__inner">
          <SectionTitle badge="反馈与建议" title="帮我们做得更好" desc="您的意见会直接影响产品方向" />
          <div className="lp-contact__card">
            <div className="lp-contact__cardbeam" />
            <div className="lp-form">
              {/* 您的称呼 */}
              <div className="lp-form__field">
                <label className="lp-form__label">
                  <span className="lp-form__dot" />
                  您的称呼
                </label>
                <input
                  className="lp-form__input"
                  placeholder="请输入您的称呼"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {/* 联系方式 */}
              <div className="lp-form__field">
                <label className="lp-form__label">
                  <span className="lp-form__dot" />
                  联系方式
                </label>
                <div className="lp-form__seg">
                  {([
                    ['phone', '手机号'],
                    ['wechat', '微信号'],
                    ['email', '邮箱'],
                  ] as [ContactType, string][]).map(([value, label]) => (
                    <div
                      key={value}
                      className="lp-form__segitem"
                      data-active={contactType === value ? '1' : '0'}
                      onClick={() => setContactType(value)}
                    >
                      {label}
                    </div>
                  ))}
                </div>
                <input
                  className="lp-form__input"
                  placeholder={
                    contactType === 'phone'
                      ? '请输入手机号'
                      : contactType === 'wechat'
                        ? '请输入微信号'
                        : '请输入邮箱'
                  }
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                />
              </div>

              {/* 需求描述 */}
              <div className="lp-form__field">
                <label className="lp-form__label">
                  <span className="lp-form__dot" />
                  需求描述
                </label>
                <textarea
                  className="lp-form__area"
                  placeholder="简单描述您的需求，如：团队人数、使用场景、期望功能"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {/* 提交 */}
              <button className="lp-form__submit" disabled={submitting} onClick={submitContact}>
                {submitting ? '提交中...' : '提 交'}
              </button>
              <div className="lp-form__note">提交即表示您同意我们的隐私政策</div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile bottom bar */}
      {isMobile && (
        <div className="lp-mbar">
          {isAuthed ? (
            <button className="lp-mbar__btn" onClick={() => navigate('/dashboard')}>
              进入工作台
            </button>
          ) : (
            <>
              <button className="lp-mbar__btn" onClick={() => navigate('/register')}>
                免费开始创作
              </button>
              <button className="lp-mbar__btn lp-mbar__btn--ghost" onClick={() => navigate('/login')}>
                登录
              </button>
            </>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="lp-footer">
        <div className="lp-footer__inner">
          <span>{`© ${new Date().getFullYear()} AI Anime · AI 动漫短剧创作平台`}</span>
          <span>粤ICP备2026069716号-1</span>
        </div>
      </div>
    </div>
  );
}
