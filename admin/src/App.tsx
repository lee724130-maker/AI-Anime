import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminLoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('admin_token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AdminLoginPage />} />
        <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}>
          <Route index element={null} />
          <Route path="dashboard" element={null} />
          <Route path="apikeys" element={null} />
          <Route path="users" element={null} />
          <Route path="logs" element={null} />
          <Route path="config" element={null} />
          <Route path="models" element={null} />
          <Route path="prompts" element={null} />
          <Route path="notifications" element={null} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
