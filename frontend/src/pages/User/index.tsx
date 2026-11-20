import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Button, Avatar, Tag, message } from 'antd';
import {
  ArrowLeftOutlined, WalletOutlined, UserOutlined, ThunderboltOutlined,
  CalendarOutlined, PhoneOutlined, MailOutlined, CrownOutlined, LogoutOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import './user.css';   // 本页质感改造样式（作用域 .user-root，详见文件头注释）

const { Title } = Typography;

interface Profile {
  id: number;
  username: string;
  phone?: string;
  email?: string;
  credits: number;
  role: string;
  created_at: string;
}

/* 文案与数据映射另建小函数（规范 §二·容器层职责），呈现口径统一、逻辑零改动 */
const roleMeta = (r?: string) => (r === 'admin' ? { color: 'purple', label: '管理员' } : { color: 'blue', label: '普通用户' });
const joinedOf = (s?: string) => (s ? new Date(s).toLocaleDateString('zh-CN') : '-');

export default function UserPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const navigate = useNavigate();
  const { user, logout, refreshUser } = useAuthStore();

  useEffect(() => {
    api.get('/api/user/profile')
      .then(({ data }) => {
        setProfile(data);
        refreshUser();
      })
      .catch(() => navigate('/login'));
  }, [navigate, refreshUser]);

  const handleLogout = () => {
    logout();
    message.success('已退出登录');
    navigate('/login');
  };

  const credits = profile?.credits ?? user?.credits ?? 0;
  const role = roleMeta(profile?.role ?? user?.role);

  return (
    <div className="user-root">
      {/* 顶栏：返回 + 标题（与 /tasks 同范式；原「居中大标题 + 下面一个返回钮」层级平） */}
      <div className="user-topbar">
        <div className="user-topbar__lead">
          <Button shape="circle" icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')} />
          <div className="user-topbar__titles">
            <Title level={4} className="user-topbar__title">个人中心</Title>
            <span className="user-topbar__sub">账号信息、算力余额与快捷入口</span>
          </div>
        </div>
      </div>

      <div className="user-col">
        {/* 身份卡：Card → 令牌卡；头像 #7c3aed → var(--grad-brand)；Space 行 → 小胶囊 */}
        <section className="user-hero">
          <div className="user-hero__id">
            <Avatar size={72} className="user-hero__avatar" icon={<UserOutlined />} />
            <div className="user-hero__main">
              <div className="user-hero__nameline">
                <span className="user-hero__name">{profile?.username || user?.username || '-'}</span>
                <Tag className="user-hero__role" color={role.color}>{role.label}</Tag>
              </div>
              <div className="user-chips">
                <span className="user-chip user-chip--credits"><ThunderboltOutlined />{credits} 算力</span>
                {profile?.phone && <span className="user-chip"><PhoneOutlined />{profile.phone}</span>}
                {profile?.email && <span className="user-chip user-chip--muted"><MailOutlined />{profile.email}</span>}
                <span className="user-chip"><CalendarOutlined />{joinedOf(profile?.created_at)} 加入</span>
              </div>
            </div>
          </div>
          <div className="user-hero__actions">
            <Button type="primary" size="large" icon={<WalletOutlined />} onClick={() => navigate('/order')}>
              充值算力
            </Button>
            <Button size="large" icon={<LogoutOutlined />} onClick={handleLogout}>
              退出登录
            </Button>
          </div>
        </section>

        {/* 账户信息：antd Card + Descriptions(bordered) → 令牌面板 + 定义列表，字段与取值不变 */}
        <section className="user-panel">
          <header className="user-panel__head"><CrownOutlined /><span>账户信息</span></header>
          {profile && (
            <dl className="user-kv">
              <div className="user-kv__row"><dt>用户名</dt><dd>{profile.username}</dd></div>
              <div className="user-kv__row">
                <dt>角色</dt>
                <dd><Tag color={roleMeta(profile.role).color}>{roleMeta(profile.role).label}</Tag></dd>
              </div>
              <div className="user-kv__row"><dt>电子邮箱</dt><dd>{profile.email || '未绑定'}</dd></div>
              <div className="user-kv__row"><dt>手机号</dt><dd>{profile.phone || '未绑定'}</dd></div>
              <div className="user-kv__row"><dt>用户 ID</dt><dd>{profile.id}</dd></div>
              <div className="user-kv__row"><dt>剩余算力</dt><dd className="user-kv__credits">{profile.credits} 分</dd></div>
              <div className="user-kv__row user-kv__row--wide"><dt>注册时间</dt><dd>{joinedOf(profile.created_at)}</dd></div>
            </dl>
          )}
        </section>

        {/* 快捷块：antd Statistic 卡 → 令牌卡（数据与跳转不变） */}
        <div className="user-stats">
          <div className="user-stat">
            <span className="user-stat__label"><ThunderboltOutlined />可用算力</span>
            <span className="user-stat__num">{credits}</span>
          </div>
          <div className="user-stat user-stat--link" onClick={() => navigate('/order')}>
            <span className="user-stat__label"><WalletOutlined />充值</span>
            <span className="user-stat__num user-stat__num--text">去充值</span>
          </div>
        </div>
      </div>
    </div>
  );
}
