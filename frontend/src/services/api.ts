import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE || '' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const url = err.config?.url || '';
      const isAuthRequest = url.includes('/api/auth/');
      const hadToken = !!localStorage.getItem('token');
      // 有 token 但 401 = token 过期/失效，触发弹窗（排除登录/注册等无需鉴权请求）
      if (!isAuthRequest && hadToken) {
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
    }
    return Promise.reject(err);
  },
);

export default api;
