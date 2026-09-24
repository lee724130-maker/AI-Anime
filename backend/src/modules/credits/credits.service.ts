import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * 公共积分扣费服务（热门创作 / 短剧工作室共用）。
 * 规则：预扣（原子 UPDATE，余额不足 400）→ 成功不退 → 失败退全款。
 * 所有价格读 system_configs 实时值（getConfigInt 兜底默认值）。
 */
@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);

  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  /** 读 system_configs 实时值，缺失/非法时返回默认值 */
  async getConfigInt(key: string, def: number): Promise<number> {
    try {
      const rows: any = await this.em.query(
        'SELECT config_value FROM system_configs WHERE config_key = ? LIMIT 1', [key],
      );
      const val = rows?.[0]?.config_value;
      const n = Number(val);
      return Number.isFinite(n) && n > 0 ? n : def;
    } catch {
      return def;
    }
  }

  /** 原子预扣积分，余额不足返回 false（不扣） */
  async charge(userId: number, cost: number): Promise<boolean> {
    if (cost <= 0) return true;
    const r: any = await this.em.query(
      'UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?',
      [cost, userId, cost],
    );
    const affected = r?.affectedRows ?? r?.[0]?.affectedRows ?? 0;
    return affected > 0;
  }

  /** 失败退全款（refundKey 去重，防止同一失败被重复退款） */
  private readonly refundedKeys = new Set<string>();
  async refund(userId: number, cost: number, refundKey?: string): Promise<void> {
    if (cost <= 0) return;
    if (refundKey) {
      if (this.refundedKeys.has(refundKey)) {
        this.logger.warn(`[credits] 重复退款拦截: key=${refundKey}, userId=${userId}, cost=${cost}`);
        return;
      }
      this.refundedKeys.add(refundKey);
      setTimeout(() => this.refundedKeys.delete(refundKey), 600_000);
    }
    await this.em.query(
      'UPDATE users SET credits = credits + ? WHERE id = ?',
      [cost, userId],
    );
    this.logger.log(`[credits] 退款: userId=${userId}, +${cost}积分, key=${refundKey || 'none'}`);
  }

  /** 预扣并校验：余额不足直接抛 400（消息带所需积分），够则扣成功 */
  async assertEnough(userId: number, cost: number, action: string): Promise<void> {
    const ok = await this.charge(userId, cost);
    if (!ok) {
      this.logger.warn(`[credits] 用户 ${userId} 积分不足：${action} 需要 ${cost} 积分`);
      throw new BadRequestException(`积分不足，本次${action}需要 ${cost} 积分，请稍后再试`);
    }
  }

  /** 仅检查余额是否足够（不扣费）：不足直接抛 400 */
  async assertSufficient(userId: number, cost: number, action: string): Promise<void> {
    const user: any = await this.em.query('SELECT credits FROM users WHERE id = ?', [userId]);
    const balance = user?.[0]?.credits ?? 0;
    if (balance < cost) {
      this.logger.warn(`[credits] 用户 ${userId} 积分不足（仅检查）：${action} 需要 ${cost}，当前 ${balance}`);
      throw new BadRequestException(`积分不足，本次${action}需要 ${cost} 积分，请充值后再试`);
    }
  }

  // ───── 热门创作（viral）定价 ─────

  /** 模板分析：50 分/次 */
  viralAnalyzeCost(): Promise<number> {
    return this.getConfigInt('viral_analyze_cost', 50);
  }

  /**
   * 项目生成 / 单场景重生成：按参考图数量梯度
   * 0 图 = base(50)；n≥1 → base + first_extra(30) + (n-1)*per_extra(40)
   * 即 0/1/2/3 图 → 50/80/120/160，每多 1 图 +40，不封顶（R2V 额度线性挂钩）
   */
  async viralGenerateCost(imageCount: number): Promise<number> {
    const base = await this.getConfigInt('viral_generate_base', 50);
    const firstExtra = await this.getConfigInt('viral_generate_first_image_extra', 30);
    const perExtra = await this.getConfigInt('viral_generate_per_image_extra', 40);
    const n = Math.max(0, Math.floor(imageCount || 0));
    if (n === 0) return base;
    return base + firstExtra + (n - 1) * perExtra;
  }

  /** 热门创作积分规则（供前端展示） */
  async getViralCreditRules(): Promise<Record<string, any>> {
    const [analyze, base, firstExtra, perExtra] = await Promise.all([
      this.viralAnalyzeCost(),
      this.getConfigInt('viral_generate_base', 50),
      this.getConfigInt('viral_generate_first_image_extra', 30),
      this.getConfigInt('viral_generate_per_image_extra', 40),
    ]);
    const examples: Record<string, number> = {};
    for (const n of [0, 1, 2, 3, 4, 5]) {
      examples[`${n}图`] = n === 0 ? base : base + firstExtra + (n - 1) * perExtra;
    }
    return {
      analyze_cost: analyze,
      generate: { base, first_image_extra: firstExtra, per_image_extra: perExtra, examples },
      regenerate: '与生成同价（按参考图数量）',
      refund_on_failure: true,
    };
  }

  // ───── 短剧工作室（drama）定价 ─────

  /** 剧情分析：5 分/次 */
  dramaAnalyzeCost(): Promise<number> {
    return this.getConfigInt('drama_analyze_cost', 5);
  }

  /** 资产图生成：5 分/张 */
  dramaAssetImageCost(): Promise<number> {
    return this.getConfigInt('drama_asset_image_cost', 5);
  }

  /** 片段生成：480p=120 / 720p=240 / 1080p=360（固定每片段，按分集分辨率） */
  dramaSegmentCost(resolution?: string | null): Promise<number> {
    const res = (resolution || '720p').toLowerCase();
    const defs: Record<string, number> = { '480p': 120, '720p': 240, '1080p': 360 };
    return this.getConfigInt(`drama_segment_cost_${res}`, defs[res] ?? 240);
  }

  /** 短剧工作室积分规则（供前端展示） */
  async getDramaCreditRules(): Promise<Record<string, any>> {
    const [analyze, assetImg, s480, s720, s1080] = await Promise.all([
      this.dramaAnalyzeCost(),
      this.dramaAssetImageCost(),
      this.getConfigInt('drama_segment_cost_480p', 120),
      this.getConfigInt('drama_segment_cost_720p', 240),
      this.getConfigInt('drama_segment_cost_1080p', 360),
    ]);
    return {
      analyze_cost: analyze,
      asset_image_cost: assetImg,
      segment: { '480p': s480, '720p': s720, '1080p': s1080, unit: '每片段（固定价，与时长无关）' },
      stitch_cost: 0,
      refund_on_failure: true,
    };
  }
}
