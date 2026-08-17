# 修复日志

## 2026-08-17（剪辑页播放器升级：时间线顺序连播 + 文字叠加预览 ✅ 本地 17/17 全绿，待 git 提交）

> 承接视频剪辑页（上节）。用户功能测试反馈「预览区播放体验」：旧实现只播「当前选中片段」单段，未选中时 fallback 第一个素材；预期剪映式行为——**按时间线顺序连播（跨片段自动切换）+ 文字轨实时叠加预览**。本轮在 EditorPage.tsx 重写播放器：

### ✅ 新增能力（EditorPage.tsx，架构重构）
- **时间线顺序播放器**：`playableSegs`（video 轨按 start 排序的可播片段）+ `boundSegRef`（当前绑定到 `<video>` 的片段）——播放时按全局播放头定位起始段 → **段尾自动切换下一视频段**（src 切换 + loadedmetadata 后跳转 trimIn）；图片段/空隙自动跳过（advanceToNext 按「段尾 > 当前位置」找下一段）；全部播完自动暂停
- **起播语义**：未选中片段 = 从播放头位置起播；选中片段 = 从该片段 start 起播（预览即该片段局部）；播放中拖动时间线片段/删除片段用**最新 timeline 数据解析绑定段**（boundId → playableSegs.find），不会播旧数据
- **seek 定位**：标尺/播放头 seek 到任意 t → 预加载并跳到对应片段的局部时间（trimIn 校准）
- **文字叠加预览**：预览模式（未渲染）下 `timeline.text` 在 `[start, start+duration)` 区间内于预览区按 x%/y%/fontSize（按 300px 预览高 × fontSize/1280 换算）/color/opacity 渲染，黑框落影保证可读；**渲染成片后由成片直接呈现文字**（overlay 自动隐藏）
- **渲染成片播放**：结束判定改 `v.currentTime >= v.duration - 0.12`（原 totalDur 比成片时长长会永不停止）；playerSrc/playerCanPlay 链不变（成片 > 选中段 > fallback 视频段）

### ✅ 实测（Playwright，17/17 全绿）
- API 5/5：注册/上传 A/B 两视频/建项目/存时间线（timeline 必须 JSON.stringify——dto.timeline 是 string）
- UI 12/12：播放按钮 enabled / **t 2.4s 真实播放推进** / **文字 overlay 渲染 count=1** / 段 A 起播 src 正确 / **t≈5s 自动切段 B src 生效** / 播完自动停（pause 图标消失）/ 导出渲染 completed / 下载成片 `<a>` 出现 / 成片播放 t>0 / 0 JS errors
- 测试用户/项目/上传文件/渲染产物全清（editor_projects=0、users 0、output 0）

### ⚠️ 本轮血泪（测试脚本）
1. **双击两个不同播放按钮 = 暂停**：底部「播放」文本按钮（onTogglePlay）与预览区圆形按钮（setPlaying 双绑）——脚本先点文本按钮再点圆形按钮 = 播→停。播放类测试只点一个按钮；抓元素用 `div[style*="translateX(-50%)"] button`（预览区底部 overlay 圆形按钮，播放中显示 pause 图标）
2. **editor dto.timeline 是 string**（create/update 传 JSON.stringify 后的时间线，非对象）；DELETE 项目受外键约束要先删项目再删用户（editor_projects.user_id → users.id）
3. 头像验证码改为 `require('redis').createClient({url:'redis://127.0.0.1:6379/0'})` 读（本地 redis-cli 不在 PATH；本地后端无 REDIS_DB 配置连 db 0——老经验重申）

## 2026-08-17（视频剪辑页（剪映风时间线编辑器）全新模块 ✅ 本地全链路验证通过，待 git 提交）

> 用户需求：新增「视频剪辑」页面——多轨时间线编辑器（视频/音频/文字三轨），素材来源复用画布编辑器 4 来源 + 音频上传，拖拽移动/右侧 resize/标尺 seek/分割/删除/属性面板，渲染复用 canvas 管线。范围已确认：**P0-MVP、总长 ≤60s、素材 ≤20、免费、仅 PC 端**。

### ✅ 后端（新模块 `backend/src/modules/editor/`）
- **数据模型**：`editor_projects` 表（name/ratio/resolution/timeline(text 列存时间线 JSON)/status/progress/result_url/error_msg）；时间线 JSON = `{duration, video:[{id,url,start,duration,trimIn,filter,nextTransition}], audio:[{id,url,start,duration,volume,fadeIn,fadeOut}], text:[{id,text,start,duration,x,y,fontSize,color,opacity,animation}]}`
- **API**：`/api/editor/projects` CRUD + `:id/render` + `:id/export` + `POST /api/editor/upload`（multer 白名单扩展音频 mp3/wav/m4a/flac/aac/ogg，≤300MB，服务端文件名）
- **校验**（validateTimeline，allowEmpty 参数控制）：总长 ≤60s（EDITOR_MAX_TOTAL_SECONDS）、素材 ≤20（EDITOR_MAX_ITEMS）、片段时长 1~60s、音频 0.5~70s、URL 仅 `/static/` 或 http(s)、滤镜/转场白名单、转场时长 0.2~1.5s；**创建空项目允许空时间线**（草稿），渲染前严格校验
- **渲染**（doRender）：timeline→workflow JSON（video 按 start 排序；图片 URL 判 image 节点；filter→effect 滤镜节点；转场 effect **插在两段之间**；text/audio→output 边）→ 调 **canvas 新增公共入口 `renderWorkflowJson`**（canvas.service.ts 参数化：workDirPrefix/finalPrefix/maxClipSeconds，默认值保持 canvas 行为零变化）；trimIn>0 时预裁剪到 `/static/` 临时文件（仅本地文件，外链跳过并 warn）；输出 `output/editor_result_{id}_{ts}.mp4`
- **canvas.service.ts 变更**：`clampDuration` 加 max 参数；renderWorkflow 加 `finalPrefix='canvas_result'`、`maxClipSeconds=15` 参数；新增 `public renderWorkflowJson(payload)`（含 refId/ratio/resolution/bgmUrl/nodes/workDirPrefix/finalPrefix/maxClipSeconds/onUpdate）
- **Bug 修复（转场丢失）**：转换循环读 `v.nextTransition` 改为读 **`videos[i-1].nextTransition`**（语义=「本段与下一段的转场」挂在当前段）——修复前转场全丢（8.0s=4+4 无重叠），修复后 7.50s 精确（4+4−0.5）

### ✅ 前端（新页面 `frontend/src/pages/Editor/`）
- `types.ts`（TimelineDoc/常量/helpers）、`components/Timeline.tsx`（三轨 52px 高/标尺 tick+播放头/拖拽移动/resize 手柄/标尺 seek/底部栏：播放头显示+分割+删除选中+缩放 slider 10~100px/秒）、`components/PropsPanel.tsx`（按轨类型编辑 + 删除）、`EditorPage.tsx`（素材面板 4 Tab + 音频 Tab + 上传 Dragger、播放器联动播放头、2s 防抖自动保存、分割逻辑含 trimIn 继承、渲染轮询 2.5s）、`index.tsx`（列表页）
- 路由 `/editor`、`/editor/:id`（App.tsx）；导航「剪辑」（AppHeader，画布之后）
- **Bug 修复（resize 手柄失效）**：Timeline.tsx 右手柄 div 的 onMouseDown 原来只 onSelect+stopPropagation → **补 `startDrag('resize', track, item.id, e, item)`**（手柄 10px 区域拖不动）
- 渲染完成显示「下载成片」（antd Button href → 渲染为 `<a>` 标签）

### ✅ 本地验证（全绿）
- **后端 e2e 13/13**（注册 token/建项目/存时间线/60s 超限 400「视频总长度不能超过 60 秒（当前 75.0 秒）」/恢复/渲染 completed/result 文件存在/列表/删除）
- **质量 4/4**（ffprobe：720×1280 / 转场修复后 7.50s 精确匹配 4+4−0.5 / aac 音轨 / 滤镜灰阶）
- **前端 UI 12/12**（注册→登录→弹窗关闭→列表→新建→素材库加素材→时间线分段→属性面板→导出渲染→下载成片 `<a>`→无 JS 错误）
- **时间线交互 7/7**（resize +38px 生效 / 标尺 seek 播放头 00:01.9 / 分割出新段 / 删除 / 无 JS 错误）
- 测试用户/项目/输出文件全部清理（editor_projects 0 残留）

### ✅ 自查修复（提交前 code review + 回归，本地全链路重跑全绿）
- **cleanup.service.ts**：引用收集补 `editor_projects.timeline` + `result_url` 两行 UNION（否则用户上传素材 30 天后被当孤儿删）；`TEMP_DIR_PREFIXES` 加 `editor_gen_`（崩溃残留目录回收）
- **NaN 防御（前后端）**：`Number(a.volume) ?? 0.8` 在字段缺失时是 **NaN**（`??` 不拦截 NaN）→ ffmpeg volume=NaN 音轨静默失败 → 统一 `numOr()` 兜底（volume/x/y/opacity/fontSize）
- **Timeline.tsx**：轨道渲染改按 `start` 排序——分割后数组顺序错乱（[A,B,C]→[A,C,B1,B2]）UI 重叠错位；顺带轨道空白点击清空选中
- **EditorPage.tsx**：autosave 竞态防护（persistRef 防首次创建重复项目）；选中图片素材时预览区渲染 `<img>`（原来 `<video src=.jpg>` 黑屏）
- 回归：后端 e2e 13/13、质量 4/4、UI 12/12、交互 7/7 全绿；测试用户/项目/输出全清；cleanup SQL 新分支实测可执行

### ✅ 第二轮修复（用户功能测试反馈 2 项，本地验证全绿）
- **① 点击「播放头」按钮无效果**：真根因 = Timeline 底部「播放头 00:00.0」是纯展示按钮（有播放 icon 但无 onClick）+ **预览区 fallback 取 `timeline.video[0]` 默认选中第一个素材——资产库前 2 个是图片** → 预览区渲染 `<img>`（无 video 元素）→ play() 静默无效。修复：a) 底部按钮改为**真播放/暂停开关**（onTogglePlay，从播放头位置播放，播放中紫色高亮，旁加「▶ t 起」文本展示播放头）；b) playerSrc fallback 改 `timeline.video.find(isVideoUrl)` **跳过图片选第一个视频片段**；c) 图片预览时两个播放按钮 disabled（playerCanPlay 判定）。
- **② 素材库选择栏横向截断**：Segmented block 5 项挤 210px 宽 → 每栏只显示 2-3 字。改 **Radio.Group 竖排 5 个全名按钮**（AI 历史/资产库/热门创作/短剧片段/音频 BGM），选中高亮清晰。
- 验证：修复专项 8/8（竖排标签全名/fallback 选视频/first play falsed=false/暂停/图片选中→img+按钮禁用/0 JS 错误）+ 原 UI 12/12 + 交互 7/7（seek 验证改读标尺 playhead left px ÷ 48px/s）；测试数据全清。
- ⚠️ 教训：预览区定位不要用 `div[style*="rgb(17,17,17)"]`（素材卡片 60px 黑底也匹配、muted=true 干扰）——**用高度 ≥250px 判定预览区**；诊断播放类问题先确认抓的元素是预览区 video。

### ⚠️ 本轮血泪经验（新）
1. **注册接口直接返回 access_token**（无需再登录）；本地后端 Redis 无 REDIS_DB 配置时**连 db 0**（不是 5！本地 .env.local 无 REDIS 配置 → 注入验证码必须写 db 0）
2. **antd Button 带 href 渲染为 `<a>`**（「下载成片」getByRole('button') 永远找不到 → 用 `a:has-text(...)`）
3. **Playwright `text=分段 1` 命中 Text 元素而非 clip div**（clip 有 8px padding，Text box=128 vs clip 144）→ 定位 clip 用 `text=分段 1 → xpath=..`；**双击两个 clip 重叠时上层的 clip 拦截下层的 resize/移动**（拖拽测试要先避免重叠）
4. **标尺 seek 点击 y 坐标**：「视频轨」Text 在 header 内垂直居中（header 高 52），thb.y-30+14 会落在 clip 上 → 用 `cursor:crosshair` 元素定位标尺（该元素是 ruler 容器，getBoundingClientRect 即 ruler 区域）
5. **tests 复用旧用户会 409**：脚本用户名带随机后缀；**同一检测点 `text=分段 N` 匹配多处**（时间线 clip + PropsPanel 标题）
6. 登录后「测试版说明」弹窗拦截点击 → 循环点确认直到 `.ant-modal-wrap:visible` 为 0；Start-Process 必须配 workdir=backend（否则起不来），且不能与 Invoke-WebRequest 同命令（ChildProcess.kill）
7. 查询 SQL 用 `cmd /c "mysql ... < file.sql"`（execFileSync 拼命令行会被 mysql 的 Usage 输出吞掉）

## 2026-08-13（晚间：AI 分析不智能排查→模型升级 + 配音功能升级（旁白/角色台词 + 11 音色）✅ 已提交+已部署+生产验证）

> 承接当日短剧剧本分析。两件事：①用户反馈「AI 分析不智能」→ 全链路排查 + 模型升级（视觉 omni-plus 优先 / 文本 qwen-plus 保速度）；②用户需求「配音内容可选旁白或角色台词 + 多音色」。均已部署生产。

### ① AI 分析不智能排查与模型升级（commit `edc5252`）
- **排查结论**：链路无断链；根因 = **模型偏弱**——视觉分析首选 `qwen3-vl-flash`（省钱方案，看图能力弱），文本固定 `qwen-plus`（无 qwen-max 级）；剧本分析不读用户输入（genre/episodes/style 全被忽略，无风格选项）。
- **剧本分析对接用户输入**（commit `836c3bd`）：Create.tsx 加「风格」选择（anime/realistic 默认 anime）→ analyze() 把 genre/episodes/style 拼入提示词、强制 structure.style=project.target_style、阶段2 追加风格指令 → confirmAnalysis 落 episodes.style + project.target_style；controller create body 加 style。端到端 9/9 全绿。
- **片段重新生成继承项目风格**（commit `fd125f6`），实测 6/6 全绿。
- **模型升级（用户确认额度后决策：方案 B 速度优先）**：
  - **视觉链**（两处：generateSmartDescription/analyzeFrames）：`qwen3.5-omni-plus`（不带日期，满 100 万未用）→ `qwen3.5-omni-plus-2026-03-15`（剩 518,846）→ `qwen3-vl-flash` 兜底。**实测看图 2s 精准**（数据 URI 直测通过；qwen3.5-omni-plus 无日期版 2s 快响应）。
  - **文本链**：`chatCompletion` 改回 **qwen-plus 优先 + GLM-4.5-Air/GLM-4.7-Flash 兜底**；12 集剧本分析 **68s**（与优化前一致，速度达标）。
  - **保留的修复**：① `chatCompletion` 支持 `options.model` 显式指定（批量机械任务可指定快模型，drama 阶段2 显式 `model:'qwen-plus'`，batchSize=3）；② **空 content 抛错触发降级**（GLM 并发限流会返回 200+空 content+finish=length，原来返回 '' 不降级，真 bug 已修）。
- **GLM-4.5-Air 实测教训（已弃用为主链）**：Z.ai 免费档**并发上限≈2**（3 并发必有一个返回空 content）、单请求排队 30-120s → 是「变慢」根因；GLM 测试版 API 不稳定，仅作兜底。
- **视觉测试环境坑**：SSRF 拦截 localhost 图片 URL（不允许访问内网地址）→ 需 data URI；data URI >1.1MB 触发 413（body 限制）→ 先缩放 512px（27KB）可过。

### ② 配音功能升级（commit `9f5cc89`）
- **配音类型可选**：生成页配音区新增「配音类型」：**🎭 角色台词**（第一人称，默认）/ **📢 旁白解说**（第三人称画外音）。`buildVoiceover(prompt, finalPrompt, duration, type)` 按类型写提示词（旁白=禁止第一人称，如「他站在雨里，心却停在了旧电话亭。」；台词=角色口吻，如「啊～这光，挠得我耳朵痒痒的…」）；smart-plan 接口加 `voiceoverType`（前端表单值传入），返回 `voiceover_type` 回显。
- **11 种音色可选**（实测 65 候选筛出 17 可用）：`GET /api/generate/tts-voices` 返回音色库 `cosyvoiceVoiceCatalog`（ai-service.util.ts）——**v2×9**（龙小纯·女/龙婉·女/龙飞·男/龙跃·男/龙叔·男/龙城·男/龙泽·男/龙强·男/龙远·男）+ **v3-plus×2**（龙安阳·男/龙安欢·女）。⚠️ **CosyVoice 音色 ID 必须带模型后缀**（`longxiaochun` 裸名 418，`longxiaochun_v2` 才可用；v3-flash 用 `_v3`）。
- **音色路由与降级**：`resolveCosyVoice` 音色 id → 专属 {model, voiceId}，`generateTTSWithCosyVoice` 优先试专属模型（失败再走降级链+默认男女音色映射）；OpenAI 历史名（nova→女声等）映射兼容。TTS 调用处（t2v/i2v）传 `dto.tts_voice`（默认中文 nova=温柔女声）。前端配音区：类型 Radio + 音色 Select（接口拉取）+ 配音内容 TextArea（placeholder 提示智能规划自动生成）。
- **本地验证 4/4**：tts-voices 11 音色 / 旁白规划（第三人称）/ 台词规划（第一人称）/ T2V 配音 completed + 日志 `voice=longze_v2` 精确命中。
- **生产部署**：前端 `index-BFUAybzC.js` + `Generate-DpSrVnsv.js`（hash 与本地一致）+ 后端 dist；pm2 online。
- **生产验证 5/5 全绿**：11 音色 / 旁白「他站在雨里，心却停在了旧电话亭。」/ 台词「啊～这光，挠得我耳朵痒痒的…」/ T2V 配音任务 completed / longze_v2 命中日志。测试用户 38/39、任务 25/26、deploy 脚本与产物全清（output 28 文件 70M 正常）。
- ⚠️ **部署脚本教训**：pscp 上传**中文文件名会乱码**（`部署脚本.sh` → 服务器上找不到）→ 部署脚本一律用 ASCII 文件名（deploy.sh）；生产验证脚本内 `execSync` 引用**循环内声明的 let 变量会越界**（`list is not defined`）→ 变量提到循环外。
- ⚠️ **git 状态**：本地已提交 4 个 commit（836c3bd/fd125f6/edc5252/9f5cc89 + 文档），**未 push**（用户要求暂缓，git 网络易出错）。
- ⚠️ 已知边界：drama 分集/片段的 TTS 仍是默认音色（未加音色选择，用户未要求）；音色库为实测筛选，若阿里云调整音色需重测。

## 2026-08-13（短剧剧本分析：两阶段分析支持大集数 + 截断渐进解析兜底 ✅ 已提交+本地验证，待部署）

> 承接 08-12 修复的**两个遗留问题**（当时记录：① 大集数 8-24 集需多阶段分析；② `cleanJson` 无截断兜底）。本轮全部实现：
- **① 两阶段分析（支持 6-24 集）**：单次 8192 tokens 装不下大集数 → `analyze()`（drama.service.ts）拆两阶段：
  - **阶段 1（结构分析）**：模板 1 收敛——只输出 title/genre/targetAudience/style/episodeCount（**=项目目标集数**，clamp 6~24，默认 12）/每集 title+summary+duration/全局 assets 清单；`{{outline}}` + `{{episodeCount}}` 两个变量；
  - **阶段 2（分段扩展）**：新增**模板 7「剧本分段扩展模板」**（seed-prompt-templates.sql，id=7，capability=script，变量 `episodeInfo, globalAssets`）——按每批 3 集 **Promise.all 并行**调用，喂入该集信息 + 全局资产清单 → 输出该集 segments（1-2 个，prompt/prompt_cn/characters/props/scenes/duration）；
  - 合并 → 兜底 → validateAnalysis → 保存；扣费仍 5 分/次（整体失败退全款）；接口/前端展示零改动。
- **② 截断渐进解析兜底（parseStructured）**：替换原 `cleanJson` naive 截取（`lastIndexOf('}')` 会误命中**字符串内部大括号**把内容截坏）→ 新 `extractRootObject`（**字符串感知**提取根对象，未闭合返回全文）→ 直接 parse 失败后：正向扫描收集**元素闭合点**（跳过字符串内括号）→ 从最近闭合点往前逐个「截断 + `repairTruncated` 补全未闭合引号/括号」尝试 parse → **丢弃末尾不完整元素、保留前面全部完整数据**（如 12 集截断在第 9 集中间 → 解析出完整 8 集）；仍失败才抛「AI 返回内容无法解析为有效 JSON」。
- **③ 两阶段协调兜底（mergeUnknownAssetRefs）**：阶段 2 LLM 可能引用阶段 1 未定义的资产（实测第 4 集引用「录音笔」未在 assets）→ 自动补入 assets（description/prompt 留空，前端可见可编辑）+ warn 日志。
- **④ 前端**：Create.tsx 集数默认 1 → **12**，上限 24（此前用户不填集数会产出 1 集剧本）。
- **验证**：截断单测 **9/9**（完整 JSON/数组中间截断/字符串中间截断报错/多集截断保留前面/代码块包裹/字符串内大括号/嵌套片段级/垃圾输入/完整数组元素）；真实 LLM 端到端 **8 集 10/10**（64s）+ **12 集 10/10**（50-69s：1 次结构 + 4 批×3 并行；集数/每集片段/资产引用/prompt 双语/confirm 入库全对）；前端 tsc 全绿；测试用户已清。
- **⑤ 输出语言修复（用户反馈：分析结果全英文）**：模板只约束了 prompt=英文、prompt_cn=中文，title/summary/description 等元数据无语言约束 → LLM 默认输出英文。修复（双保险）：模板 1/7 加语言规则「除 prompt 外所有文本字段一律中文，与大纲语言一致」（description 的「中英混合」改「中文」）；后端新增 `sanitizePrompts` 兜底——剥离 prompt 中的中文字符（实测 LLM 会把中文资产描述抄进英文 prompt，如「墨绿帆布包 slipping off shoulder」），剥离后为空回退 prompt_cn。语言验证 e2e **10/10**（title/genre/targetAudience/每集 title+summary/角色/道具/场景 name+description 全中文，prompt 纯英文无 CJK）。
- **⑥ 片段重新生成（用户需求：对剧情不满意时重生成）**：编辑分析结果页每个片段卡片新增「重新生成」按钮 → 后端 `POST /api/drama/:id/regenerate-segment`（body `{episodeNo, segmentNo}`）——复用模板 7，喂入该集信息 + currentSegments + 全局 assets，temperature 0.7 提升多样性，输出 1 个新片段替换（保持 segmentNo/时长兜底）；语言/资产兜底与 analyze 一致（sanitizePrompts + mergeUnknownAssetRefs，新引用资产自动补入 assets 并随 `newAssets` 返回给前端）；**不写库**（编辑页整体保存草稿时入库）。验证 e2e **11/11**（新片段 5.6s/剧情连贯但内容不同/语言正确/保存草稿正常）。
- ⚠️ 已知边界：阶段 1 结构被截断时集数会少于目标（parseStructured 保留前面完整集，日志 warn，前端可编辑）；24 集 = 1 + 8 批 ≈ 9 次 LLM 调用（约 90-120s）；模板 1/7 均在 `backend/seed-prompt-templates.sql`，admin 提示词模板管理页可改。
- **⑦ 候选区「主视频/备选」区分（用户反馈：选候选数 2 却看到 3 个视频，分不清哪个是正式版）**：实为 1 个正式视频 + 2 个候选的正常设计，但无标识造成困惑。优化（commit `913dee6`）：后端 `listSegmentCandidates` 加 `is_main`（`video_url === segment.video_url`，采纳翻转自然跟随）；前端候选卡片区分展示——主视频 = 紫色边框「主视频」tag + 说明「当前正式版本（与片段上方视频内容相同）」，备选 = 「备选 N」tag + 「预览满意后可采纳替换」；主视频卡片**不显示采纳/删除按钮**（采纳替换/移除仅备选可操作）；区块标题改「视频版本」。验证：接口 is_main 初始/采纳后翻转全对；UI 主视频+备选 1 标签正确、采纳按钮仅 1 个、0 JS 错误；测试用户/归属已还原。
- **⑧ 分集片段页三区布局（用户需求：播放器太小，重做页面）**（commit `cf973e2`）：EpisodeDetail.tsx 从「每个片段一卡片（含小视频+候选列表）」改为**三区布局**——① 中间：**大播放器（高 480，视频 contain 自适应，9:16 竖屏 ≈270×480 不再被压扁）** + 片段详情卡（生成/智能规划/编辑提示词/时长/候选数/进度/资产 tag）；② 右侧 340px：**视频版本列表**（主视频/备选 N，点击任意版本即切到中间播放器播放，播放中紫色高亮 + 「播放中」tag；备选保留采纳替换/移除，操作按钮 stopPropagation 防误切换）；③ 下方：**片段横向滚动切换条**（每项 190px 卡片含状态 tag/简介/首帧缩略，点击切换选中并重置播放到该片段主视频）。状态机：`selectedId`（默认首个片段）+ `playingCand`（null=播主视频；采纳/删除/切片段时重置 null）。验证 Playwright：登录→episode 129→切片段2→大播放器 270×480 播主视频 / 版本区主视频+备选1+播放中 / 点备选1 切 7268087 / 点主视频切回 / 0 JS 错误；accept 回写 segment.video_url 实测 26→还原 25 全对。
- **⑨ 片段配音生产修复（用户反馈：生成的视频都没有台词）✅ 已部署+生产验证**：根因 = **生产跑的是 08-12 及更早代码**——`generateTTS`（ai-service.util.ts）只有 OpenAI TTS 分支，而生产 system_configs 只有 `tongyi_api_key`（**CosyVoice 主链是 08-13 commit `38455fc` 才加的，从未部署**）→ `No TTS API key configured` → 返回空音频 → `audioBuf.byteLength > 0` 为假 → 视频无台词、output 无 `seg_*_audio_*.mp4`。修复 = 部署 08-13 全部后端（cosyvoice grep=5）+ 前端（index-Bd8fJj6W.js，含三区布局页），pm2 online。**生产验证**：脚本注册临时用户（Redis db 5 注入验证码）→ SQL 插项目/分集/片段（audio_lang=zh，prompt_cn 中文）→ generate → completed → output 出现 `tts_*.mp3` + `seg_2_audio_*.mp4` → **ffprobe aac 音频轨 ✓ / 时长 5.1s**；用户/项目/脚本全清理（deploy 目录 0 残留）。**用户旧的无台词片段需重新点「生成视频」才会带配音**。CosyVoice 链路：cosyvoice-v2/v3-flash/v3-plus 三级降级（本地实测 3 模型全通，63-87KB 音频），voice 映射 nova→女声其余→男声。
- **⑩ 生产库种子补齐（用户反馈：生产点 AI 分析报「系统未配置剧本分段扩展模板」）✅ 已修复+生产验证**：部署后代码虽新，但**生产 prompt_templates 缺模板 7「剧本分段扩展模板」（08-13 新增，种子只应用过本地）**且模板 1 仍是 08-12 旧版 → analyze 两阶段找模板 7 失败 400。修复 = 把 `backend/seed-prompt-templates.sql` 全量 UPSERT 到生产（模板 1/2/3/4/6 更新 + 新增 7）。**顺带全面核对生产/本地版本差异**：① 代码已一致（后端 cosyvoice grep=5、前端 index-Bd8fJj6W.js）；② system_configs 补齐 `quality_check_enabled=1`/`quality_check_strictness=normal`（本地有生产缺）；③ **生产验证**：注册临时用户 → 建项目（outline 6 集大纲）→ `POST /analyze` → **201 + 完整 JSON（title/episodes+segments/assets 齐全，两阶段跑通）**，outline 表 status=completed；episodes/segments/assets 表 0 行属正常（**analyze 只写 outline，点「确认入库」才落三表**）；测试数据/脚本全清理（deploy 0 残留）。⚠️ **部署后必须核对数据库种子/配置差异，代码同步 ≠ 功能同步**。
- ⚠️ 血泪（重复教训）：PowerShell `Get-Content`/`Set-Content` 会把 UTF-8 中文转码损坏（**复制/修改含中文的 JS 脚本必须用 node 读写 utf8**）；内联 `node -e` 中文/引号必挂 → 一律写脚本文件；重跑 12 集测试时先检查脚本断言里写死的数字。Redis 注入验证码的过期时间格式：后端 `persistCode` 存的是**毫秒**（`code|Date.now()+5min`），注入秒会被 `Number(exp) > Date.now()` 判过期 → 409「验证码错误或已过期」。登录接口 DTO 字段是 `username` 不是 `account`（400「username must be a string」）。**bash 里 `UID` 是只读保留变量**（赋值报 readonly error 且不生效→ SQL 插到 user_id=0 → 接口 404「短剧项目不存在」假象），测试脚本一律用 `USER_ID`。pscp 上传 UTF-8 中文脚本无损（PowerShell 管道才会转码）。

---

## 2026-08-12（短剧「剧本 AI 分析」报『系统未配置剧本分析模板』修复 ✅ 已修复+生产验证）

> 用户反馈：短剧工作室创建项目后点 AI 分析按钮报「系统未配置剧本分析模板」。排查发现**双重根因**，均已修复：
- **根因 1（报错直接来源）**：生产库 `prompt_templates` 表**为空（0 行）**——`drama.service.ts:98-100` 按 `name='剧本分析模板'` 查找模板，找不到即抛该错误。本地库有该表数据但从未种子到生产（无种子 SQL，此前是人工插库）。
- **根因 2（即使有模板也会失败）**：本地库模板内容**已损坏**（1/2/3 号模板 template 列是字面 `?` 乱码，4/6 号完好）；且原模板要求「8-24 集 × 每集 2-6 片段 × prompt+prompt_cn 双语」，**单次 LLM 调用输出上限 8192 tokens（qwen-plus）装不下**——实测 12 集响应在 24855 字符处被截断，JSON 不闭合 → 解析失败「AI 返回内容无法解析为有效 JSON」。
- **修复**：
  1. 重建 5 个模板（1 剧本分析/2 资产生成/3 片段提示词/4 通用/6 剧本拆分），UTF-8 正确内容；**模板 1 加篇幅约束**（6-12 集、每集 1-2 片段、prompt ≤30 英文词、prompt_cn ≤50 汉字、assets 角色≤8/道具≤6/场景≤6、描述精简），保证输出落在 8192 tokens 内。
  2. 本地+生产库均应用（`INSERT ... ON DUPLICATE KEY UPDATE`，id 1/2/3/4/6）；新增仓库种子文件 `backend/seed-prompt-templates.sql`（防再次丢失，admin 的提示词模板管理页也可改）。
  3. 语义说明：按代码惯例 `prompt`=英文提示词（供 AI 模型），`prompt_cn`=中文翻译（供中文模型/TTS）。
- **生产验证**：临时用户注册（Redis 注入验证码）→ 建项目 → `POST /api/drama/:id/analyze` → **201 + 完整结构化 JSON**（8 集「时光骑手」，title/genre/episodes/segments/assets 齐全）✅；测试用户/项目/脚本全清理，deploy 目录 0 残留。
- ⚠️ 遗留：若用户后续要大集数（8-24 集）需改造为**多阶段分析**（先结构后扩展）或换大输出上限模型；`cleanJson` 未加截断渐进解析兜底（需要时可加）。PowerShell 下 mysqldump 输出经管道会转码损坏中文（须 cmd 重定向原始字节或用 HEX 验证）。

---

## 2026-08-11（生成页结果轮播 + 生成历史独立页 + admin 密码对齐 + 服务器清理 ✅ 已提交+已部署+生产验证）

> 承接 08-10 热门创作页改造（b5a278b/04f85c6/4af700e 已提交未记录：左侧锚点导航 + 模板列表页分页搜索分类 + 首页卡片 8 个上限跳转新页面 → 侧栏改视口悬浮 + 「查看全部」按钮统一区块底部 → Hero 深色科技风）。本轮（commit `2e15697`）：
- **后端**：`GET /api/generate/tasks` 支持 `type`/`status` 筛选（listTasks where 动态拼接）；**生成进度上报链**——`updateProgress`（单调递增 + taskRepo.update 防 save 覆盖旧值，完成置 100/失败不置），文生图按视角数分段上报，文生/图生视频把 `onProgress` 透传进 ai-service.util（通义/Seedance/智谱/Runway 四家轮询回调 `30 + min(55, i*2)`，降级链逐级透传），retryTask 重置 progress=0。
- **前端**：
  - 新组件 `HistoryTable.tsx`：类型/状态筛选、分页、重试/保存到资产库/删除/视频全屏预览，`active` prop 有活跃任务时 3s 静默轮询（与生成页同步）；
  - 新页面 `/generate/history`（pageSize=10 + 筛选器 + 分页）；App.tsx 加路由（懒加载）。
  - `Generate/index.tsx` 大改：结果区改**轮播**（左/右圆形箭头 + `x / N` 页码 + 右上关闭移除 + 页脚信息条：类型/状态/视角 tag + prompt 摘要 + 参数摘要 + 保存/全屏/重试/删除）；completed 多图任务按张**逐张展开成多页**；pending/processing/failed/completed 各状态页；进度条（Progress 组件）；轮播背景 `#fafafa` 浅色（用户反馈 #141414 深色下文字不可读）；自绘 Tab 标签行（替代 antd Tabs，key 强制卸载重建表单）；历史区 8 条 + 「查看更多」跳转历史页。
- **Bug 修复**：① 关闭当前页后 currentIdx 越界崩溃 → `closeCurrent` 用 `Math.min(i, resultPages.length - 2)` 回退 + 渲染防御 `resultPages[currentIdx] ? render : null`；② HistoryTable 无自动刷新导致与轮播状态不同步 → active 3s 静默轮询。
- **生产部署**：前端新构建 hash `index-Uq4NQMyM.js`（本地=生产核对一致）+ HistoryTable-DDBcjjYE.js；pm2 online；生产验证 **16/16 全绿 + 0 JS 错误**（tasks 接口筛选×3 / 轮播空态→提交→进度条→完成显示图片→页码 / 历史页筛选后全为图片类型）；测试用户/任务/图片/zip 全清。
- **admin 密码对齐**：本地库 admin 密码 123456 → **admin123**（与生产一致；生产 `/api/auth/login` admin/admin123 实测 200；坑：PowerShell→node -e 传递 `\$2b\$` 哈希会被转义破坏致 compare false → 用 bcryptjs 重新生成哈希写库 + 文件方式读哈希验证）。
- **服务器清理**：deploy 目录历史遗留全清（admin-dist.zip/admin.zip/dist-{frontend,backend,admin}.zip ×5、test-prod-*.sh/js ×3、cleanup-orphans.sh、query-admin.sh、package-backend.json、old-backend-dist 2.6M——dist_bak 备份机制保留无损）。
- **git push**：本地领先 origin 47 提交全量推送 GitHub（lee724130-maker/AI-Anime）。

### ✅ 待办更新（2026-08-11）
- [x] 用户复测生产文生视频（模型列错位修复后）→ **用户 08-11 确认测试无误**
- [x] 用户复测「连点多个生成任务排队」→ **用户 08-11 确认测试无误**
- [x] 生产错误模板「科学悬疑解说模板」排查 → 08-11 查证 **不存在**：viral_templates 仅 1 条「英雄联盟改动解析」（id=1，user_id=16 即用户账号，is_system=0）
- [x] admin 密码 → 08-11 本地已对齐 admin123（生产不变）
- [x] 服务器 deploy 目录遗留清理
- [ ] 用户复测生产抖音链接解析（detail API 直连已部署，**用户自测中**）
- [ ] 用户重新上传视频验证解析结果与内容一致（长视频 6-8 帧，≤5 分钟）
- [ ] 观察：多个长视频（200-300s）并发分析时压缩 CPU 叠加风险（必要时压缩改 ultrafast 或串行化）
- [ ] 源视频再 404：先查磁盘清理软件（cleanup 有引用保护）

---

## 2026-08-07（登录后测试版说明弹窗 ✅ 已提交+已部署+生产验证）

> 用户需求：登录后弹「测试版说明」弹窗（测试状态/支付未开通/赠送 100 积分提示）+ 确认按钮 + 「不再提示」勾选框（勾选后该用户以后每次登录都不再弹）。实现（commit `feat: 登录后测试版说明弹窗（勾选不再提示按用户持久化，不再重复弹出）`）：
- **后端**：users 表加 `test_notice_dismissed` 布尔列（synchronize 自动建列）；新增 `POST /api/user/dismiss-test-notice`（JwtAuthGuard，置 true）；profile 返回该字段。
- **前端**：新组件 `TestNoticeModal.tsx` 挂 App.tsx 全局（Routes 外）——有 token 时检查：sessionStorage `tn_shown_{uid}`（本次登录已弹过？）→ localStorage `tn_dismissed_{uid}`（永久不再提示？）→ 调 profile 确认后端字段 → 弹出。footer 自定义：左侧「不再提示」Checkbox + 右侧「确认」按钮。确认时若勾选 → 调 dismiss 接口 + 写 localStorage（接口失败不阻断关闭）；未勾选 → 仅本次登录不再弹（sessionStorage）。`authStore.logout` 清**所有** `tn_shown_*`（会话内多账号切换时旧账号标记残留导致重登不弹的 bug）。
- **文案**（用户口述 + 优化）：「感谢您体验 AI 短剧创作平台！目前该网站还处于测试状态，支付功能暂时未开通，注册即可获赠 100 积分。您可以先使用积分体验文生图、文生视频、热门创作解析、短剧生成等全部功能；正式版上线后将开放充值渠道，届时积分不足也能随时补充。」
- **本地验证**：后端接口 4/4（profile false→dismiss→true / 无 token 401）；UI 5/5（登录弹窗+文案+勾选框+确认按钮 / 确认后刷新不弹 / 第二新用户仍弹 / 勾选后重登不弹 / 未勾选用户下次登录仍弹）+ JS errors 0。
- **生产验证**：注册→登录→弹窗文案完整→勾选确认→重登不弹 4/4 全绿，JS errors 0；测试用户已清理。前端新构建 index-apjKzkKG.js。
- ⚠️ 测试脚本血泪（三连坑）：
  1. **antd v6 两字按钮自动加空格**：「注册」渲染为「注 册」→ `has-text("注册")` 找不到（CSS :has-text 子串不跨空格）→ 用 `getByRole('button', { name: /注\s*册/ })`（JS 正则，不经 CSS 解析器；`:has-text(/注\s*册/)` 写进 CSS 字符串会报 Unexpected token）。
  2. **antd Form 输入框 fill 与 placeholder 匹配错位**：`fill('input[placeholder*="邮箱"]', email)` 实际把值填错位（邮箱框收到验证码值）→ 表单校验失败且无任何 toast——**antd 表单用索引定位** `page.locator('form input').nth(i)`（注册页 0 用户名/1 邮箱/2 验证码/3 密码）。
  3. **AuthGuard 重定向**：登录态下 goto /register 被重定向 /dashboard，且 localStorage.clear() 在 about:blank 上抛 SecurityError → goto 后判断 URL，非目标页才 evaluate 清存储再 goto。
- ⚠️ **会话内多账号切换残留**：sessionStorage 是页面级共享——u1 登录弹过（tn_shown_73=1）→ 换 u2 → 再登 u1 不弹（残留）→ **logout 必须清所有 `tn_shown_*` 前缀**而非只清当前用户。

## 2026-08-07（热门创作+短剧工作室积分扣费 ✅ 已提交+已部署+生产验证）

> 用户需求：给「热门创作（viral）」和「短剧工作室（drama）」补积分扣费（之前只 /generate 有）。方案经用户确认后实现（commit `feat: 热门创作+短剧工作室积分扣费（预扣/失败退款）+ 积分规则展示 + 修复重生成场景定义丢失`）：
- **viral 定价（用户确认）**：模板分析 50/次；生成+重生成按参考图数量梯度（0图=50、1图=80、2图=120、每多 1 图 +40，不封顶——R2V 额度有限所以 0 图也收 50）；失败自动退全款。
- **drama 定价（用户确认）**：分析 5/次、资产图 5/张、片段固定价 480p=120/720p=240/1080p=360（不按时长）、合成免费；失败自动退全款。
- **扣费方式**：预扣制（`UPDATE users SET credits=credits-? WHERE id=? AND credits>=?`，不足返回 400「积分不足，本次…需要 X 积分」）；成功不退、失败 finally 退款。所有价格读 system_configs 实时值（9 个键已插入生产 DB：viral_analyze_cost=50 / viral_generate_base=50 / viral_generate_first_image_extra=30 / viral_generate_per_image_extra=40 / drama_analyze_cost=5 / drama_asset_image_cost=5 / drama_segment_cost_480p=120 / 720p=240 / 1080p=360）。
- **实现**：新公共模块 `backend/src/modules/credits/`（CreditsService：getConfigInt/charge/refund/assertEnough + 定价 + 规则接口）；viral 三入口（analyzeVideo/analyzeUploadedVideo 预扣 50、startGeneration 按图数、regenerateScene 同梯度同价）；drama 三入口（analyze 5、generateAsset 5、executeSegmentGeneration 按分辨率 120/240/360）；两个 `GET /api/viral|drama/credit-rules` 规则接口；前端新组件 `CreditRulesAlert.tsx` 挂 CreateTemplate/ProjectDetail/Drama Detail 三页顶部展示扣分规则。
- **顺带修 bug**：startGeneration 会把 project.scenes 覆写成结果对象（丢 type/description/duration）→ regenerateScene 必然失败 → 从模板 scenes 回填字段。
- **本地验证 21 项 + UI 3/3 全绿；生产验证**：credit-rules 接口返回正确价格（新注册用户 token）+ 前端新构建 index-B0WwTGca.js。
- ⚠️ 部署/验证血泪：
  1. **PowerShell Compress-Archive 的 zip 有 backslash warning → unzip 返回非零 → set -e 脚本中断**（但 dist 实际解压成功）→ 后续步骤（pm2 restart/插配置键）没跑，服务跑旧代码。**对策：unzip 用 `unzip -o -q x.zip 2>/dev/null || unzip -o -q x.zip` 双保险（警告吞掉重试一次），脚本别用 set -e 包 unzip 步骤**；部署后必须 grep 前端 JS hash 与本地一致。
  2. **curl 用 IP 直连生产域名站点返回 404 假象**：vhost 是 `anime.leesystem.xyz`（server_name 域名），IP 直连落到默认 server（/www/server/nginx/html）→ 所有 /api/* 全 404。**生产 curl 必须 `--resolve anime.leesystem.xyz:443:127.0.0.1`（或 -H Host）**；nginx 配置在 `/www/server/panel/vhost/nginx/anime.leesystem.xyz.conf`。
  3. Node 脚本调 plink 用 **spawnSync 数组参数**（不经 cmd shell，`-pw 'xxx*'` 的 `*` 不会被通配展开、引号不炸）；execSync 拼字符串必挂。

## 2026-08-07（AI 智能规划感知所选风格 ✅ 已提交+已部署+生产验证）

> 用户反馈：/generate 文生图默认写实风格，但生成出来是动漫风格。排查定位：**智能规划（smart-plan）不感知 style**——前端只传 `{prompt, images, mode}`；后端规划 systemPrompt 是「动漫游戏角色分析专家」+「画风（日系动画/厚涂/赛璐璐/写实）让 LLM 自由选」→ LLM 默认输出动漫描述（「日系厚涂」「二次元插画质感」等）→ 写实剥离正则（08-06）只覆盖 8 个词形（动漫风格/二次元[的]?/日漫/赛璐珞/anime style 等），**漏「立绘/日系/厚涂/线稿/插画/卡通/单独动漫/anime/cartoon」** → 原样进模型出二次元图（证据：production 任务 id=18 style=realistic + prompt 含「日系厚涂+强化线稿」「商业级二次元插画质感」）。修复（commit `fix: AI智能规划感知所选风格…`）：
- **① 主修复（源头控制）**：前端 `generateSmartPlan` 从 form 取 `style` 一起传 smart-plan（三 Tab 共用函数，调用处不用改）；后端 `smartPlan` dto 加 style → `handleT2i/T2v/I2v` 注入 `styleInstruction(style)`（写实=「写实真人实拍、摄影质感、严禁动漫/二次元/插画/厚涂/线稿/立绘/卡通/赛璐璐/日系动画词汇、角色一律真实人物」；动漫=「日系动画/二次元插画质感」），T2I 分析专家 prompt 由「动漫游戏角色分析专家」改为中性「角色描述分析专家」。
- **② 兜底**：写实剥离正则两处（generateImage 文生图 + generateVideo textPrompt）扩展补全：日系动画/日系/厚涂/线稿/插画/立绘/卡通/动漫/动画/anime/cartoon/manga/chibi/illustration。
- **③ 顺带**：IMAGE_PRESETS「角色立绘」模板文案去「立绘」「干净的线条」→「角色形象」（动漫模式靠后端注入动漫词，模板保持中性）。
- **本地验证**：smart-plan realistic → 纯写实摄影描述（零动漫词）✓；anime → 日系动漫描述 ✓；剥离链单测（含「日系厚涂+强化线稿/二次元插画/立绘」全剥净、中性 prompt 原样保留）✓；端到端真实生成（realistic + 动漫词 prompt）→ completed，日志确认最终喂模型 prompt 为 `photorealistic,真人实拍质感,...` + 剥离后内容 ✓。
- **生产验证**：realistic 规划输出「真实青年女性…85mm 镜头 f/1.8 拍摄…无风格化线条、平涂色块或非现实特效」零动漫词 ✓；anime 规划输出「日系动漫风格，赛璐璐厚涂质感…」✓。前端新构建 index-C6LQ1273.js。
- ⚠️ 教训：**「生成后擦词」永远有漏网词（剥词列表是封闭的，LLM 词汇是开放的）——治本要放在 prompt 源头（规划阶段注入风格约束）**；剥离正则只作兜底。

## 2026-08-07（抖音链接解析生产打通 + 946s 快速拒绝 ✅ 已提交+已部署+生产验证）

> 承接 5 分钟时长限制。生产复测发现两个连环问题，均已在本地反复验证后部署（commit `fix: 抖音链接解析 detail API 改用 context.request 带浏览器头直连 + 无效视频直接报错不再脑补模板`）：
- **问题 1（生产 946s 链接返回 200 脑补模板）**：生产 `context.request.get(detail API)` 无浏览器 headers → 抖音 API 拒绝（status_code=undefined）→ apiMeta 拿不到 duration → 下载 72KB HTML 假视频 → ffprobe 失败（0x0, 5s 兜底）→ 纯文本**脑补**模板返回 200。本地当时没暴露（本地页面自发请求 detail 被 response 监听器捕获，走的是另一分支）。
- **修复 A**：`context.request.get` 加浏览器 headers（UA Chrome/134 + Referer `https://www.douyin.com/video/{aweme_id}` + Accept json）→ 生产直连成功（121KB JSON：TITLE「漫威电影时间线第21部…」+ DURATION 946432ms + PLAY URL）→ 下载前拦截 400「该视频时长 946 秒，超过 5 分钟…」**17s 快速拒绝，零下载** ✓。响应解析兼容 `aweme_detail / item_list[0] / data.item_list[0]` 三种结构，失败日志带响应体前 120 字符。
- **修复 B（防脑补兜底）**：analyzeFromLocalVideo 开头「无有效视频文件（不存在/width<=0/duration<=0）→ 400『视频解析失败：无法读取视频内容，请重试或更换视频』」，**杜绝下载失败后纯文本脑补模板**（脑补正是用户抱怨「解析结果与视频无关」的根源之一）。纯文本降级仅保留给「视频有效但视觉模型 API 挂」的场景。
- **修复 C**：downloadVideo 的 catch 里 `instanceof BadRequestException` 重抛（业务拒绝穿透，之前被吞导致 400 变 200）。
- **本地验证**：context.request 分支专项测试（page.route 拦截页面自发 detail 请求强制走直连分支）→ 200 + 946s + PLAY URL 全拿到 ✓；完整回归 3 用例两轮全绿（946s 链接 400 / 5s 上传 201 / 400s 上传 400 / 无 chromium 残留）。
- **生产验证**：310s 上传 400 ✓、946s 链接 **17s 400** ✓、5s 上传 201 正常分析 ✓；output 20M 干净、无残留 chrome 进程、内存正常（可用 ~470MB）。
- ⚠️ 教训：**「本地跑通」≠「生产跑通」**——本地页面自发请求 detail API 掩盖了 context.request 无 headers 的缺陷；生产与本地网络行为不同，**生产复测必须覆盖每条分支**。

## 2026-08-07（热门创作解析 5 分钟时长限制 ✅ 已提交+已部署+生产验证）

> 946s 视频在 2GB 内存生产机上连续两次压垮服务器（下载几百 MB + ffmpeg 压缩 720p 占 CPU 10-20 分钟 → OOM/负载爆炸 → sshd/443 挂）。用户拍板：**解析仅支持 ≤5 分钟视频**。实现（commit `feat: 热门创作解析仅支持 5 分钟以内视频…`）：
- **后端**（viral.service.ts）：常量 `MAX_ANALYZE_DURATION_SECONDS = 300`；**上传路径**在 copy 后立即 ffprobe，>300s → 400「该视频时长 XX 秒，超过 5 分钟（300 秒）限制，不支持长视频解析，请重新选择视频」（不压缩不分析）；**链接路径**在 downloadVideo 后、persistSourceVideo（压缩）**之前**同样拦截（946s 链接也不会再触发压缩）；analyzeFromLocalVideo 内兜底统一校验。
- **前端**（CreateTemplate.tsx）：Alert「仅支持 5 分钟以内的视频解析，不支持长视频」+ 上传 hint 同步。
- **本地验证**：400s 视频上传 → 400 ✓；**生产验证**：服务器上 ffmpeg 造 310s 小视频（51KB）上传 → 400「该视频时长 310 秒…」✓（Redis 注入验证码注册，未发信）。
- **服务器清理**：确认无 946s 残留（从未成功下载）；删除全部无引用 viral_source_*（含 2 个 72KB HTML 假视频 + 25.5MB 的 391s 压缩产物）、viral_frames_* 孤儿目录、崩溃残留 viral_analyze_* 空目录；output 19M 干净；测试脚本全部删除。
- **300s 上限安全性结论**：生产 15:21 曾成功扛过 391s 视频分析（压缩+抽帧+多模态）未崩，300s 同量级安全；946s 崩溃主因是压缩时长 ×3 且恰逢测试高峰。仍需观察：多个长视频（200-300s）并发分析时压缩 CPU 叠加风险。
- **生产部署状态**：be-dist.zip + fe-dist.zip 已部署（pm2 在线、前端新构建 index-7gBMU0J6.js、https 200）。

## ⚠️ 服务器操作安全铁律（2026-08-07 服务器崩溃事故后立规）

> 事故：在服务器上跑 Playwright 调试脚本 test-pw-prod3.js，浏览器内 `fetch` 抖音 946s 视频直链无超时无大小限制 → 本地 plink 超时被杀但**远程 node/chromium 进程残留继续下载** → 服务器内存/带宽耗尽 → sshd/443 全挂，只能重启。
1. **远程跑任何可能耗资源/下载大文件的脚本，必须自带硬退出**：脚本开头 `setTimeout(() => process.exit(1), 60000)`；所有 fetch/axios 必须 AbortController/timeout；**别在服务器上跑下载大视频的测试**（下载类验证一律本地做）。
2. **plink/pscp 本地超时 ≠ 远程命令结束**：超时后必须立即补一条 `pkill -f test-xxx` 或 `timeout 60 node xxx` 类命令清理远程残留进程。
3. **远程长命令用 Linux `timeout N cmd` 包裹**（如 `timeout 120 node xxx.js`），硬性兜底。
4. **测试脚本跑完自清理**：不遗留临时文件/进程；pscp 上传的脚本用后删除。
5. **发信测试铁律（08-06 教训重申）**：任何 send-code/真实 SMTP 发信测试必须**先征得用户同意且用用户提供的真实邮箱**；测试注册一律 Redis 注入验证码（写 `email_code:{email}` 键）绕过发信。违规会向用户 QQ 邮箱弹退信，可能被举报。
6. **生产 analyze 长视频隐患**：946s 视频解析会长时间占 CPU（ffmpeg 压缩 720p 约 10-20 分钟）+ 大下载——待用户确认是否加分析时长上限（如 ≤600s）或压缩降级。

## 2026-08-07（抖音链接解析生产打通 ✅ 本地已验证，待部署）

> 生产 yt-dlp 对抖音需 Cookie 必然失败 → Playwright 降级：服务器已装 `chromium_headless_shell-1234`（`npx playwright install chromium-headless-shell` + `install-deps chromium-headless-shell`，含 xvfb）→ 但抖音 PC 页面（www.douyin.com/video/xxx）**不再自发请求 `/aweme/v1/web/aweme/detail`**，原捕获逻辑失效（下载到 72KB HTML，video_info 全 0、0 帧、纯文本脑补）。修复（viral.service.ts Playwright 分支，commit `fix: 抖音链接解析 Playwright 降级支持 detail API 直连…`）：导航后从 `page.url()` 提取 `aweme_id`（`/video/(\d+)`）→ 页面内 `fetch` detail API（带 cookie，AbortController 20s 兜底）→ 解析 `play_addr.url_list[0]`（playwm→play）→ axios 下载（原逻辑，120s 超时）。
- **本地全链路实测**：946s 漫威剪辑视频 → 1920×1080 / 946.4s / **8 帧** / 模板准确识别「复仇者联盟3：无限战争 剧情梳理」✓。
- **生产部署状态**：代码已提交未部署（服务器 15:52 崩溃事故，重启后补部署）。

## 2026-08-07（视频解析结果与内容无关修复 ✅ 已提交+已部署）

> 用户生产上传 391s 长视频，解析出的模板（「1916 年鲨鱼袭击科学悬疑解说」）与视频实际内容（保护野生动物宣传片）完全无关。排查生产日志定位根因：`extractFrames` 硬编码 `maxFrames=4`（08-05 省钱方案遗留）——**无论视频多长只喂 4 帧给视觉模型**，391s 视频每帧间隔 ~100s，模型只能脑补编造叙事。修复已部署（commit `fix: 视频解析抽帧随时长自适应…`）。
- **修复 1**（viral.service.ts extractFrames）：`maxFrames = duration > 300 ? 8 : duration > 120 ? 6 : 4`（qwen3-vl-flash 便宜，8 帧 ≈16k image tokens 可接受）。
- **修复 2**：analyzeFromLocalVideo 的 systemPrompt 增加「严格基于画面」约束——描述只能来自画面可见内容（主体/字幕/动作/运镜/色调），画面没有的信息（剧情/台词/品牌/背景）不得编造；素材/宣传片如实描述即可，禁止虚构叙事结构。
- **本地实测**：3s 视频→3 帧、210s 视频→**6 帧**（日志「提取 6 帧关键帧」），结果准确（蜘蛛侠跳跃内容识别一致）；>300s 会走 8 帧。
- **注意**：用户之前上传 391s 视频已生成错误模板「科学悬疑解说模板」在生产库，需删除或重新分析。

### ⏳ 待办
- [ ] 服务器重启后：清理残留进程 → 上传部署 be-dist.zip（detail API 修复）→ pm2 restart → 生产复测抖音链接
- [ ] **用户复测生产抖音链接解析**（detail API 直连已部署，本地 946s 视频已验证；生产 yt-dlp 仍需 Cookie 失败，走 Playwright 降级）
- [ ] 用户重新上传视频验证解析结果与内容一致（长视频 6-8 帧，≤5 分钟）
- [ ] 删除生产上错误的「科学悬疑解说模板」（生产 viral_templates 表当前为空 cnt=0，疑似从未保存成功，待用户确认）
- [ ] **用户复测生产文生视频**（17:29 因模型列错位失败，修复后未复测）
- [ ] 用户复测「连点多个生成任务排队」效果
- [ ] 用户确认 admin 密码（生产 admin/123 登录失败，未擅改）
- [ ] 观察：多个长视频（200-300s）并发分析时压缩 CPU 叠加风险（必要时压缩改 ultrafast 或串行化）
- [ ] 源视频再 404：先查磁盘清理软件（cleanup 有引用保护）

---

## 2026-08-06（生成页积分规则展示 ✅ 已提交+已部署）

> 用户要求「每个项目里写清楚扣分规则」。实现：后端 `GET /api/generate/credit-rules`（读 system_configs 实时值：image_per_image / video_480p|720p|1080p_per_5s / video_unit_seconds=5 / refund_on_failure）+ 前端 Generate 页顶部 Alert 展示（文生图 X 分/张；视频 480p/720p/1080p = 10/20/40 分每 5 秒，不足 5 秒按 5 秒计；失败自动全额退款、预扣后成功不重复扣）。已部署生产（commit `feat: /generate 页面展示积分扣费规则…`），401 未登录验证 ✓。
- ⚠️ **Windows 安全中心拦截事件**（用户报告「从当前项目 powershell 传来恶意行为」）：根因是本地后端重启时 `Start-Process -WindowStyle Hidden`（隐藏窗口启动 node 进程）——Defender 对「PowerShell 隐藏启动外部进程」有启发式拦截（挖矿/持久化特征）。**去掉 `-WindowStyle Hidden` 参数后一切正常**（本地后端启动：`Start-Process -FilePath node -ArgumentList "dist/src/main" -RedirectStandardOutput ... -RedirectStandardError ...`）。此外 plink/pscp 从 Temp 目录运行也可能触发启发式，建议移入固定目录并加 Defender 白名单。

### ⏳ 待办
- [ ] **用户复测生产文生视频**（17:29 因模型列错位失败，修复后未复测）
- [ ] 用户复测「连点多个生成任务排队」效果
- [ ] 用户确认 admin 密码（生产 admin/123 登录失败，未擅改；用户登录 admin 可自行验证）
- [ ] 源视频再 404：先查磁盘清理软件（cleanup 有引用保护）

---

## 2026-08-06（生成任务并发限制 ✅ 已提交+已部署）

> 用户确认多用户并发风险，要求加并发限制。已实现并部署生产（commit `feat: 生成任务并发限制…`）。
- `generate.service.ts`：内存队列（单实例够用）——`enqueue` 入队 + `drain` 调度，**默认同时最多 3 个任务并行**（`system_configs.max_concurrent_generations` 可调，1~20 范围校验），超出的任务排队等待，一个完成自动拉下一个；三个生成提交点（textToImage/textToVideo/imageToVideo）统一走 `void this.enqueue(() => this.runXxx(...)).catch(...)`。
- **实测**：本地提交 6 个任务 → 日志 `active` 峰值 **=3**（19:41:14 起 1→2→3 并行，之后 31s/37s 逐个补位），6 任务全部完成；前端「processing」数量看起来 >3 是**排队任务 DB 状态也是 processing**（创建即 processing），非真并发，属正常。
- **生产验证**：`[gen-queue] 并发上限 = 3` 日志确认，服务在线，api/front 200。

### ⏳ 待办
- [ ] **用户复测生产文生视频**（17:29 因模型列错位失败，修复后未复测）
- [ ] 用户复测「连点多个生成任务排队」效果
- [ ] 用户确认 admin 密码（生产 admin/123 登录失败，未擅改；用户登录 admin 可自行验证）
- [ ] 源视频再 404：先查磁盘清理软件（cleanup 有引用保护）

---

## 2026-08-06（生成提示词清除动漫风格词 ✅ 已提交+已部署）

> 用户反馈 /generate 提示词会带出动漫风格字样。修复：① 前端快速模板 IMAGE_PRESETS「角色立绘/场景背景」文案删掉「动漫风格」前缀；② 后端写实模式剥离正则增强（`动漫风格[的]?`/`动漫[的]?风格`/`二次元[的]?`/`日漫[的]?`/`赛璐珞[的]?`，ai-service.util.ts 两处：文生图 + 视频 textPrompt）。剥离效果本地验证：`动漫风格的全身角色立绘` → `全身角色立绘`；`精美二次元的场景` → `精美场景`。已部署生产（commit `fix: 生成提示词清除动漫风格词…`）。
- ⚠️ 部署插曲：`mv deploy/be-dist_new/dist backend/dist` 路径写错（be-dist_new 解压出来本身就是 dist 内容，无 dist 子目录）→ 链中断时 backend/dist 已被 mv 走、新 dist 没放上（**pm2 一重启就挂的危险状态**）→ 重新 unzip 修复 + pm2 restart 恢复（↺7 online）。**教训：替换 dist 前先 `ls` 确认解压结构，mv 步骤拆开执行并每步验证**。

### ⏳ 待办
- [ ] **用户复测生产文生视频**（17:29 因模型列错位失败，修复后未复测）
- [ ] 用户复测「连点多个生成任务排队」效果
- [ ] 用户确认 admin 密码（生产 admin/123 登录失败，未擅改；用户登录 admin 可自行验证）
- [ ] 多用户并发：当前无任务并发上限（异步后台并行跑模型调用 + 本地 ffmpeg 进程），高并发下有资源耗尽风险——是否加并发限制（排队）待用户确认
- [ ] 源视频再 404：先查磁盘清理软件（cleanup 有引用保护）

---

## 2026-08-06（积分扣费 + 防刷注册限流 + 访问统计/IP 封禁 ✅ 已提交+已部署）

> 承接生成任务异步化。用户确认「积分扣费改造」需求（提交预扣、失败退款、防刷）。本轮完成：**生成任务积分扣费（图 5 分/张，视频 480p=10/720p=20/1080p=40 × ceil(时长/5)）+ 每 IP 每日注册限 2 个 + 访问统计 + admin IP 封禁 + admin 访问统计页**。本地 30/30、生产 24/24 全绿，已部署（commit `feat: 生成任务积分扣费（预扣/失败退款）+ 每IP每日注册限2个 + 访问统计/IP封禁 + admin 访问统计页`）。

### ✅ ① 生成任务积分扣费（generate 模块）
- **规则**（用户确认，config 可调）：图 = `credit_cost_image`（默认 5）× num_images；视频 = `credit_cost_{resolution}`（480p=10/720p=20/1080p=40）× `ceil(时长/5)`；读 `system_configs`（getConfigInt 兜底默认值）。
- **预扣+结算**：`textToImage/textToVideo/imageToVideo` 在入库前 `chargeCredits`（原子 `UPDATE users SET credits=credits-? WHERE id=? AND credits>=?`，affectedRows=0 → 400「积分不足，本次生成需要 N 积分，请稍后再试」）→ 任务存 `credit_cost`；**完成**置 `credits_charged=true`（不再重复扣）；**失败** catch 里 `refundCredits` 退全款 + 置 `credits_charged=true`。
- 实体 `generation_tasks` 新增 `credit_cost int default 0` + `credits_charged boolean default false`（synchronize 自动建列，生产已验证）。
- **实测**：本地 30/30（预扣 5→余额 95 / 完成结算后仍 95 不重复扣 / i2v 用不存在 media 预扣 20→失败→退 95 / 积分不足 400 / 限流 409 / summary / ban 403 / unban 恢复）；**生产 24/24**（同上 + 真实文生图任务 13 completed 结算 ✓ + 统计到真实公网 IP 47.121.137.131）。

### ✅ ② 防刷：每 IP 每日注册限 2 个
- `auth.service.register(dto, ip)`（controller 传 XFF 首段）：`SecurityService.checkRegisterLimit` —— Redis `reg_ip:{date}:{ip}` incr，>2 → 409「今日该网络注册账号已达上限，请明天再试」；**local/10./192.168. 豁免**（开发不挡）。生产实测：同 IP 第 3 次注册 409 ✓。
- **生产 nginx 已确认有 X-Forwarded-For**（80/443 的 /api/、/static/、socket.io 均有 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`）——真实 IP 提取链路完好，无需改。

### ✅ ③ 访问统计 + IP 封禁（新 SecurityModule）
- `backend/src/modules/security/`：`SecurityService`（getIp 优先 XFF 首段 → X-Real-IP → socket；isBanned；track：`access_count:{date}` incr + `access_ips:{date}` HINCRBY + `access_last:{date}` HSET，7 天过期，跳过 send-code；getSummary；ban/unban：`banned_ips` set）；`SecurityMiddleware`（isBanned→403「访问受限」→ track → next，try/catch 兜底不断业务）；controller：`GET /api/admin/access/summary`、`POST /api/admin/access/ban|unban`（Roles('admin')）。
- `app.module.ts`：`implements NestModule` + `configure(consumer.apply(SecurityMiddleware).forRoutes('*'))`；`main.ts`：`app.set('trust proxy', 1)`。
- **admin 前端**：新 `AccessStats/index.tsx`（今日访问量/活跃 IP/已封禁数卡片 + 手动封禁输入框 + IP 明细表：次数/最后访问/状态/封禁或解封），已接入 Dashboard 菜单与路由。
- **实测**：summary tv=22/ips=2；ban 8.8.4.4 后带 XFF 请求 403「访问受限」，unban 后 401 恢复 ✓（本地+生产）。

### ⚠️ 本轮血泪教训（debug 过程极曲折，务必记住）
1. **PowerShell 管道会杀掉 native 进程**：`npx tsc 2>&1 | Select-Object -First 5` 在 tsc 有输出时会被 PS 提前终止（报 `Unknown: ChildProcess.kill`）→ **dist 根本没更新**，重启后跑的是旧代码 → 中间件「不生效」假象。**编译命令一律裸跑 `npx tsc`（不接管道），或管道接 `Out-String`**。
2. **node-redis v4 的 `sIsMember` 返回数字 1/0 而非 boolean true/false**！`=== true` 永远 false → 封禁永不生效。必须 `raw === true || raw === 1`。同坑：`sRem/sAdd` 返回 number。**凡是 Redis 布尔类命令的返回值，别用严格 ===true 判断**。
3. **Nest 中间件里 `req.url` 是 `/`（router 内相对路径）**！判断路径前缀要用 `req.originalUrl`（Express 保留完整 URL）→ track 的 `/api/` 过滤曾全部失效，统计为 0。
4. **SecurityMiddleware 不要重复注册**（AppModule.configure 和 SecurityModule.configure 都 apply 会每请求跑 2 次，第一次 403 后第二次 res.headersSent 报错被吞 → next() → 请求继续到 controller → 401 覆盖 403）。**全局中间件只在 AppModule.configure 注册一处**。
5. **测试顺序注意注册限流**：同一 IP 注册测试用掉名额后，后续测试用户注册全 409。脚本里先测限流 → 清 `reg_ip:*` 键 → 再注册其他测试用户。
6. **生产 admin 密码不是 123**（登录 401）。**别擅自改用户密码**——测试 admin 接口用「临时注册用户 + SQL 提权 role='admin'」，测完删用户。
7. 中间件日志用 `console.error` 会进 stderr 重定向文件，查日志要查 err 文件不是 out 文件。

### ⏳ 待办
- [ ] **用户复测生产文生视频**（17:29 因模型列错位失败，修复后未复测）
- [ ] 用户复测「连点多个生成任务排队」效果
- [ ] 用户确认 admin 密码（生产 admin/123 登录失败，未擅改；用户登录 admin 可自行验证）
- [ ] 源视频再 404：先查磁盘清理软件（cleanup 有引用保护）

---

## 2026-08-06（生成任务异步化：可连续提交多个 + 默认写实风格 ✅ 已提交+已部署）

> 承接登录流程加固。用户反馈：① 点击生成后按钮一直禁用，要刷新才能再点——「我用的不是队列生成吗？正常应该能连续点多个视频一起生成」；② /generate 三个 Tab 风格默认都是动漫，应默认写实。全部完成并部署生产（commit `feat: 生成任务异步化…`）。

### ✅ ① 生成任务异步化（根因修复）
- **根因**：`generate.service.ts` 三个生成方法（textToImage/textToVideo/imageToVideo）虽然任务入库 status=processing，但**同一请求内同步 await 模型生成完才返回** → 前端按钮一直 loading 直到生成结束（几分钟）→ 用户以为要刷新。
- **修复**：拆成「同步校验+入库+立即返回」与「后台执行器」：
  - 公开方法只做校验（prompt 空/模型存在性，错误仍即时 400）+ `taskRepo.save(processing)` + `void this.runXxx().catch(...)` 触发后台执行 + **立即返回 `{taskId, status:'processing'}`**（15~70ms）
  - `runTextToImage/runTextToVideo/runImageToVideo`：原生成逻辑（扩写/抽视角/生成/下载/入库），失败只标 task failed，**不再抛给前端**；外层 .catch 兜底防 unhandledRejection 崩进程
  - `retryTask` 无需改（内部走新异步方法）
- **前端**：`doGenerate` 本来就有提交前后静默刷新 + 3s 轮询（hasActiveTask||loading）——现在 post 立即返回，按钮秒恢复，可**连续点击提交多个任务排队生成**，列表实时显示「生成中」逐个变「已完成」。
- **实测**：本地 curl 两次提交 15ms/73ms 返回 processing，两任务并行后台生成；本地 Playwright 3/3（连点两次按钮均恢复/历史 2 任务）；**生产 5/5**（默认写实/连点两任务/历史 2 任务全过）。

### ✅ ② 默认风格改写实
- 前端 `Generate/index.tsx` 三个 Tab 风格 Select `initialValue="anime"` → `"realistic"`（antd Form.Item initialValue 只影响新建表单，无旧值残留问题）。
- 后端兜底同步改：`runTextToImage` 的 `style || 'anime'` → `'realistic'`；`runTextToVideo/runImageToVideo` 补传 `style`（generateVideo 原本就支持 realistic/anime 提示词注入：写实=剥离动漫关键词，动漫=注入动漫关键词）。
- 快速模板（IMAGE_PRESETS/VIDEO_PRESETS）文案仍含「动漫风格」字样——属提示词模板内容，不影响默认风格，未改。

### ⚠️ 本轮教训
- **本地后端重启没生效**：端口 3000 被旧进程（18:22 启动的 13272）占用，`Stop-Process 15612` 目标 PID 已不存在被吞掉 → 新 node 启动监听失败，3000 仍跑旧 dist（curl 返回旧同步格式才发现）。**重启后必须 curl 验证返回体是新的**（异步接口返回 `{taskId,status:'processing'}`，同步旧版返回 `{taskId,images:[...]}`），不能只看端口通。
- antd v6 Select 选中值在 `.ant-select-content[title=...]`（不是 selection-item）；隐藏 Tab 面板也在 DOM 上，`has-text("生成图片")` 不会误匹配「生成视频」✓。

### ⏳ 待办
- [ ] **用户复测生产文生视频**（17:29 因模型列错位失败，修复后未复测）
- [ ] 用户复测「连点多个生成任务排队」效果
- [ ] 积分扣费改造（已获需求确认，用户暂缓，等测试完成再开工）
- [ ] 源视频再 404：先查磁盘清理软件（cleanup 有引用保护）

---

## 2026-08-06（登录注册流程加固 + admin 邮箱列 ✅ 已提交+已部署）

> 承接上线改进。用户反馈两个问题：① 注册后应先进登录页再登录进工作台，且登录成功后点后退不应回到登录页（除非主动退出）；② admin 用户管理页手机号列应改为电子邮箱列。全部完成并部署生产（commit `feat: 注册后跳登录页 + 已登录访问登录页自动重定向…`）。

### ✅ ① 登录/注册流程加固
- **注册后去登录页**：`RegisterPage.tsx` 注册成功不再 setAuth 自动登录 → toast「注册成功，请登录」+ `navigate('/login', { replace: true })`。
- **登录成功后退不回登录页**（双保险）：
  - `LoginPage.tsx` 登录成功 `navigate('/dashboard', { replace: true })`（replace 覆盖历史，后退回登录前页面/无处可退）
  - `App.tsx` 新增 **AuthGuard** 包 /login /register：已登录（localStorage 有 token）访问一律 `<Navigate to="/dashboard" replace />`——无论后退还是 URL 直达都进不去登录页
  - 退出登录（AppHeader）仍正常跳 /login ✓
- **实测**：本地 Playwright 8/8（注册→/login+toast / 注册后后退回不到注册页 / 登录→/dashboard / 登录后后退不回 /login / 已登录访问 /login 与 /register 均重定向 /dashboard / 退出→/login）；**生产 6/6 全绿**。

### ✅ ② admin 用户列表改电子邮箱列
- `admin/src/pages/UserManage/index.tsx`：「手机号」列删除，「邮箱」列标题改「电子邮箱」（email 为空显示 '-'）；搜索 placeholder 改「搜索用户名或邮箱」（后端 keyword 本就含 email）。
- ⚠️ 上次加的邮箱列生产没生效是因为 **admin 前端没重新构建部署**（本次部署流程补上：frontend+admin 双 dist 上传解压）。

### ✅ ③ 顺带修复：验证码 Redis db 忽略 bug（隐藏 bug）
- **症状**：生产注册 Redis 注入验证码报「验证码错误或已过期」，本地同样代码却通过。
- **根因**：`auth.service.ts` redis() 的 URL `redis://host:port` **没带 db 参数**，REDIS_DB=5 被忽略 → 后端连 db 0（与前置项目共用，违反 .env「独立 db=5」注释）；本地 .env.local 无 REDIS 配置默认 db 0 所以本地注入 db 0 恰好能过。
- **修复**：URL 加 `/${process.env.REDIS_DB || 0}`。生产重部署后注入 db 5 验证通过。
- **教训**：注入验证码测试前先确认后端实际连的 Redis db；怀疑链路问题时优先 `pm2 logs` + `redis-cli GET` 验证，不要猜。

### ⚠️ 部署教训（PowerShell zip + set -e）
- 本次 deploy 脚本 `rm -rf dist && mkdir && unzip` 用 `set -e`：PowerShell Compress-Archive 的 zip 有 backslash warning，**unzip 返回非零 → set -e 中止脚本**，admin 部分未执行（frontend 恰好先执行完）→ 生产 admin 还是旧的。
- **对策**：解压步骤不用 set -e（或拆开验证），解压后必须 curl/grep 检查 JS hash 与本地构建一致。

### ⏳ 待办
- [ ] **用户复测生产文生视频**（17:29 因模型列错位失败，修复后未复测）
- [ ] 用户复测「生成历史实时更新」效果
- [ ] 积分扣费改造（已获需求确认，用户暂缓，等测试完成再开工）
- [ ] 源视频再 404：先查磁盘清理软件（cleanup 有引用保护）

---

## 2026-08-06（追加改进：生成历史实时更新 + 模板链接仅抖音/B站 ✅ 已提交+已部署）

> 承接上线改进。用户反馈三个问题：① /generate 生成历史不实时（提交后要刷新才出现）；② QQ 邮箱收到退信（测试假邮箱导致）；③ 模板 URL 只留抖音/B站。①②③ 全部处理完毕并部署生产（commit `feat: 生成历史提交后实时显示生成中…`）。

### ✅ ① 生成历史实时更新（根因修复）
- **根因**：后端生成接口**同步执行**（`generate.service.ts` textToImage/textToVideo/imageToVideo：先 save task=processing，再**同一请求内**等模型生成完才返回）→ 前端 `await api.post` 一直阻塞，`fetchHistory()` 在 await 之后才执行 → 列表在生成完成前完全不更新。
- **修复**（`Generate/index.tsx`）：`doGenerate` 提交时**立即静默刷新**（任务此刻已入库=processing，可显示「生成中」）+ 轮询 effect 条件 `hasActiveTask || loading`（提交期间也轮询，防提交/查询竞态漏掉刚建的任务）、间隔 3s、`fetchHistory(silent)` 参数避免轮询时列表 loading 闪烁；post 成功/失败后各再刷一次。
- 效果：点「生成」→ 列表立刻出现「生成中」→ 3s 自动刷新到「已完成」出现下载按钮，无需手动刷新。

### ✅ ② 退信说明（无需修复）
- 退信来源：**本地测试** send-code 用了假邮箱 `test-code-ok@example.com`（example.com 域名不存在），QQ SMTP 先接收异步投递后产生退信。**已停止此类测试**——此后验证码链路一律 Redis 注入测注册，真实发信只发用户本人 QQ 邮箱。
- 用户自行注册测试：已成功（生产 users 出现 id=16 Lee-1 / 13710206835@163.com，QQ SMTP 发 163 邮箱投递正常）。

### ✅ ③ 模板链接白名单（仅抖音/B站）
- `analyzeVideo` URL 白名单正则 `^(https?://)?([a-z0-9-]+\.)?(douyin\.com|iesdouyin\.com|bilibili\.com|b23\.tv)(/|$)`——MP4 直链/YouTube/其他平台一律 400「暂不支持该链接，仅支持抖音、B站视频链接；也可以直接上传本地视频」；前端 CreateTemplate Alert/placeholder 同步改「抖音/B站」。
- 实测：本地 13 用例全过（抖音短链/完整/B站/B23 放行；mp4/yt/微博/小红书/微信/抖音CDN 拒绝）；生产 3 项通过（含临时注册用户验证后删除）。
- ⚠️ 合法链接测试会触发真实下载卡住——白名单测试只测「拒绝」用例 + 少量放行用例。

### ⏳ 待办
- [ ] **用户复测生产文生视频**（17:29 因模型列错位失败，修复后未复测）
- [ ] 用户复测「生成历史实时更新」效果
- [ ] 积分扣费改造（已获需求确认，用户暂缓，等测试完成再开工）
- [ ] 源视频再 404：先查磁盘清理软件（cleanup 有引用保护）

---

## 2026-08-06（上线改进：本地视频上传解析模板 + 邮箱验证码注册登录 ✅ 已提交+已部署）

> 承接 08-05 上线记录。用户提出两个改进：①「创建新模板」支持**本地 MP4 上传解析**、**暂时移除 YouTube**；②注册改**邮箱+验证码**、登录支持**邮箱或用户名**、用户名重复提示「用户名已被使用」。全部完成并已部署生产（git 两次提交：`fix: 部署期修复…` + `feat: 模板支持本地上传视频解析 + 邮箱验证码注册…`）。

### ✅ 需求一：本地视频上传解析 + 去 YouTube
- **后端**（`viral.service.ts`/`viral.controller.ts`）：`analyzeVideo` 重构——下载逻辑留在原方法，分析主体抽为 **`analyzeFromLocalVideo`**（探测/抽帧/多模态分析/组装结果，含 workDir 清理）；新增 **`POST /api/viral/templates/analyze-upload`**（multer diskStorage 服务端文件名 + 扩展名/MIME 白名单 mp4/mov/webm/mkv/avi/m4v + 300MB 上限）；`analyzeUploadedVideo` 把上传文件拷入 `viral_analyze_*` 临时目录 → `persistSourceVideo` 持久化为 `/static/viral_source_*.mp4` → 分析 → **finally 删上传临时文件与 workDir**（framesDir 保留给模板参考帧，cleanup 兜底）。
- **YouTube 拦截**：`analyzeVideo` 开头正则 `youtube\.com|youtu\.be` → 400「暂不支持 YouTube 链接，请使用抖音/B站等平台链接，或直接上传本地视频」；`source_url` 语义：本地上传存本地 `/static/` 路径（refresh-source 对 `/static/` 短路不重新下载，天然安全）。
- **前端**（`CreateTemplate.tsx`）：URL 输入 + **antd Upload.Dragger 拖拽上传**（accept 视频、300MB 校验、beforeUpload 直调 analyze-upload、`Upload.LIST_IGNORE` 阻止自动上传）；Alert/placeholder 全去掉 YouTube；`applyResult` 抽公共。
- **实测**：YouTube 400 拦截 ✓；txt 拒绝 400 ✓；ffmpeg 造 3s 测试片上传 → 8.4s 完成分析返回模板（9:16 正确、3 帧、reference_url=/static/viral_source_*.mp4）✓。

### ✅ 需求二：邮箱验证码注册 + 邮箱/用户名双登录
- **数据**：`users` 加 `email` 列（`varchar` unique nullable，synchronize 生产自动建列）；旧用户（admin/123）email=NULL，用户名登录不受影响。
- **后端**（`auth.service.ts` 重写 + 新 `dto/send-code.dto.ts` + controller `POST /api/auth/send-code` @Throttle 5/分）：
  - 验证码：6 位数字，**5 分钟有效**（TTL），**同邮箱 60 秒限频**、**每日 10 次上限**（发送成功才记录限频状态）；存储 = **Redis**（`email_code:{email}` = `code|expiresAt`，node-redis 惰性连接，失败自动降级**内存 Map**，单实例无碍）+ verifyCode 先查 Redis 后查内存，成功即删。
  - SMTP：**nodemailer**（新依赖），配置读 `process.env`：`SMTP_HOST/PORT/USER/PASS`（QQ 邮箱 smtp.qq.com:465 SSL，发件人「AI 动漫短剧」，HTML 模板）。**授权码不进 git**：本地 `backend/.env.local`（gitignore 已有）+ 生产 `/home/www/ai-anime/backend/.env` 追加（`envFilePath: ['.env.local', '.env']`）。
  - register：`ConflictException('用户名已被使用')` / `('该邮箱已被注册')` / `('验证码错误或已过期')`，成功才建用户。
  - login：`where: [{ username }, { email }]` 双匹配（旧手机号用户仍用用户名）。
- **前端**：`RegisterPage.tsx` 重写（邮箱 + 验证码输入 + 「发送验证码」按钮 60s 倒计时 + 用户名/密码）；`LoginPage.tsx` placeholder「邮箱或用户名」；admin `UserManage` 用户列表加「邮箱」列（`admin.service.ts` getUsers select 补 email + keyword 搜索含 email）。
- **实测**：本地后端 9 项 + 前端 Playwright 9 项全绿（真实验证码流程：发送 → Redis 读码 → 填入 → 注册成功跳 dashboard；重复用户名 toast 显示「用户名已被使用」）；生产 9/9（send-code 真发信到用户 QQ 邮箱 201、60s 限频拦截 400 均验证）。

### 🚀 生产部署（本次流程）
- 本地三端编译（backend `npx tsc` / frontend+admin `npm run build`）→ `Compress-Archive` 打包 → pscp 上传 `/home/www/ai-anime/deploy/` → 服务器 unzip 覆盖 dist → backend `npm install nodemailer`（npm 在 `/usr/local/bin`，node v22.22.3）→ `.env` 追加 SMTP → `pm2 restart ai-anime-backend --update-env` → 生产 smoke 全绿。
- ⚠️ **教训 1**：PowerShell `Compress-Archive` 生成的 zip 用反斜杠路径分隔符，unzip 有 warning 但**解压结果正常**（只 warn 不报错）；`rm -rf dist && unzip` 后曾以为部署了，实际 pm2 进程 uptime 82m 说明 **restart 没执行**——plink 多行 `set -e` 脚本某步失败整体退出、输出只有 warning 时**务必复查 pm2 uptime / curl 接口**。本次正是 curl `/api/auth/send-code` 404 + register 走旧文案才暴露，重启后全通。
- ⚠️ **教训 2**：生产 smoke 脚本用户固定名重复跑会撞名 409——脚本用户名加随机后缀或先删用户。
- ⚠️ **教训 3**：curl -d 含中文/引号经 PowerShell→plink 双层转义必挂 → 一律写脚本文件上传执行。

### ⏳ 待办
- [ ] **用户复测生产文生视频**（17:29 因模型列错位失败，修复后未复测）
- [ ] 用户确认 QQ 邮箱收到验证码邮件（2026-08-06 已发 1 封）
- [ ] 积分扣费改造（已获需求确认，用户暂缓，等测试完成再开工）
- [ ] 源视频再 404：先查磁盘清理软件（cleanup 有引用保护）

---

## 2026-08-05（收尾：安全加固 5 项 + 清理服务误删事故处置 ✅ 已提交）

> 承接画布体检记录。用户要求盘点项目文档剩余待办并收尾，范围选定「安全加固」：**模板权限 / 上传白名单 / 登录限流 / SSRF+路径加固 / 产物清理** 5 项全部实现。**但清理服务首次运行因 SQL 引用收集失败（viral_projects 无 bgm_url 列）删掉了 5 个被模板引用的帧目录 + 4 个源视频——已修复服务并全部恢复数据**。实测全绿，已 git 提交（`feat: 安全加固（模板权限/上传白名单/登录限流/SSRF/产物清理）`）。

### ✅ 安全加固 5 项
1. **模板权限**（`common/utils/template-permission.util.ts` 新增）：is_system=true 或 user_id=NULL 的模板仅管理员可改删；私有模板仅创建者可改删（**管理员也不能动私有模板**）；仅管理员可创建系统模板/置 is_system=true。接入 canvas + viral 的 create/update/delete + refreshTemplateSourceVideo。
2. **上传白名单**（`media.controller.ts`）：multer diskStorage（**服务端生成文件名防穿越**）+ 扩展名/MIME 双校验 + 300MB 上限；`drama.service.ts` uploadAssetImage 的 image_url 仅放行 data URI / http(s) / `/static/`。
3. **登录限流**：login/register 各 `@Throttle(10/分)`（测试连错 12 次触发 429）。
4. **SSRF/路径加固**（`common/utils/safe-download.util.ts` 新增）：`assertSafeRemoteUrl` 拒内网 IP 段（127/10/172.16-31/192.168/169.254/100.64/::1）与 file/ftp 协议；`downloadToFile` 流式落盘 + 500MB 上限；替换 canvas/viral/generate/character/global-asset/drama/video 7 处下载 + `ai-service.util.ts` imageToBase64；本地路径分支仅放行 output 目录内。
5. **产物清理**（`modules/cleanup/` 新增，每 6h + 启动时）：临时目录（viral_frames_/viral_analyze_/viral_gen_/viral_reg_/canvas_gen_）超 2h 删、无引用 viral_source_ 超 2h 删、无引用成片超 30 天删；**引用收集覆盖 13 张表**，被引用的文件/目录永不删；canvas deleteProject 补清 canvas_gen_ 临时目录；渲染孤儿清理（renderWorkflow 返回 finalPath）。

### ⚠️ 清理服务误删事故（血泪教训，重要）
- **经过**：CleanupService 启动时 SQL 引用了不存在的 `viral_projects.bgm_url` → 引用收集抛错被 catch 吞掉（返回空集合）→ 继续删除 → **5 个被引用的 viral_frames_* 目录 + 4 个 viral_source_*.mp4 全被删**（模板 4/6/7/8/10 全部受影响）。
- **修复**（两道防线）：①SQL 的 bgm_url 改 media_refs；②**引用收集失败 → 本轮清理整体中止**（不删任何东西）；③**目录级引用保护**（viral_frames_xxx 目录名也从 reference_frames 收集进 dirs 集合）。
- **数据恢复**：模板 6/7/8/10 用 source_url 外链重新 Playwright 下载 + ffmpeg 压缩（720p）+ 抽 4 帧 → 更新 reference_url/reference_frames/ratio；模板 4 只补帧图（reference_url 保持外链）。脚本 `Temp\opencode\restore-viral-sources.js` / `restore-tpl4-frames.js`（**require 需 `$env:NODE_PATH=backend\node_modules`，playwright 在 backend 依赖里**）。
- **验证**：造未引用假目录/假文件（mtime 改 3h 前）→ 重启后端 → junk 被删、5 个被引用帧目录 + 4 个 source 完好；API 安全 14/14 + SSRF 10/10 回归通过。

### 🔧 本次沉淀
- **清理服务第一铁律：引用收集失败必须中止清理**（空集合 = 全删，等同自杀）。所有「先收集白名单再删」的服务同理。
- TypeORM/Node 环境 `viral_projects` **没有 bgm_url 列**（canvas_projects 有）；viral 模板源视频恢复靠 `source_url` 外链 + Playwright API 捕获（yt-dlp 需 Cookie 不可用）。
- 测试脚本内 require 后端 TS 源文件会挂 → 用 `node --experimental-strip-types` 跑 .ts 单测（见 test-ssrf.ts），或直接测编译产物/HTTP。

---

## 2026-08-05（深夜：画布全面体检修复 12 项 ✅ 已提交）

> 承接晚节。用户反馈「画布功能基本没问题，帮我再检查检查有没有 bug」→ 双 agent 只读审查（前端 7 文件 + 后端 canvas 模块）→ 修复 12 项（其中新发现 2 个隐藏 bug：模板 API 不返回 edges、短剧素材 Tab 数据源字段不存在）。实测后端 9/9 + 前端 7/7 + legacy 迁移 5/5 全绿，tsc 双端全绿，已 git 提交（`fix: 画布体检修复（多选删除/短剧素材/变量注入/无声混音等 12 项）`）。

### ✅ 修复清单（按用户可感知度排序）
- **前端 `WorkflowCanvas.tsx`**：
  1. **多选操作条「全部删除」失效**——点击操作条时 pointerdown 先冒泡到画布空白分支清空选中 → 操作条容器加 `onPointerDown={e.stopPropagation()}`
  2. 边 id 碰撞：`edge_${Date.now()}` → `edge_${Date.now()}_${edgeSeq++}`（同毫秒两次连线 React key 重复 + 后端歧义）
- **前端 `Editor.tsx`**：
  3. **短剧片段素材 Tab 永远为空**——原读 `ep.segments[].video_url`，但 `getEpisodes` 返回裸分集实体（无 segments 字段）→ 改读分集成片 `ep.video_url`（stitched 整集），标题 `${proj.title||proj.name} - ${ep.title||第N集}`；串行 N 次请求改 `Promise.all` 并行
  4. **加载失败后空态可保存覆盖原数据**——loadError state，失败显示错误页（返回按钮），不进编辑器
  5. 渲染轮询遇一次网络错误即永久停 → 连续失败 3 次才停并提示
  6. **legacy 旧格式迁移丢字段**——newNode 分支回填 `params.text/bg_color/text_color/font_size`（top-level → params），保留 top-level `transition`（后端 workflow 渲染有 `chain[i+1]?.transition` 兜底读法）
  7. 跨项目残留渲染状态（后退/前进换项目仍显示上个项目成片）+ failed 状态不展示 → load 开头 `setRender(null)`，failed 也写入 render
  8. `unusedMedia` 可达性校验：`edges.find` 只沿第一条出边 → BFS 遍历所有出边（防多出边误拦截）
- **前端 `index.tsx`**：9. 渲染进度冻结——轮询时 status 仍为 rendering 的 progress 不写入 next → 无条件合并 + 状态变化才触发
- **后端 `canvas.service.ts`**：
  10. **模板变量替换 JSON 注入**——变量值原样拼进 nodes JSON，含 `"`/`\` 直接破坏 JSON → `JSON.stringify(value).slice(1,-1)` 转义；残留 `{{var}}` → 400「模板变量未填写」；替换后 JSON.parse 校验
  11. **文本-only 画布 + 音频节点静默丢失**——`mixAudioTracks` 硬编码 `[0:a]`（ffmpeg.util.ts:964），base_blank 无音轨 → filter 解析失败被 catch 吞掉 → **ffmpeg.util.ts 内动态补静音轨**（`hasAudioTrack` 探测，无音轨时追加 `-f lavfi -i anullsrc` + atrim 到 totalDur）
  12. **文本-only 画布固定 1 秒**——base_blank `d=1` → 按 textOverlays 的 max(start+duration) 计算（上限 60s）
  13. **ratio 显式 9:16 被模板默认值覆盖**——`ratio==='9:16' ? tpl.ratio||ratio : ratio` → `dto.ratio ? dto.ratio : tpl.ratio||'9:16'`
  14. **渲染失败保留旧 result_url**——catch 里 `result_url: null`（实体类型 `string → string | null`，⚠️ 必须显式 `type:'varchar'`，否则 TypeORM 反射 union 类型报 DataTypeNotSupportedError）
  15. **startRender 并发竞态**（双渲染互相覆盖）——「先查后写」改**原子 UPDATE**：`createQueryBuilder().update().where('id=? AND user_id=? AND status<>"rendering"')`，affected=0 再查原因
  16. `/static/` 路径穿越——`path.join(outputDir, m[1])` → `path.resolve` + `startsWith(outputDir+sep)` 校验
  17. **模板 API 不返回 edges（新发现隐藏 bug）**——`listTemplates/getTemplateById` 只返回 nodes+variables，模板 5 的 4 条边丢失 → 补 `edges: parseEdges(t.nodes)`（restore-project29.js 因此恢复出 0 边）
  18. `mergeWithTransitions` 裸 `ffprobe` → `ffmpeg.hasAudioTrack`；**ffmpeg.util.ts 三处裸 `ffprobe`（mergeVideos/getVideoInfo×2）统一 `this.ffprobePath`**（部署机 PATH 无 ffprobe 时 getVideoInfo 静默返回 duration=5、hasAudio 全 false 丢音轨）

### ✅ 实测（全绿）
- 后端 API（`test-canvas-fixes-api.js`）9/9：变量含引号 `他说"你好"\世界'x` 创建成功且 text 内容原样保留 / 缺变量 400 / 显式 16:9 不被模板覆盖 / 纯文字+音频节点渲染 completed / **成片含音轨**（ffprobe codec_type=audio）/ 时长 3s 精确
- 前端 UI（`test-canvas-fixes-ui.js`）7/7：项目 29 加载 5 节点 / 框选操作条出现 / **「全部删除」5→2 生效** / 操作条消失 / 短剧 Tab 显示「轮回仙尊重临青云 - 仙帝一剑凌霄」/ 不存在项目显示错误页 + 返回按钮 / 无 pageerror（ERR_ABORTED 是 headless 切页中止 video 请求的噪音，文件 HEAD 全 200 已验证）
- legacy 迁移（`test-canvas-legacy-ui.js`）5/5：3 节点迁移 / 文字内容保留 / 属性面板回填 / 自动生成连线 / 无 JS 错误
- tsc：backend + frontend 双端全绿

### ⚠️ 审查发现但未修（C 类上线前）
- 模板 update/delete/create 无归属校验（任意登录用户可改系统模板）、`is_system` 任意用户可置 true
- `downloadToLocal` 绝对路径分支/外链 URL 无白名单（SSRF 向量）、大文件全量进内存
- 渲染中 delete 项目 → 孤儿产物；历史成片无清理策略（归入 output/ 清理策略）
- 渲染中 PUT 修改项目不提示（doRender 用开头快照，静默过期）
- 变量名正则 `\w+` 不支持中文变量 key；`coverFromNodes` 外链直接透传
- `PropertiesPanel` 颜色输入 `<input type=color>` 对非 `#rrggbb` 历史值（'white'/'#fff'）会报格式警告

### 本轮血泪经验（新增）
- **TypeORM 实体字段改联合类型必须显式 `type`**：`result_url: string | null` 编译后 design:type 反射成 Object → `DataTypeNotSupportedError`，需 `@Column({ type:'varchar', ... })`
- **模板 API 与项目 API 返回字段不一致**：项目返回 `{nodes, edges}`，模板原只返回 `{nodes, variables}` → restore 类脚本若读 `t.edges` 会静默得到 undefined（0 边）
- **drama 项目名字段是 `title` 不是 `name`**；分集成片在 `ep.video_url`（stitched），片段级 URL 在 detail 端点
- headless 下切页导致的 `ERR_ABORTED` 视频流请求中止是噪音——用 `page.on('response')` 收集 4xx 状态 + HEAD 验证文件存在，别误判为 404 bug

---

## 2026-08-05（晚：画布交互升级——框选多选/右键平移/使用教程 ✅ 已提交）

> 承接下午记录。按用户需求改造画布编辑器交互：**左键**=选中/拖节点/空白拉框多选（可整体拖动、批量删除、Ctrl+A 全选），**右键**=平移画布，并新增编辑器内「使用教程」帮助弹窗（鼠标操作表+快捷键+面板/工具栏/属性说明）。已 git 提交（`feat: 画布多选框选 + 右键平移 + 使用教程弹窗`）。

### ✅ 已完成
- **`WorkflowCanvas.tsx` 重写**：选中模型 `selectedId` → `selectedIds`（多选）；左键空白 = marquee 框选（`{x,y,w,h}`，onUp 时 `|w|>=6|||h|>=6` 才算框选否则视为空白点击清空选择；`marqueeHitIds` 先归一化负向框再 overlap 命中）；左键节点 = 单选或整体拖动选中组（`mode:'multi'`，按下时快照 selectedIds 各节点位置，onMove 用 `base + dx/zoom` 统一位移）；右键 = `mode:'pan'` 平移（任意位置、`onContextMenu` preventDefault 禁菜单）；保留滚轮缩放（Ctrl 加倍）、素材拖放、端口连线；快捷键 Delete/Backspace 批量删（含连线）、Esc 取消、Ctrl+A 全选（均跳过输入框焦点）；底部 hint 条 + 多选时底部「已选 N 个节点/全部删除/取消选择」操作条
- **`Editor.tsx`**：`selectedIds` 化，多选时右侧面板显示批量操作（Empty + 删除选中 + 取消选择），单个选中走 PropertiesPanel；工具栏新增「使用教程」按钮 → Modal（width 640，五节：鼠标操作表/快捷键表/节点素材面板/顶部工具栏/右侧属性面板）；Ctrl+S 快速保存
- **Bug 修复（拖拽 palette 节点全部变成 video）**：`WorkflowCanvas.tsx` onDrop 的 palette 分支硬编码 `type:'video'` + 位置 `(0,0)` → 改为读拖拽数据 `parsed.__palette` 类型 + 鼠标落点（screenToWorld）；`Editor.tsx` `addAssetNode` 对 `kind==='palette'` 转走 `addPaletteNode`（带可选位置参数，默认自动排布），顺带获得 output 节点唯一检查、source 不被污染。实测（`test-palette-drop.js`）：拖 text/audio/effect/output 全部正确建对应类型节点、落点位置精确（world = 落点减半宽）、重复 output 被拦截、JS 错误 0
- **多选拖动 bug 修复（关键）**：node/multi 拖拽的 `onChange` 从对象式改为**函数式更新** `onChange((prev) => ...)`（Props 类型改为 `Dispatch<SetStateAction<Workflow>>`，Editor 直接传 `setWorkflow`），快速连续 pointermove 下位置不再丢步
- **实测全绿**（`Temp\opencode\test-multiselect-ui.js`，项目 29）：①左键空拖不平移 ②marquee 框选 v1/fx1/t1 ③组拖动精确 (111.1,66.7)（100px 屏幕 ÷ zoom 0.9）④右键平移精确 (120,80) ⑤Delete 批量删 3 剩 2 ⑥教程 Modal 内容 ⑦单点选中 out——JS 错误 0；tsc 全绿

### ⚠️ 本轮血泪经验（测试脚本）
- **Playwright `page.mouse` 在 headless 下会丢移动事件**：多选（≥2 节点选中）后的连续 `mouse.move` 循环只派发第一个事件（原生 window 监听也收不到，与 React 无关；CDP `Input.dispatchMouseEvent` 派发则全部到达、React 处理正确）→ **拖动类测试用 CDP 原生派发**：`Input.dispatchMouseEvent`（mouseMoved 定位 + mousePressed{button:'left',buttons:1} + 循环 mouseMoved{buttons:1} + mouseReleased{buttons:0}）；单击类用 `page.click('[data-node="out"]', {position})` 更可靠
- **antd v6（^6.4.3）Modal 关闭后 root 元素保留在 DOM**（wrap `display:none`）→ 检测关闭用 `getComputedStyle(wrap).display === 'none'`，不要用 `.ant-modal-root` 是否存在；modal 内 Esc 关闭需要焦点在 modal 内（portal 事件冒泡路径不含 modal 容器）
- **React 内联 style 的 hex 色渲染后是 rgb() 字符串**：判定选中态用 `el.style.borderColor !== 'rgb(227, 230, 234)'`（未选中 #e3e6ea），不要用 `/#e3e6ea/` 正则
- 测试期间 Delete 会真删节点并影响后续步骤 → 每轮测试前用 `restore-project29.js`（GET 模板 5 → 变量替换 → PUT 项目 29 恢复 5 节点 4 连线）

### ⚠️ 待办（剩余仅产品级）
- [ ] C 类（AI-Video.md）：支付对接（微信/支付宝+算力充值）、安全加固（限流/上传白名单/日志持久化）、antd 按需加载、output/ 清理策略——均属上线前事项，排后
- [ ] 源视频若再 404：先查磁盘清理软件（cleanup 有引用保护不会误删，已确认 4 文件全在）

### 测试脚本经验（新增）
- `system_configs` 表（config_key/config_value）不是 `app_configs`；`llm_provider` 为空 = auto
- PowerShell 不支持 `<` 输入重定向 → 用 `cmd /c "mysql ... < file.sql"` 执行 SQL 种子文件
- `mysql -uroot -p123456 -e "SELECT ..." ai_anime` 查询时注意列名（drama_episodes 是 episode_no 非 episode_number，无 status 列）

---
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

### 🔧 Bug 修复（画布拖拽视角跳变，已提交）
- **症状**：点击画布空白处不能直接拖动，视角瞬间跳走，之后才能拖
- **根因**：`WorkflowCanvas.tsx` onPointerDown 里 pan/node 拖拽的 `startX/startY` 记录的是**窗口坐标**（`e.clientX`），而 onMove 计算位移用的是**容器坐标**（`clientX - rect.left`），两者差一个 `rect.left`（左侧素材面板宽约 260px）→ 按下瞬间 dx 恒偏 -260px，视角跳变
- **修复**：onPointerDown 统一先用 `rect` 换算容器坐标 `sx/sy`，再写入 startX/startY（连线分支原本就正确，一并统一）
- **实测**（`Temp\opencode\test-pan-fix.js`，项目 29）：按下空白处视角零跳变 ✅；平移拖动 (120,80) 精确跟随 ✅；节点拖拽 100px 屏幕位移 → 世界坐标 111.1px（÷zoom 0.9）✅ 全绿

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
