import axios from 'axios';
import { friendlyError } from '../utils/errorMessage';

const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE || '' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    if (status === 401 || status === 403) {
      const url = err.config?.url || '';
      const isAuthRequest = url.includes('/api/auth/');
      const hadToken = !!localStorage.getItem('token');
      // 有 token 但 401 = token 过期/失效；403 = 账号被封禁（排除登录/注册等无需鉴权请求）
      if (!isAuthRequest && hadToken) {
        window.dispatchEvent(new CustomEvent(status === 401 ? 'auth:expired' : 'auth:banned'));
      }
    }
    // 集中翻译后端/AI 服务商的英文错误文案为中文（一处覆盖所有页面的 message.error）。
    // 只改 message 字段，不吞错误对象，auth:expired 等逻辑不受影响。
    const data = err.response?.data;
    if (data && typeof data === 'object' && typeof data.message === 'string') {
      data.message = friendlyError(data.message);
    }
    return Promise.reject(err);
  },
);

export default api;
