import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan, IsNull } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { GenerationTask } from '../task/generation-task.entity';
import { CreditsService } from '../credits/credits.service';
import { DistributedLockService } from '../../common/services/distributed-lock.service';

/**
 * 心跳断了多久算孤儿。
 * GenerateService 每 20s 刷一次 heartbeat_at，90s = 连续 5 拍没来。
 * 不做「启动即全量清 processing」的激进版：那样在多实例/独立 worker 场景下会把
 * 别的实例正在跑的任务杀掉，用 90s 阈值可以同一套逻辑通吃单机与将来的多实例。
 */
const ORPHAN_AFTER_MS = 90_000;

/** 清扫周期：孤儿最多 90s + 90s ≈ 3 分钟内被判失败并退款 */
const SWEEP_INTERVAL_MS = 90_000;

/** 孤儿任务对用户可见的失败原因（前端 failed 卡片会展示 error_msg + 「重新生成」按钮） */
const ORPHAN_ERROR_MSG = '服务在处理该任务时被重启或中断，积分已退还，可以点击「重新生成」重试';

/**
 * /generate 任务自愈。
 *
 * 背景：主力生成页不走 Bull（只有 video/drama 模块走），任务是 `void this.enqueue(...)`
 * 在 Web 进程内跑的。进程重启（每次部署 pm2 restart）、崩溃、OOM 都会让内存队列蒸发，
 * 而 DB 里的行永远停在 processing：用户积分已预扣、页面一直转圈、既不完成也不退款。
 * 10-23 和 10-26 两次部署正好都会踩到。这里补上缺失的那条回收链路。
 */
@Injectable()
export class TaskRecoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TaskRecoveryService.name);

  constructor(
    @InjectRepository(GenerationTask)
    private readonly taskRepo: Repository<GenerationTask>,
    private readonly creditsService: CreditsService,
    private readonly lock: DistributedLockService,
  ) {}

  /** 启动先扫一轮：把上一进程遗留的孤儿尽快结清，不等第一个定时周期 */
  async onApplicationBootstrap() {
    await this.run('startup');
  }

  @Interval(SWEEP_INTERVAL_MS)
  async scheduledSweep() {
    // 锁 TTL 略小于周期，保证下一轮无论上一轮是否异常都能按时跑
    await this.lock.runExclusive('generate-orphan-sweep', SWEEP_INTERVAL_MS / 1000 - 10, () => this.run('interval'));
  }

  private async run(reason: 'startup' | 'interval') {
    let orphans: GenerationTask[] = [];
    try {
      const deadline = new Date(Date.now() - ORPHAN_AFTER_MS);
      orphans = await this.taskRepo.find({
        where: [
          // 心跳停摆的执行中任务
          { status: In(['processing', 'pending']), heartbeat_at: LessThan(deadline) },
          // 加心跳列之前的老数据、或落库后还没来得及刷心跳就崩的（按创建时间兜底）
          { status: In(['processing', 'pending']), heartbeat_at: IsNull(), created_at: LessThan(deadline) },
        ],
        take: 200, // 单轮上限，避免异常情况下一次扫出上万行把事务拖死
      });
    } catch (err: any) {
      this.logger.error(`[gen-recovery] ${reason} 查询孤儿任务失败: ${err.message}`);
      return;
    }

    if (orphans.length === 0) return;
    this.logger.warn(`[gen-recovery] ${reason} 发现 ${orphans.length} 个孤儿生成任务（心跳停摆 > ${ORPHAN_AFTER_MS / 1000}s），开始结清`);

    let settled = 0;
    let refunded = 0;
    let debt = 0;
    for (const t of orphans) {
      try {
        // 第一步：只按 status 原子抢占并写终态。
        // affected=0 = 执行体刚好完成、用户已删除、或别的实例已回收 → 一律不再动钱。
        // （抢占条件里**不能**带 credits_charged=false，否则「已结清却卡在 processing」的脏行永远收不掉）
        const guard = await this.taskRepo.update(
          { id: t.id, status: In(['processing', 'pending']) },
          {
            status: 'failed',
            error_msg: ORPHAN_ERROR_MSG,
            completed_at: new Date(),
            heartbeat_at: new Date(),
          },
        );
        if (!guard.affected) continue;
        settled++;

        // 第二步：generate 语义里 credits_charged=false = 用户当前被扣着这笔钱 → 必须退。
        // true 的行（已结清/已退过）不再退款，避免双退。
        if ((t.credit_cost || 0) > 0 && !t.credits_charged) {
          // refund key 与失败/删除/重试路径同款命名，进程内退款去重才能继续生效
          const input = this.parseInput(t.input_data);
          const refundKey = `gen_${t.type === 'image' ? 't2i' : (input.image_url ? 'i2v' : 't2v')}_${t.id}`;
          try {
            await this.creditsService.refund(t.user_id, t.credit_cost, refundKey);
            await this.taskRepo.update(t.id, { credits_charged: true });
            refunded++;
          } catch (debtErr: any) {
            // 行已标 failed 但钱没退回 = 用户少了一笔积分。日志必须可 grep，第二批告警挂这个键。
            debt++;
            this.logger.error(`[CREDIT-DEBT] 孤儿任务 #${t.id} 已标失败但退款未落账 userId=${t.user_id} cost=${t.credit_cost}: ${debtErr.message}`);
          }
        }
      } catch (err: any) {
        this.logger.error(`[gen-recovery] 结清孤儿任务 #${t.id} 失败: ${err.message}`);
      }
    }
    this.logger.log(`[gen-recovery] ${reason} 结清 ${settled} 个孤儿任务，退款 ${refunded} 个${debt ? `，⚠️ 待补退 ${debt} 个` : ''}`);
  }

  private parseInput(raw: string | null | undefined): any {
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
}
