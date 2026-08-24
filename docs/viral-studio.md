# 热门创作（Viral Studio）工作流程

> 最后更新: 2026-08-24
>
> 本文档合并自两份文档：技术实现版（详细架构/API/模型/代码）与通俗说明版（大白话解释/FAQ/价值）。
> Part 1 为技术深潜，Part 2 为非技术读者友好版本。

---

# Part 1: 技术实现

## 一、整体架构

> 技术选型：前端 **React 19**（框架，负责全部页面交互） + **Vite**（仅开发服务器/构建打包，非框架）；组件库 Ant Design、路由 react-router、HTTP axios。后端 **NestJS**（Node.js 企业级框架）。

```
┌─────────────────────────────── 前端 React + Vite（5173）─────────────────────────┐
│  React 19（框架）+ Ant Design + react-router + axios                              │
│  Vite 作为开发服务器/构建工具（非框架）                                           │
│  模板集市 /viral        创建模板 /viral/create       模板详情 /viral/templates/:id │
│  项目列表 /viral/projects  项目详情 /viral/projects/:id                          │
└───────────────┬──────────────────────────────────────────────────────────────────┘
                │  HTTP（axios, baseURL=localhost:3000,/static、/api 代理）
┌───────────────▼──────────────────────────────────────────────────────────────────┐
│                          后端 NestJS（3000, dist/src/main）                      │
│  ViralService：analyzeVideo / createTemplate / createProject /                  │
│               startGeneration / regenerateScene / merge / cover_url             │
│  AIServiceUtil：多模态分析 / 文生图 / 图生视频 / 文字生视频（多模型降级链）        │
│  FFmpegUtil：ffprobe / 抽帧 / zoompan 图片转视频 / drawtext / concat 合并         │
└──────┬──────────────────┬──────────────────┬──────────────────┬─────────────────┘
       │                  │                  │                  │
   MySQL(3306)        Redis(6379)        AI 云服务         FFmpeg(本地二进制)
   viral_templates    （缓存/限流）   阿里云百炼·通义万相    音频处理/视频合成/抽帧
   viral_projects                ├ 火山引擎 Seedance
   media_assets                  ├ 智谱 CogVideoX
   model_configs                 └ Runway Gen-3
```

### 依赖组件

| 组件 | 用途 |
|------|------|
| **yt-dlp** | 尝试直接下载抖音/B站/YouTube 视频（需 Cookie，多数情况失败） |
| **Playwright + Chromium** | 无头浏览器打开抖音分享链接 → 拦截 `/aweme/v1/web/aweme/detail` 接口 → 拿到去水印视频真实地址 + 标题/时长元数据（yt-dlp 失败时的关键降级，**最常用的通道**） |
| **FFmpeg / FFprobe** | 视频压缩持久化、智能抽帧、图片合成视频（Ken Burns 缩放）、文字动画、多场景 concat 合并、音频归一化、BGM 混音 |
| **阿里云百炼（通义万相）** | 主视频模型供应（wan2.6-r2v-flash 参考图生视频 / wan2.1-t2i-plus、turbo 文生图）+ 多模态视觉 LLM（qwen3.5-omni-plus 模板分析） |
| **火山引擎 / 智谱 / Runway** | 视频生成备用供应商（按 Key 配置与模型活跃度自动降级） |

### 关键数据库表

| 表 | 关键字段 |
|----|---------|
| `viral_templates` | name、category、description、scenes(JSON)、variables(JSON)、tags、audio、reference_url（原视频 /static/）、reference_frames（参考帧 /static/）、thumbnail、cover、ratio（自动检测，创建项目默认值）、source_url、usage_count、user_id、status |
| `viral_projects` | template_id、name、variables(JSON)、scenes(JSON 生成结果)、media_refs(参考图)、ratio、resolution、style、language、status、progress、result_url |
| `media_assets` | 大资产库：用户上传/生成的图片、视频，全局可复用 |
| `model_configs` | 模型清单：provider/capability/sub_capability、优先级、状态(active/inactive)、支持时长/比例/分辨率 |

---

## 二、全流程总览

```
【一】创建模板                 【二】模板集市            【三】创建项目
粘贴抖音链接 → AI 分析 → SEO   刷卡片、搜索、分类       选模板 → 填变量 → 选参数
编辑/保存模板                  → 点「使用此模板」       → 可选参考图 →「创建并生成」

【四】AI 生成                   【五】合并成片           【六】交付
逐场景调用模型                  FFmpeg concat          播放/下载 →
视频/图片/文字 生成中           统一分辨率/补齐音频        项目历史 / 我的创作
```

### 流程图（Mermaid）

```mermaid
flowchart TD
    A[粘贴抖音分享链接] --> B[分析下载视频]
    B --> B1[yt-dlp 尝试]
    B1 --失败--> B2[Playwright 打开抖音页<br/>拦截 detail API 拿真实视频URL]
    B2 --> C[下载原始视频]
    C --> D[FFmpeg 压缩持久化<br/>output/viral_source_xxx.mp4]
    D --> E[智能抽帧<br/>分段+scene检测+dHash去重 上限8张]
    E --> F[多模态 LLM 分析<br/>qwen3.5-omni-plus 图片理解]
    F --失败--> G1[纯文本分析]
    G1 --失败--> G2[generateSmartDescription]
    G2 --失败--> H0[基础模板兜底]
    F --成功--> H[解析出 场景scenes/变量variables]
    H0 --> I[前端模板编辑器 可手调]
    H --> I[前端模板编辑器 可手调]
    I --> J[保存模板 viral_templates]

    J --> K[模板集市卡片展示+封面]
    K --> L[用户点「使用此模板」]
    L --> M[模板详情页填参数<br/>风格/比例/分辨率/语言]
    M --> N[替换内容:填写模板变量]
    N --> O[可选:选大资产库参考图]
    O --> P[创建项目 viral_projects]

    P --> Q{逐场景生成}
    Q -->|video场景| R[R2V/I2V/T2V 模型链 调AI视频]
    Q -->|image场景| S[文生图+FFmpeg KenBurns合成]
    Q -->|text场景| T[FFmpeg drawtext 文字动画]
    R & S & T --> U[场景结果持久化<br/>viral_scene_{project}_{i}.mp4]
    U --> V[全部完成?]
    V --否--> Q
    V --是--> W[FFmpeg concat 合并+音频补齐]
    W --> X[可选BGM混音]
    X --> Y[viral_result_xxx.mp4 完成]
    Y --> Z[项目详情 播放/下载/重生成]
```

---

## 三、逐流程技术说明

### 阶段一：创建模板（AI 自动分析爆款视频）

**入口**：前端 `/viral/create` → 后端 `POST /api/viral/templates/analyze`

| 步骤 | 做什么 | 关键细节 |
|------|--------|---------|
| 1. 短链接清洗 | `cleanShareUrl()` | 粘贴文本中提取第一个 `http(s)://` 完整 URL（兼容抖音分享带文字的格式） |
| 2. 下载视频 | `downloadVideo()` | ① yt-dlp `-f bestvideo[ext=mp4]+bestaudio...`，120s 超时；② 失败则 Playwright 无头浏览器 `goto(domcontentloaded)`，在页面中监听 `page.on('response')` 捕获抖音 `detail` 接口 JSON，取 `video.play_addr.url_list[0]`，把 `/playwm/` 替换为 `/play/` 得到**无水印地址**，再用 axios 下载（带 UA + Referer） |
| 3. 持久化原视频 | `persistSourceVideo()` | ① 同 URL 已分析过 → 复用已存在的 `viral_source_xxx.mp4`；② 新的 → FFmpeg 压缩（`scale=maxWidth720`，libx264+ aac）存 `output/viral_source_{taskId}.mp4`（4MB 左右），由 `/static/` 对外提供 |
| 4. 获取视频信息 | `ffprobe` | 宽/高/时长；优先用 API 返回时长，需 <300s 才采用 |
| 5. 智能抽帧 | `extractFrames()` | 见下方专节 |
| 6. 多模态分析 | `analyzeFrames()` | 8 张 720p 帧图片 → 阿里云 `qwen3.5-omni-plus`，约 42k tokens（图片占比 ~90%） |
| 7. 降级链 | 三级 | 多模态失败 → 纯文本 LLM（仅元数据） → `generateSmartDescription` 兜底 → 最差 `buildBasicTemplate`（固定 1 场景占位模板） |
| 8. 返回模板草稿 | 前端编辑 | name/description/category/scenes/variables/reference_url/reference_frames |

#### 多模态 LLM 的解析提示词（结构契约）

让 LLM 输出严格 JSON：

```json
{
  "name": "模板名称(中文)",
  "description": "模板简短描述",
  "category": "动态分类(如 美食测评/游戏解说/产品开箱…)",
  "scenes": [
    { "name": "场景名", "duration": 3,
      "description": "可直接喂给AI生成器的详细提示词:画面主体/动作/镜头类型/运镜/光线/色调…",
      "type": "video 或 image 或 text" }
  ],
  "variables": [
    { "key": "英文变量名", "label": "中文标签", "type": "text/textarea/select",
      "placeholder": "填写提示", "default_value": "从视频提炼的建议默认值", "required": true }
  ]
}
```

- 规则：场景 3-6 个、总时长 8-15s；变量在场景描述中用 `{{变量名}}` 占位（如 `{{品牌名}}的大招牌`）；`type` 语义：video=动态画面、image=静态特写/海报、text=纯文字卡。
- 前端 `CreateTemplate.tsx` 提供「编辑模板」步骤：可修改名称/分类/描述、增删改场景（类型/时长/描述）、编辑变量 → `POST /api/viral/templates` 正式保存。

---

### 智能抽帧详解（extractFrames）

> 目标：用最少的帧、均匀覆盖全片、跳过黑场，让 LLM 看到代表全片的关键画面。

```
1. ffprobe 探测真实时长
2. 计算段落数 = ⌊时长/2⌋ → 钳制到 [3,10]（如 87s → 10 段），段内再收敛到 [2,8]
   开始起点避开开头 0.3s（黑场淡入）
3. 逐段执行:
   ├─ ffmpeg -ss 段起点 -t 段长  → 先 -c copy 裁剪成临时小 mp4（关键:裁剪后才能seek准确）
   └─ 段内用 ffmpeg scene 检测（阈值 0.1）扫一遍:
        └ 有 scene 变化 → 取变化点首帧
        └ 无 scene（静态段）→ 三点采样兜底(25%/50%/75%)
4. dHash 感知哈希去重（两帧汉明距离 <8 视为重复，跳过）
5. 最多保留 8 帧 → 存 viral_frames_{taskId}/seg_*.jpg → /static/
```

---

### 阶段二：模板集市

**接口**：`GET /api/viral/templates`（分页/分类/搜索/排序）

- 卡片字段：封面图、名称、描述、分类标签、使用次数、操作（删除 / 使用此模板）
- 封面 `cover_url`：有 `thumbnail` 用 thumbnail，否则自动取 `reference_frames` 第一帧（所有模板都有，图为真实视频关键帧）
- 详情 `GET /api/viral/templates/:id`：封面大图、模板结构（N 个场景逐一展示 name/duration/description）、变量列表、原视频链接（可下载原爆款视频参考）、参考图相册

---

### 阶段三：创建项目

**入口**：模板详情页 → 「创建你的视频」表单 → 前置模式 `createProject` 保存 → 紧接着调用 `startGeneration` 生成

**用户可选参数（前端 Select 默认值）**：

| 参数 | 选项 | 默认 |
|------|------|------|
| 比例 ratio | 9:16（竖屏）/ 16:9（横屏）/ 1:1 / 3:4 / 4:3 / 2:3 | **自动检测：模板源视频的比例**（如 1080×1920 → 9:16），无则 9:16；随时可改 |
| 分辨率 resolution | 480p / 720p / 1080p | 720p |
| 风格 style | 写实 realistic / 动漫 anime | **realistic（写实，防混搭）** |
| 语言 language | 中文 / 英文 / 日文 | 中文 |
| 目标时长 target_duration | 自由输入 1–60 秒 | 留空 = 模板默认（8~15s）；填了则成片精确对齐到该秒数 |

**变量替换内容**：模板定义的每个变量（如 `{{品牌名}}`、`{{广告语}}`）逐项填写，default_value 可一键采用。

**大资产库参考图（可选）**：弹窗从 `media_assets` 选择图片（品牌产品图等），最多 6 张，存入项目 `media_refs` —— **有参考图时才走 I2V/R2V（图生视频）；2 张及以上开启 R2V（多参考视频生视频）**。

**比例自动检测**：
- 分析视频时用 ffprobe 读真实分辨率 → `detectRatio(width,height)` 按宽高比归类为标准比例（9:16 / 16:9 / 1:1 / 3:4 / 4:3 / 2:3），容差 15%；极端比例（如 21:9）回退横屏 16:9 / 竖屏 9:16。
- 结果存 `viral_templates.ratio`，并在模板详情页/创建项目时作为**比例默认值**（可手动改）。
- 旧模板缺 `ratio`：可点「刷新源视频」自动探测回填，或手动选中任意比例。
- 改比例只影响本项目：按新比例生成（视频镜头把新比例传给 AI；图片/文字镜头由本地 FFmpeg 按新比例合成）。参考图原始比例与目标不一致时，AI 镜头先按参考图生成再裁到目标比例，可能有轻微裁切。

**时长对齐（target_duration）**：
- 创建项目时填目标时长 → 存 `viral_projects.target_duration`（`type: 'int' nullable`；⚠️ 必须显式标 int，否则 TypeORM 推断 Object 报错）。
- 生成时分段：`computeAssignedDurations(scenes, target)` 把目标时长**均匀分配**到每个镜头（每段 clamp 1~15s，余数给前段）；若目标超过「15s×镜头数」，告警并按上限分配（成片比目标短，不失败）。
- 每段生成后调 `ffmpeg.fitToExactDuration` 对齐到精确秒数：误差 <0.15s 直接复制；超长则 `-t` 裁剪；短但 ≤25% 慢放（`setpts=ratio*PTS` + `atempo=1/ratio`）；超 25% 用 `tpad=stop_mode=clone` 尾帧定格 + `apad` 补静音。逐段精确 → concat 后成片总时长 = 目标时长。
- 生成后改目标时长：需重新生成整片生效（重新生成单个镜头也复用分配时长）。
- ⚠️ 老版 ffmpeg 的 apad 不支持 `pad_dur`，定格式必须用裸 `apad` + `-t` 截断。

**项目落库**（viral_projects）：
- 复制模板 scenes 作为项目初始 scenes
- 保存用户填的 variables / media_refs / ratio / resolution / style / language
- 状态 pending、progress 0、模板 usage_count+1

---

### 阶段四：场景生成（核心）

**POST /api/viral/projects/{projectId}/generate → startGeneration()**

```
对每个场景 i（0..n-1）:
  1. 把描述中的 {{变量名}} 替换为用户填写的值
  2. 语言不为中文 → 调 LLM 翻译场景描述成目标语言
  3. 按场景 type 分派:
```

| 场景类型 | 生成方式 | 模型 / 工具 | 详细参数 |
|---------|---------|------------|---------|
| **video** | AI 直接生成视频 | 按参考图数选模型：2张+→R2V、1张→I2V、0张→T2V（见模型链） | prompt=描述+`"电影级运镜,画面流畅自然,细节丰富,光影质感好"`;duration=场景时长;resolution=项目分辨率;ratio=项目比例;media=media_refs;style=项目风格 |
| **image** | 先文生图再变视频 | 通义万相文生图 wanx2.1-t2i-plus/turbo | 尺寸随 ratio（16:9→1280x720，1:1→1024x1024，9:16→720x1280）;numImages=1;style=项目风格 |
| **text** | FFmpeg 本地绘制 | 无需 AI | `drawtext` 每个场景控制文字居中+自动折行;背景品牌紫 `#7C3AED`;白字;0.5s 淡入/0.6s 淡出;分辨率=ratioToRes(ratio) |

**image 场景的「图片集视频」**（Ken Burns 效果）：
```
FFmpeg:
  -loop 1 -i image -t {duration}   单图循环
  -vf scale=W:H:force_original_aspect_ratio=increase
      ,crop=W:H
      ,zoompan=z='min(zoom+0.001,1.05)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2'..."
     → 从画面中心缓慢放大, 照片"活"起来
```

**video/image 场景生成成功** → `downloadToLocal()` 下载到工作目录 → 再复制到 `output/viral_scene_{projectId}_{i}.mp4` 持久化（供后续重新合并/重生成复用）→ 返回 completed。

**进度**：每完成一个场景 `progress = (i+1)/n*100` 写入数据库，前端「生成中」自动轮询（5s）刷新进度条。

**失败处理**：单场景失败不中断其余场景，失败场景 status=failed 带 error 信息；全部失败 → 项目 failed。

---

### 视频生成模型链（generateVideo）

**供应商选择**：读配置 `video_provider`（空=auto）：

```
auto 降级链（按顺序尝试，满足「Key 已配置 + 未冷却 + 有活跃模型」，前一个失败自动下一个）:
  1. 阿里云通义万相（tongyi Key 已配置且未冷却）
  2. 火山引擎 Seedance（volcengine Key 已配置且未冷却，且有活跃火山视频模型）
  3. Runway Gen-3（runway Key 已配置且未冷却，且有活跃 Runway 模型）
  4. 智谱 CogVideoX（zai Key 已配置且未冷却，且有活跃智谱模型；429 限流等待 3s 重试一次）
```

**通义万相内部**：通过 `getActiveModels('video')` 实时查库拿 model_configs 中 **active** 模型 → 按 priority 依次尝试：

- sub_capability= r2v（多参考图 video）：`wan2.6-r2v-flash`（当前唯一活跃 R2V）
- I2V（单参考图）
- T2V（无参考图）→ 如 `wan2.7-t2v`

**关键实现细节**：
- `wan2.6` 系列参数格式特殊：R2V 用 `reference_urls`、I2V 用 `reference_url`；其它版本用通用 `media`
- 异步任务 API：`X-DashScope-Async: enable` 提交 → 每 2s 轮询前 30s、之后每 5s 轮询直到结果
- 参数自适应：时长/比例/分辨率超出模型支持范围时自动裁剪到模型支持区间，而不是直接放弃该模型
- 风格注入：`realistic` → 去掉 anime/动漫相关词 + 加 `photorealistic,真人实拍质感,超写实` 前缀；`anime` → 反向处理
- 供应商冷却（cooldown）与 Key 未配置自动跳过

> 图片模型（image 场景）：按 model_configs 中 capability=image 的 active 模型优先级尝试（wanx2.1-t2i-plus → wanx2.1-t2i-turbo），异步 API + 尺寸自动映射（按 ratio 选择模型支持的最接近尺寸）+ 403 继续下一个。

---

### 阶段五：合并成片（FFmpeg）

**mergeVideos(successfulPaths)**

```
1. 取第一个视频的宽高作为统一尺寸（部分奇偶归一化，多输入 concat 必须同尺寸）
2. 逐个输入检测是否有音轨(ffprobe -select_streams a):
      ├ 有音轨 → aresample + aformat(normalize 双声道44100) + setpts 归零
      └ 无音轨 → anullsrc 生成静音轨 + atrim 填满对应时长（补足总声道）
3. 视频统一:scale=目标(W:H:increase) +crop+setsar+fps=24+setpts 归零
4. filter_complex 按顺序 concat：v=1:a=1 → [vout][aout]
5. 输出:libx264 crf20 fps24 g48 yuv420p + aac 128k + faststart
```

- 单输入时也走归一化（去抖动重标、归 24fps），不丢音轨
- 模板如有 `audio.bgm_url` → 额外 `compositeVideoWithAudio()` 混 BGM 音轨
- 最终复制为 `output/viral_result_{projectId}_{unixMs}.mp4`，`result_url=/static/...`，status=completed、progress=100

---

### 阶段六：项目管理

| 接口 | 说明 |
|------|------|
| `GET /api/viral/projects` | 项目列表（卡片/列表） + `cover_url` = 第一个已完成场景的视频（视频封面取首帧）或图片，兜底 result_url |
| `GET /api/viral/projects/:id` | 详情：结果视频播放（VideoPreview）、下载；场景列表逐条预览 + 「重新生成」按钮 |
| `POST /api/viral/projects/:id/scenes/:index/regenerate` | 单独重新生成某个场景（换 prompt / 重新调 AI / 重新绘制）→ 成功后自动重新合并全部已完成场景（result_url 更新） |
| `DELETE /api/viral/projects/:id` | 删除：同时清理结果文件 + viral_scene_{id}_* 持久文件 |

**前端自动轮询**：项目生成中「生成中/完成/失败」状态每 5s 自动刷新，无需手动刷新。

---

## 四、封面系统（CoverThumb）

| 场景 | 封面来源 |
|------|---------|
| 模板卡片 | `cover_url` = thumbnail → reference_frames[0]（真实关键帧图） |
| 模板详情页 | 同上（大图 200px 展示） |
| 项目卡片（首页我的创作） | `cover_url` = 第一个已完成场景 video（视频封面取 0.1s 首帧）/ image，兜底 result_url |
| 项目列表列表 | 同上（列表左侧 160x90 缩略图） |

**关键组件 CoverThumb**：图片→`<img>` 铺满；视频→`<video muted preload=auto>` 播 0.1s 定格首帧；加载失败 / 无资源 → 紫色渐变占位图，不破版。

**⚠️ 开发模式坑**：封面 URL 是 `/static/...` 相对路径，浏览器若直接请求 vite(5173) 会 404 → `frontend/vite.config.ts` 已配置 `proxy: { '/api', '/static' → http://localhost:3000 }`。

---

## 五、后台任务与文件清理

`cleanupOrphanFrames()`（每 6 小时跑一次 + 服务启动时）：

- 扫描 `output/viral_frames_*`、`viral_analyze_*`、`viral_source_*.mp4`
- **被模板引用（reference_frames / reference_url）的文件永不删除**；未被引用且创建超过 2 小时（保护进行中的分析）→ 删除
- 防止 output 目录无限膨胀；源视频再出现 404 时优先排查：是否被外部磁盘清理工具误删（本清理器有引用保护）

---

## 六、模型使用情况与成本状态（2026-08-03）

> 以下为**当前实际启用的模型**（额度耗尽 / 已停用的模型不再列出）。每类用途按优先级排列，前一个失败自动尝试下一个（数据库 `model_configs` 驱动，状态以 `active` 为准）。

### 1 — R2V 多参考图生视频（参考图 ≥2 张时使用）

| 模型 | 状态 | 能力边界 | 备注 |
|------|------|---------|------|
| `wan2.6-r2v-flash` | ✅ active（唯一 R2V） | 5-15s；9:16 / 16:9 / 1:1；720p / 1080p | **参考图上限 4 张**（wan2.6 系列限制），超出自动截取前 4 张；总额度紧张，失败会连锁降级 |

### 2 — I2V 单图生视频（参考图 = 1 张时使用）

| 模型（按优先级） | 时长 | 比例 | 分辨率 |
|------------------|------|------|--------|
| `wan2.7-i2v-2026-04-25` | 2-15s | 9:16/16:9/1:1/3:4/4:3/21:9 | 720P/1080P |
| `wan2.5-i2v-preview` | 5-10s | 9:16/16:9/1:1/3:4/4:3/21:9 | 480/720/1080P |
| `wan2.2-i2v-plus` | 5s | 9:16/16:9/1:1/3:4/4:3 | 480P/1080P |
| `wanx2.1-i2v-plus` | 3-5s | 9:16/16:9/1:1 | 720p/1080p |
| `wan2.7-i2v` | 5-15s | 9:16/16:9/1:1 | 720p/1080p |

### 3 — T2V 纯文字生视频（无参考图时使用）

| 模型（按优先级） | 时长 | 备注 |
|------------------|------|------|
| `wan2.7-t2v-2026-06-12` | 2-15s | 支持比例含 4:3/3:4，720p/1080p |
| `wanx2.1-t2v-turbo` | 3-15s | 9:16/16:9/1:1 |
| `wanx2.1-t2v-plus` | 5s（固定） | 9:16/16:9/1:1 |
| `wan2.5-t2v-preview` | 3-15s | 9:16/16:9/1:1 |

> 备用供应商（auto 模式第 2-4 位）：火山 **Seedance**（`ep-` 系列）、Runway **Gen-3**（4-10s，16:9/9:16）、智谱 **CogVideoX**（429 限流重试）。

### 4 — 文生图（image 场景 / 生成页）

| 优先级 | 模型 | 说明 |
|--------|------|------|
| 1 | **wanx2.1-t2i-plus** | 主用，异步 API；Viral 场景实际使用 |
| 2 | `wan2.6-t2i` | 备用 |
| 3 | **wanx2.1-t2i-turbo** | 快速备用 |
| 4-8 | `wan2.5-t2i-preview` / `wan2.2-t2i-plus` / `wan2.2-t2i-flash` / `wanx2.0-t2i-turbo` / `wanx-v1` | 逐级降级 |
| 20 / 30 | `dall-e-3`（OpenAI）、`CogView-4`（智谱） | 跨供应商备用 |

> 尺寸自动映射：16:9→1280×720、1:1→1024×1024、其它→720×1280；异步提交 + 轮询，403/400 自动换下一个。

### 5 — 多模态视觉分析（模板解析 8 帧关键帧）

优先级链（硬编码，阿里云先试，依次换各供应商）：

| 顺序 | 供应商 | 模型 |
|------|--------|------|
| 1 | 阿里云 | `qwen3.5-omni-plus-2026-03-15`（**实际生效**，7 次全成功）→ `qwen3-omni-flash-realtime` 系列 → `qwen3-vl-plus` → `qwen-vl-max` → `qwen-vl-plus` → `qwen3-vl-flash` |
| 2 | 火山引擎 | Doubao-VL（DB active 的火山 vision 模型） |
| 3 | 智谱 | `glm-4v` |
| 4 | OpenAI | `gpt-4o` |

> 全部失败 → 纯文本 LLM 分析（仅标题/时长元数据） → `generateSmartDescription` → 最差 `buildBasicTemplate` 兜底。

### 6 — 文本 LLM（翻译场景描述、文字提示词）

走 `model_configs` 中 `capability=text` 的 active 模型，按配置 `llm_provider` 与 key 自动选择：**deepseek-chat** / **gpt-4o** / **GLM-4.x 系列** 等。

### 成本参考

- **模板分析（最贵环节）**：一次 ≈4.2 万 token（图片约占 90%）。07-30 至 07-31 共 7 次 ✅ 全成功 ≈ 29 万 tokens。
- **省钱方案（待采纳）**：主用 `qwen3-vl-flash` + 抽帧减到 4 张，可省 60%+。
- **额度预警**：R2V 仅 1 个活跃模型，额度紧张；多图场景失败会连锁降级到 I2V/T2V。

---

## 七、API 清单（完整）

```
分析/模板:
  POST  /api/viral/templates/analyze           # 分析视频 → 生成模板
  GET   /api/viral/templates                   # 模板列表(分页+搜索+分类)
  GET   /api/viral/templates/:id              # 模板详情（结构+变量+帧）
  POST  /api/viral/templates                   # 手动保存自定义模板
  PUT   /api/viral/templates/:id              # 更新模板
  DELETE /api/viral/templates/:id             # 删除模板（含关联源视频/帧）
  POST  /api/viral/templates/:id/duplicate    # 复制模板
  GET   /api/viral/categories                 # 分类统计
项目：
  POST   /api/viral/projects                  # 创建项目
  GET    /api/viral/projects                  # 项目列表
  GET    /api/viral/projects/:id              # 项目详情
  PUT    /api/viral/projects/:id              # 更新项目
  DELETE /api/viral/projects/:id              # 删除项目
  POST   /api/viral/projects/:id/generate     # 全量生成（逐场景）
  POST  /api/viral/projects/:id/scenes/:index/regenerate  # 重新生成单个场景+自动重合并
```

---

## 八、关键文件

| 文件 | 职责 |
|------|------|
| `backend/src/modules/viral/viral.service.ts` | 模板/项目 CRUD、analyzeVideo、extractFrames、persistSourceVideo、startGeneration、regenerateScene、cleanupOrphanFrames、cover_url |
| `backend/src/utils/ai-service.util.ts` | generateVideo（模型降级链）、generateImage（异步文生图）、analyzeFrames（多模态）、chatCompletion、风格注入 |
| `backend/src/utils/ffmpeg.util.ts` | composite（图片 → Ken Burns 视频）、mergeVideos（concat 保留音频）、generateTextVideo（drawtext 动画）、compressForStorage、adjustVideo、fitVideoToRatio |
| `backend/src/modules/viral/viral.controller.ts` / `viral.dto.ts` / `viral-project.entity.ts` / `viral-template.entity.ts` | 接口/校验/实体 |
| `frontend/src/pages/Viral/index.tsx` | 模板集市（搜索/分类/卡片/我的创作） |
| `frontend/src/pages/Viral/CreateTemplate.tsx` | AI 分析 + 模板编辑 |
| `frontend/src/pages/Viral/TemplateDetail.tsx` | 模板详情 + 创建项目表单 + 变量/参考图 |
| `frontend/src/pages/Viral/ProjectList.tsx` | 创作列表 |
| `frontend/src/pages/Viral/ProjectDetail.tsx` | 项目详情 + 播放下载 + 单场景重生成 |
| `frontend/src/pages/Viral/CoverThumb.tsx` | 封面组件（视频/图片/占位降级） |
| `frontend/vite.config.ts` | `/api` `/static` 代理到 3000 |

---

## 九、已知边界 / 注意事项

1. **抖音下载依赖 Playwright 无头浏览器**，页面结构变更或风控收紧时可能失效；保持 yt-dlp Cookie 可进一步提高稳定性
2. **原视频文件可能被外部磁盘清理工具误删**（本项目清理器有引用保护，但仍有 19:01 后文件凭空消失 1 例）；缺文件时用「刷新源」重新下载或分析即可恢复
3. **模型额度紧张**：R2V 仅 1 个活跃模型，单场景失败会连锁影响整片；建议新增供应商 Key 或补充 wan 模型额度
4. **文字场景**（品牌 Slogan）为纯 FFmpeg 绘制，背景品牌紫 + 淡入淡出（已修复旧版黑底黑屏问题），字体渲染依赖系统字体
5. **队列**：当前生成是单进程同步逐场景（非消息队列），高并发需引入队列 + 异步任务表
6. **比例自动检测**：基于 ffprobe 容器分辨率，非常规比例（21:9 等）会回退横屏 16:9 / 竖屏 9:16；项目内改比例后，R2V/I2V 镜头按参考图原始比例生成再裁到目标比例，可能有轻微裁切（T2V 与图片/文字镜头无此问题）

---
---

# Part 2: 通俗说明

## 一、这个功能到底是干什么的

**核心一句话：参考一个爆款视频的"骨架"，把里面的内容换成你自己的，让 AI 重新生成一条新的视频。**

打个比方，就是"拍模仿秀"：

1. 你拿一个抖音上很火的穿搭视频
2. 电脑把视频拆开看明白：开头全身展示 → 特写鞋 → 特写配饰 → 定格腰部 → 结尾品牌标语，一共 5 个镜头
3. 这套"镜头清单"存成一份可复用的**模板**
4. 下次你给自己的产品拍视频：选这个模板，填上你的品牌名、文案，挑几张产品图
5. 电脑照着这份"镜头清单"，用 AI 把你的内容一个个镜头生成出来，最后拼成一条完整视频

你全程不碰剪辑软件、不懂镜头语言，就能出一条和爆款**结构一模一样**的视频。

---

## 二、整体架构：这套东西里都有谁

做一个视频，不是一个软件单干，而是好几台"机器"配合。用大白话介绍一下分工：

```
┌──────── 你看得见的部分（前端）────────┐
│  网页页面（模板集市/创建/详情/我的创作）   │
│  用的框架：React（网页三大框架之一）       │
│  启动器：Vite（负责把网页跑起来、打包）    │
└──────────────┬───────────────┘
               │ 你点按钮，请求发出去
┌──────────────▼────────────────────────────┐
│  大脑：后端服务（NestJS，主服务器程序）       │
│  所有"应该怎么干活"的判断都在这里：            │
│  接你的请求 → 指挥 AI → 处理结果 → 存数据库  │
└──┬────────┬────────┬────────┬───────────────┘
   │        │        │        │
 生成主力   备用生成   存数据    视频加工
 用的AI公司   AI公司    数据库    视频剪工具
(阿里云等)  (火山/智谱…) (MySQL)  (FFmpeg)
```

**五个角色，一个都不能少：**

| 角色 | 通俗叫法 | 具体是谁 | 干什么用的 |
|------|---------|---------|-----------|
| **前端** | 你看到的网页 | React + Vite | 你做操作的地方（选模板、填内容、看进度、下载） |
| **后端** | 大脑/总管家 | NestJS（基于 Node.js） | 接住你的请求，调动所有工具干活，把结果存好 |
| **AI 公司** | 会画画/会拍视频的"外包工" | 阿里云、火山引擎、智谱、Runway | 按描述生成图片和视频（就是真干的活） |
| **视频处理工具** | 视频剪刀手 | FFmpeg | 下载压视频、抽图、把图片变成视频、拼片、配乐，全包 |
| **数据库/缓存** | 记忆仓库 | MySQL + Redis | 存模板、项目、用户；缓存数据加速 |

> 小知识：表格里"前端"用的 React 才是**框架**（搭建网页的技术），Vite 只是**启动/打包工具**（相当于把房子盖好前的脚手架），不能混为一谈。

---

## 三、构建思路：为什么要设计成这两层？

整个功能被设计成"**两段式**"：**先把拆好的流程做成模板，再往模板里填你自己的内容**。

为什么这么设计？

- **模板可复用**：一个爆款分析一次，成百上千次都用它，不用每次都重新分析。
- **内容可替换**：换品牌名、换文案、换参考图，就能给不同产品套用同一套爆款结构。
- **人和 AI 分工**：人只做"选择和把关"，"画和做"全部交给 AI，普通人也能上手。

另外一个重要思路是**接口驱动**:前端和后端只靠"接口"通话，页面和业务互不打扰 —— 以后想换网页、加新功能，后端业务不用动。

---

## 四、完整流程：从头到尾每一步

### 阶段 0：准备工作（整套系统是怎么搭起来的）

整个系统分**前端**和**后端**两半，下面这份清单照着就能装起来。

**① 后端（总管家，跑在 3000 端口）**

| 项目 | 说明 |
|------|------|
| 运行环境 | Node.js（服务器上用来跑 JS 代码的环境——注意它不是前端框架，只是给代码一个能运行的地方） |
| 框架 | **NestJS 11**（后端框架，有一套规范化的写法；还装了配套的 nest CLI 工具） |
| 数据库插件 | **TypeORM**（专门跟数据库打交道）+ **mysql2**（连 MySQL） |
| 数据库组件 | **MySQL**（存模板/项目等所有数据）+ **Redis**（缓存加速） |
| 任务队列插件 | **Bull**（+ Redis 驱动）——后台排队干重活（比如同时处理多个生成任务） |
| 登录插件 | **Passport + JWT**（注册登录、发令牌，接口要靠它认人） |
| 视频相关 | **fluent-ffmpeg**（中文调用 FFmpeg 的命令库，自带 ffmpeg/ffprobe 本体）→ 抽帧、压片、拼片全靠它 |
| 下载相关 | **axios**（发网络请求）+ **playwright**（内置无头浏览器）+ **yt-dlp**（下载工具）→ 抖音视频这一关 |
| 其他工具 | **bcryptjs**（密码加密）、**winston**（写日志）、**ali-oss**（阿里云存储）、**class-validator/class-transformer**（校验接口数据） |

**② 前端（你看到的网页，跑在 5173 端口）**

| 项目 | 说明 |
|------|------|
| 框架 | **Vite + React 19**（Vite 负责启动/打包，React 负责搭页面） |
| UI 组件库 | **Ant Design（antd）+ antd 图标**（按钮/表格/弹窗/表单这些都现成的） |
| 路由插件 | **react-router-dom**（页面切换跳转的管理器） |
| 状态管理 | **zustand**（跨页面共享数据的小仓库） |
| 请求插件 | **axios**（前端往后端发请求） |
| 其他 | **dayjs**（日期处理）、**react-player**（视频播放器组件）、**react-hook-form**（表单管理） |

**③ 启动与配置**

| 步骤 | 做什么 |
|------|-------|
| 1 | 电脑装上 Node.js → 前端、后端各自的文件夹里执行 `npm install`（自动把上面所有插件装好） |
| 2 | 后端配好密钥文件 `.env`（数据库账号密码、各 AI 服务的密钥都在里面） |
| 3 | MySQL 里建好数据库，TypeORM 启动时会自动建表（把表格结构建好） |
| 4 | 后端 `npm run start:dev` 启动（开发模式，改代码自动重启） → 跑在 3000 |
| 5 | 前端 `npm run dev` 启动 → 跑在 5173，浏览器打开就能操作 |
| 6 | FFmpeg 由插件自带，无需另外安装；yt-dlp 若有需要单独装一份 |
| 7 | 阿里云/火山/智谱/Runway 账号开通，填上密钥（AI 公司钥匙） |

### 阶段一：拆爆款，做成模板（AI 分析）

**你能做的：** 在"创建模板"页贴一条抖音分享链接，点"AI 分析"。

**电脑一步接一步干了什么：**

1. **提取链接**：把粘贴文本里的非链接文字去掉，找出真正的网址。
2. **下载视频**（两层防线）：
   - 先试 yt-dlp 直接下（很多视频不让下）；
   - 不行就启动一个**内置的无头浏览器**（Playwright），偷偷打开抖音页面，抓到视频的"真实视频地址"（还是无水印版），下载下来。
3. **压缩视频**：把下载的大片压小（压到宽 720、几兆大小）存起来，既减少磁盘占用，页面下载/播放也是用这个压缩版。
4. **智能"截屏"**：视频按内容变化切成几段，每段挑一个有代表性的画面，最多选出 8 张，跳过黑屏、去掉重复（这叫"抽帧"，等于给 AI 配了多个"见证人"）。
5. **AI 看懂视频**：把这 8 张画面发给**视觉 AI**（阿里云），它会告诉你：
   - 这视频叫什么、适合什么品类
   - 分成几个镜头、每个镜头多长、都是什么内容（每个镜头都写成"照着画/照着拍"的详细文字说明）
   - 用户要填哪些东西（品牌名、广告语…）以及默认值
6. **降级保护**：万一视觉 AI 不行，就退到"只按标题猜"；再不行，给个最基础的一镜头模板，不会让页面空着。
7. **给你审**：AI 的结果显示在"编辑模板"页面，你改个名字、加删镜头、改变量，确认后保存 → 一份**模板**入库存好。

### 阶段二：模板集市（逛、选）

- **怎么看**：首页卡片就是一个模板，卡片上自动带上**封面**（平时 AI 抽出来的参考图），不用点进去就知道内容。
- **怎么找**：有搜索框、有分类筛选（穿搭、美食、游戏…），按使用热度排序。
- **详情页**：进去看模板结构（几个镜头、每个镜头是干嘛的、时长）、要不要填哪些变量、原爆款视频链接（能下载参考）。

---

### 阶段三：创建项目（换内容）

**选好模板后，你要填：**

| 填的项目 | 大白话 | 推荐 |
|---------|--------|------|
| 比例 | 手机竖屏、横屏还是方形 | 默认自动识别源视频的比例（可手动改） |
| 清晰度 | 480p/720p/1080p | 720p（够用又省） |
| 风格 | 写实 or 动漫 | 写实（默认，真人感最强不混搭） |
| 语言 | 中文/英文/日文 | 中文 |
| 目标时长 | 想让成片多长（秒） | 留空就用模板默认；填了（比如 30）就按这个精确出片，最长 60 |
| 替换内容 | 把模板的"填空"填上你的内容（品牌名/文案） | 用 AI 给的默认值改改也行 |
| 参考图 | （可选）从素材库挑产品图，最多 6 张，让 AI 照着你的风格生成 | 想更像你放些图 |

**点"创建并生成"**：电脑先把这个项目（一份独立的"作业单"）存进数据库 → 立刻启动生成。

**目标时长怎么算出来的**：你填了总时长后，电脑把总时长**均分**给每个镜头（每个镜头最长 15 秒，这是 AI 的物理上限）。AI 生成的镜头最后再逐段精确对齐到秒，拼起来整片就是你填的时长。想改时长？改完重新生成就行。

---

### 阶段四：AI 逐镜头生成（核心动作线）

电脑把模板里的镜头一个一个做，**每个镜头的"做法"取决于它的类型**：

| 镜头类型 | 电脑怎么做 | 谁出的力 |
|---------|-----------|---------|
| **视频镜头**（动态画面） | AI 直接生成动态视频；用哪个模型由参考图张数决定（2张+→R2V、1张→I2V、没传→T2V，见下方"💡"表） | AI 视频模型（阿里云通义，备用火山/智谱/Runway，失败自动换下一个） |
| **图片镜头**（特写/海报） | 先让 AI 画一张高清图，再把图做成"镜头慢慢推进"的动态视频（学名 Ken Burns，照片活了） | AI 画图（阿里云）+ 本地 FFmpeg 合成 |
| **文字镜头**（结尾标语） | 不需要 AI，本地用自己的字排成紫底白字，居中淡入淡出 | FFmpeg 自绘 |

**可变内容怎么套进去**：每个镜头描述里的 `{{品牌名}}` 这类占位符，会被替换成你填的真实内容；选了英文/日文，还会先让 AI 把中文描述翻译一遍再生成。

**💡 传不传图、传几张，决定用哪个模型：**

| 你传了几张参考图 | 用哪个模型 | 大白话解释 |
|-----------------|-----------|-----------|
| **0 张**（没传） | **T2V**（文字生视频） | 没图可参考，光靠文字描述凭空生成 |
| **1 张** | **I2V**（单图生视频） | 给一张图，AI 照着它生成动态画面 |
| **2 张及以上**（最多 6 张） | **R2V**（多参考图生视频） | 多张图一起参考，AI 能锁定"主角长啥样"，效果最像你的素材 |

**自动降级（保底招）**：如果 R2V 全失败 → 自动退回 I2V（只用第一张图）→ 再失败 → 退回 T2V（纯文字），保证镜头总有一条出路。
**参考图数量上限**：不同"版本"的 R2V 模型能吃的图数量不一样（如 wan2.6 最多 4 张，新版本 5 张），超了会自动截取前几张。

**进度与容错**：
- 每做完一个镜头，进度条就涨一块（百分比写进数据库，页面自动轮询看到进度）。
- 有镜头失败不中断其他镜头；全部失败才标"失败"（可以重新生成）。
- 每个成功镜头都会存档，供"单独重做"和"重新拼片"时复用。

**产出**：每个镜头生成 1 段小视频。

---

### 阶段五：拼成一条完整视频（合成）

所有镜头出来之后，电脑收尾：

1. **统一规格**：把每一段都调整成同样的尺寸、每秒 24 帧，声音格式也调一致，避免拼接起来"忽大忽小"。
2. **补声音**：有声的保留，没声的自动合成一段等长的静音，保证整条不缺音轨（不会音画不同步）。
3. **顺序拼接**：一段段按顺序首尾接起来，合成一整条。
4. **加背景音乐**：模板配过歌的，把歌混进去。
5. **交货**：成品文件命名为 `viral_result_xxx.mp4`，项目状态"完成"，页面出现播放器和下载按钮。

---

### 阶段六：交付与日常管理

| 你想干嘛 | 怎么操作 |
|---------|---------|
| 看成品 | 进项目详情，直接播放、下载 |
| 换一个镜头 | 详情页每个镜头下方都有"重新生成"，单独重做（做完自动重新拼片） |
| 找项目 | "我的创作"有缩略图封面（自动取第一个镜头的画面），一眼看出内容；列表页也能搜索 |
| 删项目 | 删除时电脑会把该项目占用空间的文件一起清掉 |
| 建更多模板 | 回到阶段一，再贴一个链接即可 |

---

## 五、辅助能力：一些细节但重要的"底盘"

### 封面自动识别
每个模板和项目都自动带封面，不用人填：
- **模板封面**：用"参考图里最标志性的第一张"。
- **项目封面**：用"第一个镜头做出来的画面"。
原理：前端负责显示（抽到视频播放到 0.1 秒固定画面），后端负责算出封面地址。

### 后台自动大扫除
每 6 个小时自动清理一次临时文件（分析中间产物、没用的旧文件）。
**重点安全保护**：凡是还被某个模板用着的文件，一律不删——所以正常情况不会误删。

### 成本保护
- **模板分析最费钱**：一次分析大约要发给 AI 几万 token（大部分是图片占的），量级约为几万汉字的成本。正在推进"换更便宜的 AI + 少选几张图"来省成本。
- **视频生成费额度**：画视频的模型额度比较紧张，系统会自动挑可用模型并做好备用，额度用完会提示失败。

---

## 六、遇到问题怎么排查（常见问答）

**Q：为什么"分析"偶尔会失败？**
抖音经常不给直接下载。电脑会自动降级：先用内置浏览器抓 → 实在抓不到，就"只按标题文字猜"或给个最简单模板，不会卡住。

**Q：为什么生成的视频有时质量一般？**
视频质量由"用的模型 + 账号额度"决定。系统会自动挑最好的模型、失败自动换备用，但最终效果取决于模型的水平。网络波动或账号额度用完时，也可能生成失败或降级。

**Q：为什么默认用"写实"风格？**
因为动漫风格容易和真人素材混搭出"四不像"（之前踩过坑），所以默认写实最稳。想用动漫，在参数里手动选即可。

**Q：识别出的比例不是我想要的，能改成别的吗？**
能。模板只提供"默认比例"（自动识别源视频得到），创建项目时下拉框可改成任意比例（或项目建成后到详情页改），改完重新生成即按新比例出片。视频 AI 镜头会按新比例生成，图片/文字镜头由本地 FFmpeg 适配；若参考图原始比例与目标不一致，AI 镜头会先按参考图生成再裁到目标比例，可能有轻微裁切。

**Q：能精确控制视频多长吗？**
能。创建项目时填"目标时长"（1~60 秒），系统把总时长均分到每个镜头，AI 出片后再逐段精确对齐到秒，成片就是你填的时长。不填就按模板默认（8~15 秒）。注意：每个镜头最长 15 秒，如果总时长超过"镜头数×15 秒"，成片会尽量取最大能做的长度（电脑会提醒，不会失败）。改时长后重新生成即可。

**Q：我能直接上手吗？**
推荐：贴链接 → 填内容 → 等完成 → 下载。其他的都不需要你操心。

---

## 七、解决什么问题（价值总结）

- **降低门槛**：不懂视频也能做出有结构的视频。
- **可复制**：一个爆款变一套可复制的"套路"，换产品换品牌都行。
- **省剪辑**：从分析到成片全自动，人只负责选。
- **工业化**：结构化数据 + 模板复用，后面能接批量做片（换一批内容批量出片）。
