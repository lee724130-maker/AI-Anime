/**
 * Agnes 生图「线路（lane）」解析 —— 2026-11-25 新增，纯函数、无依赖注入
 *
 * 背景（为什么值得做多线路）
 *   AIServiceUtil 里有一把 **账号级串行锁** withAgnesSerial：Agnes 单账号约 4~5 分钟/张，
 *   并发打必秒级 429，所以所有生图调用被排成一条队。真正的瓶颈因此不是配额数字，
 *   而是「只有一个账号 = 只有一条串行泳道」。
 *   第二个 key 属于另一个账号（国际站），它天然是**第二条独立串行泳道** → 吞吐接近翻倍。
 *
 * 设计约束（务必保持）
 *   1. 第二条线路只能由配置开启，绝不硬编码 endpoint：
 *      system_configs.agnes_intl_api_key + system_configs.agnes_intl_api_endpoint
 *      两者缺一 → 只返回中国区一条线路 → 行为与改造前**完全一致**（惰性）。
 *   2. 必须挡住「两条线路其实是同一个账号」这种误配：
 *      endpoint 相同 或 key 相同 → 丢弃第二条。否则两条串行链会同时打同一个账号，
 *      正好把当初加锁要避免的 429 风暴重新制造出来。
 *   3. 只接受 https，且必须是完整 generations 路径 —— 不做任何拼接猜测。
 */

/** 中国区端点：现有 agnes_api_key 可用，两款模型都在此（2026-11-05 实测） */
export const AGNES_IMAGE_ENDPOINT_CN = 'https://api.agnes-ai.cn/v1/images/generations';

export interface AgnesImageLane {
  /** 稳定 id，用于串行锁与冷却表的 key（不要改，改了会丢历史冷却状态） */
  id: string;
  /** 日志可读名 */
  label: string;
  endpoint: string;
  apiKey: string;
}

const isUsableEndpoint = (raw: string | null | undefined): raw is string => {
  if (!raw) return false;
  const s = raw.trim();
  if (!/^https:\/\//i.test(s)) return false;
  // 必须是完整的 images/generations 端点；不接受只有 host 的值（避免我们猜路径猜错）
  return /\/images\/generations\/?$/i.test(s);
};

/** 归一化后再比较，防止因为结尾斜杠或空格被误判成「不同 endpoint」 */
const norm = (s: string) => s.trim().replace(/\/+$/, '').toLowerCase();

/**
 * 解析可用线路。第一个元素恒为主线路（中国区），保持「默认走中国」的既有语义。
 * @param cnApiKey   已读出的 agnes_api_key（调用方传入，避免重复查库）
 * @param intlKey    system_configs.agnes_intl_api_key
 * @param intlEndpoint system_configs.agnes_intl_api_endpoint
 */
export function resolveAgnesImageLanes(
  cnApiKey: string,
  intlKey?: string | null,
  intlEndpoint?: string | null,
): AgnesImageLane[] {
  const lanes: AgnesImageLane[] = [
    { id: 'cn', label: 'Agnes 中国区', endpoint: AGNES_IMAGE_ENDPOINT_CN, apiKey: cnApiKey },
  ];

  const key = intlKey?.trim();
  if (!key) return lanes;                     // 没配第二把 key → 单线路，行为不变
  if (!isUsableEndpoint(intlEndpoint)) return lanes;  // 没配或配错 endpoint → 单线路，不猜

  const endpoint = intlEndpoint.trim();
  if (norm(endpoint) === norm(AGNES_IMAGE_ENDPOINT_CN)) return lanes; // 同端点 = 同账号
  if (key === cnApiKey.trim()) return lanes;                          // 同 key = 同账号

  lanes.push({ id: 'intl', label: 'Agnes 国际区', endpoint, apiKey: key });
  return lanes;
}

/**
 * 从候选线路里挑一条。策略：跳过冷却中的线路，再取「排队任务数最少」的（真正的负载分担），
 * 并列时优先主线路（cn），保证默认行为与改造前一致。
 * @param pending laneId → 已排队（含正在执行）的任务数
 * @param onCooldown 该线路是否处于冷却
 */
export function pickAgnesImageLane<T extends { id: string }>(
  lanes: T[],
  pending: Record<string, number>,
  onCooldown: (laneId: string) => boolean,
): T | null {
  const usable = lanes.filter((l) => !onCooldown(l.id));
  if (!usable.length) return null;
  return usable.reduce((best, cur) =>
    (pending[cur.id] ?? 0) < (pending[best.id] ?? 0) ? cur : best,
  );
}

/**
 * 线路尝试顺序：先按 pick 的结果，再把其余线路附在后面做故障转移候选。
 * 冷却中的线路也保留在候选尾部 —— 全冷却时仍值得试一次，总比直接失败给用户强。
 */
export function agnesLaneAttemptOrder<T extends { id: string }>(
  lanes: T[],
  first: T | null,
): T[] {
  if (!first) return lanes;
  return [first, ...lanes.filter((l) => l.id !== first.id)];
}
