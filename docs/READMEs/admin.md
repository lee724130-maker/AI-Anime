# AI-Anime Admin — React 19 管理后台

> 端口：`5174` | 框架：React 19 + Vite 8 | UI：antd 6 | 仅限 admin 角色

---

## 目录结构

```
admin/
├── src/
│   ├── main.tsx                        # 入口：React 19 createRoot
│   ├── App.tsx                         # 路由 + ProtectedRoute（token 检查）
│   ├── index.css                       # 全局样式（深蓝管理面板主题）
│   │
│   ├── pages/
│   │   ├── Login/
│   │   │   └── index.tsx               # 管理员登录（深蓝渐变 + admin 校验）
│   │   │
│   │   ├── Dashboard/
│   │   │   └── index.tsx               # 布局容器 + 侧边栏 + 顶部导航 + 子页面路由
│   │   │
│   │   ├── ApiKeyManage/
│   │   │   └── index.tsx               # 9 项 AI 密钥配置（掩码显示 + 状态标签）
│   │   │
│   │   ├── UserManage/
│   │   │   └── index.tsx               # 用户列表 + 搜索 + 封禁/解封 + 充值弹窗
│   │   │
│   │   ├── Logs/
│   │   │   └── index.tsx               # 任务日志表格（ID 搜索 + 状态筛选 + 自动刷新）
│   │   │
│   │   └── SystemConfig/
│   │       └── index.tsx               # 站点配置 + 算力定价 + 限制策略
│   │
│   ├── services/
│   │   └── api.ts                      # Axios 实例（admin_token JWT + 401 跳转）
│   │
│   └── stores/
│       └── authStore.ts                # Zustand 状态管理（admin_token 独立存储）
│
├── package.json
├── vite.config.ts
├── tsconfig.json
└── index.html
```

---

## 页面功能

| 菜单 | 页面 | 功能 |
|------|------|------|
| 仪表盘 | Dashboard | 4 统计卡片（用户/剧本/调用/密钥）+ 快捷入口 |
| API 密钥 | ApiKeyManage | 9 项密钥配置：Seedance / Seedream / 火山通用 / OpenAI / DeepSeek / 通义万相 / Runway / HeyGen / TTS |
| 用户管理 | UserManage | 用户表格 + 搜索 + 封禁/解封 + 手动充值算力（实时刷新） |
| 系统日志 | Logs | 全部任务表格 + ID搜索 + 状态筛选 + 5秒自动刷新 |
| 系统配置 | SystemConfig | 站点名称/公告 + 算力定价(480p/720p/1080p) + 每日上限 + 重试次数 |

---

## 状态管理

### authStore（Zustand）

与前端用户端**独立存储**，使用不同的 localStorage key：

| Key | 说明 |
|-----|------|
| `admin_token` | 管理员 JWT Token |
| `admin_user` | 管理员用户信息 |

| 方法 | 说明 |
|------|------|
| `user` | 当前管理员信息 |
| `token` | JWT Token |
| `setAuth(user, token)` | 保存认证信息 |
| `logout()` | 清除认证信息 |

### API 拦截器（`services/api.ts`）

- **baseURL**: `http://localhost:3000`
- **Request**: 自动附加 `Authorization: Bearer <admin_token>`
- **Response 401**: 清除 token → 跳转 `/login`（login 请求不触发）

---

## 配置

### Vite（`vite.config.ts`）

```ts
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
})
```

### 依赖

| 类别 | 包 |
|------|-----|
| 框架 | react 19, react-dom 19 |
| 路由 | react-router-dom 7 |
| UI | antd 6, @ant-design/icons |
| HTTP | axios |
| 状态 | zustand 5 |
| 日期 | dayjs |
| 构建 | vite 8, @vitejs/plugin-react |

---

## 关键逻辑

### 登录权限校验

```tsx
// Login/index.tsx — 登录后检查角色
if (data.user.role !== 'admin') {
  message.error('非管理员账号，无权登录后台');
  return;
}
```

### 用户充值实时刷新

充值成功后 `await fetchUsers()` 确保表格立即显示最新算力。使用 admin 的 `POST /api/admin/users/:id/recharge`。

### 侧边栏布局

- `Layout.Sider`：固定左侧，可折叠（220px ↔ 80px）
- `Layout.Header`：sticky 顶部，显示当前页面标题 + 管理员信息
- `Layout.Content`：动态渲染子页面（dashboard / apikeys / users / logs / config）

---

## 启动命令

```bash
cd admin
npm install
npm run dev       # 开发模式 → http://localhost:5174
npm run build     # 生产构建
npm run preview   # 预览生产构建
```
