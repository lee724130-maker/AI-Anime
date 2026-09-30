import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeatureRelease } from '../workbench/feature-release.entity';
import { vstr, vlink, vint, venum, vdate } from './promo-validate';

const STATUSES = ['draft', 'online', 'offline'];
const TAGS = ['NEW', 'BETA', 'HOT'];
/** update 白名单：只有这些列可被 admin 改（防任意列写入） */
const UPDATABLE = [
  'title', 'summary', 'cover_url', 'link_url', 'tag', 'status', 'priority', 'released_at',
] as const;

/**
 * A：新功能上新后台管理（同 ShowcaseAdminService 模式）。
 * 对外只走 workbench.getPromo（status=online）；本服务管全量记录。
 */
@Injectable()
export class ReleaseAdminService {
  constructor(@InjectRepository(FeatureRelease) private readonly repo: Repository<FeatureRelease>) {}

  async list() {
    const items = await this.repo.find({ order: { priority: 'DESC', id: 'DESC' } });
    return { items };
  }

  async create(body: any) {
    const r = new FeatureRelease();
    r.title = vstr(body?.title, 'title', 120, true)!;
    r.summary = vstr(body?.summary, 'summary', 300);
    r.cover_url = vlink(body?.cover_url, 'cover_url');
    r.link_url = vlink(body?.link_url, 'link_url');
    r.tag = venum(body?.tag, 'tag', TAGS, 'NEW');
    r.status = venum(body?.status, 'status', STATUSES, 'draft');
    r.priority = vint(body?.priority, 'priority', -100000, 100000, 0);
    r.released_at = vdate(body?.released_at, 'released_at');
    return this.repo.save(r);
  }

  async update(id: number, body: any) {
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('上新记录不存在');

    const patch: Partial<FeatureRelease> = {};
    for (const key of UPDATABLE) {
      if (body?.[key] === undefined) continue;
      switch (key) {
        case 'title': patch.title = vstr(body.title, 'title', 120, true)!; break;
        case 'summary': patch.summary = vstr(body.summary, 'summary', 300); break;
        case 'cover_url': patch.cover_url = vlink(body.cover_url, 'cover_url'); break;
        case 'link_url': patch.link_url = vlink(body.link_url, 'link_url'); break;
        case 'tag': patch.tag = venum(body.tag, 'tag', TAGS, r.tag); break;
        case 'status': patch.status = venum(body.status, 'status', STATUSES, r.status); break;
        case 'priority': patch.priority = vint(body.priority, 'priority', -100000, 100000, r.priority); break;
        case 'released_at': patch.released_at = vdate(body.released_at, 'released_at'); break;
      }
    }

    Object.assign(r, patch);
    return this.repo.save(r);
  }

  async delete(id: number) {
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('上新记录不存在');
    await this.repo.remove(r);
    return { deleted: true, id };
  }
}
