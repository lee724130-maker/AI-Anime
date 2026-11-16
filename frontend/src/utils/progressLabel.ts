/**
 * 把后端的细粒度进度百分比翻译成中文阶段文案，
 * 让用户知道「现在在等什么」，而不只是盯着一个数字。
 *
 * 后端阶段（generate.service.ts / ai-service.util.ts）：
 *   10 提交 / 20-30 建任务 / 30-85 模型渲染轮询 / 92 下载完成 / 95-100 配音字幕合成
 * 图像任务：10→30→70（出图）→100，阶段少，用同一套阈值也能对上。
 */
export function progressLabel(percent: number, type?: string): string {
  const p = Number(percent) || 0;
  const isVideo = type === 'video' || type === 't2v' || type === 'i2v' || type === 'r2v';
  if (p < 10) return '正在提交任务…';
  if (p < 25) return isVideo ? '正在创建视频生成任务…' : '正在准备生成…';
  if (p <= 85) return isVideo ? '模型正在渲染视频（这一步最耗时，请耐心等待）…' : '模型正在生成图片…';
  if (p < 92) return '正在下载生成结果…';
  if (p < 100) return isVideo ? '正在合成配音与字幕…' : '正在整理结果…';
  return '即将完成…';
}
