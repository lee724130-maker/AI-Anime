import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository, InjectEntityManager } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { Activity } from './activity.entity';
import { FeatureRelease } from './feature-release.entity';
import { UserTaskClaim } from './user-task-claim.entity';
import { TASK_DETECTORS } from './gameplay.constants';

interface ParsedTask { key: string; title?: string; reward?: number }

/**
 * A：活动栏 + 新功能上新对外接口（JwtAuthGuard 下走 workbench 控制器）。
 * - getPromo：只回 status=online 且在期内的活动 + online 的上新（dashboard 一次性拉取）
 * - gameplayTasks / claim：新手任务清单玩法（进度实时判定，领取写 user_task_claims + 发积分）
 */
@Injectable()
export class PromoService {
  private readonly logger = new Logger(PromoService.name);

  constructor(
    @InjectRepository(Activity) private readonly activityRepo: Repository<Activity>,
    @InjectRepository(FeatureRelease) private readonly releaseRepo: Repository<FeatureRelease>,
    @InjectRepository(UserTaskClaim) private readonly claimRepo: Repository<UserTaskClaim>,
    @InjectEntityManager() private readonly em: EntityManager,
  ) {}

  private inPeriod(a: Activity, now = new Date()): boolean {
    if (a.starts_at && new Date(a.starts_at).getTime() > now.getTime()) return false;
    if (a.ends_at && new Date(a.ends_at).getTime() < now.getTime()) return false;
    return true;
  }

  async getPromo() {
    const [activities, releases] = await Promise.all([
      this.activityRepo.find({
        where: { status: 'online' },
        order: { priority: 'DESC', id: 'DESC' },
        take: 10,
      }),
      this.releaseRepo.find({
        where: { status: 'online' },
        order: { priority: 'DESC', id: 'DESC' },
        take: 10,
      }),
    ]);
    return {
      activities: activities.filter((a) => this.inPeriod(a)),
      releases,
    };
  }

  /** 当前生效的新手任务活动（online + 期内 + gameplay=newbie_tasks，priority 最高者） */
  private async activeGameplayActivity(): Promise<Activity | null> {
    const rows = await this.activityRepo.find({
      where: { status: 'online', gameplay: 'newbie_tasks' },
      order: { priority: 'DESC', id: 'DESC' },
      take: 10,
    });
    return rows.find((a) => this.inPeriod(a)) || null;
  }

  private parseTasks(activity: Activity): ParsedTask[] {
    if (!activity.config) return [];
    try {
      const cfg = JSON.parse(activity.config);
      const tasks = Array.isArray(cfg?.tasks) ? cfg.tasks : [];
      return tasks
        .filter((t: any) => t && typeof t.key === 'string' && TASK_DETECTORS[t.key])
        .map((t: any) => ({
          key: t.key,
          title: typeof t.title === 'string' && t.title.trim() ? t.title.trim() : undefined,
          reward: Number.isFinite(Number(t.reward)) && Number(t.reward) > 0 ? Math.round(Number(t.reward)) : undefined,
        }));
    } catch {
      this.logger.warn(`activity ${activity.id} config 解析失败，玩法按无任务处理`);
      return [];
    }
  }

  /** 活动面板：任务进度 + 领取状态（claimable = 已完成且未领取） */
  async gameplayTasks(userId: number) {
    const activity = await this.activeGameplayActivity();
    if (!activity) return { activity: null, tasks: [] };

    const parsed = this.parseTasks(activity);
    if (parsed.length === 0) return { activity: null, tasks: [] };

    const claims = await this.claimRepo.find({ where: { user_id: userId } });
    const claimedSet = new Set(claims.map((c) => c.task_key));

    const tasks = await Promise.all(parsed.map(async (t) => {
      const det = TASK_DETECTORS[t.key];
      const reward = t.reward ?? det.defReward;
      let done = false;
      try {
        const rows: any = await this.taskDetect(det.sql, userId);
        done = Number(rows?.[0]?.c || 0) > 0;
      } catch (e: any) {
        this.logger.warn(`task detect failed key=${t.key}: ${e.message}`);
      }
      const claimed = claimedSet.has(t.key);
      return {
        key: t.key,
        title: t.title || det.title,
        reward,
        done,
        claimed,
        claimable: done && !claimed,
      };
    }));

    return {
      activity: { id: activity.id, title: activity.title, subtitle: activity.subtitle, ends_at: activity.ends_at },
      tasks,
    };
  }

  private taskDetect(sql: string, userId: number): Promise<any> {
    return this.em.query(sql, [userId]);
  }

  /** 领取奖励：任务须已完成 + 未领取过；成功发积分（unique 约束兜底防并发双领） */
  async claim(userId: number, taskKey: unknown) {
    const key = typeof taskKey === 'string' ? taskKey.trim() : '';
    if (!key || !TASK_DETECTORS[key]) {
      throw new BadRequestException('未知任务');
    }
    const activity = await this.activeGameplayActivity();
    if (!activity) throw new NotFoundException('活动不存在或已结束');
    const parsed = this.parseTasks(activity);
    const task = parsed.find((t) => t.key === key);
    if (!task) throw new NotFoundException('任务不存在');

    const det = TASK_DETECTORS[key];
    const rows: any = await this.taskDetect(det.sql, userId);
    if (Number(rows?.[0]?.c || 0) <= 0) throw new BadRequestException('任务尚未完成');
    if (await this.claimRepo.findOne({ where: { user_id: userId, task_key: key } })) {
      throw new BadRequestException('奖励已领取');
    }

    const reward = task.reward ?? det.defReward;
    try {
      await this.claimRepo.insert({ user_id: userId, task_key: key, reward });
    } catch (e: any) {
      // unique(user_id, task_key) 撞 = 并发双领
      throw new BadRequestException('奖励已领取');
    }
    await this.em.query('UPDATE users SET credits = credits + ? WHERE id = ?', [reward, userId]);
    this.logger.log(`[gameplay] 新手任务领取: userId=${userId}, task=${key}, +${reward}积分`);
    return { task_key: key, reward, credits: await this.credits(userId) };
  }

  private async credits(userId: number): Promise<number> {
    const rows: any = await this.em.query('SELECT credits FROM users WHERE id = ?', [userId]);
    return Number(rows?.[0]?.credits || 0);
  }
}
