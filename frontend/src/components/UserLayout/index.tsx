import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Breadcrumb } from 'antd';
import { HomeOutlined } from '@ant-design/icons';

// 生产 bundle iI：面包屑标签映射
const LABELS: Record<string, string> = {
  dashboard: '工作台',
  generate: 'AI 生成',
  viral: '热门创作',
  canvas: '画布',
  editor: '剪辑',
  drama: '短剧工作室',
  'global-assets': '大资产库',
  order: '充值',
  user: '个人中心',
  tasks: '任务中心',
  history: '生成历史',
  templates: '模板库',
  projects: '我的项目',
  create: '新建',
  assets: '资产管理',
  episodes: '分集管理',
  analysis: '编辑分析',
};

// 生产 bundle aI：面包屑（深度 >1 才显示）
function BreadcrumbBar() {
  const navigate = useNavigate();
  const segments = useLocation().pathname.split('/').filter(Boolean);
  if (segments.length <= 1) return null;

  const items: { title: ReactNode }[] = [
    {
      title: (
        <span style={{ cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
          <HomeOutlined /> 首页
        </span>
      ),
    },
  ];
  let cum = '';
  segments.forEach((seg, idx) => {
    cum += '/' + seg;
    const isLast = idx === segments.length - 1;
    const label = LABELS[seg] || (isLast ? decodeURIComponent(seg) : seg);
    items.push({
      title: isLast ? (
        <span>{label}</span>
      ) : (
        <span style={{ cursor: 'pointer' }} onClick={() => navigate(cum)}>
          {label}
        </span>
      ),
    });
  });
  return <Breadcrumb items={items} style={{ marginBottom: 16, fontSize: 13 }} />;
}

// 生产 bundle oI：UserLayout（面包屑 + page-fade-in main 按 pathname key 重挂载）
// 顶栏已移除：全站导航统一为 AppShell 左侧边栏；内容画布采用 LibTV 风格浅灰底
export default function UserLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const showBreadcrumb = location.pathname.split('/').filter(Boolean).length > 1;
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary)' }}>
      <main
        className="page-fade-in"
        style={{ maxWidth: 1280, margin: '0 auto', padding: 'clamp(16px, 3vw, 28px)' }}
        key={location.pathname}
      >
        {showBreadcrumb && <BreadcrumbBar />}
        {children}
      </main>
    </div>
  );
}
