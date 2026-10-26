# 当前版本功能与工作流程（v2026-10-26）

> 本文档记录截至 **2026-10-26** 的版本功能全景与工作流程，供后续接手快速了解现状。
> 配套阅读：`AGENTS.md`（修复日志/血泪教训）、`docs/deploy.md`（部署）、`docs/dev-checklist.md`（开发清单）、`docs/agnes-models.md`（模型参数，未跟踪）。

---

## 一、总体架构

| 端 | 技术栈 | 端口 | 说明 |
|----|--------|------|------|
| backend | NestJS + TypeORM + MySQL + Redis | 3000 | `synchronize:true` 自动建表 |
| frontend | React + Vite + antd v6 | 5173(dev) | 生产 nginx 反代 `/api/` → 3000 |
| admin | React + Vite + antd v6 | 5174(dev) | 管理后台，独立 2FA 登录 |
| 生产 | `anime.leesystem.xyz`（阿里云 47.121.137.131） | 443 | pm2 `ai-anime-backend` + 三端 dist |

**生产环境特殊点**：
- 后端 `envFilePath: ['.env.local', '.env']` —— **`.env.local` 优先**，改任何 env 键值两个文件都要改，验证按此顺序解析取最终值。
- 生产 Redis **db5**（本地 db0）；MySQL 必须 `-h127.0.0.1 -u ai_anime`（不带 `-h` 走 socket 必 1045）。
- 面板端口 **35823**（8888 已不监听；ufw 里的 888 是 phpMyAdmin 保留口）。

---

## 二、账号与鉴权

- 注册 = 邮箱 + 验证码（Redis 存码 5min，同邮箱 60s 限频，每 IP 每日限 2 个注册）；登录支持邮箱或用户名。
- **超管强制 2FA**：生产 `NODE_ENV=production` 下 admin 登录一律走邮箱验证码（`skipVerification` 被忽略，仅非生产环境可跳过供测试脚本用）。
- 前台登录页有「邮箱验证」第 2 步（自动发码 + 60s 重发倒计时 + 错码停留重输）；管理后台（5174/admin）独立 2FA 三步流程。
- 角色：`user.role` ∈ user/admin；`is_super_admin` + `admin_permissions` 控制管理后台细粒度菜单与超管专属页（Server/Database）。
- 封禁：SecurityMiddleware 按 IP 封禁（`banned_ips`），403「访问受限」。

---

## 三、AI 模型与供应商链（现状）

### 模型配置（`model_configs`，本地与生产已收敛一致）
| 用途 | active 模型 | 说明 |
|------|------------|------|
| 文生图 | `agnes-image-2.5-flash`（id95） | 1K/2K/3K/4K 四档 + 比例参数 |
| 文生视频 t2v | `agnes-video-2.5-flash`（id96） | 仅 720P、4~12 秒任意整数 |
| 图生视频 i2v | `agnes-video-2.5-flash`（id97） | keyframe 模式（首帧锚定） |
| 多图参考 r2v | `agnes-video-2.5-flash`（id98） | reference 模式，图 ≤5 |
| TTS 配音 | `qwen-audio-3.1-tts-flash`（星予 `loongstella_v3.1`） | 默认音色，降级 CosyVoice → OpenAI |

- **端点**：`https://api.agnes-ai.cn`（中国区，key 必须是 CN 区，国际区 key 必 401）。
- **key 存放**：`system_configs.agnes_api_key`（本地值=CN key，来自仓库外 `C:\Users\Administrator\.opencode-ext\agnes-cn-key.txt`，**不进 git/文档/日志**）。
- **自动降级链**：图像 auto = Agnes → 商汤 SenseNova → 火山 → OpenAI → 智谱；视频 auto = Agnes → 通义万相 → 火山 → Runway → 智谱（显式指定模型失败后落 auto 再走一遍，但 t2v 有「防双预算闸」）。
- **t2v 拥堵重试**：一次点击最多 **10 次创建尝试、成功即停**，间隔 45~65s 随机抖动（防多任务同秒撞 429），总窗口约 7~10 分钟；耗尽才走降级链，全败则失败退款。
- Agnes 视频轮询上限 **20min**（5s 片实测渲染 ~375-623s）。
- 后台生成并发上限 **3**（`system_configs.max_concurrent_generations`），超出排队。

---

## 四、核心功能与工作流程

### 1. AI 生成（/generate，主力页）
三个 Tab，共用同一套历史/轮播体系：

**① 文字生图（t2i）**
```
输入提示词 → (可选)✨AI 智能规划（LLM 扩写，感知所选风格） → 选档位/比例/张数
  → 提交（预扣积分，立即返回 taskId） → 队列排队(≤3并发) → Agnes 出图
  → 下载落盘 /static/ → completed → 历史/轮播展示
```
- **强度档位**：1K（推荐）/2K/3K/4K，计费阶梯 ×1/×2/×4/×8（基础 5 分/张）。
- 失败 → **全额退积分** + 页面提示「模型生成失败 / 积分已退还，可以重新生成」+ 重新生成按钮（提示词保留在输入框）。

**② 文字生视频（t2v）/ ③ 图片生视频（i2v，支持多图 r2v）**
```
提示词 (+参考图) → AI 智能规划（同时产出 enhancedPrompt + voiceover_text + cover_prompt）
  → 选参数（720P / 比例 6 档 / 时长 4~12 秒 / 音色 / 配音类型 / 配音内容）
  → 提交预扣 → t2v 10 次创建重试 → Agnes 渲染（轮询 ≤20min）
  → 下载成片 → 自动封面图（异步）→ completed
  → 配音链：TTS（星予 qwen-audio）→ buildVoiceSubtitles（按中文标点断句成 SRT）
  → ffmpeg 合成（音轨叠加 + subtitles 烧录）→ voiced 成片
```
- **时长**：4~12 秒任意整数（2026-10-26 放开全档）；计费 `ceil(时长/5) × 分辨率单价`（单价读 `system_configs`：代码默认 480p=10 / 720p=20 / 1080p=40 每 5 秒，**生产库 720p 实配 10**——2026-10-26 冒烟 5s 实扣 10 分；前端展示走 `credit-rules` 实时返回，以此为准）。
- **配音**：配音类型（角色台词/旁白解说）+ 音色下拉（星予推荐置顶）+ 配音内容（规划生成、可改）。
- **口型同步：定案不做**（模型无音频输入对不上口型）——保持「TTS 旁白 + 烧录字幕」；真 lip-sync 是成片后处理的独立开发线（开源模型要 GPU / 商用 API 按分钟计费），等有明确用户需求再立项。
- 防复活：任务终态写入一律 `finalizeTask` UPDATE（执行期间被删的任务不会诈尸复活）。

**通用**：
- 生成历史独立页 `/generate/history`（筛选/分页/重试/删除）；主页轮播展示；活跃任务 3s 轮询。
- 扣费规则页面内明示（`GET /api/generate/credit-rules` 实时读配置）。

### 2. 短剧工作室（/drama）
```
创建项目（大纲/题材/集数 6~24/风格） → AI 剧本分析（两阶段：结构分析 + 按每批3集并行分段扩展）
  → 编辑分析结果（可对单片段「重新生成」） → 确认入库（episodes/segments/assets 三表）
  → 资产生成（角色/场景/道具图） → 逐片段生成视频（TTS 配音 + 参考图注入 + 比例对齐）
  → 候选视频（主视频/备选，可采纳替换） → 分集合成 → 分集详情页三区布局（大播放器/版本列表/片段切换条）
```
- 计费：分析 5 分/次、资产图 5 分/张、片段 480p=120 / 720p=240 / 1080p=360（固定价），失败自动退款。
- 模板：`prompt_templates`（剧本分析/分段扩展等 7 个，种子 `backend/seed-prompt-templates.sql`）。

### 3. 热门创作 / Viral（/viral）
```
创建模板（贴抖音/B站链接 或 上传 ≤5min 本地视频） → 抽帧多模态分析（4~8帧自适应）
  → 生成模板（场景/变量/比例自动检测） → 创建项目（填变量/参考图/风格/目标时长）
  → 生成各场景（R2V/I2V/T2V 自动选择 + text 场景） → 逐段时长对齐 → 合并成片 → 下载
```
- 计费：模板分析 50 分；生成 0图=50 / 1图=80 / 2图=120 / 每多图 +40，失败退款。
- 限制：视频 ≤5 分钟；链接白名单仅抖音/B站。

### 4. 视频画布（/canvas）+ 剪辑（/editor，admin-only）
- **画布**：Coze 式节点工作流——video/image/text/audio/effect/output 六类节点 + 连线；左键框选多选、右键平移、Ctrl+滚轮缩放；转场/滤镜节点、文字动画、多音轨混音；模板可保存/复制为项目。
- **剪辑**：三轨时间线（视频/音频/文字），拖拽/resize/分割/删除/属性面板，总长 ≤60s，渲染复用 canvas 管线；顺序连播播放器 + 文字叠加预览。
- 渲染管线：ffmpeg（统一分辨率 → 段内裁剪 → xfade 转场 → 文字 overlay → 音频混音 → 成片）。

### 5. 其他页面
- **工作台（/dashboard）**：LibTV 风格首页——创建卡/工具小卡/快捷入口窄条/我的作品（模块 tab 由接口驱动）/限时活动 banner/新功能上新/新手任务清单（领积分）。
- **优秀作品展**（首页区块，admin 后台可增删改、抽帧封面）。
- **任务中心（/tasks）**：处理中/待处理任务三来源汇总（generation/video/segment）。
- **脚本（/script）、角色（/character）、视频（/video 拼接）、工作室（/studio）、大资产库（/global-assets，视频/图片/音频）、订单充值（/order，支付未开通仅展示）、个人中心（/user）**。

### 6. 管理后台（/admin，21 页）
仪表盘、用户管理（权限矩阵/充值）、模型管理、API 密钥、系统配置、提示词模板、活动管理、上新管理、作品展管理、支付记录、日志中心（生成日志/管理日志）、数据库、服务器（超管）、访问统计/IP 封禁、通知、登录 2FA。

---

## 五、积分体系

- 预扣制：提交时原子扣（`UPDATE ... WHERE credits>=?`，不足 400）；**失败/删除未结清任务全额退款**（去重 key 防双退）；完成置 `credits_charged` 结清不重复扣。
- 价格全在 `system_configs` 实时读取：
  - 图像：5 分/张 × 档位（1K=1 / 2K=2 / 3K=4 / 4K=8）
  - 视频：480p=10 / 720p=20 / 1080p=40 每 5 秒（代码默认；**生产库 720p 实配 10**，以 credit-rules 实时返回为准）
  - 短剧：分析 5 / 资产图 5 / 片段 120·240·360
  - 热门创作：分析 50 / 生成 50 起 + 参考图阶梯
- 规则接口：`GET /api/generate|viral|drama/credit-rules`；前端各页有 `CreditRulesAlert` 展示。
- 新用户注册赠 100 积分；admin 测试币 ~9894。

---

## 六、安全现状（2026-10-13 三批次 + 后续）

- **批次 A（代码）**：video 模块预扣制、JWT_SECRET 硬失败、SSRF 重定向防护、2FA 生产强制、验证码 crypto 随机、capability 白名单、路径穿越、contact 注入、SQL 注释、cleanup 引用保护等 14 项。
- **批次 B（服务器）**：.env 600、nginx 限流+安全头（TLS1.2+/HSTS）、sshd `prohibit-password` + MaxAuthTries 3、ufw 清理（保留 22/80/443/888/35823/39000:40000）、宝塔全量备份。
- **批次 C**：生产 MySQL 密码已轮换（密码在桌面凭据文件）；仓库转 private 用户自行处理；DeepSeek 历史 key 确认作废。
- SSH 免密：`C:\Users\Administrator\.ssh\id_ed25519_ai_anime`（plink 不认，一律用系统 ssh/scp）。
- SMTP 授权码 2026-10-23 轮换（新码只在两端 `.env`/`.env.local`，不进文档）。

---

## 七、部署流程（三端）

```powershell
# 1. 构建
backend:  npx tsc（裸跑不接管道）
frontend: npm.cmd run build
admin:    npm.cmd run build

# 2. 打包（zip 内容 = dist 目录下的文件，不是 dist 目录本身）
Compress-Archive -Path <dist>\* -DestinationPath deploy\<name>.zip

# 3. 上传执行（免密）
scp -i <key> deploy\*.zip root@47.121.137.131:/home/www/ai-anime/deploy/
ssh -i <key> root@47.121.137.131 "bash /home/www/ai-anime/deploy/deploy.sh"
```
- **踩坑铁律**：
  - PowerShell zip 的 backslash warning → unzip 返非零 → `set -e` 断链——**脚本 exit 1 ≠ 部署失败**，以现场 `ls + grep hash` 为准；FE-only 脚本 unzip 步骤不要 set -e。
  - 部署后核对：线上 index.html 的 hash = 本地、pm2 uptime/pid、`curl -k https://127.0.0.1/ -H 'Host: anime.leesystem.xyz'`。
  - 复杂远程命令（`$()`/`||`/中文/引号）**一律本地写 .sh → scp → 执行**（PS→OpenSSH 必吃引号）；grep 用 `grep -e A -e B`。
  - 回滚：服务器 `backend|frontend|admin/dist_bak`。
- git push 走代理：`git -c http.proxy=http://127.0.0.1:7890 -c https.proxy=... push`。

---

## 八、测试与验证惯例

- **断链验证必须双断言**：日志 provider 行 + `[MODEL_USAGE] model=<模型> success=true`（只断言 completed 会被 fallback 掩盖成假绿）。
- UI 测试用 Playwright `chromium.launch({ channel: 'chrome' })`；`$env:NODE_PATH='D:\AI-Anime-main\backend\node_modules'`。
- antd 两字按钮正则 `/确\s*认/` 等；隐藏 Tab 的表单留在 DOM，定位要 `:visible`。
- 2FA/发信测试：**一律 Redis 注入验证码**（`email_code:{email}` = `code|毫秒时间戳` EX 300），不真实发信（除非用户同意）。
- 后端日志用 `cmd /c "... > runXX.log 2>&1"` 原生重定向（raw UTF-8，PowerShell `*>` 会变 UTF-16+乱码）。
- 测试数据收尾清理；生产测试用户/任务/Redis 键测完即清。

---

## 九、当前状态与待办（2026-10-26）

- **已上线生产**：配音+字幕全链、防复活、t2v 10 次重试、durations 4~12 全档（FE `Generate-B4R_jukI.js`）、生产库 key/模型收敛、prod-verify 实质 18/18、生产配音冒烟 18/18。
- **本地三端在跑**：backend :3000（run38.log）+ FE :5173 + admin :5174。
- 待办：
  - [ ] 阿里云控制台手动复扫 + 安全组 8888 规则核查（**用户自行**）
  - [ ] Redis requirepass 激活 → 等用户发话
  - [ ] 口型同步 lip-sync —— 定案维持现状，未来有需求再立项
  - [ ] VoiceStudio 暂停中（等用户）；《体面》E2-E6 等用户
  - [ ] 保留任务：#115 / #117（无声降级现场）/ #118（联调成功证据单）**不删**
- 未跟踪文件（有意不提交）：`.gates.jsonl`、`docs/agnes-models.md`。
