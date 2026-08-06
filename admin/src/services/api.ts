import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE || '' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Don't redirect on login requests — let the caller show the error
      const isLoginRequest = err.config.url?.includes('/api/auth/login');
      if (!isLoginRequest) {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_user');
        window.location.href = '/admin/login';
      }
    }
    return Promise.reject(err);
  },
);

export default api;
