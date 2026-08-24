# 画布（Canvas Workflow）项目设计文档

> **需求日期**：2026-08-04
> **页面定位**：与「热门创作 / 短剧工作室 / AI生成 / 大资产库」同级的独立主页面
> **一句话**：把生成好的视频/图片/文字/音频，在画布上可视化拼接、加特效、预览、导出成片

---

## ⚠️ 设计变更（2026-08-04 晚间，已实施）：横向卡片 → Coze 式节点流程图

> 用户反馈旧编辑器（横向卡片顺序）不符合预期，要求按**扣子 Coze 式节点流程图**重做。
> 本文下方 §0~§14 为初版设计（横向卡片时间线），**已被新方案取代**，保留作历史参考。
> **当前进度：后端渲染管线全部完成并验证通过；前端编辑器已重写、浏览器实测通过（2026-08-05 收尾），详见 AGENTS.md「2026-08-04（晚间追加）」与「2026-08-05」。**

### 新数据模型（nodes 列存完整 JSON，不再拆数组）

```json
{
  "nodes": [
    {
      "id": "video_xxx_0",
      "type": "video | image | text | audio | effect | output",
      "position": { "x": 60, "y": 60 },
      "source": { "kind": "upload|ai_history|global_asset|viral|drama", "ref_id": 123, "url": "/static/..." },
      "duration": 3,
      "params": {}
    }
  ],
  "edges": [ { "id": "edge_xxx", "from": "nodeId", "to": "nodeId" } ]
}
```

- **effect 节点** params：`kind:'transition'`（transition: fade/fade_black/fade_white/wipe_left/wipe_right/slide_left/slide_right/circle，transition_duration）或 `kind:'filter'`（grayscale/sepia/warm/cool/vintage/bright/dark/contrast/soft/vivid）
- **text 节点** params：`text/start/x/y/font_size/text_color/opacity/animation('none'|'fade'|'slide_up'|'zoom_in')`
- **audio 节点** params：`volume/start/fade_in/fade_out`
- 兼容：旧数组格式走 `renderLegacy`（`parseWorkflow` 自动识别 `{nodes,edges}` vs 数组）

### 连线语义（canvas.service.ts）

| 连线 | 含义 |
|------|------|
| video/image → video/image（沿边顺序） | 主链播放顺序（`buildMainChain`，无媒体入边节点出发，成环按 position.x 兜底） |
| effect 夹在两段媒体之间 | 转场（`findBridgeEffect` → xfade 合并） |
| effect 直接连单个视频 | 滤镜（`applyClipFilter`） |
| text/audio → output | 叠加层 / 音轨 |
| output 节点 | 渲染目标 |

### 渲染引擎（renderWorkflow）

1. 主链逐段渲染（video: fitVideoToRatio→fitToExactDuration→normalizeToRes；image: composite）→ 相邻段转场 xfade 合并（`mergeWithTransitions2`，伪节点包 `{transition:{...}}`）
2. 文字叠加：`generateOverlayTextVideo`（透明 RGBA MOV）→ `overlayClipOnVideo`（setpts 偏移 + enable=between）
3. 音频轨：`mixAudioTracks`（多轨 volume+adelay+淡入淡出+amix）；bgm_url 兼容（音量 0.3）
4. 输出 `output/canvas_result_{id}_{ts}.mp4`

### 前端编辑器（Editor.tsx 重写 + 3 新组件）

- 布局：顶部工具栏（名称/比例/分辨率/节点连线计数/保存/导出渲染/下载）+ 左侧「节点 / 素材」Segmented 面板 + 中央 `WorkflowCanvas`（滚轮缩放/拖空白平移/节点拖拽/端口连线 SVG 贝塞尔边/删除连删边）+ 右侧 `PropertiesPanel` + 底部成片预览
- 组件：`WorkflowTypes.ts`（类型+NODE_META 配色+选项常量）、`WorkflowCanvas.tsx`、`PropertiesPanel.tsx`、`AssetPanel.tsx`（AssetItem/AssetCard 复用）
- DOM 约定：节点 `data-node={id}`、端口 `data-port="in|out" data-dir`、面板 `data-palette={type}`
- 连线：节点右侧圆点 → 左侧圆点（mouse down/up，elementFromPoint 命中 `[data-port]`）

### 实测结论（2026-08-05）

- 全链路 UI 测试通过：6 节点（video×2+effect+text+audio+output）+ 素材选择 + 5 连线 + 保存持久化（nodes=6 edges=5）+ 渲染完成「下载成片」出现 + 成片 720×1280/5.5s/含音频（3+3−0.5 转场）
- 滤镜链路通过：effect 切 filter + sepia → 渲染 720×1280/3s 成功
- 修复：属性面板素材 options 重复 URL 导致 React key 警告（去重）；节点排布 3 列改 2 列（`60+col*280, 60+row*160`）避免第 3 列节点溢出画布被遮挡
- 测试脚本注意：antd Button 带 href 渲染为 `<a>`（找"下载成片"用 `a:has-text`）；端口定位用 `[data-port]` 自身 boundingBox（勿用节点偏移估算）；`[data-node]` 会命中端口圆点，需 `:not([data-port])`

---

## 0. 已确认的产品决策（2026-08-04 用户确认）

| 决策项 | 结论 |
|--------|------|
| 画布形态 | **时间线化自由画布**：横向摆放 = 播放顺序，拖拽换序，无连线学习成本 |
| 首版素材来源 | **全部集成**：AI生成历史 / 大资产库 / 热门创作 / 短剧片段 / 本地上传 |
| 首版特效范围 | **文字 + BGM + 转场**（滤镜/调色后置） |
| 画布模板复用 | **首版就要**：画布可另存为模板，模板含占位变量，可复制复用 |
| 渲染方式 | 后端 FFmpeg 异步渲染（Bull 队列），前端轮询进度 |

---

## 1. 产品定位

**画布是一个"所见即所得的视频组装工作台"。**

- **承接上游**：AI生成历史、热门创作成片、短剧片段、大资产库素材，全部可拖入画布
- **产出下游**：多素材按顺序拼接 + 特效（转场/文字/BGM）→ 预览 → 导出成片下载
- **与剪辑软件的区别**：用户不需要理解时间线/轨道/关键帧，只需要"把素材摆成一排 + 点几下加效果"

---

## 2. 核心概念（画布模型）

**一个画布项目 = 一批素材块按顺序摆放，最终渲染成一支视频。**

```
┌────────────────────────────────────────────────────────┐
│  ▶ 预览播放器                    【保存】 【导出渲染】   │
│  ├──────○────────────────────────┤  播放头              │
├────────────────────────────────────────────────────────┤
│  素材面板(左侧)                    画布(右侧)             │
│  ┌──────────────────┐  ┌───────┐ ┌───────┐ ┌─────────┐ │
│  │ 📁 AI生成历史      │  │ 视频A │→│ 视频B │→│ 文字卡C  │ │
│  │ 📁 大资产库        │  │3s 竖屏│ │4s 竖屏│ │2s 紫底  │ │
│  │ 📁 热门创作成片    │  └──┬────┘ └──┬────┘ └─────────┘ │
│  │ 📁 短剧片段        │  ┌──┴────┐ ┌──┴────┐            │
│  │ 📁 本地上传        │  │淡入转场│ │黑场转场│           │
│  │                   │  └───────┘ └───────┘            │
│  │ [文字块][BGM块]    │   +文字层: "新品上市"            │
│  └──────────────────┘  +BGM: 背景音乐                   │
└────────────────────────────────────────────────────────┘
```

**规则**：
- 素材块在画布上的**横向位置 = 最终播放顺序**（拖拽换序）
- 每个视频/图片块可设置：时长、比例适配、转场（与前一块之间）
- 文字块/BGM块 是"附加层"，挂在某个时间位置或整片背景
- 每块素材只存**来源 URL 引用**，不复制文件（与 viral 项目同思路）

---

## 3. 素材块类型（v1）

| 类型 | 说明 | 来源 | 参数 |
|------|------|------|------|
| 视频块 | 一段视频 | 上传/AI历史/热门创作/短剧/大资产库 | 时长、转场、是否保留原声 |
| 图片块 | 自动 Ken Burns 缓动（复用 composite） | 同上 | 时长、镜头运动(zoom/pan/static) |
| 文字块 | 文字卡片（复用 generateTextVideo，紫底白字淡入淡出） | 画布内建 | 文字内容、字号、背景色、时长 |
| BGM块 | 背景音乐（整片叠加） | 上传 / 热门创作模板自带音乐 | 音量、循环、是否淡出 |
| 转场 | 两视频块之间 | 画布内建 | 类型（见 §8 转场方案） |

---

## 4. 用户流程

```
进入画布页
 ├─ 新建画布项目（名称/比例/分辨率） 或  从画布模板创建（填变量）
 ├─ 从素材面板拖素材到画布
 ├─ 拖拽排序 / 拖尾调时长 / 双击编辑
 ├─ 加转场、文字块、BGM
 ├─ 预览核对（单段预览，渲染后整片预览）
 ├─ 点击【导出渲染】→ 进度 → 成片下载
 └─ （可选）另存为画布模板，下次复用
```

---

## 5. 数据模型（新增 2 张表）

> 节点结构用 **JSON 列**存储（与 `viral_projects.scenes` 同构，简单可靠，项目规模小无需拆表）

### canvas_projects（画布项目主表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| user_id | int | 所属用户 |
| name | varchar(100) | 项目名称 |
| ratio | varchar(10) | 9:16 / 16:9 / 1:1 / 3:4 / 4:3 / 2:3（默认 9:16） |
| resolution | varchar(10) | 480p / 720p / 1080p（默认 720p） |
| fps | int | 帧率（默认 24） |
| nodes | text(JSON) | 节点数组（见下） |
| bgm_url | varchar(500) | 整片 BGM（可选） |
| status | varchar(20) | pending / rendering / completed / failed |
| progress | int | 0-100 |
| result_url | varchar(500) | 渲染成片 URL |
| error_msg | text | 失败原因 |
| created_at / updated_at | datetime | 时间戳 |

**nodes JSON 结构**：

```json
[
  {
    "id": "uuid",
    "type": "video | image | text",
    "source": { "kind": "upload | ai_history | global_asset | viral | drama", "ref_id": 123, "url": "..." },
    "duration": 3,
    "order": 0,
    "params": { "text": "", "bg_color": "#7C3AED", "font_size": 48, "kenburns": "zoom_in" },
    "transition": { "type": "fade_black", "duration": 0.5 },
    "mute": false
  }
]
```

### canvas_templates（画布模板表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| user_id | int | 创建者（系统模板为 null） |
| name | varchar(100) | 模板名称 |
| description | text | 描述 |
| category | varchar(50) | 分类（默认 "通用"） |
| ratio | varchar(10) | 比例 |
| resolution | varchar(10) | 分辨率 |
| nodes | text(JSON) | 节点结构（含 `{{变量名}}` 占位） |
| variables | text(JSON) | 变量声明 [{key,label,type,default_value,required}] |
| usage_count | int | 使用次数 |
| is_system | boolean | 系统/用户模板 |
| status | varchar(20) | active / draft |
| created_at / updated_at | datetime | 时间戳 |

---

## 6. API 设计

### 画布项目

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/canvas/projects | 项目列表（含封面） |
| POST | /api/canvas/projects | 新建项目（可带 template_id 从模板创建） |
| GET | /api/canvas/projects/:id | 项目详情（nodes 解析后返回） |
| PUT | /api/canvas/projects/:id | 更新名称/nodes/ratio/resolution/bgm_url |
| DELETE | /api/canvas/projects/:id | 删除项目（含渲染产物） |
| POST | /api/canvas/projects/:id/render | 触发渲染（Bull 队列异步） |
| GET | /api/canvas/projects/:id/export | 渲染进度 + 成片 URL |

### 画布模板

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/canvas/templates | 模板列表 |
| GET | /api/canvas/templates/:id | 模板详情 |
| POST | /api/canvas/templates | 手动创建模板 |
| PUT | /api/canvas/templates/:id | 编辑模板 |
| DELETE | /api/canvas/templates/:id | 删除模板 |
| POST | /api/canvas/templates/:id/duplicate | 复制模板 |
| POST | /api/canvas/projects/:id/save-as-template | 项目另存为模板 |

### 素材面板（复用现有接口，零新增）

| 面板 | 接口 |
|------|------|
| AI生成历史 | GET /api/generate/tasks（已完成项的视频/图片） |
| 大资产库 | GET /api/global-assets（图片） |
| 热门创作 | GET /api/viral/projects（result_url 成片） |
| 短剧片段 | GET /api/drama（各集成片 / 片段视频） |
| 本地上传 | POST /api/media/upload（复用现有上传） |

---

## 7. 前端架构

### 页面目录

```
frontend/src/pages/Canvas/
├── index.tsx                    # 画布项目列表 + 模板库 Tab
├── Editor.tsx                   # 画布编辑器（核心页面）
├── components/
│   ├── AssetPanel.tsx           # 素材面板（5 个来源 Tab + 搜索）
│   ├── CanvasBoard.tsx          # 画布主体（横向排序区 + 特效区）
│   ├── NodeCard.tsx             # 素材块卡片（预览缩略图/时长/拖拽手柄/删除）
│   ├── PreviewPlayer.tsx        # 预览播放器 + 播放头
│   ├── EffectsDrawer.tsx        # 特效抽屉（转场选择/文字编辑/BGM 选择）
│   ├── TemplateSaveModal.tsx    # 另存为模板弹窗（名称/分类/变量声明）
│   └── TemplateCreateModal.tsx  # 从模板创建项目弹窗（填变量）
```

### 交互技术选型（自研轻量，零新依赖）

- **拖拽换序**：HTML5 Drag & Drop（draggable 卡片 + drop 插入指示线），不引入 react-grid-layout/dnd-kit，控制体积
- **素材面板 → 画布**：面板卡片 draggable，画布区 onDrop 追加节点
- **调时长**：卡片右缘拖拽手柄（Pointer Events），宽度 = 时长（1px ≈ 0.1s），松手保存
- **预览**：单段预览（video src 切换）；渲染完成后整片预览
- **播放头**：点击卡片时预览该段，P3 起播放头可连续扫过多段（video ended 事件切下一段）

### 路由

```typescript
{
  path: '/canvas',
  element: <CanvasLayout />,
  children: [
    { index: true, element: <CanvasIndex /> },      // 项目列表+模板库
    { path: 'editor/:id', element: <CanvasEditor /> }, // 画布编辑器
  ]
}
```

---

## 8. 渲染引擎（复用现有 ffmpeg.util）

### 渲染流程

```
按 nodes.order 遍历 →
  视频块：downloadToLocal 下载 → fitToExactDuration 对齐时长
  图片块：composite（Ken Burns，duration 对齐）
  文字块：generateTextVideo（文字卡片，duration 对齐）
  相邻块：应用转场（见下）
  末尾：BGM 叠加（amix/apad + fade out）
  → mergeVideos 拼接 → 输出成片
```

### 转场方案（⚠️ 已实测验证）

**环境事实**：项目内嵌 ffmpeg 为 2018 老版（N-92722），**不支持 xfade**（FFmpeg 4.3 才加入），但支持 `fade` / `amix` / `apad` / `acrossfade`。

| 方案 | 做法 | 效果 |
|------|------|------|
| **降级方案（默认，零风险）** | 前块尾部 `fade=t=out:st=dur-0.5:d=0.5` + 后块头部 `fade=t=in`，再拼接 | 黑场过渡（淡出→淡入），干净可靠 |
| 升级方案（可选） | 下载新版 ffmpeg.exe 替换 `@ffmpeg-installer` 二进制（或换 npm 包），用 xfade | 溶解/擦除/圆角等丰富转场 |

**建议**：v1 用 fade 黑场转场，渲染引擎预留 xfade 分支；后续升级 ffmpeg 后无痛切换（升级前需回归测试全链路：apad/atempo/composite/merge 等）。

---

## 9. 画布模板复用（首版就有）

### 设计思路（复用 viral 模板模式）

1. **存模板**：项目 → 「另存为模板」→ 弹窗填名称/分类/描述，并把文字块内容/节点可替换项声明为变量（`{{变量名}}` 占位）
2. **用模板**：模板库 → 「使用此模板」→ 填变量值 → 生成新画布项目（nodes 里的 `{{变量}}` 全部替换）
3. **复制模板**：用户复制系统模板成为自己的版本（独立编辑，复用 `usage_count` 统计）

### 变量声明结构

```json
[
  { "key": "slogan", "label": "结尾文案", "type": "text", "default_value": "新品上市", "required": true }
]
```

节点中文字块内容写 `{{slogan}}`，创建项目时替换。

---

## 10. 与现有模块集成

| 现有模块 | 集成方式 |
|----------|----------|
| AI 生成历史 | 素材面板数据源，取已完成任务的视频/图片 |
| 大资产库 (GlobalAssets) | 素材面板数据源（图片为主） |
| 热门创作 (Viral) | 素材面板数据源，取项目成片 result_url |
| 短剧工作室 (Drama) | 素材面板数据源，取集成片/片段视频 |
| 媒体文件 (media_files) | 本地上传素材 |
| FFmpeg 工具 | composite / generateTextVideo / fitToExactDuration / mergeVideos / fade 转场 |
| 模型配置 (model_configs) | 不需要 AI 模型（画布纯编排，不调模型）——**零模型成本** |
| 任务系统 (generation_tasks) | 渲染任务记录状态历史（可选，先直接用项目 status） |

**关键收益**：画布功能**完全不消耗模型额度**，只有 FFmpeg 本地计算，对用户成本几乎为零。

---

## 11. 开发阶段规划

| 阶段 | 内容 | 验收标准 | 预估 |
|------|------|---------|------|
| P1 | 画布骨架：项目 CRUD + 节点 JSON 存储 + 拖拽换序 + 顺序拼接导出（无特效） | 拖 3 个素材 → 能导出一支完整视频 | 1.5 天 |
| P2 | 特效三件套：文字块 + BGM + fade 转场 | 能做出"素材+转场+文字+BGM"完整表达 | 1 天 |
| P3 | 素材面板全集成（5 来源）+ 预览播放头 + 草稿自动保存 | 能从任意模块拖素材进画布 | 1.5 天 |
| P4 | 画布模板（存模板/用模板/变量替换/复制）+ 封面 + 体验打磨 | 模板可复用出系列视频 | 1 天 |

**MVP 总排期 ≈ 5 天**

---

## 12. 涉及文件清单

### 后端新增

| 文件 | 说明 |
|------|------|
| `backend/src/modules/canvas/canvas.module.ts` | 模块注册（含 BullMQ） |
| `backend/src/modules/canvas/canvas.controller.ts` | 全部 API 端点 |
| `backend/src/modules/canvas/canvas.service.ts` | 项目/模板 CRUD + 渲染编排 |
| `backend/src/modules/canvas/canvas-project.entity.ts` | 画布项目实体 |
| `backend/src/modules/canvas/canvas-template.entity.ts` | 画布模板实体 |
| `backend/src/modules/canvas/canvas.dto.ts` | DTO 校验 |
| `backend/src/modules/canvas/canvas.render.processor.ts` | 渲染任务消费者（Bull） |

### 后端修改

| 文件 | 说明 |
|------|------|
| `backend/src/app.module.ts` | 注册 CanvasModule |
| `backend/src/utils/ffmpeg.util.ts` | 新增 `applyFadeTransition`（或渲染编排内联实现） |

### 前端新增

| 文件 | 说明 |
|------|------|
| `frontend/src/pages/Canvas/index.tsx` | 项目列表 + 模板库 |
| `frontend/src/pages/Canvas/Editor.tsx` | 画布编辑器 |
| `frontend/src/pages/Canvas/components/*` | AssetPanel / CanvasBoard / NodeCard / PreviewPlayer / EffectsDrawer / 两个 Modal |

### 前端修改

| 文件 | 说明 |
|------|------|
| `frontend/src/App.tsx` | 新增 `/canvas/*` 路由 |
| `frontend/src/components/AppHeader/index.tsx` | 导航加「画布」 |
| `frontend/src/pages/Home/index.tsx` | 工作台加「画布」快捷入口 |
| `frontend/src/services/api.ts` | （如需要）类型声明 |

---

## 13. 已知边界 / 风险

1. **老版 ffmpeg 无 xfade**：v1 转场用 fade 黑场过渡；升级 ffmpeg 后可扩展，升级前必须回归测试
2. **素材 URL 过期**：拖入画布的素材渲染时若 404，先尝试重新下载，失败则节点标红提示"素材失效，请重新拖入"
3. **比例不一致**：各素材比例可能与画布项目比例不同 → 渲染时按项目比例 crop（同 viral 的裁切策略，可能有轻微裁切）
4. **转场时长重叠**：带转场的相邻块总时长 = A+B-转场时长，渲染计算偏移量时需精确
5. **本地文件引用**：短剧/热门创作的成片是本地路径，渲染前需确认文件存在（磁盘清理可能删文件）
6. **渲染耗时**：素材多时长长时 FFmpeg 渲染可能 1-3 分钟，进度展示 + 失败重试
7. **并发**：同一用户多个渲染任务 → Bull 队列排队（复用短剧片段队列模式）

---

## 14. 待确认（开发前）

- [ ] 转场是否接受 v1 用"黑场过渡"，还是先升级 ffmpeg 做丰富转场？
- [ ] 画布编辑器是否需要"画布模板库"独立 Tab（建议：项目列表页双 Tab）
- [ ] BGM 是否同时支持"从热门创作模板的音频配置导入"？
- [ ] 文字块除紫底白字外，是否首版就需要样式选择（白底黑字/透明底描边）？
