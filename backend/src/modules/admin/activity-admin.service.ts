import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Activity } from '../workbench/activity.entity';
import { GAMEPLAY_TYPES, TASK_DETECTORS } from '../workbench/gameplay.constants';
import { vstr, vlink, vint, venum, vdate } from './promo-validate';

const STATUSES = ['draft', 'online', 'offline'];
const KINDS = ['banner', 'card'];
/** update 白名单：只有这些列可被 admin 改（防任意列写入） */
const UPDATABLE = [
  'title', 'subtitle', 'cover_url', 'link_url', 'button_text', 'kind',
  'status', 'priority', 'starts_at', 'ends_at', 'gameplay', 'config',
] as const;

/**
 * A：活动栏后台管理（同 ShowcaseAdminService 模式）。
 * 对外只走 workbench.getPromo（status=online 且在期）；本服务管全量记录。
 * 删除只删记录（user_task_claims 按 task_key 关联、不悬挂，无需级联）。
 */
@Injectable()
export class ActivityAdminService {
  private readonly logger = new Logger(ActivityAdminService.name);

  constructor(@InjectRepository(Activity) private readonly repo: Repository<Activity>) {}

  async list() {
    const items = await this.repo.find({ order: { priority: 'DESC', id: 'DESC' } });
    return {
      items,
      task_keys: Object.entries(TASK_DETECTORS).map(([key, d]) => ({ key, title: d.title, defReward: d.defReward })),
      gameplay_types: [...GAMEPLAY_TYPES],
    };
  }

  /** 玩法配置 JSON 校验：newbie_tasks 必须 {tasks:[{key∈白名单,reward?}]}；未传返回 undefined（= 不改） */
  private config(v: unknown, gameplay: string | null, required: boolean): string | null | undefined {
    if (v === undefined) return undefined;
    if (v === null || (typeof v === 'string' && !v.trim())) {
      if (required) throw new BadRequestException('newbie_tasks 玩法必须提供 config');
      return null;
    }
    let parsed: any;
    try {
      parsed = typeof v === 'string' ? JSON.parse(v) : v;
    } catch {
      throw new BadRequestException('config 必须是合法 JSON');
    }
    if (gameplay === 'newbie_tasks') {
      const tasks = Array.isArray(parsed?.tasks) ? parsed.tasks : null;
      if (!tasks || tasks.length === 0 || tasks.length > 10) {
        throw new BadRequestException('config.tasks 必须是 1~10 个任务的数组');
      }
      for (const t of tasks) {
        if (!t || typeof t.key !== 'string' || !TASK_DETECTORS[t.key]) {
          throw new BadRequestException(`未知任务 key: ${t?.key ?? '-'}（白名单: ${Object.keys(TASK_DETECTORS).join(', ')}）`);
        }
        if (t.reward !== undefined && t.reward !== null && t.reward !== '') {
          const r = Number(t.reward);
          if (!Number.isFinite(r) || r <= 0 || r > 100000) throw new BadRequestException(`任务 ${t.key} 的 reward 范围 1~100000`);
        }
      }
    }
    return JSON.stringify(parsed);
  }

  private gameplayVal(v: unknown): string | null {
    if (v === undefined || v === null || v === '') return null;
    const s = String(v).trim();
    if (!GAMEPLAY_TYPES.includes(s as any)) {
      throw new BadRequestException(`gameplay 仅支持 ${GAMEPLAY_TYPES.join('/')} 或留空`);
    }
    return s;
  }

  /** starts_at <= ends_at 交叉校验（只在两者都可解析时） */
  private period(start: Date | null, end: Date | null) {
    if (start && end && start.getTime() > end.getTime()) {
      throw new BadRequestException('starts_at 不能晚于 ends_at');
    }
  }

  async create(body: any) {
    const a = new Activity();
    a.title = vstr(body?.title, 'title', 120, true)!;
    a.subtitle = vstr(body?.subtitle, 'subtitle', 200);
    a.cover_url = vlink(body?.cover_url, 'cover_url');
    a.link_url = vlink(body?.link_url, 'link_url');
    a.button_text = vstr(body?.button_text, 'button_text', 20);
    a.kind = venum(body?.kind, 'kind', KINDS, 'banner');
    a.status = venum(body?.status, 'status', STATUSES, 'draft');
    a.priority = vint(body?.priority, 'priority', -100000, 100000, 0);
    a.starts_at = vdate(body?.starts_at, 'starts_at');
    a.ends_at = vdate(body?.ends_at, 'ends_at');
    this.period(a.starts_at, a.ends_at);
    a.gameplay = this.gameplayVal(body?.gameplay);
    const cfg = this.config(body?.config, a.gameplay, a.gameplay === 'newbie_tasks');
    a.config = cfg ?? null;
    return this.repo.save(a);
  }

  async update(id: number, body: any) {
    const a = await this.repo.findOne({ where: { id } });
    if (!a) throw new NotFoundException('活动不存在');

    const patch: Partial<Activity> = {};
    for (const key of UPDATABLE) {
      if (body?.[key] === undefined) continue;
      switch (key) {
        case 'title': patch.title = vstr(body.title, 'title', 120, true)!; break;
        case 'subtitle': patch.subtitle = vstr(body.subtitle, 'subtitle', 200); break;
        case 'cover_url': patch.cover_url = vlink(body.cover_url, 'cover_url'); break;
        case 'link_url': patch.link_url = vlink(body.link_url, 'link_url'); break;
        case 'button_text': patch.button_text = vstr(body.button_text, 'button_text', 20); break;
        case 'kind': patch.kind = venum(body.kind, 'kind', KINDS, a.kind); break;
        case 'status': patch.status = venum(body.status, 'status', STATUSES, a.status); break;
        case 'priority': patch.priority = vint(body.priority, 'priority', -100000, 100000, a.priority); break;
        case 'starts_at': patch.starts_at = vdate(body.starts_at, 'starts_at'); break;
        case 'ends_at': patch.ends_at = vdate(body.ends_at, 'ends_at'); break;
        case 'gameplay': patch.gameplay = this.gameplayVal(body.gameplay); break;
        case 'config': patch.config = this.config(body.config, patch.gameplay ?? a.gameplay, (patch.gameplay ?? a.gameplay) === 'newbie_tasks') ?? null; break;
      }
    }
    this.period(patch.starts_at ?? a.starts_at, patch.ends_at ?? a.ends_at);
    // gamepley 收回为空时 config 一并清空（僵尸配置不外泄）
    if (patch.gameplay !== undefined && patch.gameplay === null && patch.config === undefined) {
      patch.config = null;
    }

    Object.assign(a, patch);
    return this.repo.save(a);
  }

  async delete(id: number) {
    const a = await this.repo.findOne({ where: { id } });
    if (!a) throw new NotFoundException('活动不存在');
    await this.repo.remove(a);
    return { deleted: true, id };
  }
}
