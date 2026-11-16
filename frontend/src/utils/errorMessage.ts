/**
 * 后端/AI 服务商错误文案 → 中文友好提示。
 * 用户在界面上看到的 message.error() 大量直接取 `e.response.data.message`，
 * 会露出 ModelNotOpenError / Request failed with status code 429 这类看不懂的原文。
 * 这里在 axios 拦截器层集中翻译一次，覆盖所有页面，无需逐个组件改。
 */

type Rule = { test: RegExp; text: string };

/** 顺序敏感：越具体的规则放越前面，命中即停。 */
const RULES: Rule[] = [
  // —— 限流 / 额度 ——
  { test: /429|too many requests|rate.?limit|限流/i, text: '生成服务繁忙（请求过于频繁），请稍后再试；若持续出现，建议稍等几分钟或联系管理员提升额度' },
  { test: /ModelNotOpenError|not.?open|not.?enabled|未开通|has not been activated/i, text: '所用模型尚未开通或额度不足，已自动尝试备用模型；若仍失败，请联系管理员开通模型' },
  { test: /quota|insufficient.*balance|额度.*不足|余额不足|free.*quota/i, text: '模型免费额度已用尽，请稍后再试或联系管理员充值' },
  { test: /403.*forbidden|access denied|无权限/i, text: '没有操作权限，请确认账号状态或联系管理员' },
  // —— 超时 / 服务不可用 ——
  { test: /timeout|timed out|ETIMEDOUT|请求超时/i, text: '生成请求超时，任务可能仍在后台执行，请稍后刷新查看结果' },
  { test: /503|502|504|service unavailable|bad gateway|overloaded|队列.*满|queue.?full/i, text: '生成服务暂时不可用（队列繁忙），已自动重试，请稍后查看任务结果' },
  { test: /ECONNRESET|ECONNREFUSED|network|connect.*fail|网络/i, text: '网络连接异常，请检查网络后重试' },
  // —— 模型/参数 ——
  { test: /model.*not (found|exist)|invalid model|模型.*不存在/i, text: '所选模型不可用，请更换模型或联系管理员' },
  { test: /prompt.*(too long|超限)|内容过长/i, text: '输入内容过长，请精简后再试' },
  { test: /image.*(too large|尺寸|过大)/i, text: '图片尺寸或体积过大，请压缩后重试' },
  // —— 业务通用 ——
  { test: /积分不足|credits? insufficient|insufficient credits/i, text: '积分不足，请充值后再试' },
  { test: /未登录|unauthorized|token.*(expired|invalid)|登录.*过期/i, text: '登录状态已失效，请重新登录' },
  { test: /已被封禁|banned/i, text: '账号已被封禁，如有疑问请联系管理员' },
];

/** 把原始错误文案翻译成中文；无法识别时保留原文（不吞信息）。 */
export function friendlyError(raw: unknown): string {
  const msg = typeof raw === 'string' ? raw : (raw as any)?.message || '';
  if (!msg) return '操作失败，请稍后重试';
  for (const { test, text } of RULES) {
    if (test.test(msg)) return text;
  }
  // 裸的 "Request failed with status code 500" 兜底
  const code = String(msg).match(/status code (\d{3})/);
  if (code) return `服务暂时异常（HTTP ${code[1]}），请稍后重试`;
  return msg;
}
