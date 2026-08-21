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
      const url = err.config.url || '';
      const isAuthRequest = url.includes('/api/auth/');
      // 只有存在登录态（token）且明确是鉴权器拒绝时，才认为会话失效并登出；
      // 无 token 或后端业务/无鉴权路由的 401（如健康检查）不误跳登录页
      const hadToken = !!localStorage.getItem('token');
      const authHeader = err.response.headers?.['www-authenticate'];
      const isAuthReject = typeof authHeader === 'string' && /bearer/i.test(authHeader);
      if (!isAuthRequest && hadToken && isAuthReject) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

export default api;
