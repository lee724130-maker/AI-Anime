# Agnes 模型与 TTS 接入说明（2026-10-21）

> 本文档只记录模型参数、端点与链接，**严禁写入任何 API key / 凭据**。
> Key 落点：Agnes key 在生产/本地 `system_configs.agnes_api_key`；TTS 用 `system_configs.tongyi_api_key`（百炼）。

## 官方文档链接

| 模型 | 文档 |
|------|------|
| Agnes Image 2.5 Flash（生图） | https://www.agnes-ai.cn/zh-Hans/docs/agnes-image-25-flash |
| Agnes Video 2.5 Flash（生视频） | https://www.agnes-ai.cn/zh-Hans/docs/agnes-video-25-flash |

前端 generate 页三个表单的「模型文档」外链即指向上述页面。

## 一、Agnes Image 2.5 Flash（生图）

- **端点**：`POST https://api.agnes-ai.cn/v1/images/generations`（**中国区专用**；国际域名 `apihub.agnes-ai.com` 对中国区 key 返回 401，后端已全部切中国区端点）。
- **鉴权**：`Authorization: Bearer <agnes_api_key>`（OpenAI 兼容）。
- **size 档位**（本项目「强度」下拉）：`1K` / `2K` / `3K` / `4K`，缺省 `1K`。全档免费。
  - 实测（ratio=3:4）：1K → 864×1152、2K → 1728×2304、3K → 2592×3456、4K → 3456×4608。
- **ratio**：`1:1`（默认）/ `3:4` / `4:3` / `16:9` / `9:16` / `3:2` / `2:3` / `21:9`。
- **参考图（i2i）**：走 `image` 数组（公网可达 URL 或 base64 data URI）。
- **已知限制**：会返回 `revised_prompt`（自动扩写不可关）；i2i 高档位队列拥堵时 503 高发（自动重试/降级链兜底）。
- **响应**：`data[0].url`（临时 URL，后端立即 `downloadToLocal` 落 `/static/`）。

### 积分阶梯（2026-10-21 拍板）
`1K=基础、2K=×2、3K=×4、4K=×8`（基础价读 `system_configs.credit_cost_image`，默认 5 分/张）。
倍数由后端 `generate.service.ts` 的 `imageTierMultipliers` 维护，并经 `GET /api/generate/credit-rules` 的 `image_size_multipliers` 下发前端实时估算。

## 二、Agnes Video 2.5 Flash（生视频）

- **创建**：`POST https://api.agnes-ai.cn/v1/videos`，响应拿 `video_id`。
- **轮询**：`GET https://api.agnes-ai.cn/agnesapi?video_id=<id>&model_name=agnes-video-2.5-flash`（**查询必须带 `model_name`**），返回 `status/progress/url`。
- **`mode` 必填**：0 图=`text`；1 图=`keyframe`+`first_frame`（≈i2v）；多图=`reference`+`images`（≈r2v）。缺失会 400 `mode is required`。
- **Flash 限制**：
  - `size` 仅 `"720P"`（故 generate 页分辨率固定 720p，不暴露 480p/1080p）；
  - `seconds` 字符串 `"4"~"12"`（超出自动夹到边界 → 前端时长只给 5/10/12 秒选项）；
  - 参考图 `images` ≤ 5 张、`audios` ≤ 3 条、**不支持 `videos`（参考视频）**；
  - aspect 支持 `9:16`(720×1280) / `16:9` / `1:1` / `4:3` / `3:4` / `21:9`。
- **现价**：¥0/秒（限免促销，**随时可能结束**）。
- **已知限制**：免费队列 `503 video_queue_full` / `429`（创建限流 ≈2 次/分）是常态；后端创建退避 45s、轮询 6s×100 兜底；全链失败走「失败自动全额退积分」。
- **媒体 URL 须公网可达**：本地 `/static/` 参考图会先转 data URI 再提交。

### 积分
720p 每 5 秒 = `system_configs.credit_cost_720p`（默认 20 分），`ceil(时长/5)` 计。

## 三、TTS：qwen-audio-3.1-tts-flash（星予）

- **端点**：`POST https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer`（百炼，与 CosyVoice 同端点）。
- **请求**：`{ model: 'qwen-audio-3.1-tts-flash', input: { format: 'mp3', sample_rate: 24000, voice: 'loongstella_v3.1', text: <文本> } }`。
  - **flash 系文本字段是 `text`**；`tts-next` 系才是 `text_prompt`（勿混用）。
  - 可选 `rate`（原生语速 0.5~2.0），本项目 speed=1.0 时不传。
- **响应**：`output.audio.url`（临时 URL，下载后落 `/static/`），可带 `duration`。
- **音色**：`loongstella_v3.1` = **星予**（本项目音色下拉 id `xingyu`，**默认音色**，前端显示「星予（推荐）」）。
- **降级链**：qwen-audio 失败 → CosyVoice（v2 / v3-flash / v3-plus，16 音色保留）→ OpenAI TTS → 空音频。
  - 显式选中其他 CosyVoice 音色不会进 qwen 分支；`mapCosyVoiceVoice` 对 qwen 音色回退同性别默认声（防 `loongstella_v3.1` 误塞 CosyVoice 报 400）。
- **默认音色语义（2026-10-21 拍板）**：各模块中文配音默认走星予——generate `nova`→`xingyu`、drama `zh`→`xingyu`、viral 中文分支→`xingyu`、video.processor 中文分支→`xingyu`；`generateTTS` 未指定音色时也默认星予。

## 四、后端接入点速查

| 位置 | 说明 |
|------|------|
| `backend/src/utils/ai-service.util.ts` | `generateImageWithAgnes` / `pickAgnesImageSize`（`options.imageSize` 强制档位直传）/ `generateVideoWithAgnes` / `generateTTSWithQwenAudio` / `cosyvoiceVoiceCatalog`（星予置顶） |
| 图像 auto 链 | Agnes（primary）→ 商汤 → 阿里云 → 火山 → OpenAI → 智谱 |
| 视频 auto 链 | Agnes（primary，有 agnes 行守卫）→ 通义万相 → 火山 → Runway → 智谱 |
| 显式模型路由 | 图像 `agnes-image` 前缀 / 视频 `agnes-` 前缀（drama/video/viral 等全模块统一走 ai-service，换链即全站生效） |
| `model_configs`（本地/生产） | image id95 `agnes-image-2.5-flash`；video id96/97/98 `agnes-video-2.5-flash`（t2v/i2v/r2v）；非 Agnes 图像/视频行已删除（audio 行不动） |

## 五、扣费与失败退款（前端表现）

- 提交即预扣；**失败自动全额退积分**（generate 模块既有语义，refund key `gen_t2i|t2v|i2v_${id}`）。
- generate 页失败任务卡：报错提示栏「模型生成失败 / 积分已退还，可以重新生成」+ **重新生成**按钮（复用 retry 接口，自动补扣再执行）+ 提示词保留在输入框。
