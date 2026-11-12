# backend/scripts/smoke —— 冒烟脚本

> 2026-11-04 建立。规矩：改动跑过的冒烟脚本必须入库留档，不能只留在临时目录（历史教训：10-26、10-27 两次会话丢过即永丢）。

| 脚本 | 覆盖 | 前置 | 退出码 |
|---|---|---|---|
| `a24-discipline.cjs` | A24 分镜提示词纪律附加（7 项） | 无需后端在跑；需 `dist` 已构建 + 种子已灌 | 0 全过 / 1 有失败 |
| `b12-duration.cjs` | A14 分镜时长纪律 + 字段白名单（6 项） | **后端需在 3000 运行**；本地库要有带提示词的片段 | 同上 |

```bash
cd D:\AI-Anime-main\backend
npx tsc                                  # 改了 src 必须先重建，a24 读的是 dist
node scripts/smoke/a24-discipline.cjs
node scripts/smoke/b12-duration.cjs      # 默认自动挑第一个 pending 片段，跑完还原原值
node scripts/smoke/b12-duration.cjs 3    # 也可指定 segmentId
```

**`b12-duration.cjs` 会写库**（改 `drama_segments.duration`），但结尾无条件还原；中途 Ctrl+C 会留下脏值，需手工改回。

## 各自断言什么

**A24（7 项）**：普通镜头只附加「纪律 + 转场」两块；中文/英文打戏镜头额外附加「打戏强化」；模板表为空或查询抛错时**静默降级不打断生成**（生产还没跑种子也不能崩）；三条模板已在 `prompt_templates` 且 active；模板 6/7 的时长口径已无「5-10 秒」。

**B12（6 项）**：`duration=20` 被 400 拒绝且报错说清"目标 4~5 秒 / 绝对上限 15 秒 / 请拆成多个片段"；被拒后库里没被写脏；15 秒（目标区间外、硬上限内）放行并留 warn；4 秒放行；夹带 `status/video_url/episode_id/id/progress_percent` 全部被忽略；非数字时长报"必须是数字"。

## 为什么 b12 要测"夹带字段被忽略"

`drama.controller.ts` 的更新端点把请求体标成内联 `Partial<{...}>`，**TS 类型运行时被擦除**，而 `main.ts:21` 的全局 `ValidationPipe({whitelist:true})` 依赖 class-validator 元数据、对内联类型不生效。原 `updateSegment` 又是裸 `Object.assign`，等于客户端可以直接把片段写成 `status:'completed'` 或指向任意 `video_url`。A14 在 service 层加了 `SEGMENT_EDITABLE_FIELDS` 白名单堵掉，这条断言就是它的回归哨兵。
