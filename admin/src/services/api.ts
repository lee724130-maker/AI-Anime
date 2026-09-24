import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE || '' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auth-flow requests: 401 here is an expected business response (wrong password /
// wrong 2FA code / invalid tempToken), not an expired session — never redirect on them.
const AUTH_FLOW_URLS = ['/api/auth/login', '/api/auth/verify-admin', '/api/auth/send-admin-code'];

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const url = err.config?.url || '';
      const isAuthFlow = AUTH_FLOW_URLS.some((p) => url.includes(p));
      if (!isAuthFlow) {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_user');
        window.location.href = '/admin/login';
      }
    }
    return Promise.reject(err);
  },
);

export default api;
