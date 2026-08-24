# AI-Anime Backend — NestJS 11 API 服务

> 端口：`3000` | 数据库：MySQL 8.0 | 队列：Redis + Bull

---

## 目录结构

```
backend/
├── src/
│   ├── main.ts                          # 入口：CORS + ValidationPipe + 静态文件服务
│   ├── app.module.ts                    # 根模块（TypeORM + 6 个功能模块注册）
│   ├── app.controller.ts                # 根控制器
│   ├── app.service.ts                   # 根服务
│   │
│   ├── config/
│   │   └── database.config.ts           # TypeORM 配置（MySQL / SQLite 双模式）
│   │
│   ├── common/
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts        # JWT 认证守卫（支持 @Public() 跳过）
│   │   │   └── roles.guard.ts           # 角色权限守卫（配合 @Roles()）
│   │   └── decorators/
│   │       ├── roles.decorator.ts       # @Roles('admin') 装饰器
│   │       └── public.decorator.ts      # @Public() 公开接口标记
│   │
│   ├── modules/
│   │   ├── auth/                        # 认证模块
│   │   │   ├── auth.controller.ts       # POST /api/auth/register | login
│   │   │   ├── auth.service.ts          # bcryptjs 加密 + JWT 签发
│   │   │   ├── auth.module.ts
│   │   │   ├── jwt.strategy.ts          # Passport JWT 策略
│   │   │   └── dto/
│   │   │       ├── login.dto.ts         # 登录 DTO (class-validator)
│   │   │       └── register.dto.ts      # 注册 DTO
│   │   │
│   │   ├── user/                        # 用户模块
│   │   │   ├── user.entity.ts           # users 表实体
│   │   │   ├── user.controller.ts       # GET /api/user/profile
│   │   │   ├── user.service.ts
│   │   │   └── user.module.ts
│   │   │
│   │   ├── script/                      # 剧本模块
│   │   │   ├── script.entity.ts         # scripts 表实体
│   │   │   ├── script.controller.ts     # CRUD 5 端点
│   │   │   ├── script.service.ts
│   │   │   └── script.module.ts
│   │   │
│   │   ├── character/                   # 角色模块
│   │   │   ├── character.entity.ts      # characters 表实体
│   │   │   ├── character.controller.ts  # CRUD 5 端点
│   │   │   ├── character.service.ts
│   │   │   └── character.module.ts
│   │   │
│   │   ├── video/                       # 视频模块
│   │   │   ├── video.entity.ts          # video_tasks 表实体
│   │   │   ├── video.controller.ts      # 6 个 REST 端点
│   │   │   ├── video.service.ts         # CRUD + 队列推送 + 算力扣费
│   │   │   └── video.module.ts
│   │   │
│   │   ├── admin/                       # 管理模块
│   │   │   ├── admin.entity.ts          # system_configs 表实体
│   │   │   ├── admin.controller.ts      # 9 个管理员端点
│   │   │   ├── admin.service.ts         # 密钥管理 + 仪表盘 + 日志 + 用户管理
│   │   │   └── admin.module.ts
│   │   │
│   │   └── order/                       # 订单模块
│   │       ├── order.entity.ts          # orders 表实体
│   │       ├── order.controller.ts      # 5 个端点
│   │       ├── order.service.ts         # 套餐 + 创建 + 模拟支付 + 取消
│   │       └── order.module.ts
│   │
│   ├── queues/                          # Bull 任务队列
│   │   ├── queue.module.ts              # Redis 配置 + video 队列注册
│   │   └── video.processor.ts           # 4 步流水线消费者 + 后处理
│   │
│   └── utils/                           # 工具模块
│       ├── ai-service.util.ts           # 7 种 AI 服务聚合层 + Seedance 模型管理
│       ├── ffmpeg.util.ts               # FFmpeg 合成/缩放/循环工具
│       └── utils.module.ts
│
├── .env                                 # 环境变量（DB/JWT/Redis）
├── output/                              # FFmpeg 输出 + 静态文件目录
├── package.json
├── tsconfig.json
└── nest-cli.json
```

---

## 配置

### 环境变量 (`.env`)

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DB_TYPE` | `mysql` | 数据库类型（mysql / better-sqlite3） |
| `DB_HOST` | `localhost` | MySQL 主机 |
| `DB_PORT` | `3306` | MySQL 端口 |
| `DB_USER` | `root` | 数据库用户 |
| `DB_PASSWORD` | `123456` | 数据库密码 |
| `DB_NAME` | `ai_anime` | 数据库名 |
| `JWT_SECRET` | — | JWT 签名密钥 |
| `JWT_EXPIRES_IN` | `7d` | Token 有效期 |
| `REDIS_HOST` | `localhost` | Redis 主机 |
| `REDIS_PORT` | `6379` | Redis 端口 |
| `PORT` | `3000` | 服务端口 |

### CORS 白名单

`main.ts` 中配置：`http://localhost:5173`, `http://localhost:5174`, `http://localhost:5175`, `http://localhost:5176`

### 数据库表

| 表 | 实体 | 关键字段 |
|----|------|----------|
| `users` | `user.entity.ts` | id, username, password(bcrypt), role(admin/user), credits, status |
| `scripts` | `script.entity.ts` | id, user_id(FK), title, content, status |
| `characters` | `character.entity.ts` | id, user_id(FK), name, description, avatar_url |
| `video_tasks` | `video.entity.ts` | id, user_id, script_id, task_id, status, resolution, duration, credit_cost, video_url, progress |
| `orders` | `order.entity.ts` | id, user_id, order_no, plan_name, amount, credits, status |
| `system_configs` | `admin.entity.ts` | id, config_key, config_value, description |

---

## API 接口

### Auth（公开）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录 → JWT Token |

### User（需登录）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/user/profile` | 获取当前用户信息 |

### Script（需登录）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/script/list` | 剧本列表（分页） |
| GET | `/api/script/:id` | 剧本详情 |
| POST | `/api/script` | 创建剧本 |
| PUT | `/api/script/:id` | 更新剧本 |
| DELETE | `/api/script/:id` | 删除剧本 |

### Character（需登录）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/character/list` | 角色列表（分页） |
| GET | `/api/character/:id` | 角色详情 |
| POST | `/api/character` | 创建角色 |
| PUT | `/api/character/:id` | 更新角色 |
| DELETE | `/api/character/:id` | 删除角色 |

### Video（需登录）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/video/generate` | 创建生成任务 → Redis 队列 |
| GET | `/api/video/list` | 用户任务列表（分页） |
| GET | `/api/video/task/:taskId` | 按 task_id 轮询 |
| GET | `/api/video/:id` | 任务详情 |
| DELETE | `/api/video/:id` | 删除任务 |

**`POST /api/video/generate` 请求体：**

```json
{
  "script_id": 1,
  "character_id": 2,
  "character_name": "林风",
  "character_desc": "18岁黑发剑士",
  "prompt": "自定义提示词",
  "resolution": "1080p",
  "duration": 10
}
```

### Order（需登录）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/order/plans` | 充值套餐列表 |
| POST | `/api/order/create` | 创建订单 |
| GET | `/api/order/list` | 订单列表 |
| POST | `/api/order/:id/mock-pay` | 模拟支付 |
| POST | `/api/order/:id/cancel` | 取消订单 |

### Admin（需 admin 角色）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/dashboard` | 仪表盘统计 |
| GET | `/api/admin/api-keys` | 获取 API Key 列表（掩码） |
| PUT | `/api/admin/api-keys` | 更新 API Key |
| GET | `/api/admin/users` | 用户列表（分页+搜索） |
| PUT | `/api/admin/users/:id/ban` | 封禁/解封用户 |
| POST | `/api/admin/users/:id/recharge` | 手动充值算力 |
| GET | `/api/admin/generation-logs` | 生成任务日志 |
| GET | `/api/admin/system/config` | 获取系统配置 |
| PUT | `/api/admin/system/config` | 更新系统配置 |

---

## 核心逻辑

### 视频生成流水线

```
POST /api/video/generate
    │
    ├─ 验证算力余额 → 保存任务(pending) → Redis 队列
    │
    └─ Bull Consumer (video.processor.ts)
        │
        ├─ Step 1 (15%): Seedance 文生视频（优先 1.5 Pro）
        │   └─ 失败 → 降级 Seedream 生成角色图
        │
        ├─ Step 2 (50%): 图生视频（Seedance / Runway / FFmpeg Ken Burns）
        │
        ├─ Step 3 (65%): TTS 配音（火山引擎 / OpenAI TTS）
        │
        ├─ Step 4 (80%): FFmpeg 合成（图片+音频→MP4）
        │
        └─ Post (95%): adjustVideo() 强制缩放+循环到目标分辨率/时长
            └─ 完成 → 扣费 → 更新状态
```

### 容错策略

| 层 | 策略 |
|----|------|
| AI 模型 | Seedance 2.0 → 2.0 Fast → 1.5 Pro → 1.0 Pro Fast → 1.0 Pro（自动降级） |
| API 超时 | 单次 AI 调用 120s 超时 |
| 队列超时 | Redis 不可用时 3s 超时降级，任务保留 pending |
| 失败重试 | 指数退避，最多 3 次 |
| 本地兜底 | 无 AI Key 时 FFmpeg 本地生成测试视频 |

### Seedance 模型优先级

```
1. doubao-seedance-1-5-pro-251215    ⭐ 主力
2. doubao-seedance-2-0-260128        (需充值)
3. doubao-seedance-2-0-fast-260128
4. doubao-seedance-1-0-pro-fast-251015
5. doubao-seedance-1-0-pro-250528    (兜底)
```

---

## 启动命令

```bash
cd backend
npm install
npm run start:dev     # 开发模式（热重载）
npm run build         # 生产构建
npm run start:prod    # 生产运行
```
