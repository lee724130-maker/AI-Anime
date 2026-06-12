import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import StudioPage from './pages/Studio';
import OrderPage from './pages/Order';

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
        <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/user" element={<ProtectedRoute><UserPage /></ProtectedRoute>} />
        <Route path="/script" element={<ProtectedRoute><ScriptListPage /></ProtectedRoute>} />
        <Route path="/script/create" element={<ProtectedRoute><ScriptCreatePage /></ProtectedRoute>} />
        <Route path="/script/:id" element={<ProtectedRoute><ScriptDetailPage /></ProtectedRoute>} />
        <Route path="/character" element={<ProtectedRoute><CharacterListPage /></ProtectedRoute>} />
        <Route path="/character/create" element={<ProtectedRoute><CharacterCreatePage /></ProtectedRoute>} />
        <Route path="/character/:id" element={<ProtectedRoute><CharacterDetailPage /></ProtectedRoute>} />
        <Route path="/video" element={<ProtectedRoute><VideoListPage /></ProtectedRoute>} />
        <Route path="/video/create" element={<ProtectedRoute><VideoCreatePage /></ProtectedRoute>} />
        <Route path="/video/:id" element={<ProtectedRoute><VideoDetailPage /></ProtectedRoute>} />
        <Route path="/studio" element={<ProtectedRoute><StudioPage /></ProtectedRoute>} />
        <Route path="/order" element={<ProtectedRoute><OrderPage /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
