import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Typography, Space, Row, Col, Card, Avatar, Modal } from 'antd';
import {
  ArrowRightOutlined, RobotOutlined, FileTextOutlined, TeamOutlined,
  VideoCameraOutlined, ScissorOutlined, ThunderboltOutlined, SafetyOutlined,
  UserOutlined, WalletOutlined,
  StarOutlined, ExperimentOutlined, GlobalOutlined,
  SwapOutlined, DownloadOutlined,
  FireOutlined, CaretDownOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../stores/authStore';
import api from '../../services/api';

const { Title, Text, Paragraph } = Typography;

const features = [
  {
    icon: <RobotOutlined style={{ fontSize: 32, color: '#7c3aed' }} />,
    title: 'AI 视频生成',
    desc: '输入文字或剧本，AI 自动生成动漫短视频。支持 480p~1080p 分辨率，最长 15 秒。集成 Seedance + 通义万相 9 模型自动降级。',
  },
  {
    icon: <TeamOutlined style={{ fontSize: 32, color: '#ec4899' }} />,
    title: '角色一致性',
    desc: '创建角色后 AI 生成参考图，后续所有视频保持角色形象统一。支持动漫/真人双风格，可多角色混合使用。',
  },
  {
    icon: <FileTextOutlined style={{ fontSize: 32, color: '#f59e0b' }} />,
    title: '剧本场景拆分',
    desc: '长剧本自动拆分为多个场景，每段可独立编辑提示词和时长。支持上下文注入，场景间剧情衔接自然。',
  },
  {
    icon: <ScissorOutlined style={{ fontSize: 32, color: '#059669' }} />,
    title: '视频拼接合成',
    desc: '多视频自由排序、裁剪，一键合并为完整作品。支持拖拽调整顺序，精确到秒的裁剪控制。',
  },
  {
    icon: <ThunderboltOutlined style={{ fontSize: 32, color: '#f97316' }} />,
    title: '批量生成处理',
    desc: '提交全部场景后自动排队生成，支持后台并行处理。失败自动重试，完成后自动拼接，无需人工值守。',
  },
  {
    icon: <SafetyOutlined style={{ fontSize: 32, color: '#3b82f6' }} />,
    title: '算力管理体系',
    desc: '灵活的套餐选择，生成前预计算力消耗。支持在线充值、余额实时查询，每笔消费清晰可追溯。',
  },
];

const useCases = [
  { icon: <FireOutlined style={{ fontSize: 28 }} />, title: '动漫短剧', desc: '多角色长篇动漫故事，拆分场景逐段生成' },
  { icon: <StarOutlined style={{ fontSize: 28 }} />, title: '角色展示', desc: '创建角色形象参考图，展示角色设定' },
  { icon: <GlobalOutlined style={{ fontSize: 28 }} />, title: '剧情预告', desc: '将小说或剧本片段转化为视频预告' },
  { icon: <ExperimentOutlined style={{ fontSize: 28 }} />, title: '创意实验', desc: '快速验证不同角色和场景的视觉效果' },
  { icon: <SwapOutlined style={{ fontSize: 28 }} />, title: '多版本对比', desc: '同一场景用不同模型/风格生成，对比效果' },
  { icon: <DownloadOutlined style={{ fontSize: 28 }} />, title: '导出分享', desc: '生成完成后下载视频，或批量打包下载 ZIP' },
];

const faqItems = [
  { q: '需要绘画基础吗？', a: '完全不需要。只需要输入文字描述，AI 会自动生成角色图和视频。平台提供角色库管理、模板提示词等功能辅助创作。' },
  { q: '生成一个视频需要多久？', a: '单个视频通常 30~90 秒。批量场景生成时会自动排队，每个场景依次处理，完成后自动拼接。' },
  { q: '视频分辨率支持哪些？', a: '支持 480p（480×854）、720p（720×1280）、1080p（1080×1920），以及 6 种宽高比（9:16、16:9、1:1、4:3、3:4、21:9）。' },
  { q: '角色形象能保持一致吗？', a: '可以。先创建角色并生成参考图，后续所有视频生成时都会引用该参考图，确保角色在不同场景中形象统一。' },
  { q: '算力是怎么消耗的？', a: '根据分辨率和时长计算消耗：480p 5 算力/次、720p 10 算力/次、1080p 20 算力/次（基础 5 秒，超过部分按比例增加）。' },
  { q: '支持哪些 AI 模型？', a: '视频生成支持 Seedance 1.5 Pro（5 秒内）和通义万相（15 秒内），共 9 个模型自动降级。图片生成支持 Seedream 4.5/4.0/1.0 Pro。' },
];

const steps = [
  { step: '1', title: '创建角色', desc: '设定角色名称与描述，选择动漫或真人风格，AI 自动生成角色参考图', color: '#7c3aed' },
  { step: '2', title: '撰写剧本', desc: '编写剧情内容，AI 自动拆分为多个场景，支持独立的提示词和时长调整', color: '#ec4899' },
  { step: '3', title: '一键生成', desc: '提交所有场景后 AI 逐个生成视频，完成后自动拼接为完整作品', color: '#f59e0b' },
];

const plans = [
  { name: '入门包', price: '¥9.9', credits: 120, badge: '适合试用', popular: false },
  { name: '创作者包', price: '¥29.9', credits: 420, badge: '推荐', popular: true },
  { name: '工作室包', price: '¥99', credits: 1800, badge: '批量生产', popular: false },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const isLoggedIn = useAuthStore((s) => !!s.token);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [siteNotice, setSiteNotice] = useState<string>('');
  const [noticeOpen, setNoticeOpen] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('notice_shown')) return;
    api.get('/api/admin/site/config').then(({ data }) => {
      if (data.site_notice) {
        setSiteNotice(data.site_notice);
        setNoticeOpen(true);
        sessionStorage.setItem('notice_shown', '1');
      }
    }).catch(() => {});
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <Modal
        title="📢 站点公告"
        open={noticeOpen}
        onCancel={() => setNoticeOpen(false)}
        footer={<Button type="primary" onClick={() => setNoticeOpen(false)}>我知道了</Button>}
      >
        <div style={{ lineHeight: 1.8, fontSize: 14, whiteSpace: 'pre-wrap' }}>{siteNotice}</div>
      </Modal>
      {/* Top bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
        padding: '0 32px', height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid #f0f0f0',
      }}>
        <Space>
          <VideoCameraOutlined style={{ fontSize: 22, color: '#7c3aed' }} />
          <Text strong style={{ fontSize: 18, color: '#7c3aed' }}>AI 动漫短剧</Text>
        </Space>
        <Space size={12}>
          {isLoggedIn ? (
            <>
              <div onClick={() => navigate('/dashboard')} style={{
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                padding: '4px 16px 4px 4px', borderRadius: 30, border: '1px solid #e8e0f0',
                background: '#fff',
                boxShadow: '0 1px 4px rgba(124,58,237,0.06)',
              }}>
                <Avatar size={32} icon={<UserOutlined />} style={{ backgroundColor: '#7c3aed', flexShrink: 0 }} />
                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{user?.username}</div>
                  <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 500 }}>⚡ {user?.credits ?? 100}</div>
                </div>
              </div>
              <Button type="text" icon={<WalletOutlined />} size="large" onClick={() => navigate('/order')}>充值</Button>
              <Button type="text" size="large" danger onClick={() => { logout(); navigate('/'); }}>退出</Button>
            </>
          ) : (
            <>
              <Button type="text" size="large" onClick={() => navigate('/login')}>登录</Button>
              <Button type="primary" size="large"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)', border: 'none', borderRadius: 8 }}
                onClick={() => navigate('/register')}>
                免费注册
              </Button>
            </>
          )}
        </Space>
      </div>

      {/* Hero */}
      <div style={{
        textAlign: 'center', padding: '80px 24px 48px',
        background: 'linear-gradient(180deg, #f5f3ff 0%, #fff 60%)',
      }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <Text style={{
            display: 'inline-block', padding: '4px 16px', borderRadius: 20,
            background: '#ede9fe', color: '#7c3aed', fontSize: 13, marginBottom: 20,
          }}>
            🚀 AI 驱动的动漫短视频创作平台
          </Text>
          <Title level={1} style={{
            fontSize: 48, fontWeight: 800, margin: '0 0 16px', lineHeight: 1.2,
            background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            用 AI 创造你的动漫世界
          </Title>
          <Paragraph style={{ fontSize: 18, color: '#666', marginBottom: 36, maxWidth: 540, margin: '0 auto 36px' }}>
            无需绘画基础，输入角色和剧情，AI 自动生成动漫短视频。
            多角色一致性、场景拆分、视频拼接，一站式完成创作。
          </Paragraph>
          <Space size={16}>
            {isLoggedIn ? (
              <Button type="primary" size="large" icon={<ArrowRightOutlined />}
                style={{ height: 52, padding: '0 44px', borderRadius: 12, fontSize: 16, fontWeight: 600,
                  background: 'linear-gradient(135deg, #7c3aed, #ec4899)', border: 'none',
                  boxShadow: '0 4px 20px rgba(124,58,237,0.35)' }}
                onClick={() => navigate('/dashboard')}>
                进入工作台
              </Button>
            ) : (
              <>
                <Button type="primary" size="large" icon={<ArrowRightOutlined />}
                  style={{ height: 52, padding: '0 44px', borderRadius: 12, fontSize: 16, fontWeight: 600,
                    background: 'linear-gradient(135deg, #7c3aed, #ec4899)', border: 'none',
                    boxShadow: '0 4px 20px rgba(124,58,237,0.35)' }}
                  onClick={() => navigate('/register')}>
                  免费开始创作
                </Button>
                <Button size="large" style={{ height: 52, padding: '0 32px', borderRadius: 12, fontSize: 16 }}
                  onClick={() => navigate('/login')}>
                  已有账号？登录
                </Button>
              </>
            )}
          </Space>
        </div>
      </div>

      {/* How it works */}
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 24px' }}>
        <Title level={2} style={{ textAlign: 'center', marginBottom: 8, fontWeight: 700 }}>三步完成创作</Title>
        <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 40, fontSize: 15 }}>
          从创意到视频，简单三步
        </Text>
        <Row gutter={[32, 32]} justify="center">
          {steps.map((s) => (
            <Col xs={24} sm={8} key={s.step}>
              <div style={{ textAlign: 'center', padding: '0 8px' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 28,
                  background: `linear-gradient(135deg, ${s.color}, ${s.color}88)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px', fontSize: 22, fontWeight: 700, color: '#fff',
                }}>
                  {s.step}
                </div>
                <Title level={4} style={{ marginBottom: 8 }}>{s.title}</Title>
                <Text type="secondary">{s.desc}</Text>
              </div>
            </Col>
          ))}
        </Row>
      </div>

      {/* Use cases */}
      <div style={{ background: '#f8f9fb', padding: '48px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <Title level={2} style={{ textAlign: 'center', marginBottom: 8, fontWeight: 700 }}>适用场景</Title>
          <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 40, fontSize: 15 }}>
            AI 动漫创作可以做什么
          </Text>
          <Row gutter={[16, 16]}>
            {useCases.map((u) => (
              <Col xs={12} sm={8} md={4} key={u.title}>
                <Card style={{ borderRadius: 12, height: '100%', border: '1px solid #f0f0f0', textAlign: 'center' }}
                  styles={{ body: { padding: 20 } }}>
                  <div style={{ fontSize: 32, color: '#7c3aed', marginBottom: 10 }}>{u.icon}</div>
                  <Title level={5} style={{ marginBottom: 4, fontSize: 14 }}>{u.title}</Title>
                  <Text type="secondary" style={{ fontSize: 12 }}>{u.desc}</Text>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      </div>

      {/* Features */}
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 24px' }}>
        <Title level={2} style={{ textAlign: 'center', marginBottom: 8, fontWeight: 700 }}>核心功能</Title>
        <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 40, fontSize: 15 }}>
          专业级 AI 创作工具，全链路覆盖
        </Text>
        <Row gutter={[20, 20]}>
          {features.map((f) => (
            <Col xs={24} sm={12} md={8} key={f.title}>
              <Card style={{ borderRadius: 12, height: '100%', border: '1px solid #f0f0f0' }}
                styles={{ body: { padding: 24 } }}>
                <div style={{ marginBottom: 12 }}>{f.icon}</div>
                <Title level={5} style={{ marginBottom: 6 }}>{f.title}</Title>
                <Text type="secondary" style={{ fontSize: 13 }}>{f.desc}</Text>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      {/* Pricing preview */}
      <div style={{ background: '#f8f9fb', padding: '48px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <Title level={2} style={{ textAlign: 'center', marginBottom: 8, fontWeight: 700 }}>算力套餐</Title>
          <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 40, fontSize: 15 }}>
            灵活选择，按需使用
          </Text>
          <Row gutter={[16, 16]} justify="center">
            {plans.map((p) => (
              <Col xs={24} sm={8} key={p.name}>
                <Card style={{
                  borderRadius: 12, textAlign: 'center',
                  border: p.popular ? '1px solid #7c3aed' : '1px solid #f0f0f0',
                  boxShadow: p.popular ? '0 4px 20px rgba(124,58,237,0.12)' : 'none',
                }} styles={{ body: { padding: 28 } }}>
                  {p.popular && <Text style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600, background: '#ede9fe', padding: '2px 12px', borderRadius: 10 }}>最受欢迎</Text>}
                  <Title level={4} style={{ marginTop: p.popular ? 8 : 0, marginBottom: 4 }}>{p.name}</Title>
                  <Title level={2} style={{ color: '#7c3aed', margin: '8px 0' }}>{p.price}</Title>
                  <Text type="secondary">{p.credits} 算力</Text>
                  <div style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 12, color: '#999' }}>{p.badge}</Text>
                  </div>
                  <Button type={p.popular ? 'primary' : 'default'}
                    style={{ marginTop: 16, borderRadius: 8, width: '100%' }}
                    onClick={() => isLoggedIn ? navigate('/order') : navigate('/register')}>
                    立即购买
                  </Button>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      </div>

      {/* FAQ */}
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 24px' }}>
        <Title level={2} style={{ textAlign: 'center', marginBottom: 8, fontWeight: 700 }}>常见问题</Title>
        <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 32, fontSize: 15 }}>
          你可能想了解的事
        </Text>
        <Row gutter={[16, 16]}>
          {faqItems.map((item, i) => {
            const isOpen = openFaq === i;
            return (
              <Col xs={24} md={12} key={i}>
                <div style={{
                  borderRadius: 12, overflow: 'hidden', height: '100%',
                  border: '1px solid #f0f0f0',
                  borderLeft: `4px solid ${isOpen ? '#7c3aed' : '#e8e0f0'}`,
                  transition: 'border-color 0.2s',
                  background: '#fff',
                }}>
                  <div onClick={() => setOpenFaq(isOpen ? null : i)}
                    style={{
                      padding: '16px 20px', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      userSelect: 'none',
                    }}>
                    <Text strong style={{ fontSize: 15 }}>{item.q}</Text>
                    <CaretDownOutlined style={{
                      fontSize: 14, color: '#7c3aed',
                      transition: 'transform 0.25s',
                      transform: isOpen ? 'rotate(-180deg)' : 'rotate(0deg)',
                    }} />
                  </div>
                  {isOpen && (
                    <div style={{
                      padding: '0 20px 16px',
                      animation: 'fadeIn 0.2s ease',
                    }}>
                      <Text type="secondary" style={{ fontSize: 14, lineHeight: 1.8 }}>{item.a}</Text>
                    </div>
                  )}
                </div>
              </Col>
            );
          })}
        </Row>
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-4px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>

      {/* CTA */}
      <div style={{ textAlign: 'center', padding: '48px 24px 60px' }}>
        <Title level={2} style={{ marginBottom: 12 }}>准备好开始创作了吗？</Title>
        <Text type="secondary" style={{ fontSize: 16, display: 'block', marginBottom: 32 }}>
          {isLoggedIn ? '进入工作台，开始你的创作之旅' : '免费注册，立即体验 AI 动漫创作的乐趣'}
        </Text>
        <Button type="primary" size="large" icon={<ArrowRightOutlined />}
          style={{ height: 52, padding: '0 48px', borderRadius: 12, fontSize: 16, fontWeight: 600,
            background: 'linear-gradient(135deg, #7c3aed, #ec4899)', border: 'none',
            boxShadow: '0 4px 20px rgba(124,58,237,0.35)' }}
          onClick={() => isLoggedIn ? navigate('/dashboard') : navigate('/register')}>
          {isLoggedIn ? '进入工作台' : '免费注册'}
        </Button>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '24px', borderTop: '1px solid #f0f0f0' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>AI 动漫短剧 · 用 AI 创造无限可能</Text>
      </div>
    </div>
  );
}
