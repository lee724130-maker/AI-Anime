import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { ThemeProvider } from './theme/ThemeContext';
import PageTitle from './components/PageTitle';
import ErrorBoundary from './components/ErrorBoundary';
import LandingPage from './pages/Landing';
import LoginPage from './pages/Auth/LoginPage';
import RegisterPage from './pages/Auth/RegisterPage';
import UserLayout from './components/UserLayout';
import AppShell from './components/AppShell';
import TestNoticeModal from './components/TestNoticeModal';
import SessionExpiredModal from './components/SessionExpiredModal';
import { useAuthStore } from './stores/authStore';

const HomePage = lazy(() => import('./pages/Home'));
const TasksPage = lazy(() => import('./pages/Tasks'));
const UserPage = lazy(() => import('./pages/User'));
const ScriptListPage = lazy(() => import('./pages/Script'));
const ScriptCreatePage = lazy(() => import('./pages/Script/Create'));
const ScriptDetailPage = lazy(() => import('./pages/Script/Detail'));
const CharacterListPage = lazy(() => import('./pages/Character'));
const CharacterCreatePage = lazy(() => import('./pages/Character/Create'));
const CharacterDetailPage = lazy(() => import('./pages/Character/Detail'));
const VideoListPage = lazy(() => import('./pages/Video'));
const VideoCreatePage = lazy(() => import('./pages/Video/Create'));
const VideoDetailPage = lazy(() => import('./pages/Video/Detail'));
const VideoStitchPage = lazy(() => import('./pages/Video/Stitch'));
const StudioPage = lazy(() => import('./pages/Studio'));
const OrderPage = lazy(() => import('./pages/Order'));
const ViralIndex = lazy(() => import('./pages/Viral'));
const ViralTemplateDetail = lazy(() => import('./pages/Viral/TemplateDetail'));
const ViralCreateTemplate = lazy(() => import('./pages/Viral/CreateTemplate'));
const ViralProjectList = lazy(() => import('./pages/Viral/ProjectList'));
const ViralProjectDetail = lazy(() => import('./pages/Viral/ProjectDetail'));
const ViralTemplateList = lazy(() => import('./pages/Viral/TemplateList'));
const CanvasIndex = lazy(() => import('./pages/Canvas'));
const CanvasEditor = lazy(() => import('./pages/Canvas/Editor'));
const GeneratePage = lazy(() => import('./pages/Generate'));
const GenerateHistoryPage = lazy(() => import('./pages/Generate/History'));
const DramaListPage = lazy(() => import('./pages/Drama'));
const DramaCreatePage = lazy(() => import('./pages/Drama/Create'));
const DramaDetailPage = lazy(() => import('./pages/Drama/Detail'));
const EditAnalysisPage = lazy(() => import('./pages/Drama/EditAnalysis'));
const DramaAssetsPage = lazy(() => import('./pages/Drama/Assets'));
const GlobalAssetsPage = lazy(() => import('./pages/Drama/GlobalAssets'));
const DramaEpisodesPage = lazy(() => import('./pages/Drama/Episodes'));
const EpisodeDetailPage = lazy(() => import('./pages/Drama/EpisodeDetail'));
const EditorListPage = lazy(() => import('./pages/Editor'));
const EditorPage = lazy(() => import('./pages/Editor/EditorPage'));

// 生产 bundle KI：页面级 loading 兜底
function PageFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <Spin size="large" />
    </div>
  );
}

// 生产 bundle qI：未登录 → /login
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// 生产 bundle JI：剪辑页仅 admin 可访问
function AdminGuard({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  const user = useAuthStore((s) => s.user);
  if (!user) return <PageFallback />;
  if (user.role === 'admin') return <>{children}</>;
  return <Navigate to="/dashboard" replace />;
}

// 生产 bundle YI：已登录用户不能访问 /login、/register
function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (token) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// 已登录 + LibTV 侧边栏应用壳（全站导航统一在此包裹；全屏工作台除外）
function Shelled({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute><AppShell>{children}</AppShell></ProtectedRoute>;
}

// admin 路由 + 侧边栏壳
function ShelledAdmin({ children }: { children: React.ReactNode }) {
  return <AdminGuard><AppShell>{children}</AppShell></AdminGuard>;
}

// 生产 bundle QI 结构：ThemeProvider > BrowserRouter > [PageTitle, ErrorBoundary > Suspense > Routes, TestNotice, SessionExpired]
export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <PageTitle />
        <ErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/login" element={<AuthGuard><LoginPage /></AuthGuard>} />
              <Route path="/register" element={<AuthGuard><RegisterPage /></AuthGuard>} />
              <Route path="/" element={<LandingPage />} />
              <Route path="/dashboard" element={<Shelled><HomePage /></Shelled>} />
              <Route path="/tasks" element={<Shelled><TasksPage /></Shelled>} />
              <Route path="/generate" element={<Shelled><UserLayout><GeneratePage /></UserLayout></Shelled>} />
              <Route path="/generate/history" element={<Shelled><UserLayout><GenerateHistoryPage /></UserLayout></Shelled>} />
              <Route path="/drama" element={<Shelled><UserLayout><DramaListPage /></UserLayout></Shelled>} />
              <Route path="/drama/create" element={<Shelled><UserLayout><DramaCreatePage /></UserLayout></Shelled>} />
              <Route path="/drama/:id" element={<Shelled><UserLayout><DramaDetailPage /></UserLayout></Shelled>} />
              <Route path="/drama/:id/edit-analysis" element={<Shelled><UserLayout><EditAnalysisPage /></UserLayout></Shelled>} />
              <Route path="/drama/:id/assets" element={<Shelled><UserLayout><DramaAssetsPage /></UserLayout></Shelled>} />
              <Route path="/drama/:id/episodes" element={<Shelled><UserLayout><DramaEpisodesPage /></UserLayout></Shelled>} />
              <Route path="/drama/:id/episodes/:episodeId" element={<Shelled><UserLayout><EpisodeDetailPage /></UserLayout></Shelled>} />
              <Route path="/global-assets" element={<Shelled><UserLayout><GlobalAssetsPage /></UserLayout></Shelled>} />
              <Route path="/user" element={<Shelled><UserPage /></Shelled>} />
              <Route path="/script" element={<Shelled><ScriptListPage /></Shelled>} />
              <Route path="/script/create" element={<Shelled><ScriptCreatePage /></Shelled>} />
              <Route path="/script/:id" element={<Shelled><ScriptDetailPage /></Shelled>} />
              <Route path="/character" element={<Shelled><CharacterListPage /></Shelled>} />
              <Route path="/character/create" element={<Shelled><CharacterCreatePage /></Shelled>} />
              <Route path="/character/:id" element={<Shelled><CharacterDetailPage /></Shelled>} />
              <Route path="/video" element={<Shelled><VideoListPage /></Shelled>} />
              <Route path="/video/create" element={<Shelled><VideoCreatePage /></Shelled>} />
              <Route path="/video/stitch" element={<Shelled><VideoStitchPage /></Shelled>} />
              <Route path="/video/:id" element={<Shelled><VideoDetailPage /></Shelled>} />
              <Route path="/studio" element={<Shelled><StudioPage /></Shelled>} />
              <Route path="/order" element={<Shelled><OrderPage /></Shelled>} />
              <Route path="/viral" element={<Shelled><UserLayout><ViralIndex /></UserLayout></Shelled>} />
              <Route path="/viral/create" element={<Shelled><UserLayout><ViralCreateTemplate /></UserLayout></Shelled>} />
              <Route path="/viral/templates" element={<Shelled><UserLayout><ViralTemplateList /></UserLayout></Shelled>} />
              <Route path="/viral/templates/:id" element={<Shelled><UserLayout><ViralTemplateDetail /></UserLayout></Shelled>} />
              <Route path="/viral/projects" element={<Shelled><UserLayout><ViralProjectList /></UserLayout></Shelled>} />
              <Route path="/viral/projects/:id" element={<Shelled><UserLayout><ViralProjectDetail /></UserLayout></Shelled>} />
              <Route path="/canvas" element={<Shelled><UserLayout><CanvasIndex /></UserLayout></Shelled>} />
              {/* 画布编辑器：网页全屏工作台（无侧边栏，独占整屏） */}
              <Route path="/canvas/editor/:id" element={<ProtectedRoute><CanvasEditor /></ProtectedRoute>} />
              {/* 剪辑（生产：admin-only，列表页带侧边栏，编辑页全屏） */}
              <Route path="/editor" element={<ShelledAdmin><UserLayout><EditorListPage /></UserLayout></ShelledAdmin>} />
              <Route path="/editor/:id" element={<AdminGuard><EditorPage /></AdminGuard>} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
        <TestNoticeModal />
        <SessionExpiredModal />
      </BrowserRouter>
    </ThemeProvider>
  );
}
