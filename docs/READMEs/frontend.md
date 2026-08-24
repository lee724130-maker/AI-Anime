# AI-Anime Frontend — React 19 用户端

> 端口：`5173` | 框架：React 19 + Vite 8 | UI：antd 6

---

## 目录结构

```
frontend/
├── src/
│   ├── main.tsx                         # 入口：React 19 createRoot
│   ├── App.tsx                          # 路由配置 + ProtectedRoute 登录守卫
│   │
│   ├── pages/
│   │   ├── Auth/
│   │   │   ├── LoginPage.tsx            # 登录页（紫粉金渐变 UI）
│   │   │   └── RegisterPage.tsx         # 注册页
│   │   │
│   │   ├── Home/
│   │   │   └── index.tsx                # 首页：Hero Banner + 算力显示 + 4 快捷入口
│   │   │
│   │   ├── User/
│   │   │   └── index.tsx                # 个人中心：profile + 充值入口
│   │   │
│   │   ├── Script/
│   │   │   ├── index.tsx                # 剧本列表
│   │   │   ├── Create.tsx               # 新建剧本
│   │   │   └── Detail.tsx               # 剧本详情/编辑
│   │   │
│   │   ├── Character/
│   │   │   ├── index.tsx                # 角色列表
│   │   │   ├── Create.tsx               # 创建角色
│   │   │   └── Detail.tsx               # 角色详情/编辑
│   │   │
│   │   ├── Video/
│   │   │   ├── index.tsx                # 视频任务列表（状态轮询 + 删除）
│   │   │   ├── Create.tsx               # 创建任务（分辨率/时长选择 + 预计算力）
│   │   │   └── Detail.tsx               # 任务详情（实时状态 + 视频播放器）
│   │   │
│   │   ├── Studio/
│   │   │   └── index.tsx                # 一体化创作中心：角色+剧本+视频设置
│   │   │
│   │   └── Order/
│   │       └── index.tsx                # 充值页：套餐 + 创建订单 + 模拟支付
│   │
│   ├── components/
│   │   └── VideoPlayer/
│   │       └── index.tsx                # 视频播放器（加载态 + 下载 + 9:16 标识）
│   │
│   ├── services/
│   │   └── api.ts                       # Axios 实例 + JWT 拦截器 + 401 自动跳转
│   │
│   └── stores/
│       └── authStore.ts                 # Zustand 状态管理（user/token + refreshUser）
│
├── package.json
├── vite.config.ts
├── tsconfig.json
└── index.html
```

---

## 页面路由

| 路径 | 页面 | 说明 |
|------|------|------|
| `/login` | LoginPage | 登录（公开） |
| `/register` | RegisterPage | 注册（公开） |
| `/` | HomePage | 首页（需登录） |
| `/user` | UserPage | 个人中心 |
| `/script` | ScriptList | 剧本列表 |
| `/script/create` | ScriptCreate | 新建剧本 |
| `/script/:id` | ScriptDetail | 剧本详情/编辑 |
| `/character` | CharacterList | 角色列表 |
| `/character/create` | CharacterCreate | 创建角色 |
| `/character/:id` | CharacterDetail | 角色详情/编辑 |
| `/video` | VideoList | 视频任务列表 |
| `/video/create` | VideoCreate | 创建任务 |
| `/video/:id` | VideoDetail | 任务详情 |
| `/studio` | StudioPage | 创作中心 |
| `/order` | OrderPage | 充值页面 |

---

## 状态管理

### authStore（Zustand）

| 方法 | 说明 |
|------|------|
| `user` | 当前用户信息（从 localStorage 初始化） |
| `token` | JWT Token |
| `setAuth(user, token)` | 保存认证信息到 localStorage + store |
| `logout()` | 清除认证信息 |
| `refreshUser()` | 调用 `GET /api/user/profile` 刷新用户信息（算力实时同步） |
| `isLoggedIn()` | 检查登录状态 |

### API 拦截器（`services/api.ts`）

- **baseURL**: `http://localhost:3000`
- **Request**: 自动附加 `Authorization: Bearer <token>` 头
- **Response 401**: 清除 token → 跳转 `/login`（login 请求不触发跳转）

---

## 配置

### Vite（`vite.config.ts`）

```ts
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
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
| 视频 | react-player |
| 表单 | react-hook-form |
| 构建 | vite 8, @vitejs/plugin-react |

---

## 关键交互

### 算力实时同步

每次进入首页（`/`）或打开个人中心（`/user`），自动调用 `refreshUser()` 从后端拉取最新算力，确保 admin 后台充值后前端立即更新，无需重新登录。

### 视频任务轮询

- **列表页**：有 pending/processing 任务时每 5 秒自动刷新
- **详情页**：processing 状态每 3 秒轮询

### 算力预估

```
消耗 = baseCost × ceil(duration / 5)
       baseCost: 480p=5, 720p=10, 1080p=20
```

---

## 启动命令

```bash
cd frontend
npm install
npm run dev       # 开发模式 → http://localhost:5173
npm run build     # 生产构建
npm run preview   # 预览生产构建
```
