# AI 模型状态 & API Key 清单

> 最后更新: 2026-07-29
> ⚠️ **火山引擎已停止使用**：因欠费 21.83 元，已于 2026-07-27 删除所有火山引擎 API Key 和模型配置。
> 📌 **阿里云百炼可用模型补充**：2026-07-29 记录 8 个阿里云免费额度模型（emo/emoji/试衣/海报/风格重绘等）

---

## 一、API Key 配置总览

所有 API Key 均存储在数据库 `system_configs` 表中，通过管理后台 `Admin > API Key Manage` 管理，**不存 `.env` 文件**。

| 配置键 | Provider | 状态 | 用途 |
|--------|----------|:----:|------|
| `volcengine_api_key` | 火山引擎 (ByteDance ARK) | ❌ **已停用（因欠费）** | 统一：视频+图片+文字 — 因欠费已于 2026-07-27 删除 |
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
| **火山引擎** | 0 个（已删除） | ❌ 已停用 | 因欠费 21.83 元，已于 2026-07-27 删除所有火山引擎 API Key 和模型配置 |
| **阿里云** | 1 个 (通义万相) | ✅ 可用 | 图片+视频+文字 |
| **智谱 AI** | 1 个 (zai_api_key) | ✅ 可用 | 文字+图片+视频，2026-07-14 新增集成 |
| **DeepSeek** | 1 个 | ✅ 可用 | 仅文字 |
| **OpenAI** | 0 个 | ❌ 缺 key | |
| **Runway** | 0 个 | ❌ 缺 key | |
| **HeyGen** | 0 个 | ❌ 缺 key | |

---

## 二、图片生成模型（T2I / Text-to-Image）

### 火山引擎 & 智谱 & OpenAI

| 顺序 | 模型 ID (Endpoint ID) | Provider | 依赖 Key | 状态 |
|:--:|---------|----------|----------|:----:|
| 1 | `ep-20260715151858-tt8z7` (Seedream 4.5) | 火山引擎 | `volcengine_api_key` | ❌ 已停用（因欠费） |
| 2 | `ep-20260410175357-mm5sq` (Seedream 5.0 Lite) | 火山引擎 | `volcengine_api_key` | ❌ 已停用（因欠费） |
| 3 | `CogView-4-250304` | 智谱 AI | `zai_api_key` | ✅ 可用（近期测试返回 400） |
| 4 | `dall-e-3` | OpenAI | `openai_api_key` | ❌ 缺 key |

### 阿里云百炼通义万相（全量 T2I 模型）

> DB 优先级已更新（2026-07-29）：wanx2.1-t2i-plus 首选 → wan2.6-t2i 二号位 → 依次降级

| 优先级 | 模型 ID | 版本说明 | 免费额度 | 到期 | 依赖 Key | 状态 |
|:--:|---------|---------|:--------:|:----:|----------|:----:|
| ⭐1 | `wanx2.1-t2i-plus` | 万相 2.1 Plus（高质量版） | 500/500 | 2026/09/07 | `tongyi_api_key` | ✅ 当前首选（2026-07-29 激活） |
| 2 | `wan2.6-t2i` | Wan 2.6（最新代标准版） | 50/50 | 2026/09/07 | `tongyi_api_key` | ✅ 已入库 |
| 3 | `wanx2.1-t2i-turbo` | 万相 2.1 Turbo（快速版） | 500/500 | 2026/09/07 | `tongyi_api_key` | ✅ 已入库 |
| 4 | `wan2.5-t2i-preview` | Wan 2.5 Preview（预览版） | 50/50 | 2026/09/07 | `tongyi_api_key` | ✅ 已入库 |
| 5 | `wan2.2-t2i-plus` | Wan 2.2 Plus（高质量版） | 100/100 | 2026/09/07 | `tongyi_api_key` | ✅ 已入库 |
| 6 | `wan2.2-t2i-flash` | Wan 2.2 Flash（极速版） | 100/100 | 2026/09/07 | `tongyi_api_key` | ✅ 已入库 |
| 7 | `wanx2.0-t2i-turbo` | 万相 2.0 Turbo（快速版） | 500/500 | 2026/09/07 | `tongyi_api_key` | ✅ 已入库 |
| 8 | `wanx-v1` | 万相 v1（旧版文生图） | 499/500 | 2026/09/07 | `tongyi_api_key` | ✅ 末席兜底 |

---

## 三、视频生成模型

### Seedance（火山引擎）⚠️ 因欠费已停止使用

| 顺序 | 模型 ID (Endpoint ID) | 依赖 Key | 状态 |
|:--:|---------|----------|:----:|
| 1 | `ep-20260715152154-4kc87` (Seedance 1.0 Pro) | `volcengine_api_key` | ❌ 已停用（因欠费） |
| 2 | `ep-20260715152610-7hnr7` (Seedance 1.0 Pro Fast) | `volcengine_api_key` | ❌ 已停用（因欠费） |
| 3 | `doubao-seedance-2-0-260128` | 旧 ID | ❌ 已废弃 |
| 4 | `doubao-seedance-2-0-fast-260128` | 旧 ID | ❌ 已废弃 |

### 智谱 CogVideoX

| 模型 ID | 依赖 Key | 状态 |
|---------|----------|:----:|
| `CogVideoX-3` | `zai_api_key` | ✅ 可用（2026-07-14 集成，异步轮询） |

### 阿里云百炼（通义万相 + HappyHorse）

#### I2V（图生视频）模型

| 优先级 | 模型 ID | 免费额度 | 依赖 Key | 状态 |
|:--:|---------|:--------:|----------|:----:|
| 1 | `wan2.7-i2v-2026-04-25` | 剩 50/50 次 | `tongyi_api_key` | ⭐ 活跃 |
| 2 | `wan2.5-i2v-preview` | 剩 50/50 次 | `tongyi_api_key` | ⭐ 活跃 |
| 3 | `wan2.2-i2v-plus` | 剩 50/50 次 | `tongyi_api_key` | ⭐ 活跃 |
| 4 | `wanx2.1-i2v-plus` | — | `tongyi_api_key` | ⭐ 活跃 |

#### T2V（文生视频）模型

| 优先级 | 模型 ID | 免费额度 | 到期 | 依赖 Key | 状态 |
|:--:|---------|:--------:|:----:|----------|:----:|
| 1 | `wanx2.1-t2v-plus` | 180/200 | 2026/09/07 | `tongyi_api_key` | ⭐ 活跃（当前主力） |
| 2 | `wan2.7-t2v` | — | — | `tongyi_api_key` | ❌ 403（免费额度耗尽） |
| 3 | `wanx2.1-t2v-turbo` | 175/200 | 2026/09/07 | `tongyi_api_key` | ⭐ 活跃（Turbo快速版，固定时长） |
| 4 | `wan2.5-t2v-preview` | 37/50 | 2026/09/07 | `tongyi_api_key` | ⭐ 活跃（预览版） |
| 5 | `wan2.6-t2v` | — | — | `tongyi_api_key` | ❌ 403（免费额度耗尽） |
| 1 | `wan2.7-t2v-2026-06-12` | 50/50 | 2026/09/30 | `tongyi_api_key` | ⭐ 活跃（T2V 首选，2026-07-29 激活） |
| 2 | `wanx2.1-t2v-plus` | 180/200 | 2026/09/07 | `tongyi_api_key` | ⭐ 活跃（降级候选） |
| 3 | `wan2.7-t2v` | — | — | `tongyi_api_key` | ❌ 403（免费额度耗尽） |
| 4 | `wanx2.1-t2v-turbo` | 175/200 | 2026/09/07 | `tongyi_api_key` | ⭐ 活跃（Turbo快速版，固定时长） |
| 5 | `wan2.5-t2v-preview` | 37/50 | 2026/09/07 | `tongyi_api_key` | ⭐ 活跃（预览版） |
| 6 | `wan2.6-t2v` | — | — | `tongyi_api_key` | ❌ 403（免费额度耗尽） |

#### R2V（参考图生视频）模型

| 优先级 | 模型 ID | 免费额度 | 依赖 Key | 状态 |
|:--:|---------|:--------:|----------|:----:|
| 1 | `happyhorse-1.1-r2v` | 剩 10/10 次 | `tongyi_api_key` | ⭐ 活跃（2026-07-28 激活） |

#### 视频编辑模型

| 模型 ID | 免费额度 | 依赖 Key | 状态 |
|---------|:--------:|----------|:----:|
| `wan2.7-videoedit` | 剩 50/50 次 | `tongyi_api_key` | ⭐ 活跃 |

#### 其他视频模型（已停用）

| 模型 ID | 原因 |
|---------|------|
| `happyhorse-1.1-t2v` | priority=1，但子类型为 r2v 时不走 T2V 链 |
| `happyhorse-1.1-i2v` | inactive |
| `happyhorse-1.0-t2v/i2v/r2v` | inactive |
| `wan2.7-i2v` | inactive |
| `wan2.7-r2v` | inactive |
| `wan2.7-r2v-2026-06-12` | inactive |
| `wan2.6-i2v` | 额度耗尽，inactive |
| `happyhorse-1.0-video-edit` | inactive |

> **2026-07-28 更新**：
> - 为所有 video 模型添加 `sub_capability` 字段（i2v/t2v/r2v/videoedit）
> - 代码已支持按功能类型（videoType）选择对应模型列表
> - 三种功能使用独立模型列表，节省 tokens
> - happyhorse-1.1-r2v 已激活作为 R2V 首选

#### 视觉模型（用于智能描述/图像理解）

| 优先级 | 模型 ID | 依赖 Key | 状态 | 备注 |
|:--:|---------|----------|:----:|------|
| 1 | `qwen3.5-omni-plus-2026-03-15` | `tongyi_api_key` | ❓ 待测 | 多模态理解 |
| 2 | `qwen3-omni-flash-realtime-2025-09-15` | `tongyi_api_key` | ❓ 待测 | 多模态理解 |
| 3 | `qwen3-omni-flash-realtime` | `tongyi_api_key` | ❓ 待测 | 多模态理解 |
| 4 | `qwen3-vl-plus` | `tongyi_api_key` | ❓ 待测 | 视觉理解 |
| 5 | `qwen-vl-max` | `tongyi_api_key` | ❓ 待测 | 视觉理解 |
| 6 | `qwen-vl-plus` | `tongyi_api_key` | ❓ 待测 | 视觉理解 |
| 7 | `qwen3-vl-flash` | `tongyi_api_key` | ❓ 待测 | 视觉理解 |

> **问题**：2026-07-28 测试所有视觉模型均返回 400 错误，需排查 API 调用格式
> **降级方案**：多模态失败时自动降级到纯文本模型生成通用描述

### Runway

| 模型 ID | 依赖 Key | 状态 |
|---------|----------|:----:|
| `gen3` | `runway_api_key` | ❌ 缺 key |

### 阿里云百炼其他可用模型（免费额度）

> 以下模型均有免费额度剩余，尚未集成到项目代码中，作为后续功能扩展的候选。

| 模型 ID | 功能说明 | 剩余额度 | 到期日 | 依赖 Key | 状态 |
|---------|---------|:--------:|:------:|----------|:----:|
| `wanx-v1` | 通义万相-文生图 | 499/500 次 | 2026/09/07 | `tongyi_api_key` | ✅ 已集成 |
| `wanx-style-repaint-v1` | 人像风格重绘（照片转动漫/手绘等艺术风格） | 500/500 次 | 2026/09/07 | `tongyi_api_key` | 💡 候选 |
| `wanx-poster-generation-v1` | 创意海报生成（自动排版文字+背景） | 500/500 次 | 2026/09/06 | `tongyi_api_key` | 💡 候选 |
| `emo-v1` | 悦动人像EMO（图生唱演视频：图片+音频 → 表情动态视频） | 1,800/1,800 秒 | 2026/09/07 | `tongyi_api_key` | 💡 候选 |
| `emo-detect-v1` | EMO 图像检测（检测图片人物是否符合 EMO 规范） | 200/200 次 | 2026/09/07 | `tongyi_api_key` | 💡 候选 |
| `emoji-v1` | 表情包Emoji视频生成（图片 → 人脸表情包视频） | 500/500 次 | 2026/09/07 | `tongyi_api_key` | 💡 候选 |
| `emoji-detect-v1` | Emoji 图像合规检测（检测图片是否符合 Emoji 规范） | 200/200 次 | 2026/09/07 | `tongyi_api_key` | 💡 候选 |
| `aitryon-parsing-v1` | AI试衣-图片分割（服装/人体解析，配合 OutfitAnyone 使用） | 800/800 次 | 2026/09/07 | `tongyi_api_key` | 💡 候选 |

---

## 四、LLM 模型（自动模式优先级链）

| 顺序 | 模型 ID | Provider | 依赖 Key | 状态 |
|:--:|---------|----------|----------|:----:|
| 1 | `qwen-plus` | 阿里云 | `tongyi_api_key` | ✅ 可用（首选，已验证） |
| 2 | `GLM-4.5-Air` → `GLM-4.7-Flash` | 智谱 AI | `zai_api_key` | ✅ 可用（双模型降级链） |
| 3 | `ep-20260715151139-8svqj` (Seed 2.1 Pro) | 火山引擎 | `volcengine_api_key` | ❌ 已停用（因欠费） |
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
| 图片 (`image_provider`) | `auto` / `volcengine`（已停用）/ `aliyun` / `zhipu` / `openai` |
| 视频 (`video_provider`) | `auto` / `volcengine`（已停用）/ `aliyun` / `zhipu` / `runway` |
| 对话 (`llm_provider`) | `auto` / `aliyun` / `zhipu` / `volcengine`（已停用）/ `openai` / `deepseek` |
