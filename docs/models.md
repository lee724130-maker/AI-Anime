# AI 模型与配置

> 最后更新: 2026-08-24
> 来源：阿里云百炼控制台 + 智谱 z.ai 控制台 + 本地 model_configs 表
> ⚠️ **火山引擎已停止使用**：因欠费 21.83 元，已于 2026-07-27 删除所有火山引擎 API Key 和模型配置。
> ⚠️ **配音/质检/生成一律优先阿里云百炼**；智谱与火山引擎用户声明已无法使用（GLM 文本额度除外）。

---

## 一、Provider 概况

| Provider | 状态 | 可用能力 | 说明 |
|----------|:----:|----------|------|
| **阿里云百炼 (DashScope)** | ✅ 可用 | 图片/视频/文本/TTS/视觉 | 主力 Provider，`tongyi_api_key` |
| **智谱 AI (Zhipu)** | ✅ 部分可用 | 文本 (GLM) | `zai_api_key`；视觉/图片/视频能力**不可用**，仅文本链保留 |
| **DeepSeek** | ✅ 可用 | 文本 | `deepseek_api_key`，末席兜底 |
| **火山引擎 (ByteDance)** | ❌ 已停用 | — | 因欠费 21.83 元，2026-07-27 已删除所有 Key 和模型 |
| **OpenAI** | ❌ 未配置 | — | `openai_api_key` 未配置，DALL·E / TTS / GPT-4o 不可用 |
| **Runway** | ❌ 未配置 | — | `runway_api_key` 未配置 |
| **HeyGen** | ❌ 未配置 | — | `heygen_api_key` 未配置，数字人不可用 |

---

## 二、API Key 配置

所有 API Key 存储在数据库 `system_configs` 表中，通过管理后台 `Admin > API Key Manage` 管理，**不存 `.env` 文件**。

| 配置键 | Provider | 状态 | 用途 |
|--------|----------|:----:|------|
| `tongyi_api_key` | 阿里云 (DashScope) | ✅ 已配置 | 通义万相图片+视频 + Qwen 文本 + CosyVoice TTS |
| `zai_api_key` | 智谱 AI | ✅ 已配置 | GLM-4.5-Air 文字（备用链） |
| `deepseek_api_key` | DeepSeek | ✅ 已配置 | 文本 LLM（末席兜底） |
| `volcengine_api_key` | 火山引擎 | ❌ 已删除 | 因欠费已于 2026-07-27 删除 |
| `openai_api_key` | OpenAI | ❌ 未配置 | DALL·E / TTS / GPT-4o |
| `runway_api_key` | Runway | ❌ 未配置 | Runway 视频 |
| `heygen_api_key` | HeyGen | ❌ 未配置 | 数字人 |
| `tts_api_key` | TTS | ❌ 未配置 | 配音备用 |

### Provider 路由配置

通过管理后台 `Admin > System Config` 切换：

| 服务 | 配置键 | 可选 Provider |
|------|--------|--------------|
| 图片 | `image_provider` | `auto` / `aliyun` / `zhipu` / `openai` |
| 视频 | `video_provider` | `auto` / `aliyun` / `zhipu` / `runway` |
| 对话 | `llm_provider` | `auto` / `aliyun` / `zhipu` / `deepseek` / `openai` |

---

## 三、可用模型清单

### 3.1 文生图 (T2I) — 阿里云万相系列

优先级已更新（2026-07-29）：`wanx2.1-t2i-plus` 首选 → `wan2.6-t2i` 二号位 → 依次降级

| 优先级 | 模型 ID | 版本说明 | 免费额度 | 到期 | 状态 |
|:------:|---------|---------|:--------:|:----:|:----:|
| ⭐1 | `wanx2.1-t2i-plus` | 万相 2.1 Plus（高质量版） | 486/500 | 2026/09/07 | ✅ 当前首选 |
| 2 | `wan2.6-t2i` | Wan 2.6（最新代标准版） | 50/50 | 2026/09/07 | ✅ 二号位 |
| 3 | `wanx2.1-t2i-turbo` | 万相 2.1 Turbo（快速版） | 500/500 | 2026/09/07 | ✅ 降级 |
| 4 | `wan2.5-t2i-preview` | Wan 2.5 Preview（预览版） | 50/50 | 2026/09/07 | ✅ 降级 |
| 5 | `wan2.2-t2i-plus` | Wan 2.2 Plus（高质量版） | 100/100 | 2026/09/07 | ✅ 降级 |
| 6 | `wan2.2-t2i-flash` | Wan 2.2 Flash（极速版） | 100/100 | 2026/09/07 | ✅ 降级 |
| 7 | `wanx2.0-t2i-turbo` | 万相 2.0 Turbo（快速版） | 500/500 | 2026/09/07 | ✅ 降级 |
| 8 | `wanx-v1` | 万相 v1（旧版兜底） | 499/500 | 2026/09/07 | ✅ 末席 |

> 2026-08-06 核对：以上 8 个 T2I 模型已全部在 `model_configs` 启用（active），与百炼控制台免费额度清单一致。

#### 其他图片模型（非 T2I）

| 模型 ID | 功能说明 | 免费额度 | 到期日 | 状态 |
|---------|---------|:--------:|:------:|:----:|
| `CogView-4-250304` | 智谱图片生成 | — | — | ✅ 可用（近期测试返回 400） |
| `wanx-style-repaint-v1` | 人像风格重绘（照片转动漫/手绘等艺术风格） | 500/500 次 | 2026/09/07 | 💡 候选 |
| `wanx-poster-generation-v1` | 创意海报生成（自动排版文字+背景） | 500/500 次 | 2026/09/06 | 💡 候选 |
| `emo-v1` | 悦动人像EMO（图生唱演视频） | 1,800/1,800 秒 | 2026/09/07 | 💡 候选 |
| `emo-detect-v1` | EMO 图像检测 | 200/200 次 | 2026/09/07 | 💡 候选 |
| `emoji-v1` | 表情包Emoji视频生成 | 500/500 次 | 2026/09/07 | 💡 候选 |
| `emoji-detect-v1` | Emoji 图像合规检测 | 200/200 次 | 2026/09/07 | 💡 候选 |
| `aitryon-parsing-v1` | AI试衣-图片分割（配合 OutfitAnyone） | 800/800 次 | 2026/09/07 | 💡 候选 |

### 3.2 文生视频 (T2V) — 阿里云万相系列

| 优先级 | 模型 ID | 免费额度 | 到期 | 状态 |
|:------:|---------|:--------:|:----:|:----:|
| ⭐1 | `wan2.7-t2v-2026-06-12` | 50/50 | 2026/09/30 | ✅ 当前首选（2026-07-29 激活） |
| 2 | `wanx2.1-t2v-plus` | 180/200 | 2026/09/07 | ✅ 降级候选（当前主力） |
| 3 | `wan2.7-t2v` | — | — | ❌ 403（免费额度耗尽） |
| 4 | `wanx2.1-t2v-turbo` | 175/200 | 2026/09/07 | ✅ Turbo快速版，固定时长 |
| 5 | `wan2.5-t2v-preview` | 37/50 | 2026/09/07 | ✅ 预览版 |
| 6 | `wan2.6-t2v` | — | — | ❌ 403（免费额度耗尽） |
| — | `wan2.2-t2v-plus` | 50/50 | 2026/09/07 | 💡 待配置 |

### 3.3 图生视频 (I2V) — 阿里云万相系列

| 优先级 | 模型 ID | 免费额度 | 到期 | 状态 |
|:------:|---------|:--------:|:----:|:----:|
| 1 | `wan2.7-i2v-2026-04-25` | 50/50 | 2026/09/07 | ✅ 活跃 |
| 2 | `wan2.5-i2v-preview` | 50/50 | 2026/09/07 | ✅ 活跃 |
| 3 | `wan2.2-i2v-plus` | 50/50 | 2026/09/07 | ✅ 活跃 |
| 4 | `wanx2.1-i2v-plus` | 200/200 | 2026/09/07 | ✅ 待启用 |

#### 待配置 I2V 模型（等当前序列用完后再加入 DB）

| 模型 ID | 免费额度 | 备注 |
|---------|:--------:|------|
| `wan2.2-i2v-flash` | 50/50 | 同系列 |
| `wan2.6-i2v-flash` | 有免费额度 | 最便宜 I2V |
| `wanx2.1-i2v-turbo` | 200/200 | Turbo 版 |

### 3.4 参考图生视频 (R2V)

| 优先级 | 模型 ID | 免费额度 | 状态 |
|:------:|---------|:--------:|:----:|
| 1 | `wan2.6-r2v-flash` | — | ✅ 当前首选 R2V |
| 2 | `happyhorse-1.1-r2v` | 10/10 次 | ✅ 活跃（2026-07-28 激活） |
| — | `wan2.7-r2v` | — | ❓ 待测 |
| — | `wan2.7-r2v-2026-06-12` | — | ❓ 待测 |

### 3.5 视频编辑

| 模型 ID | 免费额度 | 状态 |
|---------|:--------:|:----:|
| `wan2.7-videoedit` | 50/50 次 | ✅ 活跃（需输入视频） |

### 3.6 语音合成 (TTS) — 阿里云 CosyVoice

三个短板之「配音」的主模型族。各模型独立 10,000 次免费额度。

| 模型 ID | 剩余/总 | 免费额度到期 | 降级链位置 | 状态 | 备注 |
|---------|---------|-------------|:----------:|------|------|
| `cosyvoice-v2` | 10,000 / 10,000 | 2026-09-07 | ⭐ 首选 | ✅ 已开启 | 经典中文音色（男声 longcheng_v2 / 女声 longxiaochun_v2） |
| `cosyvoice-v3-flash` | 10,000 / 10,000 | 2026-09-07 | 第 2 位 | ✅ 已开启 | 快速版（男声 longcheng_v3 / 女声 longxiaochun_v3） |
| `cosyvoice-v3-plus` | 10,000 / 10,000 | 2026-09-07 | 第 3 位 | ✅ 已开启 | 高音质（男声 longanyang / 女声 longanhuan） |
| `cosyvoice-clone-v1` | 10,000 / 10,000 | 2099-01-01 | — | ✅ 已开启 | 音色克隆（二期分角色用） |
| `cosyvoice-v3.5-plus` | 10,000 / 10,000 | 2026-09-07 | — | ⚠️ 不入降级链 | 无系统音色（仅声音复刻/设计） |
| `cosyvoice-v3.5-flash` | 10,000 / 10,000 | 2026-09-07 | — | ⚠️ 不入降级链 | 同上，无系统音色 |
| `cosyvoice-v1` | 10,000 / 10,000 | 2099-01-01 | — | ⚠️ 不入降级链 | 不支持 HTTP 调用（仅 WebSocket） |

**当前降级链**：`cosyvoice-v2 → cosyvoice-v3-flash → cosyvoice-v3-plus`，OpenAI TTS 兜底。

**实测（2026-08-12）**：v2/v3-flash/v3-plus 三模型全部打通（同步 SpeechSynthesizer 接口，2~3s 返回，mp3 正常 ffprobe）。

**规划**：第一版统一男旁白 → `cosyvoice-v2`；二期分角色多音色 → 音色 ID 映射 + `clone-v1` 克隆。

### 3.7 文本大模型 (LLM)

项目 `llm_provider=auto`，主链通义 qwen-plus（剧本/扩写/规划，额度大且稳定）；智谱 GLM 额度保留为备用链。

| 优先级 | 模型 ID | Provider | 状态 | 备注 |
|:------:|---------|----------|:----:|------|
| 1 | `qwen-plus` | 阿里云 | ✅ 可用 | 首选，已验证 |
| 2 | `GLM-4.5-Air` | 智谱 AI | ✅ 可用 | 降级候选（付费） |
| 3 | `GLM-4.7-Flash` | 智谱 AI | ✅ 可用 | 降级候选（免费） |
| 4 | `deepseek-chat` | DeepSeek | ✅ 可用 | 末席兜底 |
| — | `ep-20260715151139-8svqj` (Seed 2.1 Pro) | 火山引擎 | ❌ 已停用 | 因欠费 |
| — | `gpt-4o` | OpenAI | ❌ 缺 key | |

#### 智谱 GLM 额度详情（备用链）

| 模型 ID | 剩余/总 | 免费额度到期 | 类型 |
|---------|---------|-------------|------|
| `glm-4.5-air` | 1,000,000 / 1,000,000 | 2026-09-07 | 付费 |
| `glm-4.5` | 1,000,000 / 1,000,000 | 2026-09-07 | 付费 |
| `glm-4.6` | 1,000,000 / 1,000,000 | 2026-09-07 | 付费 |
| `glm-4.7` | 1,000,000 / 1,000,000 | 2026-09-07 | 付费 |
| `glm-5` | 1,000,000 / 1,000,000 | 2026-09-07 | 付费 |
| `glm-5.1` | 1,000,000 / 1,000,000 | 2026-09-07 | 付费 |
| `glm-5.2` | 1,000,000 / 1,000,000 | 2026-09-15 | 付费（最晚到期） |

> 智谱免费模型：GLM-4.7-Flash / GLM-4.5-Flash / GLM-4-Flash-250414 / GLM-4-Flash 均免费，tokens 用完时可切免费模型。

### 3.8 视觉模型（质检/智能描述/图像理解）

三个短板之「质检」的模型族。**已实证可用**（2026-08-05 本地实测：720p 单张 2042 image tokens）。

| 优先级 | 模型 ID | 用途 | 状态 | 备注 |
|:------:|---------|------|:----:|------|
| 1 | `qwen3-vl-flash` | 质检/模板分析/智能描述（首选） | ✅ 实测可用 | 便宜快，8 帧 ≈16k tokens |
| 2 | `qwen3.5-omni-plus-2026-03-15` | 兜底 | ✅ 可用 | 原首选，tokens 贵（42k/次）已降级 |
| 3 | `qwen3-omni-flash-realtime-2025-09-15` | 多模态理解 | ❓ 待测 | |
| 4 | `qwen3-omni-flash-realtime` | 多模态理解 | ❓ 待测 | |
| 5 | `qwen3-vl-plus` | 视觉理解 | ❓ 待测 | |
| 6 | `qwen-vl-max` | 视觉理解 | ❓ 待测 | |
| 7 | `qwen-vl-plus` | 视觉理解 | ❓ 待测 | |

> 智谱 glm-4v 视觉兜底代码仍在 `ai-service.util.ts`，但智谱已声明不可用 → 质检只用阿里云。

### 3.9 视频模型（火山引擎 — 已停用）

> ⚠️ 因欠费 21.83 元，已于 2026-07-27 删除所有 API Key 和模型配置，以下仅作历史参考。

#### Seedance（视频）

| 模型 ID (Endpoint ID) | 类型 | 状态 |
|-----------------------|------|:----:|
| `ep-20260715152154-4kc87` (Seedance 1.0 Pro) | 文生视频/图生视频 | ❌ 已停用 |
| `ep-20260715152610-7hnr7` (Seedance 1.0 Pro Fast) | 文生视频/图生视频 | ❌ 已停用 |

#### Seedream（图片）

| 模型 ID (Endpoint ID) | 类型 | 状态 |
|-----------------------|------|:----:|
| `ep-20260715151858-tt8z7` (Seedream 4.5) | 文生图 | ❌ 已停用 |
| `ep-20260410175357-mm5sq` (Seedream 5.0 Lite) | 文生图 | ❌ 已停用 |

#### Doubao（文本）

| 模型 ID (Endpoint ID) | 类型 | 状态 |
|-----------------------|------|:----:|
| `ep-20260715151139-8svqj` (Seed 2.1 Pro) | 对话 | ❌ 已停用 |

### 3.10 过期/废弃/不可用模型汇总

| 模型 ID | 原因 |
|---------|------|
| `doubao-seedream-4-5-251128` | 2026-07-15 废弃（旧 ID，已切换至 Endpoint ID） |
| `doubao-seedream-4-0-250828` | 2026-07-15 废弃 |
| `doubao-seedream-1-0-pro` | 2026-07-15 废弃 |
| `doubao-seedance-1-5-pro-251215` | 2026-07-15 废弃 |
| `doubao-seedance-1-0-pro-fast-251015` | 2026-07-15 废弃 |
| `doubao-seedance-1-0-pro-250528` | 2026-07-15 废弃 |
| `doubao-seedance-2-0-260128` | 未充值激活 |
| `doubao-seedance-2-0-fast-260128` | 未充值激活 |
| `wan2.7-t2v-2026-04-25` | 配额耗尽 (403)，2026-07-16 移除 |
| `wan2.6-t2v` | 免费额度用完 |
| `wan2.6-i2v` | 免费额度用完 |
| `happyhorse-1.1-i2v` | inactive |
| `happyhorse-1.0-t2v/i2v/r2v` | inactive |
| `happyhorse-1.0-video-edit` | inactive |

---

## 四、额度与用量统计

### 4.1 阿里云百炼资源包

| 资源包 | 剩余 | 到期 | 状态 |
|--------|:----:|:----:|:----:|
| wan2.7-t2v-2026-06-12 (T2V 首选) | 50/50 | 2026/09/30 | ✅ |
| wanx2.1-t2v-plus (T2V 主力) | 180/200 | 2026/09/07 | ✅ |
| wanx2.1-t2v-turbo (T2V 降级) | 175/200 | 2026/09/07 | ✅ |
| wan2.5-t2v-preview (T2V 预览) | 37/50 | 2026/09/07 | ✅ |
| wanx2.1-i2v-plus | 200/200 | 2026/09/07 | ✅ 待启用 |
| wanx2.1-i2v-turbo | 200/200 | 2026/09/07 | ✅ 待启用 |
| wan2.7-i2v | 50/50 | 2026/09/07 | ✅ 待启用 |
| wan2.7-i2v-2026-04-25 | 50/50 | 2026/09/07 | ✅ 待启用 |
| wan2.6-i2v | 50/50 | 2026/09/07 | ✅ 待启用 |
| wan2.5-i2v-preview | 50/50 | 2026/09/07 | ✅ 待启用 |
| wan2.2-i2v-plus | 50/50 | 2026/09/07 | ✅ 待启用 |
| wan2.2-i2v-flash | 50/50 | 2026/09/07 | ✅ 待启用 |
| wan2.6-i2v-flash | 有免费额度 | — | ✅ 待启用 |
| wanx2.1-t2i-plus (T2I 首选) | 486/500 | 2026/09/07 | ✅ 已用 14 次 |
| wanx2.1-t2i-turbo | 500/500 | 2026/09/07 | ✅ |
| wanx2.0-t2i-turbo | 500/500 | 2026/09/07 | ✅ |
| wan2.2-t2i-flash | 100/100 | 2026/09/07 | ✅ |
| wan2.2-t2i-plus | 100/100 | 2026/09/07 | ✅ |
| wan2.5-t2i-preview | 50/50 | 2026/09/07 | ✅ |
| wan2.6-t2i | 50/50 | 2026/09/07 | ✅ |
| wanx-v1 | 499/500 | 2026/09/07 | ✅ |
| HappyHorse 全系列 | 0 (已用尽) | — | ❌ 403 |

### 4.2 CosyVoice TTS 额度

所有模型独立 10,000 次免费额度，2026-09-07 到期（v1/clone-v1 至 2099）。

### 4.3 智谱资源包

| 资源包名称 | 可用余额 | 到期 |
|-----------|---------|------|
| 【新用户专享】20 次图片/视频生成资源包 | 20 次 | 2026-10-08 |
| 【新用户专享】100 次搜索资源包 | 100 次 | 2026-10-08 |
| 【新用户专享】200 万通用模型推理资源包 | 1,903,092 tokens | 2026-10-08 |
| 【新用户专享】600 万 GLM-4.6V 资源包 | 6,000,000 tokens | 2026-10-08 |
| 【新用户专享】1200 万 GLM-4.5-Air 资源包 | 12,000,000 tokens | 2026-10-08 |

---

## 五、状态与降级策略

### 5.1 视频生成降级链

```
T2V: wan2.7-t2v-2026-06-12 → wanx2.1-t2v-plus → wan2.7-t2v → wanx2.1-t2v-turbo → wan2.5-t2v-preview → wan2.6-t2v
I2V: wan2.7-i2v-2026-04-25 → wan2.5-i2v-preview → wan2.2-i2v-plus → wanx2.1-i2v-plus
R2V: wan2.6-r2v-flash → happyhorse-1.1-r2v → wan2.7-r2v → I2V(第一张) → T2V
```

> 为所有 video 模型添加了 `sub_capability` 字段（i2v/t2v/r2v/videoedit），代码按功能类型选择对应模型列表，三种功能使用独立模型列表，节省 tokens。

### 5.2 文生图降级链

```
wanx2.1-t2i-plus → wan2.6-t2i → wanx2.1-t2i-turbo → wan2.5-t2i-preview → wan2.2-t2i-plus → wan2.2-t2i-flash → wanx2.0-t2i-turbo → wanx-v1
```

> 智谱 CogView-4 / 火山 Seedream 均不可用，文生图仅走阿里云链。

### 5.3 TTS 降级链

```
cosyvoice-v2 → cosyvoice-v3-flash → cosyvoice-v3-plus → OpenAI TTS（缺 key 不可用）
```

> cosyvoice-v3.5-plus/flash 无系统音色，不入降级链；cosyvoice-v1 不支持 HTTP 调用。

### 5.4 LLM 降级链

```
qwen-plus → GLM-4.5-Air → GLM-4.7-Flash → deepseek-chat
```

> 火山/DeepSeek/GPT-4o 均不可用或缺 key，实际链路为 qwen-plus → GLM 双模型 → DeepSeek。

### 5.5 视觉模型降级链

```
qwen3-vl-flash → qwen3.5-omni-plus-2026-03-15 → 纯文本模型生成通用描述
```

> 智谱已声明不可用，质检只用阿里云。

### 5.6 使用规划（三短板落地）

| 能力 | 模型 | 依据 |
|------|------|------|
| 配音 | `cosyvoice-v2`（降级 v3-flash → v3-plus） | 10,000 次免费 |
| BGM | 在线免版权曲库直链（临时下载用完即删） | 磁盘紧张，零占用 |
| 质检 | `qwen3-vl-flash`（抽 3~5 帧/镜头） | 实测 2042 tokens/张，免费额度内 |
| LLM 规划 | qwen-plus（主）+ GLM 备用 | 已在用 |
| 视频候选 | 默认 N=1，关键镜头 2~3 | 次数额度有限 |

### 5.7 风险备注

- CosyVoice 各模型免费额度 2026-09-07 到期（v1/clone-v1 至 2099）→ 到期前评估购买或切长期模型
- 智谱/火山不可用 → 任何降级链不得回落到智谱/火山（代码中若有备用链需在改造时移除或标注）
- 视频次数额度为历史记录，未含最新消耗 → 多候选功能上线前建议在百炼控制台复核一次
- 火山引擎欠费 21.83 元，如需恢复须先充值

---

## 六、代码位置速查

| 文件 | 行号 | 内容 |
|------|:----:|------|
| `backend/src/modules/admin/admin.service.ts` | 12-22 | API Key 配置键定义 |
| `backend/src/utils/ai-service.util.ts` | 86-187 | 图片生成路由逻辑（含 `model` 参数前缀路由） |
| `backend/src/utils/ai-service.util.ts` | 219-246 | CogView-4 图片生成（智谱） |
| `backend/src/utils/ai-service.util.ts` | 248-301 | Seedream 图片生成（Endpoint ID 降级链） |
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
