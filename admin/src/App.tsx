import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';

// wxe: token guard — no token => /login; JWT payload exp check => clear + /login
function AdminGuard({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('admin_token');
  if (!token) return <Navigate to="/login" replace />;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      return <Navigate to="/login" replace />;
    }
  } catch {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

// Txe
export default function App() {
  return (
    <BrowserRouter basename="/admin">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <AdminGuard>
              <DashboardPage />
            </AdminGuard>
          }
        >
          <Route index element={null} />
          <Route path="dashboard" element={null} />
          <Route path="apikeys" element={null} />
          <Route path="users" element={null} />
          <Route path="access" element={null} />
          <Route path="logs" element={null} />
          <Route path="config" element={null} />
          <Route path="models" element={null} />
          <Route path="prompts" element={null} />
          <Route path="notifications" element={null} />
          <Route path="payments" element={null} />
          <Route path="server" element={null} />
          <Route path="database" element={null} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
