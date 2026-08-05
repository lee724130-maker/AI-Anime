# 修复日志

## 2026-08-05（下午：待办 A+B 全部收尾 ✅）

> 承接当日早间记录（Coze 编辑器收尾完成）。用户确认执行剩余待办 A 类（画布/视觉模型）+ B 类（历史遗留验证），全部完成并已 git 提交（`feat: 内置画布模板 + 视觉模型省钱方案 + 遗留项验证`）。

### ✅ 今日完成（A 类）
- **A3 视觉模型省钱方案落地**：
  - 模型首选改为 `qwen3-vl-flash`（`ai-service.util.ts` 两处 visionModels：`generateSmartDescription` + `analyzeFrames`，omni-plus 降为第 2 兜底）
  - 抽帧减为 **4 张**（`viral.service.ts` extractFrames：`slice(0,8)` → 均匀采样 4 张，按 `framePaths` 等距取索引，覆盖全程不丢信息；分段抽帧仍 8 段保证采样质量）
  - **实测验证**：`Temp\opencode\test-vl-flash.js` 直接调 DashScope 成功——单张 720p 图仅 **2042 image tokens**（对比 omni-plus 单次分析 ≈42k tokens，省 ~60%+）；后端重编译重启动生效
- **A1 内置画布模板 2 个**（`is_system=1`，user_id=NULL，全用户可见，直接 SQL 种子 `Temp\opencode\seed_canvas_templates.sql`）：
  - id=4「品牌宣传片 · 视频+口号」：video（复用 `/static/canvas_result_27_*.mp4` 素材）+ text(`{{slogan}}`) + output
  - id=5「多段展示 · 双视频转场」：video + effect(fade 0.5s) + video + text + output，5 节点 4 连线
  - **全链路验证**：模板 5 → 创建项目 29（变量 `{{slogan}}` 正确替换、nodes=5/edges=4 保留）→ 渲染 **720×1280 / 5.5s**（3+3−0.5 转场）→ ffprobe 确认
- **A4 源视频 404 排查**：4 个 `viral_source_*.mp4` 全部存在且 `/static/` HEAD 全 200；模板 6/7/8/10 引用全部有效；cleanup 引用保护确认覆盖（reference_url 匹配 `/static/viral_source_*.mp4` → 不删；模板 4 是抖音短链无本地文件属正常）

### ✅ 今日完成（B 类验证，均无需改代码）
- **B5 短剧比例不生效**：DB 8 个分集 ratio 已全部非空（49-52=9:16、53-56=16:9，07-24 的 null 已被用户保存修复）；代码链路完整（`executeSegmentGeneration` epRatio 兜底 9:16 + 传 `generateVideo` ratio + ffmpeg ratio correction 兜底）→ 结案
- **B6 media_refs + R2V 降级**：`startGeneration`/`regenerateScene` 均把 `media_refs` 解析拼接为 `media` 参数（`viral.service.ts:1172`）；多图→R2V 优先（`ai-service.util.ts:607`）、单图→I2V、R2V 全败→I2V(第一张)→T2V 降级链完整；参考图上限处理（wan2.6 截 4、其他 5）→ 结案
- **A2 短剧片段来源**：`GET /api/drama/22/episodes`（空项目）→ 200 + 空数组（前端空态属正常）；项目 16 → 5 个片段（video_url 为空属分集未生成成片，正常）→ 结案

### ⚠️ 待办（剩余仅产品级）
- [ ] C 类（AI-Video.md）：支付对接（微信/支付宝+算力充值）、安全加固（限流/上传白名单/日志持久化）、antd 按需加载、output/ 清理策略——均属上线前事项，排后
- [ ] 源视频若再 404：先查磁盘清理软件（cleanup 有引用保护不会误删，本轮已确认 4 文件全在）

### 测试脚本经验（新增）
- `system_configs` 表（config_key/config_value）不是 `app_configs`；`llm_provider` 为空 = auto
- PowerShell 不支持 `<` 输入重定向 → 用 `cmd /c "mysql ... < file.sql"` 执行 SQL 种子文件
- `mysql -uroot -p123456 -e "SELECT ..." ai_anime` 查询时注意列名（drama_episodes 是 episode_no 非 episode_number，无 status 列）

---

## 2026-08-05（前端 Coze 工作流编辑器实测收尾完成 ✅）

> 承接 2026-08-04 晚间记录：后端多轨工作流渲染管线已完成；今日完成前端编辑器浏览器实测收尾、修 2 个 bug、全链路验证通过，并已 git 提交（提交信息 `feat: 画布 Coze 式节点工作流编辑器 + 多轨渲染管线`）。

### ✅ 今日完成
- **渲染完成验证通过**：`Temp\opencode\canvas-min-ui.js` 最终确认「下载成片」按钮出现（此前测试脚本用 `button:` 选择器误判失败——antd Button 带 href 渲染为 `<a>` 标签，功能一直正常）
- **Bug 修复 1（React key 重复警告）**：`Editor.tsx` 属性面板素材 options 由多来源（viral+AI历史+短剧+大资产库）拼接，同一 URL 重复导致 duplicate key 警告 → `assetOptions` useMemo 增加 `dedupe`（Map by url）→ 实测警告 0 条
- **Bug 修复 2（第 3 列节点被画布裁剪/遮挡）**：`addPaletteNode` 排布 3 列（`60+col*280, 60+row*180`），第 3 列节点（x=620）超出画布可视区被 overflow 裁剪+右侧属性面板遮挡，端口无法命中 → 改 **2 列**（`60+col*280, 60+row*160`）→ 6 节点全部可见、连线全通
- **全链路 UI 实测**（`canvas-full-ui.js`，1600×900 视口）：6 节点添加（video×2+effect+text+audio+output）/ 素材选择 / **5 条连线**（v1→effect→v2→output + text→output + audio→output）/ 保存持久化 nodes=6 edges=5 / 渲染完成出现下载按钮 / 成片 **720×1280 / 5.5s（3+3−0.5 转场）/ 含音频** —— 全绿
- **滤镜链路实测**（`canvas-filter-ui.js` + `debug-effsel3.js` + `render-28.js`）：effect 节点属性面板切「滤镜」+ 选「复古棕褐」→ 保存 params `{kind:'filter', filter:'sepia'}` → 重新渲染成功 720×1280/3s
- **文档**：`画布-项目设计.md` 顶部新增「⚠️ 设计变更（Coze 式节点流程图）」章节（新数据模型/连线语义/渲染引擎/前端架构/实测结论，旧横向卡片设计保留作历史参考）

### 测试脚本经验（防下次踩坑）
- 「下载成片」按钮是 `<a>` 不是 `<button>`（antd Button href）→ `a:has-text("下载成片")`
- `[data-node]` 会命中端口圆点（端口 div 也带 data-node 属性）→ 节点用 `[data-node]:not([data-port])`
- 端口定位用端口自身 boundingBox 中心（`[data-port="out"]` / `[data-port="in"]`），不要用节点偏移估算（viewport zoom=0.9 会偏 8px 导致连不上）
- antd Select 点当前值选项不触发 onChange（选"黑白"时无效果，选其他值正常）
- 后端 GET 项目 `nodes` 已解析为对象（非字符串）；ffprobe 在 `backend/tools/ffmpeg/ffprobe.exe`（不是 bin/）
- 内联 `node -e` 中文/引号在 PowerShell 下易挂 → 写脚本文件跑

### 服务状态（关停前）
| 服务 | 端口 | 状态 |
|------|------|------|
| 后端（NestJS，`node dist/src/main`） | 3000 | ✅ 运行中（今日重编译重启动） |
| 前端（Vite） | 5173 | ✅ 运行中 |
| 管理后台（Vite） | 5174 | ⚠️ 未启动 |
| Redis | 6379 | ✅ 运行中 |
| MySQL | 3306 | ✅ 运行中 |

### ⚠️ 待办（收尾后剩余）
- [ ] 模板库暂无内置模板（可先「新建空白画布」自建；「复制为项目」已支持模板→项目）
- [ ] 短剧片段来源（`/api/drama/:id/episodes`）依赖分集存在，空项目无片段属正常
- [ ] 视觉模型省钱方案（qwen3-vl-flash + 减帧 4 张）待确认
- [ ] 源视频再 404 时检查磁盘清理软件（cleanup 有引用保护不会误删）

---

## 2026-08-04（晚间追加：画布重构为 Coze 式工作流，后端完成/前端未完成）

> 本节是当日「视频画布编辑器」之后追加的工作。用户反馈旧编辑器（横向卡片顺序）不符合预期，
> 要求按**扣子 Coze 式节点流程图**重做：中央自由画布拖拽摆放节点 + 连线，支持多素材类型/音频轨/属性面板/效果库/多轨叠加。
> **当前进度：后端渲染管线全部完成并验证通过；前端编辑器已重写但浏览器实测未完全跑通，明日继续。**

### ✅ 已完成：后端多轨工作流渲染管线（未提交，git 工作区待 commit）
- **数据模型**: 项目 nodes 字段存 `{nodes:[], edges:[]}` 完整 JSON（不再拆成数组）
  - node: `{id, type: video|image|text|audio|effect|output, position:{x,y}, source:{kind,url}, duration, params}`
  - edge: `{id, from, to}`
  - effect 节点 params: `kind:'transition'`（transition: fade/fade_black/fade_white/wipe_left/wipe_right/slide_left/slide_right/circle，transition_duration）或 `kind:'filter'`（grayscale/sepia/warm/cool/vintage/bright/dark/contrast/soft/vivid）
  - text 节点 params: `text/start/x/y/font_size/text_color/opacity/animation('none'|'fade'|'slide_up'|'zoom_in')`
  - audio 节点 params: `volume/start/fade_in/fade_out`
- **连线语义**（`canvas.service.ts`）:
  - 主链 = video/image 节点按边顺序（`buildMainChain`，从无媒体入边的节点出发沿 out 边走；成环则按 position.x 排序兜底）
  - 效果节点在两段媒体之间 = 转场（`findBridgeEffect`）；效果节点直接连单个视频 = 滤镜（`applyClipFilter`）
  - text/audio 节点 → 输出节点（叠加层 / 音轨）；输出节点是渲染目标
- **渲染引擎**（`renderWorkflow`）:
  1. 主链每段渲染（video: fitVideoToRatio→fitToExactDuration→**normalizeToRes**；image: composite）→ 相邻段用桥接效果节点的转场 xfade 合并（`mergeWithTransitions2`，伪节点必须包成 `{transition:{...}}` 否则 afterTransitions=[0,0] 转场失效）
  2. 文字叠加: `ffmpeg.generateOverlayTextVideo`（透明 RGBA MOV 文字视频）→ `overlayClipOnVideo`（setpts 偏移 + enable=between(t,start,end)）
  3. 音频轨: `ffmpeg.mixAudioTracks`（多轨 volume+adelay+淡入淡出+amix）；项目 bgm_url 仍兼容（音量 0.3）
- **ffmpeg.util.ts 新增**: `generateOverlayTextVideo` / `overlayImageOnVideo` / `mixAudioTracks`
- **兼容**: 旧数组格式走 `renderLegacy` 原逻辑（`parseWorkflow` 自动识别 `{nodes,edges}` vs 数组）；createProject/saveAsTemplate 保留原始 JSON
- **验证（e2e 脚本 `Temp\opencode\canvas-wf-e2e.js`）**: 2 视频 + fade 0.5 转场 + 文字叠加 + 音频节点 → 项目 14 → `canvas_result_14_1785838813416.mp4` **720×1280 / 5.5s 精确**（3+3−0.5，日志 afterTransitions=[0.50,0.00]）；文字叠加用红像素窗口法验证通过（t=1.0/1.5 有红像素、t=2.5 窗口结束消失）；ffprobe 确认音频流存在

### ⚠️ 未完成：前端 Coze 式工作流编辑器（代码已写、实测未通，明日继续）
- **已写**（`frontend/src/pages/Canvas/`，tsc 编译全绿）:
  - `components/WorkflowTypes.ts`: 类型 + NODE_META 配色 + 转场/滤镜/动画选项常量
  - `components/WorkflowCanvas.tsx`: 自由画布（滚轮缩放/拖空白平移/节点拖拽/端口连线：节点右侧圆点拖到左侧圆点，SVG 虚线贝塞尔边）、素材拖拽放置、删除节点连带删边
  - `components/PropertiesPanel.tsx`: 右侧属性面板（按类型：时长/选素材/文字内容/字号/动画/颜色/X-Y 位置滑块/音频音量淡入淡出/效果类型切换转场或滤镜/输出说明）
  - `Editor.tsx` 重写: 顶部工具栏（名称/比例/分辨率/节点连线计数/保存/导出渲染/下载）+ 左侧「节点 / 素材」面板（Segmented 切换：6 种节点点击添加 + 素材 4 Tab 点击添加，带连线规则说明）+ 中央画布 + 右侧属性面板 + 底部成片预览；渲染校验（无素材/文字未填/素材未连输出/未选素材均拦截提示）
- **浏览器实测已通过的部分**（`Temp\opencode\canvas-min-ui.js`）: 页面加载/添加节点/属性面板选素材/**连线成功**/保存后进入项目页/**后端持久化 nodes=2 edges=1**/渲染启动（"开始渲染..." 消息出现）
- **❌ 未跑通**: 渲染完成出现「下载成片」按钮（测试中途手动中断，未等到渲染完成；渲染接口本身后端已验证过，应无问题）
- **已知问题**:
  - ⚠️ 测试脚本 `canvas-flow-ui.js` 里 `.ant-select` 误点顶部工具栏比例选择器（已改用 nth(2) 规避）——用户真实操作无此问题
  - ⚠️ console 有 React key 重复警告（`/static/vid_4_1785140340944.mp4`，来自属性面板素材 Select 的 options 重复 value 或 AssetPanel 列表），需定位修复
  - 节点/连线 data-* 属性已修（`data-node` 而非 `data-node-id`，dataset.node）；节点 overflow:hidden 裁剪端口已修复（改 header/body 独立圆角）
- **明日步骤**: ① 跑 `canvas-min-ui.js` 等到渲染完成；② 修 React key 警告；③ 浏览器全链路复核（含 text/audio/effect 节点 + 滤镜）；④ 更新 `画布-项目设计.md` + git 提交（当前未提交：canvas.service.ts / ffmpeg.util.ts / Editor.tsx / 3 个新组件文件）

### 服务状态（关停前）
| 服务 | 端口 | 状态 |
|------|------|------|
| 后端（NestJS，`node dist/src/main`） | 3000 | ✅ 运行中（今日多次重启，最新代码 dist 已编译） |
| 前端（Vite） | 5173 | ✅ 运行中 |
| 管理后台（Vite） | 5174 | ✅ 运行中 |
| Redis | 6379 | ✅ 运行中 |
| MySQL | 3306 | ✅ 运行中 |

### ⚠️ 待办
- [ ] 前端 Coze 工作流编辑器实测收尾（见上节明日步骤）
- [ ] 模板库暂无内置模板（可先「新建空白画布」自建；「复制为项目」已支持模板→项目）
- [ ] 短剧片段来源（`/api/drama/:id/episodes`）依赖分集存在，空项目无片段属正常
- [ ] 视觉模型省钱方案（qwen3-vl-flash + 减帧 4 张）待确认
- [ ] 源视频再 404 时检查磁盘清理软件（cleanup 有引用保护不会误删）

---

## 2026-08-04（上午：视频画布编辑器初版）

### 服务状态（关停前）

#### 功能概览
- **定位**: 把 AI 生成的历史产物（AI 视频/图片、大资产库、热门创作成片、短剧片段、本地上传）按需拖入画布，配文字块/转场/BGM，一键导出成片
- **页面**: 「视频画布」一级导航（位于 热门创作 之后）→ 列表页（项目 + 模板库 Tab）+ 编辑器页（`/canvas/editor/:id`）
- **设计文档**: `画布-项目设计.md`（顶层新增）

#### 后端（`backend/src/modules/canvas/`）
- **实体**: `canvas_projects`（name/ratio/resolution/fps/nodes(JSON)/bgm_url/status/progress/result_url/error_msg）、`canvas_templates`（name/category/variables(JSON)/nodes(JSON)）
- **API**（全部带 user 鉴权）:
  - 项目: `GET/POST /api/canvas/projects`、`GET/PUT/DELETE /api/canvas/projects/:id`、`GET :id/export`（渲染状态）、`POST :id/render`（开始渲染）
  - 模板: `GET /api/canvas/templates`（category/keyword 过滤）、`GET :id`、`POST :id/duplicate`（复制为项目）
- **渲染管线**（`canvas.service.ts` doRender）:
  1. 项目解析 nodes 顺序排列；变量替换（模板变量 `{{var}}` → 项目变量值，文本块内替换）
  2. 每块独立渲染到 workDir：video 块（`fitVideoToRatio` 裁到项目比例 → `fitToExactDuration` 精确时长 → **`normalizeToRes`** 统一到项目分辨率 720×1280 等）；image 块（参考图等比放大填满 + zoompan 缓慢放大 + 交叉淡入淡出）；text 块（`generateTextVideo` 紫底白字 + 淡入淡出）
  3. 相邻块转场：xfade（fade/wipe_left/wipe_right/zoom_in，每转场 0.4~0.5s）→ 最后 `mergeVideos` 合并（保留音频，aac 归一化）
  4. BGM：`bgm_url` 叠加音频（adelay+amix，BGM 音量 0.3）
  5. 输出 `output/canvas_result_{id}_{ts}.mp4` → `result_url=/static/...`，更新 status/progress
- **渲染安全**: 渲染中二次请求 render → 400「正在渲染中」；进度分段上报（分段 0.1→0.5，转场 0.6→0.8，BGM/完成 1.0）
- **⚠️ 已知坑**: `normalizeToRes` 必须做（video 块 fitVideoToRatio 会缩到 406×720，与 text 块 720×1280 不一致导致 xfade/concat 静默回退成普通拼接、时长失准）——实测 3 段 3s + fade 0.5 + wipe 0.4 = 8.1s 精确
- **验证**: 模板→变量替换→渲染 API 全通；真实 16:9 视频 + 文字 + 9:16 项目 → 720×1280 / 8.1s / 音频正常

#### ffmpeg 升级
- `backend/tools/ffmpeg` 升级 **6.1.1**（此前 2018 老版不支持 zoompan 多输出/复杂滤镜），`findFfmpeg()` 优先探测 tools 目录，其次 PATH；`ffmpeg.util.ts` 新增 `zoompanImage` 辅助
- ⚠️ 回归注意: fitToExactDuration 的 apad/atemp 老参数已适配新版；`getVideoInfo` 兼容

#### 前端（`frontend/src/pages/Canvas/`）
- **列表页 index.tsx**: 我的画布（封面 CoverThumb + 删除/导出/编辑）+ 模板库 Tab（模板卡片 + 复制为项目）；「新建空白画布」→ `/canvas/editor/new`
- **编辑器 Editor.tsx**: 顶部（名称/比例 6 选/分辨率/保存/导出渲染 + 保存状态 Tag）；素材面板 5 来源（AI历史/大资产库/热门创作/短剧片段/上传，拖拽或点击添加）；画布区（节点卡片拖拽排序、删除、点击选中编辑——文本内容/背景色/字色/字号/时长 1~15s/转场 fade|wipe_left|wipe_right|zoom_in）；BGM 选择抽屉（从热门创作成片选，渲染时叠加音频）；渲染进度条 + 完成后下载按钮
- **组件**: `AssetPanel.tsx`（AssetItem 定义 + 分类 Tab + 拖拽）、`NodeCard.tsx`（视频/图片预览 + 文字编辑表单 + 转场 Select）
- **路由/导航**: App.tsx 加 `/canvas`、`/canvas/editor/:id`；AppHeader 加「视频画布」菜单项

#### 关键 Bug 修复（今日）
- **绝对路径 file:// 报错**: 旧数据节点 `source.url` 存了 `C:\...\backend\output\x.mp4` 绝对路径，浏览器 video 无法加载 → 前端 `toStaticUrl()`（Editor.tsx）加载项目/添加素材/资产列表时统一转 `/static/` URL；后端 `coverFromNodes` 同样转换绝对路径 → 列表封面不再报 file:// 错误
- **转场静默失效**: xfade 尺寸不一致时 ffmpeg 报错被吞 → 新增 `normalizeToRes` 统一所有 video 块到项目分辨率后转场/拼接正常

### ⚠️ 待办
- [ ] 模板库暂无内置模板（可先「新建空白画布」自建；「复制为项目」已支持模板→项目）
- [ ] 短剧片段来源（`/api/drama/:id/episodes`）依赖分集存在，空项目无片段属正常
- [ ] 视觉模型省钱方案（qwen3-vl-flash + 减帧 4 张）待确认
- [ ] 源视频再 404 时检查磁盘清理软件（cleanup 有引用保护不会误删）

---

## 2026-08-03

### 服务状态（关停前）
| 服务 | 端口 | 状态 |
|------|------|------|
| 后端（NestJS，`npm run start:dev` watch 模式） | 3000 | ✅ 运行中（PID 12696） |
| 前端（Vite） | 5173 | ✅ 运行中 |
| 管理后台（Vite） | 5174 | ✅ 运行中 |
| Redis | 6379 | ✅ 运行中 |
| MySQL | 3306 | ✅ 运行中 |

### 今日完成功能

#### 视频比例自动检测 ✅
- **需求**: 分析视频时自动识别源视频比例（9:16 / 16:9 等），作为模板/项目的比例默认值，避免每次手动选
- **后端**: `viral.service.ts` 新增 `detectRatio(width,height)`（宽高比 → 标准比例，容差 15%，极端比例回退横/竖屏）；`analyzeVideo` / `buildBasicTemplate` 返回 `ratio`；`viral_templates` 表新增 `ratio` 列（`synchronize: true` 自动建列）；「刷新源视频」`refreshTemplateSourceVideo` 会重新探测并回填 `ratio`；`viral.dto.ts` Create/Update 模板支持 `ratio`
- **前端**: `CreateTemplate.tsx` 分析后捕获并保存 `ratio`，编辑页显示"已自动检测视频比例: xxx"；`TemplateDetail.tsx` 创建项目表单默认值取 `template.ratio || '9:16'`，比例选项扩展到 6 种（9:16 / 16:9 / 1:1 / 3:4 / 4:3 / 2:3）
- **验证**: 前后端编译全绿；接口实测响应带 `ratio` 字段、PUT/GET 正常；真实源视频 720×1280 → 正确识别 9:16；模板 8 已回填 `ratio=9:16`
- **注意**: 旧模板缺 `ratio` → 点「刷新源视频」自动回填或手动选；改项目比例后 R2V/I2V 镜头按参考图原比例生成再裁切，可能有轻微裁切
- **文件**: `backend/src/modules/viral/viral.service.ts`、`viral-template.entity.ts`、`viral.dto.ts`、`frontend/src/pages/Viral/CreateTemplate.tsx`、`TemplateDetail.tsx`

#### 视频目标时长对齐 ✅
- **需求**: 模型合成的视频不能精确匹配用户想要的时长（原固定 8~15s），需要「时长控制」：创建项目时指定目标时长，成片逐段对齐精确到秒
- **设计决策**（用户确认）: 时长设置位置 = 创建项目时；可选范围 = 自由输入 ≤60s；对齐策略 = **变速优先 + 定格兜底**
- **后端**:
  - `viral-projects` 表新增 `target_duration` 列（`type: 'int'` nullable，⚠️ 必须显式 `type: 'int'`，否则 TypeORM 推断 Object 报 `DataTypeNotSupportedError`）
  - `viral.service.ts` 新增 `computeAssignedDurations(scenes, target)`：均匀分配目标时长到各场景（每段 clamp 1~15s，余数给前段；超过 15s×场景数 上限时告警并按上限分配，不失败）
  - `startGeneration` / `regenerateScene`：有 target_duration 时用分配时长生成每段（image composite / video generateVideo / text generateTextVideo），生成后调用 `ffmpeg.fitToExactDuration` 对齐到精确秒数，场景结果存 `duration` 供重新生成复用
  - `viral.dto.ts`：Create/UpdateProjectDto 新增 `@IsInt() @Min(1) @Max(60) target_duration`
- **前端**: `TemplateDetail.tsx` 创建项目表单新增「目标时长（秒）」InputNumber（1~60，留空=模板默认，带 ⓘ 说明）；`ProjectDetail.tsx` 顶部新增时长 Select（15/30/45/60 + 可清除回默认）+ 详情标签展示目标时长，比例选项同步扩为 6 种
- **ffmpeg**（`fitToExactDuration`，兼容 2018 老版 ffmpeg）:
  - 误差 <0.15s → 直接复制
  - 超长 → `-t` 裁剪（重编码）
  - 短但 ≤25%（ratio ≤1.25）→ `setpts=ratio*PTS` + `atempo=1/ratio` 轻微慢放
  - 超 25% → `tpad=stop_mode=clone` 尾帧定格 + `-af apad`（⚠️ 老版 ffmpeg 的 apad 不支持 `pad_dur` 参数，必须用裸 `apad` + `-t` 截断）
- **验证**: 分配算法 9 组用例全对（30s/3段→[10,10,10]、60s/5段→[12×5]、60s/3段→[15×3] 告警降级、50s/4段→[13,13,12,12] 等）；`fitToExactDuration` 4 种模式实测全过（5s→4s 裁剪 / 5s→6s 慢放 / 5s→9s 定格 / 5→5.05s 复制）；API 实测创建项目带 `target_duration=30` 持久化成功；前后端编译全绿。**用户实测**：时长控制生成验证基本没问题
- **注意**: 单段最长 15s（模型物理上限）；目标时长超上限时成片会比目标短（后端日志告警）；生成后改目标时长需重新生成整片生效（重新生成单场景也能复用分配时长）
- **文件**: `backend/src/modules/viral/viral.service.ts`、`viral-project.entity.ts`、`viral.dto.ts`、`backend/src/utils/ffmpeg.util.ts`、`frontend/src/pages/Viral/TemplateDetail.tsx`、`ProjectDetail.tsx`

### 文档更新（未提交）
- `ViralStudio-完整工作流程.md`：新增"比例自动检测"与"时长对齐（target_duration）"小节、`viral_templates` 表字段补充 `ratio`、阶段三参数表加目标时长、模型/成本章节重写（2026-08-03，按 model_configs 实际 active 记录 R2V/I2V/T2V/文生图/多模态/文本）、已知边界补第 6 条
- `ViralStudio-简化版流程.md`：比例默认值改自动识别、阶段三表格加目标时长、FAQ 新增"识别比例不满意可改"与"能精确控制视频多长吗"问答（注意：文件名由「通俗版」改名为「简化版」）

### ⚠️ 待办
- [x] 两份 ViralStudio 文档 + AGENTS.md 变更提交 git（已完成）
- [ ] 视觉模型省钱方案（qwen3-vl-flash + 减帧 4 张）待确认
- [x] 新模板实测：分析 16:9/9:16 视频 → 详情页确认默认比例、生成验证（用户已实测，基本没问题）
- [ ] 源视频再 404 时检查磁盘清理软件（cleanup 有引用保护不会误删）

---

## 2026-07-31

### 服务状态（关停前）
| 服务 | 端口 | 状态 |
|------|------|------|
| 后端（NestJS，`node dist/src/main`） | 3000 | ✅ 运行中（PID 8224，需重启生效新代码） |
| 前端（Vite） | 5173 | ✅ 运行中 |
| 管理后台（Vite） | 5174 | ✅ 运行中 |
| Redis | 6379 | ✅ 运行中 |
| MySQL | 3306 | ✅ 运行中 |

### 今日完成功能

#### 模板/项目卡片封面 ✅
- **需求**: 模板卡片和创作卡片无封面，无法直观了解内容
- **后端**: `listTemplates` / `getTemplateById` 返回 `cover_url`（优先 thumbnail，否则取 reference_frames 首帧）；`listProjects` 返回 `cover_url`（优先第一个 completed 场景的 videoPath/imagePath，本地路径自动转 `/static/` URL，兜底 result_url）
- **前端**: 新增 `CoverThumb` 组件（视频→video 首帧封面，图片→img，失败→渐变占位），用于模板卡片、模板详情页、首页"我的创作"卡片、ProjectList 列表封面
- **文件**: `backend/src/modules/viral/viral.service.ts`、`frontend/src/pages/Viral/CoverThumb.tsx`、`index.tsx`、`ProjectList.tsx`、`TemplateDetail.tsx`
- **⚠️ 坑**: `/static/` 相对路径在 vite dev（5173）下会 404 → `frontend/vite.config.ts` 新增 `/api` + `/static` 代理到 3000（项目 2 的 text 场景文件缺失属旧数据，CoverThumb 自动降级占位图）
- **验证**: 已 Playwright 端到端验证——模板卡片 4 张全部渲染参考帧封面图、创作卡片渲染场景视频首帧封面、模板详情页封面渲染；封面 URL 经 5173 代理全部 HTTP 200

#### 代码质量清理 ✅
- 前端 `tsc -b` 全绿：清理 Viral 全部页面/components 的未使用 import、未使用变量（List/Form/Descriptions/Tag/Space/Row/Col/TeamOutlined/ScissorOutlined/ModelItem/PROVIDER_LABELS 等）、`ProjectDetail` 语言映射类型修复（TS7053）、删除未引用的死代码 `TemplateCard.tsx`

#### 项目 5 三问题诊断 + 修复 ✅
模板 8（服饰穿搭）生成的项目 5 存在三个问题，已全部定位并修复：

##### Bug 1 - 结尾黑屏（品牌 Slogan 文字场景）✅ 已修复
- **根因**: `viral.service.ts` startGeneration 中 text 场景 `bgColor: '#1a1a2e'`（近黑色）+ 3s 静态白字 → 视觉上就是"结尾黑屏 3 秒"（实测尾部亮度 YAVG≈39，全片最暗）
- **修复**: 背景统一为品牌紫 `#7C3AED`（与 regenerateScene 一致）+ `generateTextVideo` 新增 0.5s 淡入 / 0.6s 淡出动画
- **文件**: `backend/src/modules/viral/viral.service.ts`（行 1055）、`backend/src/utils/ffmpeg.util.ts`（generateTextVideo filter）
- **生效条件**: 需重启后端（dist 已重新编译）

##### Bug 2 - 原视频下载 404（模板 8 参考视频丢失）✅ 已修复
- **根因**: `viral_source_1785494547540.mp4` 文件在 19:01 后凭空消失（18:42 持久化成功、19:00 复用成功、19:01:51 仍在，之后无删除日志；cleanupOrphanFrames 有模板引用保护不会误删，原因不可回溯，怀疑磁盘清理类软件）
- **修复**: 重新下载源视频（yt-dlp 失败 → Playwright API 捕获，7.3MB）→ ffmpeg 压缩持久化为同名文件（4MB）→ 已验证 HTTP 200
- **注意**: 后端服务 /static/ 是静态文件服务，文件补回后**无需重启即可访问**

##### Bug 3 - 风格混乱（真人视频中插入动漫内容）✅ 已修复（预防性）
- **根因**: 前端 `TemplateDetail.tsx` 风格 Select **默认值就是 `anime`**（initialValue="anime"），用户创建项目时未改 → 项目 5 style=anime → 全部场景注入动漫描述；但 R2V 场景参考真人源视频生成（接近真人）vs T2I 图片场景纯动漫 → 同一视频真人+动漫混搭
- **修复**: 前端默认值 `anime` → `realistic`（写实），选项顺序调整，提交兜底值同步修改
- **文件**: `frontend/src/pages/Viral/TemplateDetail.tsx`
- **影响范围**: 只影响新建项目；项目 5 保持 anime 不变（用户选择不重生成，如需真人版用模板 8 新建项目选"写实"）

#### Viral Studio 全链路开发（07-30 晚 ~ 07-31，本日提交）✅
- 模板分析 → 项目创建 → 场景生成（video/image/text）→ 合并 → 下载全链路打通
- 项目 CRUD（`viral.controller.ts` / `viral.dto.ts` / `viral-project.entity.ts` / 前端 ProjectList/ProjectDetail）
- 场景生成: video 场景（R2V/I2V/T2V 自动选择，`style` 注入）、image 场景（T2I 文生图 + zoompan 合成）、text 场景（drawtext 动画）
- 多场景视频合并保留音频（concat a=1 + anullsrc 静音补齐）
- `mergeVideos` 多文件合并 v=1:a=1 + aresample 归一化；`adjustVideo` 修复 `-an` 丢音轨（→ `-c:a aac`）
- 智能抽帧 `extractFrames`: 均匀分段 → 段内 scene 检测（阈值 0.1）→ 三点采样兜底 → dHash 去重 → 上限 8 帧
- `persistSourceVideo`: 同 URL 复用已持久化文件，否则压缩（maxWidth 720）保存

### 模型状态（2026-07-31）
| 模型 | capability | 状态 | 备注 |
|------|-----------|------|------|
| wan2.6-r2v-flash | video (r2v) | ✅ active priority=1 | 唯一活跃 R2V（其他 R2V 额度用尽） |
| wan2.6-r2v / wan2.7-r2v / wan2.7-r2v-2026-06-12 / happyhorse-1.1-r2v | video | ⛔ inactive | 额度用完 |
| wan2.1-t2i-plus / wan2.1-t2i-turbo | image | ✅ active | 文生图（image 场景） |
| wan2.7-i2v 系列 | video | ⛔ inactive | 无额度 |

### Token 用量核算（07-31）
- 单次模板分析 ≈ 42k tokens（qwen3.5-omni-plus，720p 源视频 8 帧，图片占 ~90%）
- 07-30 晚至今共 7 次多模态分析全成功 ≈ 29 万 tokens
- 建议：后续换 qwen3-vl-flash 首选 + 减帧到 4 可省 60%+（待用户确认）

### ⚠️ 待办
- [ ] 重启后端使黑屏修复生效（`node dist/src/main`）
- [ ] 验证：模板 8 下载原视频正常 + 新项目文字场景为紫色背景
- [ ] 项目 5 如需真人风格 → 模板 8 新建项目选"写实"
- [ ] 视觉模型省钱方案（qwen3-vl-flash + 减帧）待确认
- [ ] 源视频再 404 时检查磁盘清理软件（cleanup 有引用保护不会误删）

### 关键文件清单
| 文件 | 修改内容 |
|------|---------|
| `backend/src/modules/viral/viral.service.ts` | 项目 CRUD、场景生成、extractFrames 重构、persistSourceVideo、text 场景背景色、cover_url |
| `backend/src/utils/ffmpeg.util.ts` | generateTextVideo 淡入淡出、mergeVideos 保留音频、adjustVideo -c:a aac |
| `backend/src/modules/viral/viral.controller.ts` / `viral.dto.ts` / `viral-project.entity.ts` | 项目/模板接口与实体 |
| `frontend/vite.config.ts` | `/api` + `/static` 代理到 3000（封面图 dev 下 404 修复） |
| `frontend/src/pages/Viral/TemplateDetail.tsx` | 风格默认值 realistic、变量/参考图表单、详情页封面 |
| `frontend/src/pages/Viral/CoverThumb.tsx` / `index.tsx` / `ProjectList.tsx` / `ProjectDetail.tsx` | 封面组件/模板集市/项目列表/项目详情 |

---

## 2026-07-30

### 服务状态（关停前）
| 服务 | 端口 | 状态 |
|------|------|------|
| 后端（NestJS） | 3000 | ✅ 运行中（PID 18876） |
| 前端（Vite） | 5173 | ✅ 运行中 |
| 管理后台（Vite） | 5174 | ✅ 运行中 |
| Redis | 6379 | ✅ 运行中 |
| MySQL | 3306 | ✅ 运行中 |

### 今日完成功能

#### Bug D - 智能描述多模态 400 错误（data URI 修复）✅ 已修复
- **现象**: `imageToBase64` 收到 `data:image/jpeg;base64,...` 格式的图片时，因为不以 `http` 开头走进了本地文件路径分支，`fs.existsSync('data:...')` 自然失败
- **文件**: `backend/src/utils/ai-service.util.ts`
- **修改**: 在 `imageToBase64` 开头添加 `data:` URI 检测，匹配 `data:image/\w+;base64,(.+)` 直接提取 base64 内容返回
- **验证结果**: 
  - 8 帧全部成功转换：`成功 8, 失败 0`
  - 阿里云 `qwen3.5-omni-plus-2026-03-15` 多模态 API 成功返回
  - 生成模板：「影视浪漫混剪」— 4 场景，7 变量

#### 抖音视频下载流程打通 ✅
- yt-dlp 下载失败（需要 Cookie）→ Playwright 降级成功
- 简化版导航（单次 goto + `domcontentloaded` + 8s 等待）稳定工作
- API 元数据捕获（标题、时长、去水印 URL）正常
- `DownloadVideo` 流程: yt-dlp → Playwright API 捕获 → axios 下载 → 返回 `{duration, title}`

#### FFmpeg 修复 ✅
- `ffprobe` 输出解析修复：`-select_streams v:0` 只取视频流
- 时长 >300s 时回退到 `format.duration`

### 明天开发计划（2026-07-31）

#### 最重要的一步：用视频模板生成视频内容
1. 启动项目（后端 `npm run start:dev`，前端 `npx vite`）
2. 测试 `POST /api/viral/templates/analyze` 传入抖音 URL → 成功返回模板
3. 测试 `POST /api/viral/projects` 创建项目 + 填写变量 → 返回 projectId
4. 测试 `POST /api/viral/projects/:id/generate` → 调用 AI 模型生成各场景视频
5. 验证最终视频合成和下载
6. 验证 `media_refs`（大资产库参考图）是否已传递给 AI 模型（当前代码有 gap）

#### 关键待办
- [ ] 检查 `startGeneration()` 中 `media_refs` 是否已拼接到 `media` 参数传给 AI
- [ ] 测试纯文本降级 vs 多模态分析的效果差异
- [ ] 验证多图场景下 R2V 降级链路

### 关键文件清单
| 文件 | 修改内容 |
|------|---------|
| `backend/src/utils/ai-service.util.ts` | `imageToBase64` 添加 data URI 检测 + `chatWithVision` 图片处理优化 |
| `backend/src/modules/viral/viral.service.ts` | `downloadVideo` 简化、`analyzeVideo` 视觉→文本三级降级 |
| `backend/src/utils/ffmpeg.util.ts` | `getVideoInfo` 修复 |

---

## 2026-07-29

### 服务状态

| 服务 | PID | 端口 | 状态 |
|------|-----|------|------|
| 后端（NestJS） | 11256 | 3000 | ✅ 运行中 |
| 前端（Vite） | — | 5173 | ✅ 运行中 |
| 管理后台（Vite） | — | 5174 | ✅ 运行中 |
| Redis | — | 6379 | ✅ 运行中 |
| MySQL | — | 3306 | ✅ 运行中 |

### 今日完成功能

#### Bug H - 文字生图片 400 错误（阿里云废弃同步 API）✅ 已修复
- **现象**: 文生图接口报错 `Request failed with status code 400`，日志显示 403 `current user api does not support synchronous calls`
- **根因分析**:
  1. **阿里云废弃同步 API** - 当前账户层级要求使用异步 API（`X-DashScope-Async: enable`），原代码使用同步调用
  2. **模型降级不及时** - `generateImageWithTongyi` 硬编码 `wanx-v1`，失败后直接抛出，没有尝试备用模型
  3. **尺寸不匹配** - 默认 1080×1920 不在 `wanx-v1` 支持的尺寸列表内（仅支持 `1024*1024`, `720*1280`, `1280*720`, `768*1152`）
  4. **火山引擎和 OpenAI key 未配置** - `volcengine_api_key` 和 `openai_api_key` 为空，降级链跳过
  5. **CogView-4 也返回 400** - 智谱模型不可用
- **文件**: `backend/src/utils/ai-service.util.ts`
- **修改**:
  1. **异步 API 支持**: 添加 `X-DashScope-Async: enable` header + 轮询机制（同视频生成模式）
  2. **数据库驱动的模型列表**: 通过 `getActiveModels('image')` 从 DB 加载阿里云图片模型（`wanx-v1`, `wanx2.1-t2i-turbo`, `wanx2.1-t2i-plus`）并按优先级尝试
  3. **智能尺寸映射**: 按宽高比选择最接近的支持尺寸
  4. **403 继续尝试**: 对任何 403 错误继续尝试下一个模型而非直接抛出
- **数据库变更**: 新增两条图片模型记录

  | id | model_id | provider | capability | priority |
  |---|----------|----------|-----------|----------|
  | 65 | wanx2.1-t2i-turbo | aliyun | image | 2 |
  | 66 | wanx2.1-t2i-plus | aliyun | image | 3 |

#### 阿里云欠费问题 ✅
- 阿里云百炼账号已充值
- **但需注意**: 支付宝充值后需在[阿里云百炼控制台](https://bailian.console.aliyun.com/) → 模型广场 → 找到对应模型 → 关闭「仅使用免费额度」开关，否则仍返回 403

#### 生成历史删除功能 ✅ 已添加
- **后端**: 新增 `DELETE /api/generate/tasks/:id` 端点
  - 验证任务归属（user_id）
  - 删除关联 `task_events` 记录
  - 删除关联 `media_files` 记录
  - 解析 `output_data` 中的文件路径，物理删除 `output/` 目录下的文件
  - 最后删除任务本身
- **前端**: 操作列新增红色「删除」按钮
  - `Modal.confirm` 弹框，标题「确认删除」，内容「删除后数据无法恢复！」
  - 确认/取消按钮
  - 删除成功后自动刷新列表
- **文件**: `backend/src/modules/generate/generate.controller.ts`, `generate.service.ts`, `frontend/src/pages/Generate/index.tsx`

#### Generate 页面生成历史视频播放修复 ✅
- 视频结果列从纯图标改为内联 `<video>` 播放器（160x90），可直接播放
- 播放按钮浮动居中，点击可进入全屏预览 Modal
- 视频/图片 URL 补全了 `http://localhost:3000` 前缀（`getUrl()` 函数）

#### 生成历史自动轮询 ✅
- 当历史列表中存在 `pending`/`processing` 状态的任务时，每 5 秒自动刷新
- 用户提交生成后无需手动刷新，状态会自动从"排队中"→"生成中"→"已完成"更新

#### 后端时长过滤逻辑修复 ✅
- **问题**: 模型按用户请求时长（如 12s）预先过滤，不支持的模型被跳过，但自适应调整逻辑在过滤之后才运行，导致某些模型被错误跳过，最终降级到 T2V 短时长模型
- **修复**: 移除预先时长过滤，完全依赖循环内的自适应调整（自动裁剪时长到模型支持范围）

#### Controller DTO 补充 ✅
- `image-to-video` 接口补充了 `media` 字段声明，与前端发送的数据结构对齐

#### Bug F - wan2.6-r2v 模型 API 参数格式错误 ✅ 已修复
- **现象**: wan2.6-r2v 和 wan2.6-r2v-flash 模型报错 `please provide reference_video_urls or reference_urls`
- **原因**: wan2.6 系列模型使用的 API 参数格式与其他版本不同
- **模型参数格式对照**:

| 模型版本 | R2V 参数格式 | I2V 参数格式 |
|---------|-------------|-------------|
| wan2.0-2.2 | `img_urls` | `img_url` |
| **wan2.6** | **`reference_urls`** | **`reference_url`** |
| wan2.5, wan2.7+ | `media` | `media` |

- **文件**: `backend/src/utils/ai-service.util.ts`
- **修改**:
  - I2V 模式添加 wan2.6 特殊处理：使用 `reference_url` 格式
  - R2V 模式添加 wan2.6 特殊处理：使用 `reference_urls` 格式
  - 正则匹配：`/wan2\.6/.test(model)`

#### Bug G - AI 智能规划按钮状态不响应 ✅ 已修复
- **现象**: 输入文字后，「✨ AI 智能规划」按钮需要重新添加图片才能点击
- **原因**: 使用 `form.getFieldValue('prompt')` 获取值不是响应式的，React 不会自动更新组件
- **文件**: `frontend/src/pages/Generate/index.tsx`
- **修改**:
  - 使用 `Form.useWatch('prompt', form)` 让 prompt 值变成响应式
  - 为三个表单分别添加 watch 变量：`promptTextToImage`、`promptTextToVideo`、`promptImageToVideo`
  - 将响应式变量传递给 `PromptPresets` 组件

#### 视频生成轮询速度优化 ✅ 已完成
- **问题**: 视频生成轮询使用固定 5 秒间隔，用户等待时间过长
- **文件**: `backend/src/utils/ai-service.util.ts`
- **优化**: 将所有模型的轮询间隔改为**动态间隔策略**
  - 前 15 次轮询（约 30 秒内）使用 2 秒间隔
  - 之后使用 5 秒间隔
- **优化范围**:
  - 通义万相（主模型）轮询
  - I2V 降级轮询
  - T2V 降级轮询
  - Seedance 轮询
  - CogVideoX 轮询
  - Runway 轮询
- **预计提升**: 平均等待时间减少 3-5 秒，整体响应速度提升 30-50%

#### Bug D - 智能描述功能多模态模型 400 错误 ✅ 已修复
- **现象**: 点击「根据图片生成描述」报错 `Vision LLM call failed: Request failed with status code 400`
- **根因分析**:
  1. **图片下载失败后降级使用原始 URL** - 原代码在图片下载失败时会降级使用原始 URL（如 `http://localhost:3000/...`），但阿里云服务器无法访问 localhost 或内网 URL
  2. **缺少图片格式验证** - 没有检查 base64 图片是否有效（太小的图片可能是损坏的）
  3. **本地文件路径处理不完善** - 没有正确处理 `/static/xxx` 格式的路径
- **验证过程**:
  - 使用测试脚本直接调用阿里云多模态 API，确认 API 格式正确可用
  - 测试结果: `qwen-vl-max` 模型成功返回图片描述
  - 错误信息: `The image length and width do not meet the model restrictions`（测试用的 1x1 图片太小）
- **修复方案** (`backend/src/utils/ai-service.util.ts`):
  1. **移除降级 URL 逻辑** - 图片下载失败时不再降级使用原始 URL，因为阿里云无法访问内网
  2. **添加 base64 有效性检查** - 检查 base64 长度，小于 100 字符视为无效
  3. **改进本地文件处理** - 支持 `/static/xxx` 格式转换为实际路径
  4. **添加详细日志** - 记录图片下载成功/失败的详细信息
  5. **部分成功支持** - 允许部分图片成功、部分失败，而不是全部失败
  6. **更好的错误信息** - 当所有图片都失败时给出清晰的错误提示
- **降级方案**: 纯文本模型生成通用描述（已实现）

### ✅ 已完成测试验证
- **百度百科搜索** (✅ 通过): axios 403 → Playwright 无头浏览器降级正常，成功抓取百度百科 400 字，基于真实资料生成 prompt
- **T2I 智能规划** (✅ 通过): 输入"鸣潮角色爱弥斯"，LLM 基于百科资料生成详细角色视觉描述，效果完整可用
- **多视角生成** (✅ 通过): 生成历史多图展示+视角标签正常
- **模型列移除** (✅ 已完成): 生成历史表头去掉「模型」列

### ⏭️ 明天开发计划

#### 新功能：爆款视频复刻中心（页面暂命名：热门创作 / Viral Studio）
- **定位**: 与工作台、AI生成、短剧工作室、大资产库同级的新页面
- **功能**: 参考抖音爆款AI视频的格式/风格/节奏，替换用户自己的内容（产品/品牌/文案）后生成相似效果的AI视频
- **场景**: 如"肯德基新套餐AI广告"——参考爆款广告结构，替换为用户的套餐信息
- **完整开发方案**: 详见 `后续开发清单.md` 中的独立章节

---

## 2026-07-28

### 服务状态

| 服务 | PID | 端口 | 状态 |
|------|-----|------|------|
| 后端（NestJS） | — | 3000 | ⚠️ 待重启 |
| 前端（Vite） | — | 5173 | ✅ 运行中 |
| 管理后台（Vite） | — | 5174 | ✅ 运行中 |
| Redis | — | 6379 | ✅ 运行中 |
| MySQL | — | 3306 | ✅ 运行中 |

### 今日完成功能

#### Generate 页面大资产库多选功能 ✅ 已完成
- **功能**: 图片生视频页面支持多选图片（上限9张）
- **文件**: `frontend/src/pages/Generate/index.tsx`
- **修改**:
  - 支持点击选择/取消选择图片
  - 显示已选数量：`0/9张图片`
  - 已选图片带删除按钮可单独移除
  - 支持「清空」按钮一键清除

#### 移除模型选择栏 ✅ 已完成
- **功能**: 三种生成模式自动分配对应模型
- **文件**: `frontend/src/pages/Generate/index.tsx`, `backend/src/utils/ai-service.util.ts`, `backend/src/modules/generate/generate.service.ts`
- **修改**:
  - 文字生图片 → 自动选择图片生成模型
  - 文字生视频 → 自动选择 T2V 模型
  - 图片生视频 → 自动选择 I2V（单图）或 R2V（多图）模型
- **数据库更新**: 为 video 模型添加 `sub_capability` 字段（i2v/t2v/r2v/videoedit）

#### 按功能类型分配不同模型 ✅ 已完成
- **功能**: 三种功能使用独立模型列表，节省 tokens
- **I2V 模型列表** (按优先级):
  1. wan2.7-i2v-2026-04-25
  2. wan2.5-i2v-preview
  3. wan2.2-i2v-plus
  4. wanx2.1-i2v-plus
- **T2V 模型列表** (按优先级):
  1. wan2.7-t2v
  2. wanx2.1-t2v-turbo
  3. wanx2.1-t2v-plus
  4. wan2.7-t2v-2026-06-12
  5. wan2.5-t2v-preview
  6. wan2.6-t2v
- **R2V 模型**: happyhorse-1.1-r2v（已激活）

#### 备用模型降级策略 ✅ 已完成
- 每种功能类型配置多个模型（按优先级排序）
- 首选模型失败自动尝试下一个
- 示例：I2V 依次尝试 4 个模型

#### 智能描述功能（框架搭建完成）⚠️ 待测试
- **功能**: 参考上传图片，AI 自动生成视频描述
- **按钮位置**: 图片生视频页面，「💡 快速模板」旁边的「🤖 根据图片生成描述」按钮
- **文件**: `backend/src/utils/ai-service.util.ts`, `backend/src/modules/generate/generate.service.ts`, `backend/src/modules/generate/generate.controller.ts`, `frontend/src/pages/Generate/index.tsx`
- **已实现**:
  - 后端 `generateSmartDescription()` 方法
  - 支持多模态 LLM：阿里云 Qwen-VL、火山引擎 Doubao-VL、智谱 glm-4v、GPT-4o
  - 支持 7+ 个阿里云视觉模型降级
  - 纯文本模型降级兜底方案
  - API 路由：`POST /api/generate/smart-describe`

### ⚠️ 未解决问题（需明天继续）

#### Bug D - 智能描述功能多模态模型 400 错误 ❌ 未解决
- **现象**: 点击「根据图片生成描述」报错 `Vision LLM call failed: Request failed with status code 400`
- **已尝试的阿里云视觉模型**:
  1. `qwen3.5-omni-plus-2026-03-15` - 400 错误
  2. `qwen3-omni-flash-realtime-2025-09-15` - 400 错误
  3. `qwen3-omni-flash-realtime` - 400 错误
  4. `qwen3-vl-plus` - 400 错误
  5. `qwen-vl-max` - 400 错误
  6. `qwen-vl-plus` - 400 错误
  7. `qwen3-vl-flash` - 400 错误
- **可能原因**:
  1. 模型 API 参数格式问题（messages 结构或 content 格式）
  2. 图片 URL 格式不正确（需要公网可访问的 URL）
  3. 阿里云账户权限或配额问题
  4. 模型名称/版本不正确
- **代码位置**: `backend/src/utils/ai-service.util.ts` 的 `chatWithVision()` 方法
- **降级方案**: 纯文本模型生成通用描述（已实现但未测试）
- **待解决**:
  - 检查实际发送的请求体格式
  - 使用 curl 直接测试单个模型 API
  - 参考阿里云官方文档对比请求格式
  - 可能需要使用 DashScope SDK 而非 HTTP API
  - 检查图片是否为公网可访问 URL（本地/内网 URL 可能无法访问）

#### Bug E - 前端白屏问题（已修复但需验证） ✅ 已修复
- **问题**: `SparklesOutlined` 图标不存在导致页面白屏
- **修复**: 替换为 `BulbOutlined`
- **状态**: 代码已修改，需重启前端验证

### 明天验证步骤

1. **重启后端**: `cd backend && npm run start:dev`
2. **重启前端**: `cd frontend && npx vite`（清除缓存：`--force`）
3. **测试智能描述功能**:
   - 选择图片 → 点击「🤖 根据图片生成描述」
   - 查看后端日志，确认使用哪个模型
   - 如果多模态失败，检查是否降级到纯文本
4. **修复多模态 400 错误**:
   - 查看后端日志的详细错误信息
   - 用 curl 测试单个模型 API
   - 对比阿里云官方示例调整请求格式
   - 检查图片 URL 是否可访问
5. **验证图片生视频完整流程**:
   - 选择多张图片 → 生成视频
   - 确认使用正确的模型类型（I2V vs R2V）
   - 确认视频生成质量

### 关键文件清单

| 文件 | 修改内容 |
|------|---------|
| `backend/src/utils/ai-service.util.ts` | generateSmartDescription、chatWithVision、generateDescriptionFromText |
| `backend/src/utils/ai-service.util.ts` | getTongyiVideoModels 支持 videoType 参数 |
| `backend/src/modules/generate/generate.service.ts` | smartDescribe 方法、imageToVideo 支持 media |
| `backend/src/modules/generate/generate.controller.ts` | smart-describe 路由 |
| `frontend/src/pages/Generate/index.tsx` | 多选支持、移除模型选择、智能描述按钮 |
| 数据库 `model_configs` | 更新 sub_capability、激活 R2V 模型 |

### 备注
- 智能描述功能已实现完整的降级链路：多模态模型 → 纯文本模型 → 默认描述
- 即使多模态模型不可用，用户也不会完全无法使用该功能
- 需要重点排查图片 URL 格式问题（本地 URL vs 公网 URL）

---

## 2026-07-27

### 服务状态

| 服务 | PID | 端口 | 状态 |
|------|-----|------|------|
| 后端（NestJS） | 19728 | 3000 | ✅ 运行中 |
| 前端（Vite） | 10080 | 5173 | ✅ 运行中 |
| 管理后台（Vite） | — | 5174 | ✅ 运行中 |
| Redis | — | 6379 | ✅ 运行中 |
| MySQL | — | 3306 | ✅ 运行中 |

### 今日修复内容

#### 功能优化 - 视频封面显示 ✅ 已修复
- **问题**: 大资产库的视频卡片没有显示封面，只能显示占位图标
- **文件**: `frontend/src/pages/Drama/GlobalAssets.tsx`
- **修改**: 
  - 将 `preload` 从 `metadata` 改为 `auto`
  - 添加固定容器高度和背景色
  - 添加 `onLoadedData` 事件设置 `currentTime = 0.1` 确保第一帧渲染
  - 空状态使用渐变背景和图标

#### 模型切换 ✅ 已完成
- **问题**: wan2.6-i2v 额度用尽，需要切换到其他可用模型
- **数据库更新**: 
  - 将 wan2.6-i2v (id=52) 的 status 改为 inactive
  - 调整模型优先级：wan2.7-i2v → wan2.7-r2v → wan2.7-i2v-2026-04-25 → ...
- **文件**: `backend/src/utils/ai-service.util.ts`
- **修改**: 更新 fallback 模型列表，移除 wan2.6 系列，优先使用 wan2.7

#### 视频比例处理优化 ✅ 已修复
- **问题**: 之前使用"添加黑边"方式改变比例，实际内容比例未变
- **文件**: `backend/src/utils/ffmpeg.util.ts`
- **修改**: 使用 `crop` 裁剪滤镜代替 `pad` 填充，真正改变视频内容比例

#### 自适应参数调整 ✅ 已添加
- **问题**: 不同模型支持不同的时长/范围/分辨率，之前参数不匹配直接跳过
- **文件**: `backend/src/utils/ai-service.util.ts`
- **新增功能**:
  - 自动调整时长到模型支持范围
  - 自动调整比例到模型支持范围（优先16:9）
  - 自动调整分辨率到模型支持范围

#### 修复 wanx2.1-i2v-plus 模型参数 ❌ 未完全解决
- **问题**: 模型报错 `img_url must be set for image to video method`
- **文件**: `backend/src/utils/ai-service.util.ts` (行592-611)
- **修改**: 
  - 将判断条件从 `/wan2\.[0-6]/` 改为 `/wan2\.[0-6]/` + `model.startsWith('wanx')`
  - R2V 模型也相应添加 `wanx` 支持
- **日志证据**:
  ```
  2026-07-27 18:59:43 - wanx2.1-i2v-plus 提交成功
  2026-07-27 18:59:48 - 报错: img_url must be set for image to video
  2026-07-27 18:59:48 - 回退到 wanx2.1-t2v-plus (只能生成5秒)
  ```

### ⚠️ 未解决问题（需明天继续）

#### Bug A - 视频只能生成5秒 ❌ 未解决
- **现象**: 设置12秒，但最终只能生成5秒
- **根因分析**:
  1. 用户设置 12 秒 → 正确传递给系统
  2. 依次尝试 wan2.7-r2v、happyhorse 系列 → 失败（账户/配额问题）
  3. 尝试 wanx2.1-i2v-plus → 之前因 img_url 问题失败（已修复但未验证）
  4. 回退到 wanx2.1-t2v-plus → 只能生成 5 秒（min=5, max=5）
- **待验证**: 修复 img_url 后，wanx2.1-i2v-plus 是否能正常生成12秒视频
- **数据库模型配置**:
  ```
  wanx2.1-t2v-plus: min=5, max=5 (只能生成5秒!)
  wanx2.1-i2v-plus: min=5, max=15 (支持5-15秒)
  wan2.7-i2v: min=5, max=15 (支持5-15秒)
  wan2.7-r2v: min=5, max=15 (支持5-15秒)
  ```

#### Bug B - 视频未应用小资产库的资产 ❌ 未解决
- **现象**: 生成的视频没有使用项目小资产库中的人物、场景等资产
- **代码流程** (drama.service.ts):
  1. 从数据库读取 `character_refs`、`scene_refs`、`prop_refs`
  2. 如果 refs 为空，尝试从 prompt 中自动检测
  3. 根据名称查找资产，获取 `image_url`
  4. 构建 `media` 数组传给 AI
  5. 构建 `enhancedPrompt` 包含资产描述
- **需要检查**:
  - refs 是否正确保存到数据库
  - 自动检测逻辑是否生效
  - media 数组是否正确传递给模型
  - 模型参数格式是否正确（img_url vs media）

#### Bug C - wanx2.1-i2v-plus 新问题 ❌ 需调查
- **最新日志错误**: `img_url must be set for image to video method`
- **可能原因**: 
  - 图片 URL 转换为 base64 时出错
  - 模型 API 参数格式有变化
  - 需要检查实际发送的请求体

#### Dashboard 统计卡片优化 ✅ 已修改
- **问题**: 「角色/场景资产」卡与「短剧项目」重复跳转 `/drama`；「片段总数」卡无跳转
- **文件**: `frontend/src/pages/Home/index.tsx`
- **后端**: `backend/src/modules/workbench/workbench.service.ts` — 新增 `totalGenerations` 字段
- **修改**:
  1. #2 卡: **角色/场景资产** → **AI 生成**（值=总生成次数，跳转 `/generate`）
  2. #4 卡: **片段总数** → **可用算力** → **热门创作**（值=0，跳转 `/viral`，占位卡片，页面尚未开发）
- **备注**: 爆款视频复刻中心页面开发完成后，需更新此卡片的值（从数据库读取模板/项目数）和路由

---

## 关键文件清单

| 文件 | 修改内容 |
|------|---------|
| `backend/src/utils/ai-service.util.ts` | 自适应参数调整、img_url修复、模型列表更新、文生图异步API修复、尺寸映射 |
| `backend/src/utils/ffmpeg.util.ts` | 视频裁剪代替填充 |
| `backend/src/modules/drama/drama.service.ts` | - |
| `frontend/src/pages/Drama/GlobalAssets.tsx` | 视频封面显示 |
| `frontend/src/pages/Drama/EpisodeDetail.tsx` | 视频显示优化 |
| `frontend/src/pages/Generate/index.tsx` | 视频播放、轮询、智能规划按钮响应式 |
| 数据库 `model_configs` | 更新 wan2.6-i2v 状态、调整优先级、新增文生图备用模型 |

## 2026-07-24

### Bug 3 — 视频不用资产库，总是用男主背景 ✅ 已修复

#### 3-① textPrompt 覆盖增强提示词
- **文件**: `backend/src/modules/drama/drama.service.ts`
- **行号**: 660
- **改前**: `generateVideo(vidOptions, segment.prompt)` — `segment.prompt` 作为 `textPrompt` 覆盖了 `vidOptions.prompt`（`enhancedPrompt`）
- **改后**: `generateVideo(vidOptions, enhancedPrompt)` — 传增强提示词，携带资产上下文

#### 3-② I2V 只取第一张参考图
- **文件**: `backend/src/utils/ai-service.util.ts`
- **行号**: 542-544
- **改前**: `allItems[0].url` 只取第一张
- **改后**: 通过 3-④ 多图时走 R2V，R2V 正确处理 `allItems.map(...)`，I2V 仅作为单图 fallback

#### 3-③ 媒体数组角色在前
- **文件**: `backend/src/modules/drama/drama.service.ts`
- **行号**: 587
- **改前**: `[...charNames, ...sceneNames, ...propNames]` — 角色排最前
- **改后**: `[...sceneNames, ...charNames, ...propNames]` — 场景图在前

#### 3-④ 多图时 R2V 优先于 I2V
- **文件**: `backend/src/utils/ai-service.util.ts`
- **行号**: 503-508
- **改前**: I2V → R2V → T2V
- **改后**: `media.length > 1` 时 R2V → I2V → T2V；单图时保持 I2V → R2V → T2V

### Bug 2 — 配音英文 ✅ 已修复

- **文件**: `backend/src/modules/drama/drama.service.ts`
- **行号**: 671
- **改前**: `audio_lang='none'` 走了 else 分支用英文 prompt
- **改后**: `if (audioLang === 'none') audioLang = 'zh'` 映射为中文

### Bug 1 — 比例不生效 ⏳ 待验证

- 代码链路正常，分集 54/55/56 的 DB `ratio=null` 需用户在前端设置保存一次
- 前端 `Episodes.tsx` 和 `EpisodeDetail.tsx` 的 `saveSettings` 均正确发送 `ratio` 字段
