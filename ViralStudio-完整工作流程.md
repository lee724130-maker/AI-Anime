# 热门创作（Viral Studio）完整工作流程

> 一套「参考抖音爆款视频 → 生成你的专属 AI 视频」的全自动流水线。
> 核心思路：**分析爆款视频的分镜结构做成可复用的「模板」→ 用户替换自己的内容（产品/文案/素材）→ AI 逐场景生成 → FFmpeg 合并成片**。

---

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

## 二、全流程总览（用户视角）

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

## 三、逐流程说明（每个环节细节）

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

**比例自动检测（新）**：
- 分析视频时用 ffprobe 读真实分辨率 → `detectRatio(width,height)` 按宽高比归类为标准比例（9:16 / 16:9 / 1:1 / 3:4 / 4:3 / 2:3），容差 15%；极端比例（如 21:9）回退横屏 16:9 / 竖屏 9:16。
- 结果存 `viral_templates.ratio`，并在模板详情页/创建项目时作为**比例默认值**（可手动改）。
- 旧模板缺 `ratio`：可点「刷新源视频」自动探测回填，或手动选中任意比例。
- 改比例只影响本项目：按新比例生成（视频镜头把新比例传给 AI；图片/文字镜头由本地 FFmpeg 按新比例合成）。参考图原始比例与目标不一致时，AI 镜头先按参考图生成再裁到目标比例，可能有轻微裁切。

**时长对齐（target_duration，新）**：
- 创建项目时填目标时长 → 存 `viral_projects.target_duration`（`type: 'int'` nullable；⚠️ 必须显式标 int，否则 TypeORM 推断 Object 报错）。
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
| **video** | AI 直接生成视频 | 按参考图数选模型：2张+→R2V、1张→I2V、0张→T2V（见模型链） | prompt=描述+“电影级运镜,画面流畅自然,细节丰富,光影质感好”;duration=场景时长;resolution=项目分辨率;ratio=项目比例;media=media_refs;style=项目风格 |
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
- 防止 output 目录无限膨胀；公司源视频再出现 404 时优先排查：是否被外部磁盘清理工具误删（本清理器有引用保护）

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

---

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