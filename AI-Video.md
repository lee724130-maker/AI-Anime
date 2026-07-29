# AI 动漫短剧网站 — 项目总体规划

> **核心理念**：从「抽卡」到「流水线」—— 打造一个工业化 AI 短剧内容平台，重点解决角色一致性、批量生成与抖音适配问题。

---

## 当前进度

> **状态**：Phase 1-5 已完成（2026-07-15）· HappyHorse 免费额度模型配置完成（2026-07-16）· Drama UI 重构 + 资产库增强完成（2026-07-17）· ⚠️ **火山引擎已停止使用**（2026-07-27，因欠费 21.83 元）

| 模块 | 状态 | 详情 |
|------|:----:|------|
| 后端框架 | ✅ | NestJS 11 + TypeScript 5.7，48+ 个 `.ts` 源文件 |
| 前端用户端 | ✅ | React 19 + Vite 8 + antd 6，37+ 个源文件，短剧资产库页面 |
| 管理后台 | ✅ | React 19 + Vite 8 + antd 6，10+ 个源文件，6 个功能页面（含操作日志 tab） |
| MySQL 数据库 | ✅ | 18 张业务表（含 drama_projects/outlines/episodes/segments/assets + model_configs + prompt_templates 等）|
| 用户认证系统 | ✅ | 注册/登录/JWT/Passport/路由守卫 |
| 角色权限系统 | ✅ | user/admin 隔离，`@Roles('admin')` + RolesGuard |
| 剧本模块 | ✅ | 后端 CRUD + 前端列表/创建/编辑/详情 |
| 角色模块 | ✅ | 后端 CRUD + 前端列表/创建/编辑/详情 |
| 视频生成模块 | ✅ | 任务创建/状态轮询/Bull 队列/Seedance+FFmpeg 流水线（⚠️ 火山引擎已停用）+ **后处理** + HappyHorse 免费额度模型集成 |
| AI 服务聚合层 | ✅ | ~~火山引擎(Seedance+Seedream+Doubao)~~（已停用）/ 阿里云(通义万相+**HappyHorse**+Qwen) / 智谱(GLM+CogView+CogVideoX) / OpenAI / DeepSeek / Runway — **4 家 Provider** |
| 网页视频播放 | ✅ | 静态文件服务/VideoPlayer/Range 请求支持 |
| API Key 管理 | ✅ | 8 项配置，火山引擎 3 Key 已删除（因欠费），智谱 `zai_api_key` |
| 一体化创作中心 | ✅ | Studio：角色+剧本+视频设置，含分辨率/时长/模型选择（含 HappyHorse） |
| 管理后台功能 | ✅ | 仪表盘/API密钥/用户管理/日志(含操作日志tab)/系统配置 + **充值实时刷新** |
| 订单模块 | ✅ | 套餐/创建/模拟支付/取消（mock-pay） |
| 跨应用算力同步 | ✅ | Admin 充值 → Frontend 实时显示，无需重新登录 |
| 项目文档 | ✅ | 4 份 README + ROADMAP.md + AI-MODEL-STATUS.md |
| 视频管理增强（网格/列表/筛选/下载） | ✅ | Phase 1：视频列表页重构 |
| 剧本批量场景生成 | ✅ | Phase 2：多场景拆分 + 批量提交 |
| 系统默认生成参数 | ✅ | Phase 3：后台配置默认分辨率/时长/风格/模型 |
| **HappyHorse 免费额度配置** | ✅ | **2026-07-16：7 个 HappyHorse 模型（各剩 10 次）配置为阿里云视频最高优先级** |
| 真实支付 | ⬜ | 支付宝/微信支付对接 |
| 部署上线 | ⬜ | 尚未部署 |

### 测试账号

| 角色 | 用户名 | 密码 | 可登录 |
|------|--------|------|:--:|
| 管理员 | `admin` | `123456` | 用户端 + 管理后台 |
| 普通用户 | `user1` | `123456` | 仅用户端 |

---

## 前期开发记录（2026-05-28 ~ 2026-05-29）

<details>
<summary>点击展开：第 1-3 周工作详情</summary>

### 2026-05-28（第 1-2 周）

- MySQL 数据库 `ai_anime` 创建，5 张业务表（users/characters/scripts/video_tasks/orders）
- NestJS 11 后端框架搭建：8 个模块骨架 + JWT/Passport 认证 + RolesGuard 权限
- React 19 用户端：登录/注册/首页/个人中心 + Zustand 状态管理 + Axios 拦截器
- React 19 管理后台：独立登录（admin 校验）+ 仪表盘
- 权限模型：user/admin 角色隔离，后台仅限 admin 登录

### 2026-05-29（第 3 周）

- 剧本模块：后端 Script CRUD API + 前端列表/创建/编辑/详情页
- 角色模块：后端 Character CRUD API + 前端列表/创建/编辑/详情页
- UI 主题区分：管理后台深蓝暗色面板风 / 用户端紫粉金动漫渐变风
- Bug 修复：管理员登录 401 无提示、退出登录不跳转、前端同款 401 问题
- 首页导航更新：3 个功能卡片（剧本创作/角色管理/视频生成预留）
- 测试账号：demo/123456（admin）、user1/123456（user）

</details>

---

## 今日开发记录（2026-06-01）

### 概览

> **完成范围**：第 4-7 周全部工作，新建 22 个文件，修改 7 个文件，修复 4 个 Bug。打通了「文生图 → 图生视频 → 配音 → FFmpeg 合成」完整链路，并通过 Redis + Bull 队列实现了异步任务处理。

### 一、管理后台 API 密钥配置

**后端**（`backend/src/modules/admin/`）

| 文件 | 说明 |
|------|------|
| `admin.entity.ts` | `SystemConfig` 实体 → `system_configs` 表（key-value 配置存储） |
| `admin.service.ts` | 密钥 CRUD + 仪表盘统计（userCount/scriptCount/apiKeyCount/todayCalls）+ 生成日志查询 |
| `admin.controller.ts` | `GET/PUT /api/admin/api-keys` `GET /api/admin/dashboard` `GET /api/admin/generation-logs` |
| `admin.module.ts` | 模块注册（依赖 TypeOrmModule + User/Script/VideoTask 仓库） |

**前端**（`admin/src/pages/ApiKeyManage/`）

| 文件 | 说明 |
|------|------|
| `index.tsx` | 6 项 AI 密钥表单页：OpenAI / DeepSeek / 通义万相 / Runway / HeyGen / TTS |

**功能要点**：
- 密钥仅存储在服务器端 `.env` + `system_configs` 表，前端只展示 `••••••••xxxx` 掩码
- 已配置/未配置状态标签，显示最后更新时间
- 安全提示卡片

### 二、后端视频模块

**后端**（`backend/src/modules/video/`）

| 文件 | 说明 |
|------|------|
| `video.entity.ts` | `VideoTask` 实体 → `video_tasks` 表，关联 User + Script |
| `video.service.ts` | CRUD + 创建任务 + Bull 队列推送（3 秒超时降级）+ 分页查询 + 状态更新 |
| `video.controller.ts` | 5 个 REST 端点（generate / list / task / detail / delete） |
| `video.module.ts` | 模块注册 + Bull 队列注册 |

**API 端点**：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/video/generate` | 创建生成任务 → 推入 Redis 队列 |
| GET | `/api/video/list` | 用户任务列表（分页） |
| GET | `/api/video/task/:taskId` | 按 task_id 查询（轮询用） |
| GET | `/api/video/:id` | 任务详情 |
| DELETE | `/api/video/:id` | 删除任务 |

### 三、前端视频页面

**前端**（`frontend/src/pages/Video/` + `components/VideoPlayer/`）

| 文件 | 说明 |
|------|------|
| `Video/index.tsx` | 视频任务列表页：卡片列表 + 状态标签（4 种颜色）+ 自动 5 秒轮询 + 删除确认 |
| `Video/Create.tsx` | 创建任务页：选择剧本下拉框 + 选择角色下拉框 + 流程说明 Alert |
| `Video/Detail.tsx` | 任务详情页：状态大横幅 + 自动 3 秒轮询 + 完成/失败 Result 展示 + 任务信息表 |
| `components/VideoPlayer/index.tsx` | 视频播放器：加载态 Spin + 错误重试 + 下载按钮 + 9:16 竖屏标识 |

**路由**：`/video` `/video/create` `/video/:id`

### 四、Redis + Bull 任务队列

**后端**（`backend/src/queues/`）

| 文件 | 说明 |
|------|------|
| `queue.module.ts` | Bull 根配置（Redis localhost:6379）+ `video` 队列注册 + 无 Redis 时优雅降级 |
| `video.processor.ts` | `@Processor('video')` 消费者，处理 `generate` 作业 |

**4 步视频生成流水线**：
```
Step 1: AI 文生图 → 根据提示词生成角色/场景图片（1080×1920 竖屏）
Step 2: AI 图生视频 → 将图片转为动态视频（Runway Gen-3 / 占位模式）
Step 3: TTS 配音 → 文字转语音 → 保存为 mp3 文件
Step 4: FFmpeg 合成 → 图片序列 + 音频 + 字幕 → 最终 MP4
```

**容错机制**：
- 指数退避重试（最多 3 次）
- 重试次数 > 3 → 标记 `failed` + 记录错误信息
- Redis 不可用 → 3 秒超时降级，任务保留 `pending` 待后续拾取

### 五、AI 服务聚合层 + FFmpeg 合成

**后端**（`backend/src/utils/`）

| 文件 | 说明 |
|------|------|
| `ai-service.util.ts` | 6 种 AI 服务统一接口：OpenAI DALL·E / 通义万相（图片）、Runway Gen-3（视频）、OpenAI TTS（语音）、DeepSeek/OpenAI（LLM 对话） |
| `ffmpeg.util.ts` | FFmpeg 合成工具：图片拼接、视频合成、SRT 字幕生成、音频时长检测 |
| `utils.module.ts` | UtilsModule 注册 |

**AI 服务切换策略**：
- 优先级：OpenAI → DeepSeek → 通义万相（自动降级）
- 无密钥时：FFmpeg 本地生成纯色占位图（1080×1920 PNG）
- 所有 API 调用均 120 秒超时 + 错误日志

**FFmpeg 功能**：
- 单图 + 音频 → MP4（libx264 编码）
- 多图序列 → 视频（concat 模式）
- SRT 字幕烧录
- 自动缩放至目标分辨率（默认 1080×1920 竖屏）

### 六、管理后台日志页

**前端**（`admin/src/pages/Logs/`）

| 文件 | 说明 |
|------|------|
| `index.tsx` | 表格展示全部生成任务：ID/任务ID/用户/状态/剧本/重试/错误/时间，支持搜索（任务ID）和状态筛选（全部/待处理/处理中/已完成/失败），5 秒自动刷新 |

### 七、Bug 修复记录

| # | 问题 | 根因 | 修复方法 |
|---|------|------|----------|
| 1 | Admin API 返回 500：`Cannot read properties of undefined (reading 'role')` | RolesGuard 注册为全局 `APP_GUARD`，在 JwtAuthGuard 之前执行时 `req.user` 为 undefined | 将 RolesGuard 从全局守卫移除，改为在 admin controller 级别使用 `@UseGuards(JwtAuthGuard, RolesGuard)` 组合 |
| 2 | 视频生成接口在无 Redis 时挂起 | Bull `queue.add()` 阻塞等待 Redis 连接，无超时 | 使用 `Promise.race([jobPromise, timeoutPromise])` 添加 3 秒超时降级 |
| 3 | FFmpeg 合成失败：`Error opening output file` | 占位图远程 URL 返回 SVG 格式，且路径含 `~` 短文件名 | 改为 FFmpeg 本地生成 PNG 占位图 + 输出目录改为项目 `output/` |
| 4 | 多任务卡在 `pending` | Redis 启动前创建的任务未推入队列 | 重启后端后新任务正常（旧任务保留 pending 可手动重试） |

### 八、编译与运行验证

```
三端 TypeScript 编译：backend ✅ | frontend ✅ | admin ✅    （全部零错误）
后端运行：localhost:3000 ✅
前端运行：localhost:5173 ✅
管理后台：localhost:5174 ✅
Redis 连接：localhost:6379 ✅ (ESTABLISHED ×4)
```

**端到端测试结果**（Task #8）：

| 步骤 | 耗时 | 结果 |
|------|------|------|
| 创建任务 | <100ms | `task_id: vid_xxx, status: pending` |
| Redis 队列推送 | <10ms | `Job pushed to queue` |
| Bull 消费者拾取 | <10ms | `Processing video task #8` |
| Step 1: 图片生成 | 1s | FFmpeg 生成 `placeholder_xxx.png` (10 KB) |
| Step 2: 视频生成 | <10ms | 本地占位图直传 |
| Step 3: TTS | <10ms | 无密钥返回空音频 |
| Step 4: FFmpeg 合成 | 3s | 生成 `composite_xxx.mp4` (11.8 KB) |
| 状态更新 | <10ms | `status: completed` |
| **总计** | **~4 秒** | **一条完整的视频生成任务成功完成** |

---

## 今日开发记录（2026-06-01 · 第二段）

> **范围**：用户体验修复 + 火山引擎/豆包 API 全面接入 + 图片/视频 Key 分离

### 九、视频网页播放修复

| # | 问题 | 根因 | 修复方法 |
|---|------|------|----------|
| 5 | 视频文件无法在浏览器播放 | `video_url` 存储本地绝对路径（如 `C:\Users\...\output\xxx.mp4`），前端无法通过 `file://` 访问 | 后端添加 Express 静态文件服务（`app.useStaticAssets`），URL 改为 `/static/filename` 格式 |
| 6 | 视频只有纯蓝色背景 | 占位图使用 FFmpeg `color` 滤镜生成纯色块 | 改用 `testsrc` 滤镜生成彩色测试图案视频（170KB），并添加 Ken Burns 平移缩放效果 |
| 7 | 中文剧本/角色名称显示乱码 | MySQL 连接未设置字符集 | TypeORM 配置添加 `charset: 'utf8mb4'` + `extra: { charset: 'utf8mb4' }` |
| 8 | 剧本/角色/视频页面缺少返回按钮 | 页面顶部只有标题 | 所有列表页添加顶部横幅「返回主页」按钮 + 列表上方导航按钮 |

**新增/修改文件**：

| 文件 | 变更 |
|------|------|
| `backend/src/main.ts` | 添加 `app.useStaticAssets(outputDir, { prefix: '/static/' })` 静态文件服务 |
| `backend/src/common/decorators/public.decorator.ts` | 新增 `@Public()` 装饰器，标记公开接口 |
| `backend/src/common/guards/jwt-auth.guard.ts` | 更新支持 `@Public()` 跳过 JWT 认证 |
| `backend/src/modules/video/video.controller.ts` | 新增 `GET /api/video/file/:filename` 公开文件流端点（支持视频 Range 请求） |
| `backend/src/utils/ffmpeg.util.ts` | 单图模式添加 Ken Burns 效果（`zoompan` 滤镜，缓慢推近） |
| `backend/src/app.module.ts` | MySQL 连接添加 `charset: 'utf8mb4'` |
| `frontend/src/pages/Video/index.tsx` | 添加返回主页按钮 |
| `frontend/src/pages/Script/index.tsx` | 添加返回主页按钮 |
| `frontend/src/pages/Character/index.tsx` | 添加返回主页按钮 |
| `frontend/src/pages/Video/Detail.tsx` | 内嵌 VideoPlayer 组件，自动拼接完整 URL，3 秒轮询 |

### 十、火山引擎/豆包 API 全面接入

**问题**：用户拥有豆包 Seedance 2.0（视频生成）+ Seedream 4.5/1.0 Pro（图片生成）免费资源包，但系统之前只支持 OpenAI/通义万相。

**解决方案**：接入火山引擎 ARK API（OpenAI 兼容接口），一个 Key 通用所有模型。

**更新文件**：

| 文件 | 变更 |
|------|------|
| `backend/src/modules/admin/admin.service.ts` | 新增 `seedance_api_key` 和 `seedream_api_key` 配置项，图片/视频 Key 分离 |
| `backend/src/utils/ai-service.util.ts` | 新增 `generateImageWithSeedream()` 方法（自动切换 4.5→4.0→1.0 Pro 模型）；新增 `generateVideoWithSeedance()` 方法（文生视频+图生视频+轮询）；更新 `generateImage()` 优先级：Seedream → 火山引擎通用 → OpenAI → 通义万相；更新 `generateVideo()` 优先级：Seedance → 火山引擎通用 → Runway |
| `backend/src/queues/video.processor.ts` | 注入 Character/Script Repository；使用角色描述+剧本内容构建 AI 提示词；有 Seedance 时直接文生视频跳过图片步骤；新增 `buildImagePrompt()` / `buildVideoPrompt()` / `buildTTSText()` 方法 |
| `backend/src/queues/queue.module.ts` | 注册 Character/Script TypeORM 实体 |

**API Key 配置结构（最终版）**：

| 配置项 | 对应模型 | 用途 |
|--------|----------|------|
| `seedance_api_key` | Seedance 2.0 | 文生视频/图生视频 |
| `seedream_api_key` | Seedream 4.5/4.0/1.0 Pro | AI 角色图片生成 |
| `volcengine_api_key` | 通用 | 图片+视频兜底 |
| `deepseek_api_key` | DeepSeek | 文本/LLM |
| `openai_api_key` | DALL·E + TTS | 图片+语音 |
| `tongyi_api_key` | 通义万相 | 图片生成 |
| `runway_api_key` | Runway Gen-3 | 视频生成 |

**Seedream 模型自动切换策略**：
```
优先级: doubao-seedream-4-5-251128 (4.5 免费推理)
      → doubao-seedream-4-0-250828 (4.0)
      → doubao-seedream-1-0-pro (1.0 Pro)
逻辑: 遇到 "ModelNotOpen" 错误自动尝试下一个，认证/网络错误立即抛出
```

**完整视频生成链路（最终版）**：

```
用户提交任务 → Redis 队列 → Bull 消费者拾取
  │
  ├─ Step 1: 尝试 Seedance 文生视频（直接文字→视频，无需图片）
  │   └─ 失败/无 Key → 降级到 Seedream 生成角色图
  │       ├─ 尝试 doubao-seedream-4-5 (免费)
  │       ├─ 尝试 doubao-seedream-4-0
  │       ├─ 尝试 doubao-seedream-1-0-pro
  │       └─ 全部失败 → FFmpeg 本地生成占位测试图
  │
  ├─ Step 2: 图生视频
  │   ├─ Seedance 2.0 (首帧图片 + 动态描述)
  │   ├─ Runway Gen-3
  │   └─ FFmpeg Ken Burns 效果 (缓慢推近+平移)
  │
  ├─ Step 3: TTS 配音
  │   ├─ 火山引擎 TTS
  │   ├─ OpenAI TTS
  │   └─ 无声（保留视觉）
  │
  └─ Step 4: FFmpeg 合成输出 → /static/xxx.mp4 → 前端播放
```

### 十一、最终验证结果

```
✅ 后端编译: 零错误 (39 个 .ts 源文件)
✅ 前端编译: 零错误 (18 个源文件)
✅ 管理后台: 零错误 (8 个源文件)
✅ Redis 连接: localhost:6379 (ESTABLISHED ×4)
✅ 静态文件服务: HTTP 200, Content-Type: video/mp4
✅ 中文编码: script.title = "异世界冒险谭" (utf8mb4)
✅ 火山引擎 API: Seedance 2.0 + Seedream 4.5/4.0/1.0 Pro 全部接入
✅ API Key 分离: 图片和视频独立配置
```

**当前 API Key 配置状态**：

| Key | 已配置？ |
|-----|:--:|
| API Key | 已配置？ | 模型 | 用途 |
|-----|:--:|------|------|
| Seedance 视频生成 | ✅ | `doubao-seedance-1-0-pro-250528` | 文生视频/图生视频 |
| Seedream 图片生成 | ✅ | `doubao-seedream-4-5-251128` | AI 角色图片生成 |
| DeepSeek | ✅ | `deepseek-chat` | 文本/LLM |
| 火山引擎通用(备用) | ✅ | 同 Seedance Key | 图/视频兜底 |

---

## 下一步工作计划

### 短期（可立即开始）

| 优先级 | 任务 | 说明 |
|:--:|------|------|
| ⭐ | 激活 Seedance 2.0 | 在火山引擎 ARK 控制台充值后激活 `doubao-seedance-2-0-260128`，代码已自动支持，激活后无需改代码 |
| ⭐ | 视频质量调优 | 当前 1.0 Pro 可用，但 2.0 支持音频生成、首尾帧控制、视频参考等高级功能 |
| 1 | 支付真实对接 | 接入支付宝/微信支付，替换当前 `mock-pay` |
| 2 | 视频生成进度细化 | 前端显示具体百分比而非仅"处理中"，Seedance 轮询状态可映射为进度 |
| 3 | 首帧封面图优化 | 完成视频后自动截取首帧作为封面缩略图 |

### 中期（第 9-10 周）

| 任务 | 说明 |
|------|------|
| 批量视频生成 | 一个剧本自动拆分为多场景，批量提交视频任务 |
| 字幕烧录 | 结合 DeepSeek 自动生成字幕，FFmpeg 烧录到视频 |
| 抖音一键发布 | 对接抖音开放平台 API，生成后直接发布 |
| 数据库备份策略 | 定期备份 MySQL + 视频文件 |

### 技术债

- [ ] 前端 chunk 体积优化（antd 按需加载）
- [ ] 接口限流（防止 API 滥用）
- [ ] 上传文件类型白名单
- [ ] 视频文件清理策略（output/ 目录会越来越大）
- [ ] 错误日志持久化（目前只有 console 输出）

---

> **文档状态**：活跃开发中 · 视频分辨率/时长后处理已实现 · 跨应用算力实时同步 · Seedance 1.5 Pro 设为主力（2026-06-03）

---

## 今日开发记录（2026-06-11）

> **范围**：AI 供应商切换 + 真人/动漫风格选择

### 一、AI 供应商切换（管理后台）

**新增功能**：系统配置中可单独选择图片/视频/文本三个功能的 AI 供应商。

**配置项**（存储在 `system_configs` 表）：

| 配置键 | 可选值 | 说明 |
|--------|--------|------|
| `image_provider` | `auto` / `volcengine` / `aliyun` / `openai` | 图片生成供应商 |
| `video_provider` | `auto` / `volcengine` / `aliyun` / `runway` | 视频生成供应商 |
| `llm_provider` | `auto` / `aliyun` / `volcengine` / `openai` / `deepseek` | 文本对话供应商 |

- 设为 `auto` 保持原优先级链行为
- 切换后即刻生效，无需重启

**新增 AI 服务**：
- `generateVideoWithTongyi()` — 阿里云百炼通义万相视频生成（异步任务 + 轮询）
- `chatCompletion` 新增 Qwen（阿里云百炼）和 Doubao（火山引擎）支持，均使用 OpenAI 兼容接口

**修改的文件**：

| 文件 | 变更 |
|------|------|
| `backend/src/modules/admin/admin.service.ts` | `getSystemConfig` / `updateSystemConfig` 新增 provider 配置键 |
| `backend/src/utils/ai-service.util.ts` | `generateImage` / `generateVideo` / `chatCompletion` 按 provider 路由；新增 `generateVideoWithTongyi()`；新增 `getConfigValue()` |
| `admin/src/pages/SystemConfig/index.tsx` | 新增「AI 供应商切换」面板，图片/视频/文本三个下拉选择器 |

### 二、真人/动漫风格选择

**问题**：之前 prompt 硬编码为 `"Anime character"` / `"anime style"`，无论选什么模型都只出动漫风格。

**修复**：新增 `style` 字段，根据用户选择的风格动态切换 prompt 关键词。

**修改的文件**：

| 文件 | 变更 |
|------|------|
| `backend/src/modules/video/video.entity.ts` | 新增 `style` 列（默认 `anime`） |
| `backend/src/modules/video/video.service.ts` | DTO + 队列任务传递 `style` |
| `backend/src/modules/video/video.controller.ts` | 接口接受 `style` 参数 |
| `backend/src/queues/video.processor.ts` | `buildImagePrompt` / `buildVideoPrompt` 根据 style 切换 anime/realistic 关键词 |
| `frontend/src/pages/Studio/index.tsx` | Step 3 新增 🎨动漫/📷真人 Segmented 切换器 |
| `frontend/src/pages/Video/Create.tsx` | 表单新增风格选项 |
| `frontend/src/pages/Video/index.tsx` | 列表显示风格标签 |
| `frontend/src/pages/Video/Detail.tsx` | 详情显示风格信息 |

### 三、已知问题

- **❌ 选"真人"风格后生成的仍是动漫视频**（2026-06-11）— 推测原因是 prompt 虽然改了，但 Seedance 1.0 Pro 模型本身是动漫向模型，对 "realistic" 关键词不敏感。需要进一步排查：
  - 测试在 通义万相（阿里云百炼）video 接口下选择真人风格是否生效
  - 如果百炼能出真人，说明是 Seedance 模型能力限制
  - 如果百炼也不行，需要调整 prompt 措辞或换模型（如 Seedance 2.0 或 Runway）

### 四、编译验证

```
backend  ✅ npm run build (零错误)
frontend ✅ npm run build (零错误)
admin    ✅ npm run build (零错误)
```

## 今日开发记录（2026-06-03）

> **范围**：Bug 修复 + 视频分辨率/时长后处理 + 跨应用算力同步 + CORS 修复 + 管理员账号调整 + 文档完善

### 一、Admin 页面白屏修复

| # | 问题 | 根因 | 修复方法 |
|---|------|------|----------|
| 1 | Admin 页面全白不显示 | 13 个残留 Node.js 僵尸进程占用端口，导致 Vite 端口跳变 (5174→5175)，CORS 白名单不含 5175 | 清理所有僵尸进程；CORS 白名单扩展为 `5173,5174,5175,5176`；重启所有服务 |
| 2 | demo 账号无法登录后台 | CORS 拦截 API 请求，前端看到网络错误 | 同上修复 |

### 二、Admin 充值后用户端算力不更新

**问题**：Admin 后台给用户充值算力后，用户端（frontend `localhost:5173`）显示旧算力，需重新登录才更新。

**根因**：frontend 的 `authStore` 仅在登录时从 API 获取算力，之后一直读取 localStorage 缓存值。

**修复**：

| 文件 | 变更 |
|------|------|
| `frontend/src/stores/authStore.ts` | 新增 `refreshUser()` 方法，调用 `/api/user/profile` 同步更新 localStorage + store |
| `frontend/src/pages/Home/index.tsx` | 添加 `useEffect` → 每次进入首页自动刷新算力 |
| `frontend/src/pages/Order/index.tsx` | 删除本地 `refreshProfile`，改用 store 共享的 `refreshUser()` |
| `frontend/src/pages/User/index.tsx` | 获取 profile 后同步刷新 store |

### 三、视频分辨率 + 时长选项修复

**问题**：前端选不同分辨率（480p/720p/1080p）和时长（5s/10s/15s），生成视频始终是 720p + 5 秒。

**根因**：5 处硬编码导致参数丢失。

| # | 文件 | 位置 | 问题 |
|---|------|------|------|
| 1 | `video.processor.ts:124` | `duration: 5` 写死 | → `videoDuration` |
| 2 | `video.processor.ts:92` | 未传 `resolution` | → 添加 `resolution: videoResolution` |
| 3 | `ai-service.util.ts:270` | `scale=1080:1920` 写死 | → 读取 `options.resolution` |
| 4 | `ai-service.util.ts:402` | Seedance API `resolution: '720p'` | → `options.resolution` |
| 5 | `ffmpeg.util.ts:243` | `resolution: '1080x1920'` 写死 | → 参数化 |

**增强**：新增 FFmpeg 后处理步骤，Seedance 原始输出（固定 720×1280 @ 5s）→ 自动缩放 + 循环到目标分辨率/时长。验证结果：480p+12s 输出 **480×854 @ 12.000s** ✅

| 文件 | 变更 |
|------|------|
| `utils/ffmpeg.util.ts` | 新增 `getVideoInfo()` + `adjustVideo()` 方法 |
| `queues/video.processor.ts` | Step 4 后新增后处理步骤 |
| `utils/ai-service.util.ts` | `VideoGenerationOptions` 新增 `resolution` 字段；`generatePlaceholderVideo` 动态分辨率；新增 `doubao-seedance-1-0-pro-fast-251015` 模型 |

### 四、Seedance 模型管理

**新增模型**：`doubao-seedance-1-0-pro-fast-251015`（1.0 Pro 快速版）

**模型优先级调整为**：
```
1. doubao-seedance-1-5-pro-251215    ⭐ 主力
2. doubao-seedance-2-0-260128        (需充值)
3. doubao-seedance-2-0-fast-260128
4. doubao-seedance-1-0-pro-fast-251015
5. doubao-seedance-1-0-pro-250528    (兜底)
```

1.5 Pro 设为主力，用户可直接测试最新可用模型效果。

### 五、管理员账号调整

- 数据库：`UPDATE users SET username='admin' WHERE id=1` → 管理员用户名从 `demo` 改为 `admin`
- 新测试账号：`admin / 123456`

### 六、项目文档完善

| 新建文件 | 说明 |
|----------|------|
| `ROADMAP.md` | 后续开发路线图（短期/中期/长期 + 技术债） |
| `backend/README.md` | 后端完整文档：目录结构、API 接口表、配置、启动命令 |
| `frontend/README.md` | 前端文档：路由表、状态管理、依赖、关键交互 |
| `admin/README.md` | 管理后台文档：页面功能、authStore、布局逻辑 |

### 七、编译验证

```
backend  ✅ npm run build (零错误)
frontend ✅ npm run build (零错误)
admin    ✅ npm run build (零错误)
```

### 十二、一体化创作中心页面

**新建文件**：`frontend/src/pages/Studio/index.tsx`

| 步骤 | 功能 | 组件 |
|------|------|------|
| Step 1 | 角色设定 | 快速创建 / 从角色库选择 |
| Step 2 | 剧情内容 | 剧本下拉 + TextArea 1000字输入 |
| Step 3 | 视频设置 | 480p/720p/1080p + 5s/10s/15s |
| 右侧栏 | 生成历史 | 缩略图卡片 + 5s轮询 + 点击跳详情 |

**后端扩展参数**：`POST /api/video/generate` 新增 `character_name`, `character_desc`, `prompt`, `resolution`, `duration`
**分辨率映射**：`480p→480×854`, `720p→720×1280`, `1080p→1080×1920`

### 十三、管理后台完善

| 新建文件 | 功能 |
|----------|------|
| `admin/src/pages/UserManage/index.tsx` | 用户表格 + 搜索 + 封禁/解封 + 手动充值弹窗 |
| `admin/src/pages/SystemConfig/index.tsx` | 站点名称/公告 + 算力定价 + 每日上限 + 重试次数 |

**新增 API**：`GET /api/admin/users` `PUT /api/admin/users/:id/ban` `POST /api/admin/users/:id/recharge` `GET /api/admin/system/config` `PUT /api/admin/system/config`

### 十四、UI 全面优化

- **主页**：顶部栏(用户信息) + Hero大字 + 渐变按钮 + 3小图标入口，背景 `#f8f9fb`
- **创作中心**：①②③编号步骤 + Segmented组件 + 右侧缩略图历史 + 统一顶栏
- **管理后台**：用户管理/系统配置从占位变为完整功能

### 编译状态

```
backend 44 .ts ✅ | frontend 20 .tsx/.ts ✅ | admin 10 .tsx/.ts ✅
```

---

### 用户端功能（`frontend/` — `localhost:5173`）

| 页面 | 路由 | 功能 |
|------|------|------|
| 登录 | `/login` | 用户名+密码登录，JWT 认证，紫粉金渐变 UI |
| 注册 | `/register` | 新用户注册，class-validator 参数校验 |
| 首页 | `/` | Hero Banner + 算力显示 + 3 个功能卡片入口 |
| 剧本列表 | `/script` | 卡片列表 + 新建 + 编辑 + 删除（Popconfirm） |
| 剧本创建 | `/script/create` | 标题 + 内容表单 |
| 剧本详情 | `/script/:id` | 查看/编辑剧本 |
| 角色列表 | `/character` | 头像 + 描述 + 管理 |
| 角色创建 | `/character/create` | 名称 + 描述 + 头像 URL |
| 角色详情 | `/character/:id` | 查看/编辑角色 |
| 视频列表 | `/video` | 状态标签(4色) + 5秒自动轮询 + 删除 |
| 视频创建 | `/video/create` | 选择剧本 + 角色 + 分辨率/时长 + 模型/风格选择 + 预计算力 |
| 视频详情 | `/video/:id` | 3秒轮询 + 完成/失败结果 + 视频播放器 |
| 创作中心 | `/studio` | ①角色选择 ②剧本选择 ③视频设置（分辨率/时长/模型/风格）一键生成 |
| 充值套餐 | `/order` | 3 档套餐选择 + 创建订单 + 模拟支付 + 订单历史 |
| 个人中心 | `/user` | 用户头像/角色/算力/手机号/注册时间 + 充值入口 + 退出登录 |

### 管理后台功能（`admin/` — `localhost:5174`）

| 页面 | 菜单键 | 功能 |
|------|--------|------|
| 登录 | `/login` | 仅限 admin 角色登录，深蓝渐变 UI |
| 仪表盘 | `dashboard` | 4 个统计卡片 + 快捷入口 |
| API 密钥 | `apikeys` | 6 项 AI 密钥配置 + 掩码显示 + 状态标签 |
| 用户管理 | `users` | 用户列表 + 搜索 + 封禁/解封 + 手动充值 |
| 系统日志 | `logs` | 生成日志（带剧本标题/进度/规格/算力，服务端分页）+ 操作日志（管理员动作记录，服务端分页） |
| 系统配置 | `config` | 站点名/公告/算力定价/每日限额/重试次数/AI 供应商切换 |

### 后端 API 全览（`backend/` — `localhost:3000`）

**认证模块** — `POST /api/auth/register` `POST /api/auth/login`
**用户模块** — `GET /api/user/profile`
**剧本模块** — `GET list` `GET :id` `POST` `PUT :id` `DELETE :id`
**角色模块** — `GET list` `GET :id` `POST` `PUT :id` `DELETE :id`
**视频模块** — `POST generate` `GET list` `POST batch-delete` `POST batch-download` `POST :id/retry` `GET list?search=&status=&resolution=&sort=` `GET task/:taskId` `GET :id` `DELETE :id` `GET file/:filename`
**剧本模块** — `GET :id/export` `POST /import`
**管理模块** — `GET api-keys` `PUT api-keys` `GET dashboard` `GET generation-logs?page=&limit=&status=` `GET logs?page=&limit=`
**订单模块** — `GET plans` `POST create` `GET list` `POST :id/mock-pay` `POST :id/cancel`

---

## 技术栈与依赖

### 后端（NestJS 11 + TypeScript 5.7）

```json
{
  "核心框架": "@nestjs/core @nestjs/common @nestjs/platform-express",
  "数据库": "@nestjs/typeorm typeorm mysql2 better-sqlite3",
  "认证": "@nestjs/jwt @nestjs/passport passport passport-jwt bcryptjs",
  "校验": "class-validator class-transformer",
  "队列": "@nestjs/bull bull redis",
  "配置": "@nestjs/config",
  "HTTP": "axios",
  "视频": "fluent-ffmpeg",
  "上传": "multer",
  "对象存储": "ali-oss",
  "日志": "winston",
  "开发": "@nestjs/cli typescript ts-node jest supertest"
}
```

### 前端用户端（React 19 + Vite 8 + TypeScript 6）

```json
{
  "框架": "react react-dom",
  "路由": "react-router-dom",
  "UI库": "antd @ant-design/icons",
  "HTTP": "axios",
  "状态管理": "zustand",
  "视频播放": "react-player",
  "表单": "react-hook-form",
  "日期": "dayjs",
  "构建": "vite @vitejs/plugin-react typescript"
}
```

### 管理后台（同前端技术栈）

依赖同用户端，但不含 `react-player` 和 `react-hook-form`。

### 外部服务

| 服务 | 用途 | 安装方式 |
|------|------|----------|
| MySQL / SQLite | 数据持久化 | SQLite 默认（零配置），MySQL 可选 |
| Redis | 任务队列缓存 | Windows 本地服务（端口 6379） |
| FFmpeg | 视频合成 | Windows 安装到 `C:\Program Files\ffmpeg\` |

---

## 数据库表结构（6 张表）

| 表名 | 实体文件 | 用途 | 关键字段 |
|------|----------|------|----------|
| `users` | `user.entity.ts` | 用户 | id, username, password(加密), role(user/admin), credits, status |
| `characters` | `character.entity.ts` | AI 角色 | id, user_id, name, description, avatar_url, lora_model_id |
| `scripts` | `script.entity.ts` | 剧本 | id, user_id, title, content, scenes(JSON), status |
| `video_tasks` | `video.entity.ts` | 视频任务 | id, user_id, script_id, task_id, status, video_url, error_msg, retry_count, model_name, style, resolution, duration, credit_cost, progress |
| `orders` | `order.entity.ts` | 订单 | id, user_id, order_no, amount, credits, status, created_at |
| `system_configs` | `admin.entity.ts` | 系统配置 | id, config_key, config_value, description |

---

## 项目目录结构（完整）

```
AI-Anime/                            # 📍 C:\Users\Administrator\Desktop\AI-Anime\
├── AI-Video.md                      # 项目规划 + 开发文档（工作日志）
├── ROADMAP.md                       # 后续开发路线图 + 技术债
│
├── backend/                         # NestJS 11 + TypeScript 5.7
│   ├── README.md                    # 后端文档（API/配置/架构）
│   ├── src/
│   │   ├── main.ts                  # 入口：CORS + ValidationPipe
│   │   ├── app.module.ts            # 全局模块：TypeORM + 6 个功能模块
│   │   ├── config/
│   │   │   └── database.config.ts   # 双模式：MySQL / SQLite
│   │   ├── common/
│   │   │   ├── guards/
│   │   │   │   ├── jwt-auth.guard.ts       # JWT 认证守卫
│   │   │   │   └── roles.guard.ts          # 角色权限守卫
│   │   │       └── decorators/
│   │   │           ├── roles.decorator.ts      # @Roles('admin') 装饰器
│   │   │           └── public.decorator.ts     # @Public() 开放接口装饰器
│   │   ├── modules/
│   │   │   ├── auth/                       # 认证模块
│   │   │   │   ├── auth.controller.ts      # register / login
│   │   │   │   ├── auth.service.ts         # bcryptjs + JWT
│   │   │   │   ├── auth.module.ts
│   │   │   │   ├── jwt.strategy.ts         # Passport JWT 策略
│   │   │   │   └── dto/
│   │   │   │       ├── login.dto.ts
│   │   │   │       └── register.dto.ts
│   │   │   ├── user/                       # 用户模块
│   │   │   │   ├── user.entity.ts          # users 表
│   │   │   │   ├── user.service.ts
│   │   │   │   ├── user.controller.ts      # GET /api/user/profile
│   │   │   │   └── user.module.ts
│   │   │   ├── script/                     # 剧本模块
│   │   │   │   ├── script.entity.ts        # scripts 表
│   │   │   │   ├── script.service.ts
│   │   │   │   ├── script.controller.ts    # CRUD 5 端点
│   │   │   │   └── script.module.ts
│   │   │   ├── character/                  # 角色模块
│   │   │   │   ├── character.entity.ts     # characters 表
│   │   │   │   ├── character.service.ts
│   │   │   │   ├── character.controller.ts # CRUD 5 端点
│   │   │   │   └── character.module.ts
│   │   │   ├── video/                      # 视频模块 ⭐ 新增
│   │   │   │   ├── video.entity.ts         # video_tasks 表
│   │   │   │   ├── video.service.ts        # CRUD + 队列推送（3秒超时降级）
│   │   │   │   ├── video.controller.ts     # 5 个 REST 端点
│   │   │   │   └── video.module.ts
│   │   │   ├── admin/                      # 管理模块 ⭐ 新增
│   │   │   │   ├── admin.entity.ts         # system_configs 表
│   │   │   │   ├── admin.service.ts        # 密钥管理 + 仪表盘统计 + 日志查询
│   │   │   │   ├── admin.controller.ts     # 4 个管理员端点
│   │   │   │   └── admin.module.ts
│   │   │   └── order/                      # 订单模块（mock 支付）
│   │   ├── queues/                         # 任务队列 ⭐ 新增
│   │   │   ├── queue.module.ts             # Bull + Redis 配置
│   │   │   └── video.processor.ts          # 4 步流水线消费者 + 重试机制
│   │   └── utils/                          # 工具模块 ⭐ 新增
│   │       ├── ai-service.util.ts          # 6 种 AI 服务聚合层
│   │       ├── ffmpeg.util.ts              # FFmpeg 合成工具
│   │       └── utils.module.ts
│   ├── .env                               # MySQL + JWT + Redis 配置
│   ├── output/                            # FFmpeg 输出目录
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                               # React 19 + Vite 8 + antd 6
│   ├── README.md                          # 前端文档（路由/状态/依赖）
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx                         # 路由 + ProtectedRoute
│   │   ├── pages/
│   │   │   ├── Auth/
│   │   │   │   ├── LoginPage.tsx           # 登录页（紫粉金渐变）
│   │   │   │   └── RegisterPage.tsx        # 注册页
│   │   │   ├── Home/index.tsx              # 首页（Hero + 算力 + 3 卡片）
│   │   │   ├── User/index.tsx              # 个人中心
│   │   │   ├── Script/
│   │   │   │   ├── index.tsx               # 剧本列表
│   │   │   │   ├── Create.tsx              # 新建剧本
│   │   │   │   └── Detail.tsx              # 剧本详情/编辑
│   │   │   ├── Character/
│   │   │   │   ├── index.tsx               # 角色列表
│   │   │   │   ├── Create.tsx              # 创建角色
│   │   │   │   └── Detail.tsx              # 角色详情/编辑
│   │   │   ├── Video/                      # ⭐ 新增
│   │   │   │   ├── index.tsx               # 视频列表（状态轮询）
│   │   │   │   ├── Create.tsx              # 创建任务
│   │   │   │   └── Detail.tsx              # 任务详情（实时状态）
│   │   │   ├── Studio/index.tsx            # ⭐ 一体化创作中心（角色+剧本+视频）
│   │   │   ├── Order/                      # 充值套餐 + 订单历史
│   │   ├── components/
│   │   │   └── VideoPlayer/index.tsx        # ⭐ 新增：视频播放器
│   │   ├── services/api.ts                 # Axios + JWT 拦截器 + 401 跳转
│   │   └── stores/authStore.ts             # Zustand 状态管理
│   ├── package.json
│   └── vite.config.ts
│
└── admin/                                  # React 19 + Vite 8 + antd 6
    ├── README.md                          # 管理后台文档（页面/状态/布局）
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx                          # 路由 + 登录守卫
    │   ├── pages/
    │   │   ├── Login/index.tsx              # 管理后台登录（深蓝渐变）
    │   │   ├── Dashboard/index.tsx          # 布局容器 + 仪表盘 + 菜单导航
    │   │   ├── ApiKeyManage/index.tsx       # API 密钥配置
│   │   ├── Logs/index.tsx               # 生成任务日志
│   │   ├── UserManage/index.tsx         # 用户列表 + 封禁/解封 + 手动充值
│   │   └── SystemConfig/index.tsx       # 站点配置 + AI 供应商切换
    │   ├── services/api.ts                 # Axios + admin_token JWT 拦截器
    │   └── stores/authStore.ts             # Zustand（独立 admin_token key）
    ├── package.json
    └── vite.config.ts
```

---

## 开发计划进度

| 阶段 | 周期 | 核心任务 | 产出 | 状态 |
|------|------|----------|------|:----:|
| 第 1 周 | 7 天 | 环境搭建、基础框架 | NestJS + React (用户端+后台) 项目初始化 | ✅ |
| 第 2 周 | 7 天 | 用户认证系统 + 角色权限 | 注册/登录/JWT/个人中心/admin 隔离 | ✅ |
| 第 3 周 | 7 天 | 剧本 + 角色模块 | LLM 剧本生成、角色创建与保存 | ✅ |
| 第 4-5 周 | 14 天 | 视频生成链路 | 文生图 → 图生视频 → 配音 → FFmpeg 合成 | ✅ |
| 第 6 周 | 7 天 | 任务队列 | Bull + Redis 异步处理 + 前端轮询 | ✅ |
| 第 7 周 | 7 天 | 管理后台完善 | API 密钥配置/仪表盘/日志/菜单导航 | ✅ |
| 第 8 周 | 7 天 | 支付 / 会员 | 对接支付宝/微信支付，算力扣费逻辑 | ⬜ |
| 第 9-10 周 | 14 天 | 测试 + 上线 | 功能测试、性能测试、生产环境部署 | ⬜ |

---

## 下一步 → 第 8 周：支付 / 会员系统（进行中）

### ✅ 已完成
- [x] 订单模块后端 — `order.entity.ts`、`order.service.ts`、`order.controller.ts`、`order.module.ts`
- [x] 前端订单页面 — `frontend/src/pages/Order/` 充值套餐选择 + 历史订单列表
- [x] 管理后台用户管理 — `admin/src/pages/UserManage/` 用户列表 + 封禁/解封 + 手动充值
- [x] 管理后台系统配置 — `admin/src/pages/SystemConfig/` 站点名/公告/算力定价/供应商切换
- [x] 视频算力扣费 — 生成前余额检查、成功后扣费、防重复扣费

### ⬜ 待完成

#### Step 3：支付对接
- [ ] 支付宝/微信支付 API 对接
- [ ] 支付回调处理 + 订单状态更新
- [ ] 算力充值（`users.credits` 字段更新）

---

## 运维与保障

### 启动方式

```bash
# 1. 启动 MySQL（Windows 服务）
# 2. 启动 Redis
redis-server

# 3. 启动后端
cd backend && npm run start:dev

# 4. 启动前端用户端
cd frontend && npm run dev

# 5. 启动管理后台
cd admin && npm run dev
```

### 当前运行地址

| 服务 | 地址 |
|------|------|
| 后端 API | `http://localhost:3000` |
| 用户端 | `http://localhost:5173` |
| 管理后台 | `http://localhost:5174` |

### AI 调用容错策略

| 策略 | 说明 |
|------|------|
| 多供应商切换 | OpenAI → DeepSeek → 通义万相（自动降级） |
| 队列超时降级 | Redis 不可用时 3 秒超时，任务保留 pending |
| 指数退避重试 | 失败后最多重试 3 次 |
| 本地占位图 | 无 AI 密钥时 FFmpeg 本地生成纯色图 |
| API 超时控制 | 单次 AI 调用超时 120s |

### 安全规范

- [x] API 密钥仅存后端 `.env` + `system_configs` 表
- [x] 密码 bcryptjs 加密存储
- [x] JWT token 7 天过期
- [x] class-validator 参数校验
- [x] 角色权限双守卫（JwtAuthGuard + RolesGuard）
- [x] 前端 401 自动跳转登录
- [ ] 接口限流（Nginx + NestJS 双层）— 待部署
- [ ] 上传文件类型白名单 — 待实现

---

## 今日开发记录（2026-06-02）

> **范围**：第 8 周支付/会员系统第一阶段：订单模块、充值页面、视频算力扣费骨架与进度反馈。

### 一、启动与配置检查

| 项目 | 状态 | 说明 |
|------|:----:|------|
| FFmpeg | ✅ | `ffmpeg -version` 可用 |
| MySQL | ✅ | `127.0.0.1:3306` 正常运行中 |
| Redis | ✅ | `127.0.0.1:6379` 正常运行中 |
| Seedance API Key | ✅ | 火山引擎 `25e6e822-...`，已配置 |
| Seedream API Key | ✅ | 同上 Key，已配置（图片生成正常） |
| DeepSeek API Key | ✅ | `sk-xxxx...`，已配置 |
| 支付 API Key | ⬜ | 真实支付宝/微信支付尚未接入 |

### 二、后端订单模块

**新增文件**（`backend/src/modules/order/`）：

| 文件 | 说明 |
|------|------|
| `order.entity.ts` | `Order` 实体，对应 `orders` 表 |
| `order.service.ts` | 套餐列表、创建订单、订单列表、模拟支付、取消订单 |
| `order.controller.ts` | `GET /api/order/plans`、`POST /api/order/create`、`GET /api/order/list`、`POST /api/order/:id/mock-pay`、`POST /api/order/:id/cancel` |
| `order.module.ts` | 订单模块注册 |

**当前充值套餐**：

| 套餐 | 金额 | 算力 |
|------|------|------|
| 入门包 | ¥9.90 | 120 |
| 创作者包 | ¥29.90 | 420 |
| 工作室包 | ¥99.00 | 1800 |

> 当前使用 `mock-pay` 作为本地开发支付成功入口；真实支付接入后由支付宝/微信回调更新订单状态并发放算力。

### 三、视频算力扣费与进度

**修改文件**：

| 文件 | 变更 |
|------|------|
| `backend/src/modules/video/video.entity.ts` | 新增 `resolution`、`duration`、`credit_cost`、`progress`、`credits_charged` 字段 |
| `backend/src/modules/video/video.service.ts` | 生成前检查用户余额；按分辨率和时长估算消耗；成功后扣费且防重复扣费 |
| `backend/src/queues/video.processor.ts` | 关键步骤写入进度；失败重试时进度归零；完成后进度 100 并扣费 |

**默认扣费规则**：

| 分辨率 | 5 秒基础消耗 |
|------|------|
| 480p | 5 算力 |
| 720p | 10 算力 |
| 1080p | 20 算力 |

时长按 5 秒为一个单位向上取整；管理后台 `credit_cost_480p/720p/1080p` 可覆盖默认值。

### 四、用户端充值页面

**新增文件**：

| 文件 | 说明 |
|------|------|
| `frontend/src/pages/Order/index.tsx` | 充值套餐、创建订单、模拟支付、订单历史 |

**修改文件**：

| 文件 | 变更 |
|------|------|
| `frontend/src/App.tsx` | 新增 `/order` 路由 |
| `frontend/src/pages/Home/index.tsx` | 首页顶部和快捷入口新增充值入口 |
| `frontend/src/pages/User/index.tsx` | 个人中心新增充值按钮 |
| `frontend/src/pages/Video/Create.tsx` | 新增分辨率/时长选择与预计算力提示 |
| `frontend/src/pages/Video/index.tsx` | 列表展示进度、规格与消耗 |
| `frontend/src/pages/Video/Detail.tsx` | 详情页展示进度、规格与本次算力 |
| `frontend/src/pages/Studio/index.tsx` | 生成按钮展示预计算力 |

### 五、管理后台修复

- 修复 `backend/src/modules/admin/admin.service.ts` 中 API Key 中文标签乱码和掩码显示乱码。
- 清理用户端/管理后台未使用 import 与变量，恢复 TypeScript 编译零错误。

### 六、编译验证

```
backend  ✅ npm run build
frontend ✅ npm run build
admin    ✅ npm run build
```

> Vite 仍提示部分 chunk 超过 500KB，这是体积优化提示，不影响运行。

### 七、当前阻塞

- ~~MySQL 未启动~~ ✅ 已解决
- ~~Redis 未启动~~ ✅ 已解决
- ~~Seedance 视频生成失败~~ ✅ 已解决（见第八节）
- ~~Studio 角色库选择不可用~~ ✅ 已解决（见第九节）
- 如要真实支付，需要补齐支付宝/微信支付商户配置；当前仅完成本地模拟支付闭环。

---

### 八、Seedance API 重大修复（下午调试 · 2026-06-02）

> **问题**：视频生成一直卡在"处理中"，最终生成的是 FFmpeg 彩色测试图案而非 AI 视频。

**根因诊断**：通过直接调用火山引擎 ARK API 逐项排查，发现 3 个致命 Bug：

| # | Bug | 原因 | 修复 |
|---|-----|------|------|
| 🔴1 | API 端点 404 | 使用了错误的 `/api/v3/video/generations`（不存在） | 改为正确的 `/api/v3/contents/generations/tasks` |
| 🔴2 | 模型 ID 错误 | 代码写 `seedance-2.0`，正确 ID 是 `doubao-seedance-1-0-pro-250528` | 添加 `SEEDANCE_MODELS` 自动降级链：2.0→2.0-fast→1.5→1.0-pro |
| 🔴3 | 请求格式不对 | 用的是 OpenAI DALL·E 风格的 flat payload | 改为 ARK content generation 的 `content` 数组格式 |
| 🟡4 | ffmpeg 命令空参数 | 当 `imageUrl=''` 时，`-i` 后面无文件路径 | ffmpeg.util.ts 添加输入验证 + video.processor.ts 重构视频合成逻辑 |
| 🟡5 | 占位图返回 .mp4 | `getPlaceholderImage` 返回视频而非图片 | 修复为返回 PNG 图片 |

**API 修复前后对比**：

| | 修复前（❌） | 修复后（✅） |
|---|---|---|
| 端点 | `POST /api/v3/video/generations` | `POST /api/v3/contents/generations/tasks` |
| 模型 ID | `seedance-2.0` | `doubao-seedance-1-0-pro-250528`（自动降级） |
| 请求体 | `{model, prompt, aspect_ratio}` | `{model, content: [{type:"text",text:...}], parameters:{...}}` |
| 轮询 | `GET /api/v3/video/generations/{id}` | `GET /api/v3/contents/generations/tasks/{id}` |
| 响应 | `data.output.video_url` | `data.content.video_url` |

**修改的文件**：

| 文件 | 变更内容 |
|------|----------|
| `backend/src/utils/ai-service.util.ts` | ① 重写 `generateVideoWithSeedance()`：正确端点+content array 格式+模型自动降级 ② 新增 `pollSeedanceTask()` 轮询方法 ③ 新增 `generateEmergencyPlaceholder()` 三级兜底 ④ `getPlaceholderImage` 返回 PNG ⑤ `generatePlaceholderVideo` 公开+不返回空值 |
| `backend/src/queues/video.processor.ts` | 重构视频合成决策：区分远程视频/本地视频/图片/无产出四种情况，`imageUrl` 永不为空 |
| `backend/src/utils/ffmpeg.util.ts` | ① `composite()` 添加输入验证 ② 命令构建改为数组参数方式 ③ 新增 `compositeVideoWithAudio()` 方法 |

**Seedance 模型可用状态**（API 直接查询 `GET /api/v3/models`）：

| 模型 ID | 状态 |
|---------|:----:|
| `doubao-seedance-2-0-260128` | ⚠️ 需充值激活 |
| `doubao-seedance-2-0-fast-260128` | ⚠️ 需充值激活 |
| `doubao-seedance-1-5-pro-251215` | ⚠️ 未激活 |
| `doubao-seedance-1-0-pro-250528` | ✅ 已激活，当前使用此模型 |

**验证结果**：通过 curl 直接调用 API，Seedance 1.0 Pro 成功返回 AI 视频 URL（1080p，24fps），耗时约 40-55 秒。

### 九、Studio 角色库选择修复

**问题**：Studio 创作中心页面中"从角色库选择"选项无法点击切换。

**根因**：`Segmented` 组件的 `value` 绑定了 `characterId ? 'select' : 'quick'`，但点击"从角色库选"时 `characterId` 仍为 `undefined`，导致 `value` 立即跳回 `'quick'`。

**修复**：新增独立的 `characterMode` state 控制 Segmented 切换。

**修改文件**：`frontend/src/pages/Studio/index.tsx`

---

### 十、今日编译终验

```
backend  ✅ npm run build (零错误)
frontend ✅ npm run build (零错误)
admin    ✅ npm run build (零错误)
```

> **文档状态**：开发中 · 视频生成链路已完全打通，Seedance 1.0 Pro 正常运行（2026-06-02 下午）· 下一阶段：支付真实对接 + 激活 Seedance 2.0 + 视频质量优化

---

## 今日开发记录（2026-06-12）

> **范围**：通义万相 API 调试 + 真实感风格优化 + 字幕烧录

### 一、通义万相 API 集成修复

**Bug 1：语法错误导致整个函数之后的代码失效**

| 问题 | 根因 | 修复 |
|------|------|------|
| `Cannot read properties of undefined (reading 'taskId')` | `generateVideoWithTongyi()` 中 `axios.post()` 调用结束后残留了 14 行重复代码（片段来自旧版本），破坏了 TypeScript 语法解析，导致 `submitRes` 变量未正确初始化 | 删除残留代码（`ai-service.util.ts:324-337`） |
| Property 'TONGYI_VIDEO_MODELS' does not exist | 循环引用 `this.TONGYI_VIDEO_MODELS` 但类中未定义该属性 | 在 `SEEDANCE_MODELS` 后新增 `TONGYI_VIDEO_MODELS` 数组 |

**Bug 2：模型列表缺少用户已激活的模型**

更新模型优先级为（用户确认有免费额度的排最前）：

```typescript
TONGYI_VIDEO_MODELS = [
  'wan2.7-t2v-2026-04-25',     // ✅ 用户有免费额度
  'wan2.7-t2v',
  'wan2.7-i2v-2026-04-25',
  'wan2.7-r2v',
  'happyhorse-1.0-video-edit',
  'wan2.6-t2v',
  'wanx2.1-t2v-turbo',
]
```

**Bug 3：分辨率参数大小写错误**

`720p → 720P` 的转换代码：
```typescript
// ❌ 之前：只大写首字符 '7'，p 还是小写
resolution: res.charAt(0).toUpperCase() + res.slice(1)
// ✅ 修复后
resolution: res.toUpperCase()
```

### 二、阿里云绿网内容审核拦截

**问题**：`wan2.7-t2v-2026-04-25` 模型任务提交成功，但在推理阶段被阿里云绿网（Green Net）拦截：
```
Green net check failed for text: Input data may contain inappropriate content.
```

**根因**：`prompt_extend: true` 导致模型自动扩展 prompt，扩展内容可能包含过于详细的身体描述词（如 `pores`），触发了审核。

**修复**：
- 恢复 realistic prompt 到安全措辞，移除 `pores`、`real person live action` 等可能触发审核的词
- 设置 `prompt_extend: false`，只发送原始控制文本

**根因**：`prompt_extend: true` 导致模型自动扩展 prompt，扩展内容触发了审核。设置为 `false` 后修复。

### 三、真实/动漫风格切换

**问题**：选真人风格不出真人，选动漫风格也不出动漫，prompt 放在末尾被模型忽略了。

**修复**：
1. 风格关键词移至 prompt **最开头**
2. 真人分支强化：`真人实拍, live action, realistic video, no animation`
3. 动漫分支强化：`anime style, 动漫风格, 二次元, Japanese animation, cel shade, 赛璐珞风格, hand-drawn, no realistic, no真人`

**验证**：✅ 两个风格能正确区分

### 四、字幕烧录

**问题**：视频有音频无字幕；自定义提示词中的台词不显示。

**修复**：

| 问题 | 根因 | 修复 |
|------|------|------|
| 字幕不显示 | `buildTTSText()` 只读 `script.content`，自定义提示词被忽略 | 新增 `customPrompt` 参数，优先使用用户输入的台词 |
| FFmpeg subtitles 滤镜报错 | Windows 路径 `C:\...` 的冒号被 FFmpeg 当成参数分隔符 | 路径 `\`→`/`，冒号转义为 `\\:` → `subtitles=C\:/path/file.srt` |
| 中文字体显示不全 | 默认字体不含中文全形字 | 测试通过：libass 自动 fallback 到 MicrosoftYaHeiUI |

**修改文件**：

| 文件 | 变更 |
|------|------|
| `utils/ffmpeg.util.ts` | `compositeVideoWithAudio()` 新增 `subtitlePath` 参数 + 两个 compositing 方法的 subtitles 滤镜统一使用 `\\:` 转义冒号 |
| `queues/video.processor.ts` | 新增 `generateSubtitles()` 方法；`buildTTSText()` 新增 `customPrompt` 参数；字幕路径传入 compositing |

### 五、编译验证

```
backend  ✅ npm run build (零错误)
frontend ✅ npm run build (零错误)
admin    ✅ npm run build (零错误)
```

> **文档状态**：通义万相视频 API 集成完成 · 风格切换正常 · 字幕烧录正常 · 模型选择器可用（2026-06-12）

---

## 今日开发记录（2026-06-12 · 第二段）

> **范围**：模型选择器 + 剧本删除外键修复 + antd v6 兼容

### 一、模型选择器（Studio / 视频创建页）

**新增功能**：用户可在生成视频时手动指定使用哪个 AI 模型，覆盖默认优先级链。

**前端**：Studio 创作中心「视频设置」区新增「模型」下拉框，`Video/Create.tsx` 同步添加。

| 选项 | 说明 |
|------|------|
| 空（默认） | 按系统配置的优先级链自动选择 |
| `doubao-seedance-1-5-pro-251215` | 火山引擎 Seedance 1.5 Pro |
| `wan2.7-t2v-2026-04-25` | 阿里云 通义万相 2.7 T2V |
| `wan2.7-i2v-2026-04-25` | 阿里云 通义万相 2.7 I2V |

**后端**：
- `VideoGenerationOptions` 新增 `model` 字段
- `VideoTask` 实体新增 `model_name` 列
- `generateVideo()` 优先按 model 前缀路由（`doubao-seedance-*` → 火山引擎，`wan*/wanx*/happyhorse-*` → 阿里云）
- `generateVideoWithSeedance()` 和 `generateVideoWithTongyi()` 当 `options.model` 指定时跳过优先级链，只试指定模型

**修改文件**：

| 文件 | 变更 |
|------|------|
| `utils/ai-service.util.ts` | `VideoGenerationOptions` 新增 `model`；`generateVideo()` 按 model 前缀路由；两个 provider method 支持单模型模式 |
| `modules/video/video.entity.ts` | 新增 `model_name` 列 |
| `modules/video/video.controller.ts` | body 接受 `model` 参数 |
| `modules/video/video.service.ts` | DTO / 实体保存 / 队列数据加入 `model` |
| `queues/video.processor.ts` | job data 读取 `model` 并传入 `generateVideo()` |
| `frontend Studio/index.tsx` | 模型选择器 UI + state + payload |
| `frontend Video/Create.tsx` | 模型选择器 UI |

### 二、剧本删除外键约束修复

**问题**：删除剧本时 MySQL 报错 `Cannot delete or update a parent row: a foreign key constraint fails`，因为 `video_tasks.script_id` 外键引用 `scripts.id`。

**修复**：`ScriptService.remove()` 删除剧本前先 `UPDATE video_tasks SET script_id = NULL WHERE script_id = ?`，解除引用关系。

| 文件 | 变更 |
|------|------|
| `modules/script/script.service.ts` | 注入 `VideoTask` repo，删除前先置空关联 |
| `modules/script/script.module.ts` | `TypeOrmModule.forFeature` 加入 `VideoTask` |

**验证**：✅ 删除剧本后历史视频仍然保留，仅 script_id 断开关联

### 三、antd v6 兼容修复

**问题**：`bodyStyle` 在 antd v6 中已移除，导致 5 处 `Warning`；`List` 组件已弃用。

**修复**：`bodyStyle` → `styles={{ body: {...} }}`；`List` → `scripts.map()` 普通渲染。

**修改文件**：`frontend/src/pages/Studio/index.tsx`、`Script/index.tsx`、`Auth/LoginPage.tsx`、`Auth/RegisterPage.tsx`、`components/VideoPlayer/index.tsx`

### 四、编译验证

```
backend  ✅ npm run build (零错误)
frontend ✅ npm run build (零错误)
admin    ✅ npm run build (零错误)
```

---

## 今日开发记录（2026-06-12）

> **范围**：Git 仓库清理 + 敏感文件处理 + 文档同步 + 首次推送至 GitHub

### 一、仓库清理

| 问题 | 修复 |
|------|------|
| `.git` 误初始化在 `C:\Users\Administrator\` | 删除后重新在项目根目录 `git init` |
| `backend/` 内有嵌套 `.git` | 删除嵌套 `.git`，让根仓库统一追踪 |
| 误添加的外部 gitlink | 清理仓库后消失 |

### 二、敏感文件防护

| 文件 | 处理 |
|------|------|
| `backend/.env`（含 DB 密码、JWT 密钥） | `backend/.gitignore` 已忽略 |
| `backend/output/` 46 个生成视频 | `backend/.gitignore` 已忽略 |
| `backend/data/dev.db` SQLite 测试库 | 新增 `/data` 到 `backend/.gitignore` |
| `admin/bash.exe.stackdump` 崩溃转储 | 根 `.gitignore` 新增 `*.stackdump` |
| `AI-Video.md` 中 DeepSeek `sk-xxx` 密钥 | 替换为 `sk-xxxx...` |

### 三、新增文件

| 文件 | 用途 |
|------|------|
| 根 `.gitignore` | OS 文件、崩溃转储、编辑器配置 |
| `backend/.env.example` | 脱敏环境变量模板 |

### 四、文档同步到实际项目

- 概览表文件计数、数据库说明
- 目录树（Order 模块/页面、Studio、UserManage、SystemConfig 去掉"空壳"）
- API 全览表（新增 `file/:filename`、订单模块）
- 下周任务状态（已完成的标记 ✅）

### 五、首次推送至 GitHub

```bash
git remote add origin https://github.com/lee724130-maker/AI-Anime.git
git push -u origin main --force
```

---

## 今日开发记录（2026-06-15）

> **范围**：支付流程 Bug 修复 + 安全加固 + 前端打磨

### 一、安全修复

| 问题 | 修复 |
|------|------|
| Admin 充值接受负数/零金额（可盗取算力） | 后端增加 `if (amount <= 0) throw BadRequestException` |
| `Math.max(0, credits - cost)` 导致用户余额不足时也能0元生成 | 改为检查余额，不足则拒绝扣费并报错 |

### 二、数据一致性修复

| 问题 | 修复 |
|------|------|
| `mockPay()` 更新用户算力和订单状态是两步操作，无事务 | 使用 `QueryRunner` 事务包裹 |
| `chargeForCompletedTask()` 同上 | 使用 `QueryRunner` 事务包裹 |
| Admin 充值无审计记录 | 充值同时创建 `orders` 记录（`payment_provider='admin'`） |

### 三、前端打磨

| 问题 | 修复 |
|------|------|
| 创建订单按钮无 loading 状态，可重复点击 | 添加 `creatingPlan` 状态，按钮显示 loading |
| 算力扣费失败时任务状态回退重试 | 改为直接完成但附带错误提示信息 |

### 四、Studio / 主页顶栏用户信息

- 点击用户区域（头像+用户名+算力）直接跳转个人中心
- 白色背景 + 浅紫边框 + hover 动画效果
- 移除下拉菜单和退出按钮，简化交互
- 主页和 Studio 样式保持一致

### 五、个人中心重设计

| 功能 | 说明 |
|------|------|
| 用户头像 | 72px 紫色 Avatar + 首字母 |
| 身份标签 | 普通用户 / 管理员 Tag |
| 算力 + 手机号 + 加入时间 | 内联展示 |
| 充值算力 / 退出登录 | 两个全宽操作按钮 |
| 账户信息 | Descriptions 列表（ID/用户名/手机号/角色/算力/注册时间） |
| 快捷统计 | 可用算力卡片 + 充值入口 |

### 六、编译验证

```
backend  ✅ npm run build (零错误)
frontend ✅ npm run build (零错误)
admin    ✅ npm run build (零错误)
```

---

## 三个已完善功能详情

### 功能一：视频管理页面增强（Phase 1）

**作用：** 替代原有的简陋视频列表，提供完整的视频管理 UI。

**功能点：**
- **网格/列表双视图** — 通过 Segmented 切换。网格模式用 Row/Col 响应式卡片展示封面图、状态标签、进度条、脚本标题、分辨率/时长/风格/算力消耗等元信息；列表模式用紧凑横向卡片展示
- **状态筛选** — 顶部 Segmented 过滤全部/待处理/生成中/已完成/失败，5 秒自动轮询刷新进度
- **下载按钮** — 对已完成视频，点击直接下载（`?download=1` 触发服务端 `Content-Disposition: attachment`）
- **删除确认** — Popconfirm 删除任务

**涉及文件：**
- `frontend/src/pages/Video/index.tsx` — 主 UI 组件（视图切换、筛选、下载、删除）
- `backend/src/modules/video/video.controller.ts` — `GET /api/video/list`（列表）、`GET /api/video/file/:filename`（文件服务 + 下载）
- `backend/src/modules/video/video.service.ts` — `findByUser()`（分页查询）

---

### 功能二：剧本多场景拆分 + 批量生成（Phase 2）

**作用：** 把一个包含多个场景的长剧本自动拆分，每个场景单独生成一条视频。

**功能点：**
- **场景智能拆分** — 先按 `\n---\n`（Markdown 分隔线）拆分；如果只有一个片段，降级按 `\n\n`（空行）拆分；再不行整个作为一个场景
- **前端场景预览** — Script Detail 页面实时显示拆分出的场景数，每个场景显示前 200 字预览和字数统计
- **批量生成 Modal** — 点击"批量生成视频"弹窗，列出所有场景确认，点"开始生成"后一次性发 POST
- **后端 `batchCreate`** — 加载剧本，执行相同拆分逻辑，计算总算力消耗（单场景消耗 × 场景数），校验余额，遍历场景：为每个场景创建 `VideoTask` + 推送 Bull 队列 job，job 名称标记为 `"剧本标题 - 场景 i+1"`，便于追踪
- **接口：** `POST /api/video/batch-generate`，接收 `{ script_id, resolution?, duration?, style?, model? }`

**涉及文件：**
- `backend/src/modules/video/video.service.ts` — `batchCreate()`（核心拆分 + 批量创建逻辑）
- `backend/src/modules/video/video.controller.ts` — `POST /api/video/batch-generate` 路由
- `frontend/src/pages/Script/Detail.tsx` — 场景预览 + 批量生成 Modal

---

### 功能三：系统配置默认生成参数（Phase 3）

**作用：** 管理员在后台设置全局默认值，用户创建视频时自动填充，无需每次手动选择。

**功能点：**
- **后台配置 UI** — 新增「默认生成参数」卡片，四个字段：
  - `default_resolution`：Select 下拉（480p/720p/1080p）
  - `default_duration`：Select 下拉（5/10/15 秒）
  - `default_style`：Select 下拉（动漫/真人）
  - `default_model`：Input 输入框，留空则自动
- **数据库存储** — 存入 `system_configs` 表，key 为 `default_resolution` / `default_duration` / `default_style` / `default_model`
- **后端接口** — `GET /api/video/defaults` 查询四个 key，去掉 `default_` 前缀后返回 `{ resolution, duration, style, model }`
- **前端自动填充** — Studio 页面和 Video/Create 页面在 mount 时调用 `GET /api/video/defaults`，用返回值预填分辨率/时长/风格/模型 Segmented 或 Select

**数据流：**
```
Admin UI 保存 → PUT /api/admin/system/config → upsert system_configs 表
    → 用户打开 Studio/Create 页面 → GET /api/video/defaults
        → 前端 setFieldsValue/setState 自动填充默认值
```

**涉及文件：**
- `admin/src/pages/SystemConfig/index.tsx` — 默认参数卡片 UI
- `backend/src/modules/admin/admin.service.ts` — allowed keys 白名单 + upsert 逻辑
- `backend/src/modules/video/video.service.ts` — `getDefaults()` 方法
- `backend/src/modules/video/video.controller.ts` — `GET /api/video/defaults` 路由
- `frontend/src/pages/Studio/index.tsx` — mount 时加载默认值
- `frontend/src/pages/Video/Create.tsx` — mount 时加载默认值

---

## 辅助信息

### 支付/算力体系（之前完成）
- Admin 充值拒绝零/负数金额
- `mockPay()` 和 `chargeForCompletedTask()` 使用 QueryRunner 事务保证原子性
- Admin 充值也创建 `orders` 记录（`payment_provider='admin'`），方便审计

### 关键约定
- FFmpeg 字幕烧录需要 `-c:v libx264` 重新编码，不能用 `-c:v copy`
- 字幕 SRT 编码 UTF-8，libass 自动回退到 MicrosoftYaHeiUI 显示中文
- 通义万相视频 API：使用正确模型名、`X-DashScope-Async: enable` 请求头、`prompt_extend: false`、分辨率大写
- 批量生成接口在创建任务前先算总算力消耗，余额不足则抛出 `BadRequestException`
- 视频下载复用现有文件服务接口，加 `?download=1` 参数
- 用户头像/名称/算力区域点击直接跳到 `/user` 个人中心，不用下拉菜单

---

## 今日开发记录（2026-06-15 · 第二段）

> **范围**：角色双风格参考图 + 视频封面截取 + 多角色选择 + 长视频场景系统 + I2V 模型修复

### 一、角色参考图双风格

**问题**：角色只有一个 `reference_image`，但动漫模型（Seedream）生成的图做不了真人风格，通义万相生成的图又不像动漫。

**方案**：拆分 `reference_image_anime` 和 `reference_image_realistic` 两个字段，生成时根据 `style` 选择对应的图。

**修改文件**：

| 文件 | 变更 |
|------|------|
| `backend/src/modules/character/character.entity.ts` | `reference_image` → `reference_image_anime` + `reference_image_realistic` |
| `backend/src/modules/character/character.service.ts` | `generateReferenceImage()` 接收 `style` 参数，存到对应字段 |
| `backend/src/modules/character/character.controller.ts` | `POST /api/character/:id/generate-reference?style=anime\|realistic` |
| `backend/src/modules/character/character.module.ts` | 引入 UtilsModule（依赖 `AIServiceUtil`） |
| `backend/src/modules/video/video.service.ts` | `create()`/`batchCreate()` 根据 `style` 选择 `reference_image_anime` 或 `reference_image_realistic` |
| `backend/src/utils/ai-service.util.ts` | `generateImage()` 按 `style` 路由：realistic → 通义万相，anime → Seedream |
| `backend/src/queues/video.processor.ts` | fallback 图片生成也传递 `style` |
| `frontend/src/pages/Character/Detail.tsx` | 两个槽位：动漫/真人，各自有生成按钮和预览 |
| `frontend/src/pages/Character/index.tsx` | 列表展示两个风格的标签 |

### 二、视频封面截取

**功能**：视频生成完成后，用 FFmpeg 截取第一帧作为封面图，存储在 `cover_url` 字段。

**修改文件**：

| 文件 | 变更 |
|------|------|
| `backend/src/utils/ffmpeg.util.ts` | 新增 `extractFrame()` 方法 |
| `backend/src/queues/video.processor.ts` | 最终输出后调用 `extractFrame()`，保存为 `cover_url` |
| `frontend/src/pages/Video/index.tsx` | 封面图模式：有 `cover_url` 用 `<img>`，否则用 `<video>` |
| `frontend/src/pages/Studio/index.tsx` | 历史卡片同上 |

### 三、Studio 多角色选择

**功能**：从单角色改为灵活添加角色槽位（最多 5 个），每个槽位独立选择定位（男一号/女一号/男二/女二/备用），可从角色库选或手动输入。

**修改文件**：`frontend/src/pages/Studio/index.tsx`

### 四、后端多角色支持

**修改文件**：

| 文件 | 变更 |
|------|------|
| `backend/src/modules/video/video.controller.ts` | `generate`/`batch-generate` 接受 `characters` 数组 |
| `backend/src/modules/video/video.service.ts` | `create()`/`batchCreate()` 提取 `characters` 数组，用第一个角色做主参考 |
| `backend/src/queues/video.processor.ts` | 加载所有角色，以第一个的参考图做 I2V 首帧 |

### 五、长视频场景系统

**核心思路**：剧本（Script）作为主入口，拆分场景（Scene）→ 逐场生成（带前情提要上下文）→ 拼接为完整视频。

**新增后端端点**：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/script/:id/split` | 按 `---` 或空行拆分剧本内容为场景列表 |
| PUT | `/api/script/:id/scene/:index` | 更新单个场景的 prompt/时长 |
| POST | `/api/script/:id/generate-all` | 逐个创建视频任务（第 N 场带前 N-1 场提要） |
| POST | `/api/script/:id/stitch-all` | 拼接所有已完成场景视频 |

**处理器增强**：任务完成后自动更新 `script.scenes[index].status = 'completed'` + video_url/cover_url

**前端新增/修改**：

| 页面 | 变更 |
|------|------|
| `Script/Detail.tsx` | 全新场景面板：拆分/编辑/生成全部/拼接全部 + 视频预览 + 状态轮询 |
| `Script/Create.tsx` | 改造为  创建即用：保存后直接在本页展示场景面板 |
| `Studio/index.tsx` | 选剧本后加载场景列表，生成按钮切换为"生成全部场景"模式 |

### 六、I2V 模型跳过修复

**问题**：`wan2.7-i2v-2026-04-25` 是 I2V 模型，要求 `input.media` 字段，但无参考图时传空导致报错 `Field required: input.media`。

**修复**：`backend/src/utils/ai-service.util.ts` — `generateVideoWithTongyi()` 中检测模型名含 `-i2v` 且无 `options.imageUrl` 时自动跳过。

### 七、编译验证

```
backend  ✅ npm run build (零错误)
frontend ✅ npm run build (零错误)
admin    ✅ npm run build (零错误)
```

### 八、未解决问题

| 优先级 | 问题 | 说明 |
|:--:|------|------|
| 🔴 | 通义万相 403 | T2V 模型 `wan2.7-t2v-2026-04-25` 返回 403 Forbidden，API Key 可能过期/配额耗尽。I2V 模型（`wan2.7-i2v`）未报 403 但需要传图片。建议检查 `tongyi_api_key` 有效性或改 `video_provider` 为 `volcengine` |
| 🟡 | 角色参考图 I2V 未验证 | 修复了 I2V 模型跳过逻辑，但尚未实际测试带图生成的链路 |

### 九、当前文档统计

- 项目文件：后端 44+ 源文件，前端 20+ 源文件，管理后台 10+ 源文件
- 数据库表：6 张（users/characters/scripts/video_tasks/orders/system_configs）
- AI 模型支持：Seedance / Seedream / 通义万相 / DeepSeek / OpenAI / Runway

---

## 今日开发记录（2026-06-16）

> **范围**：宽高比全链路支持 + 时长路由重构 + UI 统一 + 视频拼接增强 + 模型状态文档化

### 一、宽高比（ratio）全链路支持

新增 6 种宽高比选项（9:16 / 16:9 / 1:1 / 4:3 / 3:4 / 21:9），贯穿全栈：

| 层 | 变更 |
|---|------|
| `ai-service.util.ts` | `VideoGenerationOptions` 新增 `ratio` 字段；通义万相和 Seedance API 调用从硬编码 `'9:16'` 改为 `options.ratio`；新增 `resolveVideoDimensions()` 方法 |
| `video.entity.ts` | 新增 `ratio` 列（默认 `'9:16'`） |
| `video.controller.ts` | generate/batchGenerate 接口 body 增加 `ratio` |
| `video.service.ts` | DTO + 角色参考图尺寸 + 存储 + 队列数据均包含 ratio |
| `video.processor.ts` | 提取 `videoRatio`，`resolveDimensions()` 替代 `resolutionToSize()`，prompt 构建传递 ratio |
| 前端 Studio/VideoCreate/Script | 新增 ratio 下拉选择器，6 种比例 |
| admin SystemConfig | 新增 `default_ratio` 白名单 + UI 下拉 |

### 二、时长与模型路由重构

| 变更 | 说明 |
|------|------|
| 时长上限 15s | API 实测 `wan2.6-t2v` 仅支持 2-15s，移除 20s/30s 选项 |
| 自动路由 `wan2.7-t2v` | >5s 未指定模型时走 `wan2.7-t2v`（wan2.6 额度已耗尽） |
| 安全兜底 | processor `Math.min(duration, 15)` 防止超长值 |
| 通义万相模型优先级 | `TONGYI_VIDEO_MODELS` 顺序调整：wan2.7-t2v 最前，wan2.6-t2v 降为 fallback |
| `adjustVideo()` 移除 `-stream_loop` | 不再循环 5s 视频凑时长，AI 生成多长就多长 |

### 三、UI 样式统一

| 页面 | 变更 |
|------|------|
| Studio | 分辨率/时长/宽高比/风格 4 列 Select 下拉统一（Segmented → Select） |
| Studio | 列宽调整：分辨率 sm=5，宽高比 sm=8，时长 sm=5，风格 sm=6 |
| Video/Create | 分辨率/时长/风格 从 Segmented 改为 Select（移除 `Segmented` 依赖） |
| Script/Detail | 生成弹窗 4 列布局新增宽高比 |
| Script/Create | 生成设置新增宽高比行 |

### 四、视频拼接增强

| 变更 | 说明 |
|------|------|
| 已选列表 | 每个片段显示 `#ID 标题`（如 `#75 漫步古城 - 场景 1`），方便区分同标题视频 |
| 视频选择列表 | 同样显示 `#ID 标题`，统一风格 |

### 五、模型状态文档化

新建 `AI-MODEL-STATUS.md`，记录：

- 所有 22 个模型（图片/视频/TTS/LLM）的完整列表与状态
- 已过期模型：`wan2.7-t2v-2026-04-25`（403）、`wan2.6-t2v`（额度耗尽）、`doubao-seedance-2.0` 系列（未激活）
- 当前可用主力：Seedance 1.5 Pro（≤5s）、通义万相 wan2.7-t2v（≤15s）、Seedream 4.5（动漫图片）
- 各 API 的 fallback 路由逻辑与代码位置速查

### 六、通义万相备用模型扩充
实测发现并添加 3 个可用模型作为 fallback 链：

| 模型 ID | 类型 | 说明 |
|---------|------|------|
| `wanx2.1-t2v-plus` | T2V | 备用文生视频，支持 15s |
| `wanx2.1-i2v-plus` | I2V | 备用图生视频 |
| `wan2.6-i2v` | I2V | 备用图生视频 |

fallback 链扩充为 9 个模型：`wan2.7-t2v` → `wanx2.1-t2v-plus` → `wan2.6-t2v` → `wan2.7-i2v` → `wanx2.1-i2v-plus` → `wan2.6-i2v` → `wan2.7-r2v` → `happyhorse-1.0-video-edit` → `wanx2.1-t2v-turbo`

### 七、编译验证

```
backend  ✅ npm run build (零错误)
frontend ✅ npm run build (零错误)
admin    ✅ npm run build (零错误)
```

### 八、已知问题

| 优先级 | 问题 | 说明 |
|:--:|------|------|
| 🟡 | 角色参考图 I2V 全链路 | I2V 模型跳过逻辑已修复，但带图生成尚未实际端到端测试 |
| 🟢 | Seedance 2.0 激活 | 火山引擎充值后可激活，代码层已支持，激活即用无需改代码 |

---

## 项目总结（2026-06-16）

### 完成的核心功能

| 模块 | 状态 | 说明 |
|------|:----:|------|
| 用户认证 | ✅ | 注册/登录/JWT/路由守卫 |
| 角色管理 | ✅ | CRUD + AI 参考图生成（动漫/真人双风格） |
| 剧本管理 | ✅ | CRUD + 场景拆分 + 带上下文批量生成 |
| 视频生成 | ✅ | Seedance ≤5s / 通义万相 ≤15s，9 模型 fallback 链 |
| 视频场景生成 | ✅ | 多场景逐个生成 + 前情提要注入 + 自动拼接 |
| 视频拼接 | ✅ | 多选/拖拽排序/裁剪/合并 |
| 宽高比 | ✅ | 6 种比例全链路支持 |
| 一体化创作中心 | ✅ | Studio 三步走：角色→剧本→视频设置 |
| 算力系统 | ✅ | 套餐/充值/扣费/余额实时同步 |
| 管理后台 | ✅ | 仪表盘/用户/密钥/日志/系统配置 |

### 当前文件统计

- 后端：44+ TypeScript 源文件
- 前端用户端：23+ TypeScript/TSX 源文件
- 管理后台：10+ TypeScript/TSX 源文件
- 数据库表：6 张
- 文档：5 份（README ×3 + AI-Video.md + AI-MODEL-STATUS.md + ROADMAP.md）

### 推荐后续扩展（非阻塞）

| 优先级 | 功能 | 说明 |
|:--:|------|------|
| 🔵 | 真实支付接入 | 替换 mock-pay 为支付宝/微信支付 |
| 🔵 | 部署上线 | 生产环境部署（Docker/Nginx） |

---

## 今日开发记录（2026-06-16 · 第二段）

> **范围**：9 项功能完善 + 角色参考图本地持久化 + 管理后台页面优化 + Bug 审计修复

### 一、9 项功能新增

| # | 功能 | 后端 | 前端 | Admin |
|---|------|------|------|-------|
| 1 | **UI 手动重试失败任务** | `POST /api/video/:id/retry` 重置状态+重新入队 | 列表+详情页重试按钮 | — |
| 2 | **视频搜索/筛选** | list API 支持 `search`/`status`/`resolution` 参数 | 搜索框+状态/分辨率下拉 | — |
| 3 | **视频批量删除** | `POST /api/video/batch-delete` | 多选框+全选+批量删除 | — |
| 4 | **视频列表排序** | list API 支持 `sort=created_at\|duration` | 排序下拉 | — |
| 5 | **剧本导入/导出 JSON** | `GET /:id/export` + `POST /import` | 导入/导出按钮 | — |
| 6 | **管理后台操作日志** | `AdminLog` 实体 + 自动记录 recharge/ban/config 变更 | — | 日志页添加操作日志 tab |
| 7 | **视频批量下载 ZIP** | `POST /api/video/batch-download` (archiver) | 多选+下载按钮 | — |
| 8 | **接口限流** | `@nestjs/throttler` 全局 ThrottlerGuard 60s/100req | — | — |
| 9 | **错误日志持久化** | Winston 写入 `logs/error.log`+`logs/combined.log` (7日轮转) | — | — |

### 二、角色参考图本地持久化

**问题**：AI 生成的参考图 URL 临时有效（1h 后过期），Character/Video 存远程 URL 导致后续页面空白。

**修复**：
| 文件 | 变更 |
|------|------|
| `character.service.ts` | `downloadToLocal()` — 生成后即时下载到 `output/ref_{id}_{style}.jpg`，DB 存本地 `/static/...` 路径 |
| `video.service.ts` | 预生成角色参考图时同样下载到本地 |
| `ai-service.util.ts` | Tongyi I2V 检测本地路径 → 读取为 base64 data URI；Seedance 原生支持本地文件 |

### 三、Bug 审计修复

| # | Bug | 根因 | 修复 |
|---|-----|------|------|
| 1 | Dashboard 查 SQL 报错 | `CURDATE()` 仅 MySQL 兼容，SQLite 报错 | 替换为 JS Date 参数（双数据库兼容） |
| 2 | 批量删除/下载/拼接报错 | `findByIds()` 在 TypeORM 0.3 已移除 | 替换为 `findBy({ id: In(ids) })` |
| 3 | Studio generate-all 缺时长 | POST body 缺少 `duration` 字段 | 前端补齐 duration 参数 |
| 4 | Script 场景"查看视频"跳 `/video` | 硬编码路径未拼接 ID | 改为 `/video/${scene.task_id}`（Detail.tsx + Create.tsx） |
| 5 | Admin Space 方向属性错误 | `orientation` 在 antd v5 是 `direction` | 改为 `direction="vertical"` |
| 6 | 4 处未使用 import | 残留 import 导致编译警告 | 移除 |
| 7 | `require('fs')` 不兼容 ESM | NestJS 使用 ESM 模块 | 改为 `import * as fs` |
| 8 | Tongyi I2V 本地路径 null | `/static/...` 路径未转换 base64 | 检测并读取为 data URI |

### 四、管理后台页面优化

| 优化 | 说明 |
|------|------|
| **生成日志列补齐** | 新增 progress/resolution/duration/credit_cost 列 |
| **生成日志剧本标题** | 后端 `getGenerationLogs` 使用 QueryBuilder + `leftJoinAndSelect('v.script')` 关联剧本标题 |
| **服务端分页** | 两 tab 均从全量前端分页改造为服务端 `page/limit` 参数分页 |
| **URL 路由化** | App 层 `{path: '/:sub'}` 子路由 + Dashboard 读取 `location.pathname` 决定当前页，子页可直接 `localhost:5174/users` 访问 |

### 五、编译验证

```
backend  ✅ npm run build (零错误)
frontend ✅ npm run build (零错误)
admin    ✅ npm run build (零错误)
```

---

## 今日开发记录（2026-07-16）

> **范围**：HappyHorse 免费额度模型配置 + 代码降级链优化 + 文档更新

### 一、HappyHorse 模型集成

用户阿里云百炼账号有 7 个 HappyHorse 视频生成模型，各剩 10 次免费额度：

| 模型 ID | 类型 | 免费额度到期 |
|---------|------|:----------:|
| `happyhorse-1.1-t2v` | 文生视频 | 2026/09/21 |
| `happyhorse-1.1-i2v` | 图生视频 | 2026/09/21 |
| `happyhorse-1.1-r2v` | 参考生视频 | 2026/09/21 |
| `happyhorse-1.0-t2v` | 文生视频 | 2026/09/07 |
| `happyhorse-1.0-i2v` | 图生视频 | 2026/09/07 |
| `happyhorse-1.0-r2v` | 参考生视频 | 2026/09/07 |
| `happyhorse-1.0-video-edit` | 视频编辑 | 2026/09/07 |

#### 数据库 — `model_configs` 表

- 删除所有旧阿里云模型（5 条）
- 插入 14 条新模型配置（HappyHorse priority 1-7 + 万相 priority 8-14）
- HappyHorse 模型参数：min_duration=3, max_duration=15, 支持 720p/1080p, 9:16/16:9/1:1

#### 代码改动

**`backend/src/utils/ai-service.util.ts`** — `getTongyiVideoModels()` 降级链重排

- 将 HappyHorse 模型移至数组最前（T2V → I2V → R2V → Edit → 万相兜底）
- 确保 DB 模型优先，无 DB 记录时使用此降级链

**`backend/src/queues/video.processor.ts`** — 移除硬编码模型选择

- 原逻辑：`videoDuration > 5` 时强制走 `wan2.7-t2v`（Seedance 仅支持 ≤5s）
- 新逻辑：不指定默认模型，由 `generateVideoWithTongyi()` 自动按优先级链选择
- HappyHorse 支持 3-15s，可以完全替代万相做长视频

**`frontend/src/pages/Studio/index.tsx`** — 模型选择器更新

- 添加 6 个 HappyHorse 模型选项（带 ⭐ 标识）
- 保留万相 T2V/I2V 作为备选

### 二、自动降级策略

HappyHorse 免费额度用完后（API 返回 403），自动尝试列表中下一个模型：

```
happyhorse-1.1-t2v → happyhorse-1.1-i2v → happyhorse-1.1-r2v
→ happyhorse-1.0-t2v → happyhorse-1.0-i2v → happyhorse-1.0-r2v
→ happyhorse-1.0-video-edit → wan2.7-t2v → 万相兜底
```

### 三、注意事项

- HappyHorse 可能有**水印**限制（代码已传 `watermark: false` 参数）
- HappyHorse 可能有**动漫风格**限制（百炼平台策略，无法绕过）
- T2V（文生视频）直接从文本生成，不需要输入图片
- I2V（图生视频）需要先通过 `generateImage()` 生成图片再传参
- R2V（参考生视频）需要参考图

### 四、今日编译验证

```
backend  ✅ npm run build (零错误)
```

### 五、文档更新

| 文件 | 变更 |
|------|------|
| `AI-MODEL-STATUS.md` | 阿里云模型区重写，新增 HappyHorse 表 + 优先级说明 + 代码位置更新 |
| `AI-Video.md` | 进度区更新 + 今日日志 |
| `CHANGELOG.md` | 新增 2026-07-16 条目 |
| `项目测试流程.md` | 新增 HappyHorse 测试项 |
| `backend/seed-happyhorse.sql` | 新建 - MySQL 种子脚本 |

---

## 今日开发记录（2026-07-17）

> **范围**：Drama UI 重构 + 资产库增强 + 编辑弹框改造 + 重复检测 + 文档更新

### 一、后端 500 路由冲突修复

`drama.controller.ts` 中 `@Get(':id')` 注册在 `@Get('ping')`/`@Get('model-info')` 之前，导致 Express 将 `ping`/`model-info` 匹配为 `:id` 参数，`NaN` 传入 MySQL 抛出 `Unknown column 'NaN'`。

**修复**：将 `@Get(':id')` 移至最后，`ping` 和 `model-info` 正常响应。

### 二、样式/比例/分辨率从 Project 下放至 Episode

- `DramaEpisode` 实体新增 `style`/`ratio`/`resolution` 三列
- Project create/edit 表单移除 style/ratio/resolution 字段
- 视频生成逻辑改为读取 episode 级别设置
- `Episodes.tsx` 新增每集"画面设置"Modal
- `EpisodeDetail.tsx` 显示当前设置标签

### 三、样式关键词从存储的提示词中移除

以下文件不再将 `styleLabel`（如 "anime style"）写入数据库存储的 `prompt` 字段：

| 文件 | 方法 |
|------|------|
| `drama.service.ts` | 自动生成资产图片的 prompt |
| `video.service.ts` | `generateTaskVideo`、`batchGenerate` |
| `character.service.ts` | 所有角色 prompt 生成 |
| `video.processor.ts` | `buildImagePrompt`、`buildVideoPrompt` |

style 现在仅通过 `generateImage`/`generateVideo` 的 `style` 参数运行时传递，由 `ai-service.util.ts` 在调用时前置拼接。

### 四、段落时长智能规划

`planSegmentDuration()` 方法将段落内容发送 LLM，返回 `{ duration, timeline }`，保存 `duration` 到 `DramaSegment`，`timeline` 写入 `prompt_cn` 字段。

### 五、资产提示词智能规划

`planAssetPrompt()` 将资产信息发送 LLM，返回优化后的 `{ prompt, prompt_cn }` 并存入数据库，不含风格关键词。

### 六、重复资产检测

`addAsset()` 方法新增唯一性检查：同一 `project_id + type + name` 不可重复添加，返回“同类型同名资产已存在，不能重复添加”错误。`importFromGlobal()` 已有同样检查。

### 七、Global Asset 生成增强

`POST /api/global-assets/:id/generate` 新增接受 `width`/`height`/`style` 参数，通过 `@Body()` 装饰器传入并转发至 AI 服务。

### 八、Global Assets 页面样式同步

`GlobalAssets.tsx` 完全对齐 `Assets.tsx`：
- 文字按钮（2x2 网格）
- 生成参数 Modal（风格/宽高比/画质选择器）
- 网格列宽一致（`xs=24 sm=12 md=8 lg=6`）

### 九、编辑提示词弹框重构（大小资产库同步）

**触发方式**：
- 卡片上的"编辑提示词"按钮
- 点击卡片上被截断的提示词文本（3 行省略号）

**弹框布局**：

```
┌────────────────────────────────────────┐
│  中文提示词                              │
│  [TextArea - 可编辑, 4行]                 │
│                                          │
│  [ 智能规划 ]    [ 中文转英文 ]              │
│                                          │
│  英文提示词（只读）                        │
│  [TextArea - 只读, 灰色背景, 4行]          │
└────────────────────────────────────────┘
```

- 智能规划：调用 LLM 重新生成中英文提示词
- 中文转英文：调用 LLM 将中文翻译为英文，填入英文框
- 保存时同时更新 `prompt_cn` 和 `prompt`

### 十、小资产库样式调整

- 提示词文本 CSS `-webkit-line-clamp: 3` 截断 3 行 + 省略号
- 移除 `Tooltip` 悬浮显示（替代为点击进入编辑弹框）
- "保存到大资产库"按钮添加 `#f5f5f5` 浅灰背景 + hover/active 效果

### 十一、受影响文件清单

| 文件 | 变更类型 |
|------|:--------:|
| `backend/src/modules/drama/drama.controller.ts` | 路由重排序 + 新增 translate/plan 端点 |
| `backend/src/modules/drama/drama.service.ts` | 新增 `planSegmentDuration`、`planAssetPrompt`、`translateAssetPrompt`、`updateEpisodeSettings`；`addAsset` 加重复检测；移除样式关键词 |
| `backend/src/modules/drama/drama-episode.entity.ts` | 新增 `style`/`ratio`/`resolution` 列 |
| `backend/src/modules/video/video.service.ts` | 移除 `styleLabel` |
| `backend/src/modules/character/character.service.ts` | 移除 `styleLabel` |
| `backend/src/queues/video.processor.ts` | `buildImagePrompt`/`buildVideoPrompt` 移除样式关键词 |
| `backend/src/modules/global-asset/global-asset.controller.ts` | 新增 translate/plan-prompt 端点；generate 接受 body 参数 |
| `backend/src/modules/global-asset/global-asset.service.ts` | 新增 `translatePrompt`、`planPrompt`；`generateImage` 接受 width/height/style |
| `frontend/src/pages/Drama/Assets.tsx` | 文字按钮、网格布局、Modal 编辑、生成参数 Modal、3行截断、点击编辑 |
| `frontend/src/pages/Drama/GlobalAssets.tsx` | 同步 Assets 样式 + 编辑弹框重构 |
| `frontend/src/pages/Drama/Episodes.tsx` | 画面设置 Modal + 标签 |
| `frontend/src/pages/Drama/EpisodeDetail.tsx` | 时长下拉框、智能规划 |
| `frontend/src/pages/Drama/Create.tsx` | 移除 style/ratio/resolution |
| `frontend/src/pages/Drama/Detail.tsx` | 移除 style 选择器 |
| `frontend/src/pages/Drama/index.tsx` | 项目列表精简 |
### 十二、Seedream 水印设置补全

`ai-service.util.ts` 中 Seedream（火山引擎）图片生成请求体缺少 `watermark: false` 参数，导致生成的图片可能带有 AI 水印。已补加到火山引擎 `/v3/images/generations` 请求体中。

之前已配置 `watermark: false` 的模型：通义万相、CogView-4、阿里云视频、Seedance。至此所有支持去水印参数的模型均已覆盖。
### 十三、片段生成接入 Bull 队列

将 drama 模块的片段生成从同步阻塞改为异步队列（Bull）。

**改动：**

| 文件 | 变更 |
|------|------|
| `queues/drama-segment.processor.ts` | **新建** — 监听 `drama-segment` 队列的 `generate` 任务，调用 `DramaService.executeSegmentGeneration()` |
| `queues/queue.module.ts` | 注册 `drama-segment` 队列 + `DramaSegmentProcessor` provider |
| `modules/drama/drama.module.ts` | 注册 `drama-segment` 队列 + 导出 `BullModule` |
| `modules/drama/drama.service.ts` | 注入 `@InjectQueue('drama-segment')`；`generateSegment()` 改为提交队列任务并返回 `{ jobId, status: 'queued' }`；原同步逻辑重命名为 `executeSegmentGeneration()`；新增 `getSegmentStatus()` |
| `modules/drama/drama.controller.ts` | 新增 `GET episodes/:episodeId/segments/:segmentId/status` 状态轮询端点 |
| `frontend/.../EpisodeDetail.tsx` | 生成时改为提交任务 + 每 2 秒轮询状态，完成/失败后刷新 |

**效果：**
- 生成请求立即返回，不阻塞 HTTP 响应
- 前端通过轮询实时获取生成进度
- 批量生成时各片段独立排队，互不阻塞
- 为后续失败重试、进度通知打下基础

### 十四、编译验证

```
backend  ✅ npm run build (零错误)
```

### 十五、文档更新

| 文件 | 变更 |
|------|------|
| `AI-Video.md` | 进度区更新 + 今日日志 |
| `CHANGELOG.md` | 新增 2026-07-17 条目 |

---

## 今日开发记录（2026-07-22）

> **范围**：视频生成 Pipeline 修复 — 断路器逻辑重写、Alibaba Cloud WAN/Tongyi API 集成、风格前缀注入修复、火山引擎 Seedance 视频模型激活

### 一、背景

HappyHorse 免费额度耗尽后，通义万相视频链路上 HappyHorse 模型全部返回 403（Free quota exhausted），但断路器（3次连续失败判死）在 HappyHorse 模型上触发，**截断了整个链**，导致有额度的 WAN 模型（Wanx 2.1 T2V+, Wan 2.5 T2V Preview 等）从未被尝试。

同时，智谱 CogVideoX 返回 429 限流（3 秒重试仍 429），火山引擎 Seedance 视频模型在 DB 中被标记为 `inactive`。

**最终结果**：所有视频供应商均不可用，片段 259-263 停留在旧占位视频。

### 二、改动清单

#### ① 断路器「A」移除 —— `ai-service.util.ts`

| 改动 | 说明 |
|------|------|
| 删除 `tongyiVideoFailStreak` 成员变量和 `TONGYI_VIDEO_STREAK_LIMIT=3` | 移除连续计数断路器 |
| 删除 `catch` 块中的 A 逻辑 | 不再因 3 次失败判死整条链 |
| 删除 `return videoUrl` 处的 `this.tongyiVideoFailStreak = 0` | 同步清理 |

**效果**：所有非 permission 403 错误（配额耗尽、模型不兼容等）全部 `continue` 到下一个模型，**不再断路**。

#### ② 错误体提取修正 —— `ai-service.util.ts`

| 改动 | 说明 |
|------|------|
| `err.response?.data?.error?.message` → `data?.error?.message || data?.message` | DashScope API 错误体格式为 `{code, message}` 而非 `{error: {message}}` |

#### ③ 非 HTTP 错误也 `continue` —— `ai-service.util.ts`

`happyhorse-1.0-r2v` 任务提交成功但轮询失败后抛出 `new Error(...)`，此时 `err.code` 为 `undefined`，未匹配 403/404 条件，直接 `throw err` 跳出循环。

**修复**：`ERRCODE` 统一判断 → 所有非 permission 错误（包括任务轮询失败、格式错误、参数不匹配）全部 `continue`。

#### ④ 模型参数预验证 —— `ai-service.util.ts` `generateVideoWithTongyi()`

**改动**：在 auto 链循环中预加载 DB 模型配置，对每个模型执行 `validateModelParams()`，duration/ratio/resolution 不兼容的模型**直接跳过**，不浪费 API 请求。

#### ⑤ DB 模型配置修正 —— `model_configs` 表

| 模型 | 字段 | 旧值 | 新值 |
|------|------|------|------|
| Wanx 2.1 T2V+ (id=48) | `max_duration` | 15 | 5 |
| All video models | 优先级重排 | HappyHorse 优先 | Wanx T2V → Wan T2V → WAN T2V Turbo/Preview → Wan/HappyHorse I2V/R2V → Runway/CogVideoX/Seedance 兜底 |

**新的优先级顺序**（前 13 个均为 WAN 系列，有额度）：

| 优先级 | 模型 | 状态 |
|:------:|------|:----:|
| 1 | Wanx 2.1 T2V+ (wanx2.1-t2v-plus) | ✅ 185/200 |
| 2 | Wan 2.7 T2V (wan2.7-t2v) | ✅ |
| 3 | WAN 2.7 T2V 别名 (wan2.7-videoedit) | ✅ 50/50 |
| 4 | Wan 2.6 T2V (wan2.6-t2v) | ⚠️ 403 |
| 5 | WAN 2.1 T2V Turbo (wanx2.1-t2v-turbo) | ✅ 不支持 duration |
| 6 | WAN 2.5 T2V Preview (wan2.5-t2v-preview) | ✅ 当前兜底成功 |
| 7-13 | 其余 WAN 系列 | — |
| 14-18 | HappyHorse 系列 (无额度) | ⛔ 403 |
| 30+ | Runway / CogVideoX / Seedance | — |

#### ⑥ 风格前缀注入修复 —— `drama.service.ts`

**问题**：`executeSegmentGeneration()` 调用 `generateVideo(vidOptions)` 时未传第二参数 `textPrompt`，导致 `ai-service.util.ts:358-368` 的风格前缀注入被跳过。WAN 模型收到的 prompt 不含 `photorealistic,真人实拍质感,超写实风格` 前缀，默认输出动漫。

**修复**：
```typescript
// ❌ 之前：skipped style prefix injection
const remoteUrl = await this.aiService.generateVideo(vidOptions);

// ✅ 修复后：style prefix is injected
const remoteUrl = await this.aiService.generateVideo(vidOptions, segment.prompt);
```

#### ⑦ 优先级改 DB 而非硬编码 —— `ai-service.util.ts`

`getTongyiVideoModels()` 内部硬编码的降级数组改为优先从 DB 的 `model_configs` 表按 `priority` 排序获取，DB 无数据时再用硬编码数组兜底。

### 三、已知问题

| # | 问题 | 状态 |
|---|------|:----:|
| 1 | 通义 wanx2.1-t2v-plus 不支持 duration>5，segment 259 的 duration=8 时需跳过此模型 | 已修复（DB max_duration=5） |
| 2 | 智谱 CogVideoX 429 限流，重试一次仍失败 | ⬜ 需等待限流解除或升级 key |
| 3 | 火山引擎 Seedance 模型被标记 `inactive`，无法进入自动链路 | ⬜ 需用户在 ARK 控制台激活后改 DB |
| 4 | 通义 WAN 视频生成耗时约 2-3 分钟（阿里云推理时间，代码无法优化） | 正常 |
| 5 | `wanx2.1-t2v-turbo` 不支持自定义 duration 参数 | 需额外处理移除 duration 再调用 |
| 6 | `wan2.7-videoedit` 需要 input video media，纯 T2V 无法使用 | 已自动跳过（API 返回错误后 continue） |

### 四、修改的文件

| 文件 | 变更 |
|------|------|
| `backend/src/utils/ai-service.util.ts` | 移除 A 断路器；修正错误体提取路径；非 HTTP 错误 continue；auto 链加模型预验证；getTongyiVideoModels 优先读 DB |
| `backend/src/modules/drama/drama.service.ts` | `executeSegmentGeneration()` 调用 `generateVideo()` 时传入 `segment.prompt` 作为 textPrompt |
| — | `model_configs` 表：优先级重排；`wanx2.1-t2v-plus` max_duration=5 |

### 五、注意事项

- **不要 push 到 git** — 当前仓库中有修改（断路器和排序改动），但 git 仓库里的原始版本是功能正常的无 bug 版本。如果以后要回退，`git pull` 或 `git checkout` 即可恢复 baseline。
- 当前段需要重新触发生成才会用新逻辑。已有视频的段不受影响。
