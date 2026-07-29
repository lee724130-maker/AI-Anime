# Changelog

## 2026-07-29

### AI 智能规划功能全面增强 + 百度百科 + Playwright 反爬 + 多视角生成

#### 智能规划三策略拆分
- **后端** (`generate.service.ts`): `smartPlan()` 拆分为三个独立策略器 `handleT2i`/`handleT2v`/`handleI2v`，分别处理文字→图片(角色知识库)、文字→视频(分镜创意)、图片→视频(动作指导)
- **前端** (`Generate/index.tsx`): 三个 tab 分别传 `mode: 't2i'/'t2v'/'i2v'`

#### T2I 两步法 + 百度百科
- **两步法**: 第一步 LLM 分析角色并标注【确定】/【推测】，第二步基于分析构建 prompt
- **百度百科**: `searchBaike()` 抓取百科页面 (`meta description` + 前5段 `.para`)，有资料时直接基于资料生成，避免 LLM 脑补
- **自动扩写**: prompt < 15 字时用 LLM 升级为详细描述

#### Playwright 反爬（百度 403 修复）
- **问题**: 百度百科返回 403 Forbidden，axios 被反爬拦截
- **修复**: 新增 `backend/scripts/baike-fetcher.js`（Playwright 无头浏览器），安装 Chromium 191.8MB
- **双层策略**: axios（标准请求头）→ Playwright（真实浏览器渲染），自动降级
- **依赖**: `playwright` 包 + Chromium 已下载

#### 多视角图像生成
- **逻辑**: `textToImage` 根据 `num_images`(1/2/4) 分别生成 view=front/back/left/right 各视角图片
- **输出**: `[{ id, url, view }]` 格式，每张独立调用 `generateImage({ numImages: 1 })` 后归入同一 task
- **前端**: 数量选择器旁标注 "1张=单图 / 2张=正面+背面 / 4张=正面+背面+左侧+右侧"

#### 生成历史展示优化
- 结果列：图片模式显示所有缩略图+视角标签；视频模式修复 `url` 变量未定义 bug
- 文字生图片结果改为多图平铺

#### 相关文件
- `backend/src/modules/generate/generate.service.ts`: searchBaike、handleT2i/handleT2v/handleI2v、多视图循环
- `backend/scripts/baike-fetcher.js`: Playwright 无头浏览器抓取
- `backend/src/modules/generate/generate.controller.ts`: DTO 加入 `mode` 字段
- `frontend/src/pages/Generate/index.tsx`: 传 mode、数量标注、多图展示+视角标签

#### Dashboard 统计卡片整理
- **#2 卡**: 角色/场景资产（与短剧项目重复跳转 `/drama`）→ **AI 生成**（跳转 `/generate`）
- **#4 卡**: 片段总数（死链接）→ **可用算力**（跳转 `/order`）→ **热门创作**（跳转 `/viral`，占位）
- **后端**: `workbench.service.ts` 新增 `totalGenerations` 字段
- **文件**: `frontend/src/pages/Home/index.tsx`

## 2026-07-27

### 火山引擎模型停止使用
- **因欠费 21.83 元，删除所有火山引擎 API Key 和模型配置**
- 删除 `system_configs` 中 `volcengine_api_key`、`seedance_api_key`、`seedream_api_key`
- 删除 `model_configs` 中 7 条火山引擎模型记录（文字/图片/视频/3D）
- 所有 md 文档添加"因欠费火山模型已停止使用"备注

## 2026-07-21

### 工作台 Dashboard 重设计 + Header 优化 + 大资产库保存修复

#### 前端改动
- **Dashboard 重设计**：Hero 渐变区 + 统计卡片圆角图标布局 + 快捷入口 4 列网格 + 左右双栏（项目列表/任务概览/失败任务）
- **布局对齐**：左栏 `lg={16}` 右栏 `lg={8}`，统一 `border`/`boxShadow`/`borderRadius` 变量
- **项目列表**：改用 antd `List` 标准对齐，hover 高亮，箭头按钮 `RightOutlined`
- **任务概览**：「处理中/待处理」双格布局 + 进度条
- **状态标签修正**：「排队中」→「待处理」，排除无意义的 segment pending 计数
- **Header 重构**：自定义 flex 导航（去 antd Menu），新增「大资产库」入口
- **Header 右侧**：充值按钮浅紫底、用户卡片 38px、退出按钮默认红色 + 文字
- **Generate 保存修复**：解析 `input_data` 取 prompt，新增描述/中文提示词输入框，解决保存到大资产库字段缺失

#### 后端改动
- **GlobalAssets.tsx**：智能规划按钮增加 `loading={planning.has(asset.id)}` 状态显示
- **global-asset.controller.ts**：所有 `@Param('id')` 加 `ParseIntPipe`

#### 构建验证
- 后端 + 前端 `npm run build` 零错误通过

## 2026-07-20

### 片段生成进度 UI 增强 + 防重复提交 + 大资产库入口 + Bug 修复

#### 前端改动
- **EpisodeDetail.tsx**：状态标签新增「⏳ 生成中」(processing 蓝色)，区分 completed/pending/failed/generating
- **生成按钮**：生成中禁用（`disabled` + `loading`），防止重复点击
- **submittingGuard**：新增 `submittingRef` + `submitting` 状态，API 提交期间立即拦截重复点击（比轮询守卫更早）
- **批量进度条**：批量生成时展示 `Progress` 组件（`completed/total`），全部完成后 1.5s 自动消失
- **清理无用导入**：移除未使用的 Popconfirm、Divider、DeleteOutlined、SyncOutlined、PlayCircleOutlined 等
- **Drama 各页面清理**：修复 Assets/Episodes/GlobalAssets/index.tsx/EditAnalysis 等文件的 TS6133 未使用变量/导入
- **UserLayout**：ReactNode 改为 `import type`
- **Bug 修复**：切换分集时清除旧轮询定时器，防止 stale closure 导致数据错乱
- **GlobalAssetService**：移除未使用的 `In` import
- **阶段 7.5 收尾-2**：AI 生成中心历史记录中，已完成项目增加「保存」按钮，弹出模态框选择类型/名称后保存到大资产库；视频生成结果拦截提示不支持
- **GlobalAssets.tsx**：卡片按钮改为 3 列布局，新增「智能规划」按钮（含 loading 状态），与 Assets.tsx 对齐
- **Bug 修复 3.1**：`generateImage()` 增加 `urls` 空数组检查，防止 AI 未返回图片时崩溃
- **Bug 修复 2.1**：`global-asset.controller.ts` 所有 `@Param('id')` 增加 `ParseIntPipe`，确保参数类型正确
- **阶段 8 工作台**：创建 WorkbenchModule，提供 `/api/workbench/summary|projects|failed-tasks|disk-usage` 聚合端点
- **阶段 8 任务面板**：Dashboard 升级为工作台：项目进度列表/继续入口、任务队列状态(处理中/排队中)、中文失败原因展示、10s 自动轮询刷新
- **阶段 8 失败原因中文化**：40+ 常见错误映射到中文，覆盖网络/认证/配额/AI 服务/内容审核等
- **Dashboard** 已有「大资产库」入口（快速链接卡片），无需额外修改
- **构建验证**：后端 + 前端 `npm run build` 零错误通过

## 2026-07-17

### Drama UI 重构 + 资产库增强

#### 后端改动
- **500 路由冲突修复**：`drama.controller.ts` 中 `@Get(':id')` 移至 `@Get('ping')`/`@Get('model-info')` 之后
- **Episode 设置独立化**：`DramaEpisode` 实体新增 `style`/`ratio`/`resolution` 列，视频生成从此读取 episode 级别设置而非 project 级别
- **新端点**：
  - `PUT episodes/:episodeId/settings` — 更新单集画面设置
  - `POST episodes/:episodeId/segments/:segmentId/plan` — 智能规划片段时长+时间线
  - `POST :id/assets/:assetId/plan-prompt` — 智能优化资产提示词
  - `POST episodes/:episodeId/segments/:segmentId/generate` — 支持 `{width, height, style}` 参数
  - `POST :id/assets/:assetId/translate` — 中文转英文翻译
  - `POST /api/global-assets/:id/translate` — 同上（大资产库）
  - `POST /api/global-assets/:id/plan-prompt` — 大资产库智能规划
- **样式关键词移除**：`drama.service.ts`/`video.service.ts`/`character.service.ts`/`video.processor.ts` 中不再将 `styleLabel` 写入存储的 prompt 文本，style 仅通过参数运行时传递
- **重复资产检查**：`addAsset()` 新增 `project_id + type + name` 唯一性校验，防止同一资产重复添加
- **GlobalAsset 生成增强**：`POST /api/global-assets/:id/generate` 新增接受 `width`/`height`/`style` 参数

#### 前端改动
- **Assets.tsx（小资产库）**：
  - 图标按钮 → 全宽度文字按钮（2x2 网格布局）
  - 卡片列宽改为 `xs=24 sm=12 md=8 lg=6`
  - 图片居中显示（`maxHeight: 140`）
  - 编辑提示词改用 Modal（不再使用 `prompt()`）
  - 新增生成图片参数 Modal（风格/宽高比/画质选择器）
  - 新增"智能规划"按钮
  - 移除锁定按钮
  - 提示词文本截断 3 行 + 点击直接进入编辑弹框
- **GlobalAssets.tsx（大资产库）**：同步更新为 Assets.tsx 相同的文字按钮样式 + 网格布局 + 生成参数 Modal + 编辑提示词 Modal
- **Create.tsx/Detail.tsx**：移除 style/ratio/resolution 字段
- **index.tsx**：项目列表仅显示 genre/episodes/created_at
- **Episodes.tsx**：新增每集 style/ratio/resolution 设置 Modal + 标签显示
- **EpisodeDetail.tsx**：片段级 3-15s 时长下拉框 + 智能规划按钮 + 编辑提示词 Modal
- **编辑弹框重构**（大小资产库）：
  - 上：中文提示词可编辑 / 下：英文提示词只读
  - 中间两个按钮：智能规划 / 中文转英文
- **发布按钮背景色**：加了 `#f5f5f5` 背景 + hover/active 效果
- **Seedream 水印修复**：`ai-service.util.ts` Seedream 图片生成请求体补加 `watermark: false`，解决生成图片带 AI 水印问题
- **片段生成异步化**：`generateSegment()` 改为提交 Bull 队列任务，前端轮询状态，不再阻塞 HTTP 响应

#### 文档
- `AI-Video.md`：进度区更新 + 今日日志
- `CHANGELOG.md`：新增 2026-07-17 条目

## 2026-07-16

### HappyHorse 免费额度模型配置

#### 数据库
- **`model_configs` 表更新**：删除 5 条旧阿里云模型，插入 14 条新配置
- **优先级链**：HappyHorse（priority 1-7，免费额度各 10 次）→ 万相（priority 8-14，兜底）

#### 后端改动
- **`ai-service.util.ts`**：`getTongyiVideoModels()` 降级链 HappyHorse 排最前
- **`video.processor.ts`**：移除 `duration > 5` 时强制 `wan2.7-t2v` 的硬编码逻辑，改为纯自动选择

#### 前端改动
- **`Studio/index.tsx`**：模型选择器新增 6 个 HappyHorse 选项

#### 文档
- `AI-MODEL-STATUS.md`：阿里云模型区重写
- `AI-Video.md`：进度区更新 + 今日日志
- `backend/seed-happyhorse.sql`：新建种子脚本

## 2026-07-15

### Phase 5: 短剧资产库 (Drama Asset Library)

#### 后端新增
- **5 个资产生成端点**: `POST /api/drama/:id/assets`（新增资产）、`DELETE /api/drama/assets/:assetId`（删除）、`POST /api/drama/:id/assets/:assetId/generate`（单个生成）、`POST /api/drama/:id/assets/generate-all`（批量生成）、`POST /api/drama/:id/assets/:assetId/upload`（上传替换）
- **资产图片生成**：`generateImage()` 新增 `model` 参数路由，支持按模型前缀自动选择 Seedream/通义万相/CogView-4
- **候选图版本管理**：重新生成或上传替换时，旧图自动移入 `candidates` 字段
- **资产锁定保护**：`locked` 字段 + `updateAsset()` 方法

#### 前端新增
- **`/drama/:id/assets` 资产库专用页面**：三 Tab（人物/物品/场景）、每张卡片显示名称/状态/缩略图、支持生成/编辑/锁定/删除操作
- **Detail.tsx 入口按钮**：资产概览区增加「进入资产库」按钮快捷跳转

#### 模型与集成
- **Volcengine ARK 全面切换到 Endpoint ID**：`model_configs` 表删除 8 条旧模型 ID，插入 7 条 Endpoint ID；代码前缀路由从 `doubao-seedream`/`doubao-seedance` 改为 `ep-`；所有 Volcengine 调用统一使用 `volcengine_api_key`
- **Seedream 4.5 图片生成验证通过**（1920×1920 以上分辨率）
- **Seed-2.1-pro 文字对话验证通过**
- **Seedance 1.0 Pro 视频生成验证通过**

#### 构建验证
- 后端 `npm run build` ✅
- 前端 `npx tsc --noEmit` ✅
- E2E 测试：创建项目→分析→生成 8 个资产（全部 Seedream 成功）→新增资产→批量生成 → 全链路通过 ✅

## 2026-06-23

### 展示页优化 (Landing Page)
- 恢复上一版简洁风格（紫色渐变调色、白色背景、圆角卡片）
- 新增板块：平台数据条、三步流程（详细描述）、适用场景（6用例卡片）、算力套餐预览、常见问题（FAQ 独立卡片式）
- 所有模块统一 `max-width: 1000px`
- 去掉平台数据板块
- FAQ 改为 2 列栅格布局

### 顶栏统一 (AppHeader)
- 新建 `components/AppHeader/index.tsx` — 共享白色顶栏组件
- 左侧 `🎬 AI 动漫短剧` logo 点击跳转展示页 `/`
- 右侧用户头像 + 算力、充值、退出按钮
- Dashboard 移除 `HomeOutlined` 返回展示页按钮

### 导航按钮重构
- 所有「返回主页/首页」按钮改为「返回」，跳转目标从 `/` 改为 `/dashboard`
- Script / Character / Video / Order / Studio / User 六页面统一结构：
  - 第一行：居中页面标题
  - 第二行：`[返回]` 左对齐，操作按钮（如有）右对齐
- 去掉所有渐变横幅样式

### Back Button 交互增强
- 新增 `.back-btn` CSS 类（`frontend/src/index.css`）
- hover: 紫色边框 + 浅紫背景 + 阴影
- active: 深紫边框 + 紫灰背景 + `scale(0.97)` 按下效果

### Admin 后台样式优化
- 新增 `ConfigProvider` 包裹全局（`main.tsx`），设置中文 locale + 主题 token
- 全局 `index.css` 重写 — 表格表头加粗、卡片悬浮阴影、滚动条美化、登录页动画、统计卡片 `translateY` 悬浮效果、快捷入口圆形图标背景 + 上浮动画
- **登录页**: 分区动画 (`loginFadeIn` / `loginSlideIn`)、表单改用 `layout="vertical"`、输入框间距优化、按钮圆角统一
- **Dashboard**: 统计卡片加 `stat-card` 类悬浮上移；快捷入口卡片加 `quick-link-link` 类 + 圆形图标容器 + 上浮阴影；标题区 `fontWeight: 600` 统一；用户头像区域 hover 背景高亮
- **用户管理**: 搜索栏 + 表格卡片内边距优化（`styles.body.padding`）
- **系统配置**: 卡片标题用 emoji + 图标混合、表单 `maxWidth` 放宽至 720px
- **日志中心**: 筛选栏 + 表格卡片内边距统一、操作日志刷新按钮对齐
- **API 密钥管理**: 密钥显示区域背景微调、安全提示卡片标题美化
