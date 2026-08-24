# AI 动漫短剧创作平台

文生图、文生视频、短剧剧本智能生成、热门创作复刻、视频画布编辑、视频剪辑 —— 一站式 AI 动漫短剧创作工具。

## 技术栈

- **后端**: NestJS 11 + TypeORM + MySQL 8 + Redis
- **前端**: React 19 + Vite 8 + antd 6
- **AI**: 通义万相 / Seedance / CosyVoice / 智谱 / Runway（多模型降级链）
- **渲染**: FFmpeg（工作流渲染管线）

## 快速开始

```bash
# 后端
cd backend && npm install && npx tsc && node dist/src/main

# 前端
cd frontend && npm install && npx vite

# 管理后台
cd admin && npm install && npx vite
```

## 项目结构

```
├── backend/        # NestJS API 服务
├── frontend/       # React 用户端
├── admin/          # React 管理后台
├── docs/           # 设计文档与开发资料
│   ├── models.md           # AI 模型配置与额度
│   ├── deploy.md           # 服务器部署流程
│   ├── viral-studio.md     # 热门创作功能设计
│   ├── canvas-design.md    # 视频画布编辑器设计
│   ├── ai-video-design.md  # 项目总体规划
│   ├── roadmap.md          # 开发路线图
│   ├── dev-checklist.md    # 开发清单与改进方案
│   ├── test-checklist.md   # 测试清单与报告
│   └── READMEs/            # 各模块 README
└── AGENTS.md       # 开发日志（每日工作记录）
```

## 文档导航

| 文档 | 说明 |
|------|------|
| [AI 模型配置](docs/models.md) | 模型清单、API Key、额度统计、降级策略 |
| [服务器部署](docs/deploy.md) | SSH 连接、部署流程、pm2 管理 |
| [热门创作](docs/viral-studio.md) | Viral Studio 完整技术流程与通俗说明 |
| [视频画布](docs/canvas-design.md) | Coze 式节点工作流编辑器设计 |
| [项目总体规划](docs/ai-video-design.md) | 整体架构、模块进度、核心愿景 |
| [开发路线图](docs/roadmap.md) | 各模块完成状态与未来规划 |
| [开发清单](docs/dev-checklist.md) | 分阶段开发计划与短板改造方案 |
| [测试清单](docs/test-checklist.md) | 7 阶段测试流程与结果报告 |
| [开发日志](AGENTS.md) | 每日工作记录（持续更新） |
