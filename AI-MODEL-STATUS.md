# AI 模型状态 & API Key 清单

> 最后更新: 2026-07-16

---

## 一、API Key 配置总览

所有 API Key 均存储在数据库 `system_configs` 表中，通过管理后台 `Admin > API Key Manage` 管理，**不存 `.env` 文件**。

| 配置键 | Provider | 状态 | 用途 |
|--------|----------|:----:|------|
| `volcengine_api_key` | 火山引擎 (ByteDance ARK) | ✅ **已配置** | 统一：视频+图片+文字（3 个 Key 已合并为 1 个） |
| `tongyi_api_key` | 阿里云 (DashScope) | ✅ **已配置** | 通义万相图片+视频 + Qwen 文字 |
| `zai_api_key` | 智谱 AI (Zhipu) | ✅ **已配置** | GLM-4.5-Air 文字 + CogView-4 图片 + CogVideoX-3 视频 |
| `deepseek_api_key` | DeepSeek | ✅ **已配置** | 文本 LLM |
| `openai_api_key` | OpenAI | ❌ **未配置** | DALL·E / TTS / GPT-4o |
| `runway_api_key` | Runway | ❌ **未配置** | Runway 视频 |
| `heygen_api_key` | HeyGen | ❌ **未配置** | 数字人 |
| `tts_api_key` | TTS | ❌ **未配置** | 配音备用 |

### 当前有效 Key 汇总

| Provider | Key 数量 | 状态 | 说明 |
|----------|:--------:|:----:|------|
| **火山引擎** | 1 个（已合并） | ✅ 可用 | 原 3 个 Key（`volcengine_api_key`/`seedance_api_key`/`seedream_api_key`）已合并为 `volcengine_api_key` 统一管理，旧 key 保留在 `system_configs` 中不再使用 |
| **阿里云** | 1 个 (通义万相) | ✅ 可用 | 图片+视频+文字 |
| **智谱 AI** | 1 个 (zai_api_key) | ✅ 可用 | 文字+图片+视频，2026-07-14 新增集成 |
| **DeepSeek** | 1 个 | ✅ 可用 | 仅文字 |
| **OpenAI** | 0 个 | ❌ 缺 key | |
| **Runway** | 0 个 | ❌ 缺 key | |
| **HeyGen** | 0 个 | ❌ 缺 key | |

---

## 二、图片生成模型

| 顺序 | 模型 ID (Endpoint ID) | Provider | 依赖 Key | 状态 |
|:--:|---------|----------|----------|:----:|
| 1 | `ep-20260715151858-tt8z7` (Seedream 4.5) | 火山引擎 | `volcengine_api_key` | ✅ 可用（主力，已验证） |
| 2 | `ep-20260410175357-mm5sq` (Seedream 5.0 Lite) | 火山引擎 | `volcengine_api_key` | ✅ 可用 |
| 3 | `CogView-4-250304` | 智谱 AI | `zai_api_key` | ✅ 可用 |
| 4 | `wanx-v1` | 阿里云 | `tongyi_api_key` | ✅ 可用（2026-07-15 验证通过） |
| 5 | `dall-e-3` | OpenAI | `openai_api_key` | ❌ 缺 key |

---

## 三、视频生成模型

### Seedance（火山引擎）

| 顺序 | 模型 ID (Endpoint ID) | 依赖 Key | 状态 |
|:--:|---------|----------|:----:|
| 1 | `ep-20260715152154-4kc87` (Seedance 1.0 Pro) | `volcengine_api_key` | ✅ 可用（已验证） |
| 2 | `ep-20260715152610-7hnr7` (Seedance 1.0 Pro Fast) | `volcengine_api_key` | ✅ 可用 |
| 3 | `doubao-seedance-2-0-260128` | 旧 ID | ❌ 已废弃（旧模型 ID，不再使用） |
| 4 | `doubao-seedance-2-0-fast-260128` | 旧 ID | ❌ 已废弃（旧模型 ID，不再使用） |

### 智谱 CogVideoX

| 模型 ID | 依赖 Key | 状态 |
|---------|----------|:----:|
| `CogVideoX-3` | `zai_api_key` | ✅ 可用（2026-07-14 集成，异步轮询） |

### 阿里云百炼（通义万相 + HappyHorse）

| 顺序 | 模型 ID | 类型 | 免费额度 | 依赖 Key | 状态 |
|:--:|---------|------|:--------:|----------|:----:|
| 1 | `happyhorse-1.1-t2v` | 文生视频 | 剩 10/10 次 | `tongyi_api_key` | ✅ 免费额度可用（⭐ 优先使用） |
| 2 | `happyhorse-1.1-i2v` | 图生视频 | 剩 10/10 次 | `tongyi_api_key` | ✅ 免费额度可用（⭐ 优先使用） |
| 3 | `happyhorse-1.1-r2v` | 参考生视频 | 剩 10/10 次 | `tongyi_api_key` | ✅ 免费额度可用 |
| 4 | `happyhorse-1.0-t2v` | 文生视频 | 剩 10/10 次 | `tongyi_api_key` | ✅ 免费额度可用，到期 2026/09/07 |
| 5 | `happyhorse-1.0-i2v` | 图生视频 | 剩 10/10 次 | `tongyi_api_key` | ✅ 免费额度可用，到期 2026/09/07 |
| 6 | `happyhorse-1.0-r2v` | 参考生视频 | 剩 10/10 次 | `tongyi_api_key` | ✅ 免费额度可用，到期 2026/09/07 |
| 7 | `happyhorse-1.0-video-edit` | 视频编辑 | 剩 10/10 次 | `tongyi_api_key` | ✅ 免费额度可用，到期 2026/09/07 |
| 8 | `wan2.7-videoedit` | 视频编辑 | 剩 50/50 次 | `tongyi_api_key` | ⭐ 免费额度可用 |
| 9 | `wan2.7-t2v` | 文生视频 | — | `tongyi_api_key` | ✅ 可用（兜底） |
| 10 | `wanx2.1-t2v-plus` | 文生视频 | — | `tongyi_api_key` | ✅ 可用（兜底） |
| 11 | `wan2.7-i2v` | 图生视频 | — | `tongyi_api_key` | ❓ 待测 |
| 12 | `wanx2.1-i2v-plus` | 图生视频 | — | `tongyi_api_key` | ✅ 可用（兜底） |
| 13 | `wan2.6-i2v` | 图生视频 | — | `tongyi_api_key` | ✅ 可用（兜底） |
| 14 | `wan2.6-t2v` | 文生视频 | — | `tongyi_api_key` | ❌ 额度耗尽（403） |
| 15 | `wan2.7-r2v` | 参考生视频 | — | `tongyi_api_key` | ❓ 待测 |
| 16 | `wanx2.1-t2v-turbo` | 文生视频 | — | `tongyi_api_key` | ❓ 待测 |

> **优先级链**：HappyHorse（免费额度，priority 1-7）→ WAN 2.7 视频编辑（免费 50 次，priority 8）→ 万相（兜底，priority 9-16）
> **移除**：旧 `wan2.7-t2v-2026-04-25` 配额已耗尽，已从模型列表删除
> **注意**：HappyHorse 模型可能有水印和风格限制，测试时需确认

### Runway

| 模型 ID | 依赖 Key | 状态 |
|---------|----------|:----:|
| `gen3` | `runway_api_key` | ❌ 缺 key |

---

## 四、LLM 模型（自动模式优先级链）

| 顺序 | 模型 ID | Provider | 依赖 Key | 状态 |
|:--:|---------|----------|----------|:----:|
| 1 | `qwen-plus` | 阿里云 | `tongyi_api_key` | ✅ 可用（首选，已验证） |
| 2 | `GLM-4.5-Air` → `GLM-4.7-Flash` | 智谱 AI | `zai_api_key` | ✅ 可用（双模型降级链） |
| 3 | `ep-20260715151139-8svqj` (Seed 2.1 Pro) | 火山引擎 | `volcengine_api_key` | ✅ 可用（已验证） |
| 4 | `gpt-4o` | OpenAI | `openai_api_key` | ❌ 缺 key |
| 5 | `deepseek-chat` | DeepSeek | `deepseek_api_key` | ✅ 可用（末席兜底） |

---

## 五、TTS 模型

| 模型 ID | Provider | 依赖 Key | 状态 |
|---------|----------|----------|:----:|
| `tts-1` | OpenAI | `openai_api_key` | ❌ 缺 key |

---

## 六、过期/废弃/不可用模型

| 模型 ID | 原因 |
|---------|------|
| `doubao-seedream-4-5-251128` | 2026-07-15 废弃（旧模型 ID，已切换至 Endpoint ID `ep-20260715151858-tt8z7`） |
| `doubao-seedream-4-0-250828` | 2026-07-15 废弃（旧模型 ID） |
| `doubao-seedream-1-0-pro` | 2026-07-15 废弃（旧模型 ID） |
| `doubao-seedance-1-5-pro-251215` | 2026-07-15 废弃（旧模型 ID，已切换至 Endpoint ID `ep-20260715152154-4kc87`） |
| `doubao-seedance-1-0-pro-fast-251015` | 2026-07-15 废弃（旧模型 ID，已切换至 `ep-20260715152610-7hnr7`） |
| `doubao-seedance-1-0-pro-250528` | 2026-07-15 废弃（旧模型 ID） |
| `doubao-seedance-2-0-260128` | 未充值激活 |
| `doubao-seedance-2-0-fast-260128` | 未充值激活 |
| `wan2.7-t2v-2026-04-25` | 配额耗尽 (403)，2026-07-16 移除 |
| `wan2.6-t2v` | 免费额度用完 |
| `wan2.6-i2v` | 免费额度可能已用完（待确认） |

---

## 七、代码位置速查

| 文件 | 行号 | 内容 |
|------|:----:|------|
| `backend/src/modules/admin/admin.service.ts` | 12-22 | API Key 配置键定义 |
| `backend/src/utils/ai-service.util.ts` | 86-187 | 图片生成路由逻辑（含 `model` 参数前缀路由） |
| `backend/src/utils/ai-service.util.ts` | 248-301 | Seedream 图片生成（Endpoint ID 降级链） |
| `backend/src/utils/ai-service.util.ts` | 219-246 | CogView-4 图片生成（智谱） |
| `backend/src/utils/ai-service.util.ts` | 339-411 | 视频生成路由逻辑（含 `model` 参数前缀路由，`happyhorse` 路由到通义万相） |
| `backend/src/utils/ai-service.util.ts` | 429-541 | 通义万相 / HappyHorse 视频生成（异步任务+轮询，含 I2V 跳过逻辑） |
| `backend/src/utils/ai-service.util.ts` | 631-640 | `getTongyiVideoModels()` 降级链 — HappyHorse 优先于万相 |
| `backend/src/utils/ai-service.util.ts` | 646-768 | Seedance 视频生成（异步任务+轮询） |
| `backend/src/utils/ai-service.util.ts` | 822-873 | CogVideoX-3 视频生成（智谱，异步轮询） |
| `backend/src/utils/ai-service.util.ts` | 975-1101 | LLM 路由逻辑（自动模式降级链 5 家 Provider） |
| `backend/src/queues/video.processor.ts` | 36-37 | 移除硬编码默认模型，改为纯自动选择链 |
| `backend/src/queues/video.processor.ts` | 99-164 | 视频生成决策：参考图 I2V → T2V → 图片+I2V → 占位符 |
| `admin/src/pages/ApiKeyManage/index.tsx` | — | 管理后台 API Key 管理页面 |
| `admin/src/pages/SystemConfig/index.tsx` | 8-28 | Provider 切换配置 |
| `frontend/src/pages/Studio/index.tsx` | — | Studio 模型选择器 |
| `frontend/src/pages/Video/Create.tsx` | — | Video 创建模型选择器 |

---

## 八、Provider 路由配置

通过管理后台 `Admin > System Config` 切换：

| 服务 | 可选 Provider |
|------|--------------|
| 图片 (`image_provider`) | `auto` / `volcengine` / `aliyun` / `zhipu` / `openai` |
| 视频 (`video_provider`) | `auto` / `volcengine` / `aliyun` / `zhipu` / `runway` |
| 对话 (`llm_provider`) | `auto` / `aliyun` / `zhipu` / `volcengine` / `openai` / `deepseek` |
