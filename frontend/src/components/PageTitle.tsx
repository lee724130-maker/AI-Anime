import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// 生产 bundle ZI + XI 逐字还原
const TITLES: Record<string, string> = {
  '/': 'AI 动漫短剧创作平台',
  '/login': '登录',
  '/register': '注册',
  '/dashboard': '工作台',
  '/tasks': '任务中心',
  '/generate': 'AI 生成',
  '/generate/history': '生成历史',
  '/drama': '短剧工作室',
  '/drama/create': '创建短剧',
  '/global-assets': '大资产库',
  '/user': '个人中心',
  '/script': '剧本列表',
  '/video': '视频列表',
  '/studio': '拼接成片',
  '/order': '订单管理',
  '/viral': '热门创作',
  '/viral/create': '创建模板',
  '/viral/templates': '模板列表',
  '/viral/projects': '我的创作',
  '/canvas': '视频画布',
};

export default function PageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const t = TITLES[pathname] || '';
    document.title = t ? `${t} - AI 动漫短剧创作平台` : 'AI 动漫短剧创作平台';
  }, [pathname]);
  return null;
}
