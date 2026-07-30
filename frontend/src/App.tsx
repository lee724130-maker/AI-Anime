import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/Landing';
import LoginPage from './pages/Auth/LoginPage';
import RegisterPage from './pages/Auth/RegisterPage';
import HomePage from './pages/Home';
import UserPage from './pages/User';
import ScriptListPage from './pages/Script';
import ScriptCreatePage from './pages/Script/Create';
import ScriptDetailPage from './pages/Script/Detail';
import CharacterListPage from './pages/Character';
import CharacterCreatePage from './pages/Character/Create';
import CharacterDetailPage from './pages/Character/Detail';
import VideoListPage from './pages/Video';
import VideoCreatePage from './pages/Video/Create';
import VideoDetailPage from './pages/Video/Detail';
import VideoStitchPage from './pages/Video/Stitch';
import StudioPage from './pages/Studio';
import OrderPage from './pages/Order';
import ViralIndex from './pages/Viral';
import ViralTemplateDetail from './pages/Viral/TemplateDetail';
import ViralCreateTemplate from './pages/Viral/CreateTemplate';
import ViralProjectList from './pages/Viral/ProjectList';
import ViralProjectDetail from './pages/Viral/ProjectDetail';
import GeneratePage from './pages/Generate';
import DramaListPage from './pages/Drama';
import DramaCreatePage from './pages/Drama/Create';
import DramaDetailPage from './pages/Drama/Detail';
import EditAnalysisPage from './pages/Drama/EditAnalysis';
import DramaAssetsPage from './pages/Drama/Assets';
import GlobalAssetsPage from './pages/Drama/GlobalAssets';
import DramaEpisodesPage from './pages/Drama/Episodes';
import EpisodeDetailPage from './pages/Drama/EpisodeDetail';
import UserLayout from './components/UserLayout';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/generate" element={<ProtectedRoute><UserLayout><GeneratePage /></UserLayout></ProtectedRoute>} />
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
        <Route path="/viral/templates/:id" element={<ProtectedRoute><UserLayout><ViralTemplateDetail /></UserLayout></ProtectedRoute>} />
        <Route path="/viral/projects" element={<ProtectedRoute><UserLayout><ViralProjectList /></UserLayout></ProtectedRoute>} />
        <Route path="/viral/projects/:id" element={<ProtectedRoute><UserLayout><ViralProjectDetail /></UserLayout></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
