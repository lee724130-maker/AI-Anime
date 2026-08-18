import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import LandingPage from './pages/Landing';
import LoginPage from './pages/Auth/LoginPage';
import RegisterPage from './pages/Auth/RegisterPage';
import UserLayout from './components/UserLayout';
import TestNoticeModal from './components/TestNoticeModal';

const HomePage = lazy(() => import('./pages/Home'));
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
const EditorIndex = lazy(() => import('./pages/Editor'));
const EditorPage = lazy(() => import('./pages/Editor/EditorPage'));
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

function PageFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <Spin size="large" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Logged-in users must not see /login or /register (even via back button)
function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (token) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<AuthGuard><LoginPage /></AuthGuard>} />
          <Route path="/register" element={<AuthGuard><RegisterPage /></AuthGuard>} />
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
          <Route path="/generate" element={<ProtectedRoute><UserLayout><GeneratePage /></UserLayout></ProtectedRoute>} />
          <Route path="/generate/history" element={<ProtectedRoute><UserLayout><GenerateHistoryPage /></UserLayout></ProtectedRoute>} />
          <Route path="/drama" element={<ProtectedRoute><UserLayout><DramaListPage /></UserLayout></ProtectedRoute>} />
          <Route path="/drama/create" element={<ProtectedRoute><UserLayout><DramaCreatePage /></UserLayout></ProtectedRoute>} />
          <Route path="/drama/:id" element={<ProtectedRoute><UserLayout><DramaDetailPage /></UserLayout></ProtectedRoute>} />
          <Route path="/drama/:id/edit-analysis" element={<ProtectedRoute><UserLayout><EditAnalysisPage /></UserLayout></ProtectedRoute>} />
          <Route path="/drama/:id/assets" element={<ProtectedRoute><UserLayout><DramaAssetsPage /></UserLayout></ProtectedRoute>} />
          <Route path="/drama/:id/episodes" element={<ProtectedRoute><UserLayout><DramaEpisodesPage /></UserLayout></ProtectedRoute>} />
          <Route path="/drama/:id/episodes/:episodeId" element={<ProtectedRoute><UserLayout><EpisodeDetailPage /></UserLayout></ProtectedRoute>} />
          <Route path="/global-assets" element={<ProtectedRoute><UserLayout><GlobalAssetsPage /></UserLayout></ProtectedRoute>} />
          <Route path="/user" element={<ProtectedRoute><UserPage /></ProtectedRoute>} />
          <Route path="/script" element={<ProtectedRoute><ScriptListPage /></ProtectedRoute>} />
          <Route path="/script/create" element={<ProtectedRoute><ScriptCreatePage /></ProtectedRoute>} />
          <Route path="/script/:id" element={<ProtectedRoute><ScriptDetailPage /></ProtectedRoute>} />
          <Route path="/character" element={<ProtectedRoute><CharacterListPage /></ProtectedRoute>} />
          <Route path="/character/create" element={<ProtectedRoute><CharacterCreatePage /></ProtectedRoute>} />
          <Route path="/character/:id" element={<ProtectedRoute><CharacterDetailPage /></ProtectedRoute>} />
          <Route path="/video" element={<ProtectedRoute><VideoListPage /></ProtectedRoute>} />
          <Route path="/video/create" element={<ProtectedRoute><VideoCreatePage /></ProtectedRoute>} />
          <Route path="/video/stitch" element={<ProtectedRoute><VideoStitchPage /></ProtectedRoute>} />
          <Route path="/video/:id" element={<ProtectedRoute><VideoDetailPage /></ProtectedRoute>} />
          <Route path="/studio" element={<ProtectedRoute><StudioPage /></ProtectedRoute>} />
          <Route path="/order" element={<ProtectedRoute><OrderPage /></ProtectedRoute>} />
          <Route path="/viral" element={<ProtectedRoute><UserLayout><ViralIndex /></UserLayout></ProtectedRoute>} />
          <Route path="/viral/create" element={<ProtectedRoute><UserLayout><ViralCreateTemplate /></UserLayout></ProtectedRoute>} />
          <Route path="/viral/templates" element={<ProtectedRoute><UserLayout><ViralTemplateList /></UserLayout></ProtectedRoute>} />
          <Route path="/viral/templates/:id" element={<ProtectedRoute><UserLayout><ViralTemplateDetail /></UserLayout></ProtectedRoute>} />
          <Route path="/viral/projects" element={<ProtectedRoute><UserLayout><ViralProjectList /></UserLayout></ProtectedRoute>} />
          <Route path="/viral/projects/:id" element={<ProtectedRoute><UserLayout><ViralProjectDetail /></UserLayout></ProtectedRoute>} />
          <Route path="/canvas" element={<ProtectedRoute><UserLayout><CanvasIndex /></UserLayout></ProtectedRoute>} />
          {/* 画布编辑器：网页全屏工作台（无导航栏，独占整屏） */}
          <Route path="/canvas/editor/:id" element={<ProtectedRoute><CanvasEditor /></ProtectedRoute>} />
          <Route path="/editor" element={<ProtectedRoute><UserLayout><EditorIndex /></UserLayout></ProtectedRoute>} />
          <Route path="/editor/:id" element={<ProtectedRoute><UserLayout><EditorPage /></UserLayout></ProtectedRoute>} />
        </Routes>
      </Suspense>
      <TestNoticeModal />
    </BrowserRouter>
  );
}
