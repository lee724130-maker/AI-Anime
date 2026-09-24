import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { createClient } from 'redis';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { SystemConfig } from './admin.entity';
import { AdminLog } from './admin-log.entity';
import { User } from '../user/user.entity';
import { Script } from '../script/script.entity';
import { Character } from '../character/character.entity';
import { VideoTask } from '../video/video.entity';
import { GenerationTask } from '../task/generation-task.entity';
import { Order } from '../order/order.entity';

export interface ApiKeyModel {
  id: string;
  name: string;
  priority: number;
}

export interface ApiKeyEntry {
  key: string;
  label: string;
  description: string;
  hidden?: boolean;
  capabilities?: string[];
  models?: Record<string, ApiKeyModel[]>;
}

export const API_KEY_KEYS: ApiKeyEntry[] = [
  {
    key: 'volcengine_api_key',
    label: '火山引擎',
    description: '火山引擎 ARK API Key — 可生成视频、图片、文字',
    capabilities: ['video', 'image', 'text'],
    models: {
      video: [
        { id: 'seedance-2-0',   name: 'Seedance 2.0', priority: 1 },
        { id: 'seedance-1-5',   name: 'Seedance 1.5', priority: 2 },
      ],
      image: [
        { id: 'seedream-4-5',   name: 'Seedream 4.5', priority: 1 },
        { id: 'seedream-4-0',   name: 'Seedream 4.0', priority: 2 },
      ],
      text: [
        { id: 'doubao-1-5-pro', name: 'Doubao 1.5 Pro', priority: 1 },
      ],
    },
  },
  {
    key: 'tongyi_api_key',
    label: '阿里云百炼',
    description: '阿里云百炼 API Key — 可生成视频、图片、文字',
    capabilities: ['video', 'image', 'text'],
    models: {
      video: [
        { id: 'wanx-2-6',   name: '通义万相视频 2.6', priority: 1 },
        { id: 'wanx-2-5',   name: '通义万相视频 2.5', priority: 2 },
      ],
      image: [
        { id: 'wanx-i2i-2-6', name: '通义万相 2.6', priority: 1 },
        { id: 'wanx-i2i-2-5', name: '通义万相 2.5', priority: 2 },
      ],
      text: [
        { id: 'qwen3.8-flash', name: 'Qwen3.8-Flash', priority: 1 },
        { id: 'qwen3.7-flash', name: 'Qwen3.7-Flash', priority: 2 },
        { id: 'qwen3.8-27b',   name: 'Qwen3.8-27B',   priority: 3 },
      ],
    },
  },
  {
    key: 'openai_api_key',
    label: 'OpenAI',
    description: 'OpenAI API Key — 图片生成 DALL·E + 文本 GPT-4o + TTS 语音',
    capabilities: ['image', 'text', 'audio'],
    models: {
      image: [{ id: 'dall-e-3',    name: 'DALL·E 3', priority: 1 }],
      text:  [{ id: 'gpt-4o',      name: 'GPT-4o',   priority: 1 }],
      audio: [{ id: 'openai-tts',  name: 'OpenAI TTS', priority: 1 }],
    },
  },
  {
    key: 'deepseek_api_key',
    label: 'DeepSeek',
    description: 'DeepSeek API Key — 大模型文本理解',
    capabilities: ['text'],
    models: {
      text: [{ id: 'deepseek-v4-flash-0731', name: 'DeepSeek V4 Flash', priority: 1 },
             { id: 'deepseek-v4-pro-0813',   name: 'DeepSeek V4 Pro',   priority: 2 }],
    },
  },
  {
    key: 'runway_api_key',
    label: 'Runway',
    description: 'Runway API Key — Gen-3 视频生成',
    capabilities: ['video'],
    models: {
      video: [{ id: 'runway-gen-3', name: 'Runway Gen-3', priority: 1 }],
    },
  },
  {
    key: 'heygen_api_key',
    label: 'HeyGen',
    description: 'HeyGen API Key — 唇形同步/数字人',
    capabilities: ['avatar'],
    models: {
      avatar: [{ id: 'heygen-lipsync', name: 'HeyGen 唇形同步', priority: 1 }],
    },
  },
  {
    key: 'tts_api_key',
    label: 'TTS 语音',
    description: '备用 TTS 配音服务',
    capabilities: ['audio'],
    models: {
      audio: [{ id: 'tts-fallback', name: '备用 TTS', priority: 1 }],
    },
  },
  {
    key: 'zai_api_key',
    label: '智谱 ZAI',
    description: '智谱 ZAI API Key — GLM-5V-Turbo 大模型文本理解',
    capabilities: ['text'],
    models: {
      text: [{ id: 'glm-5.2',      name: 'GLM-5.2', priority: 1 },
             { id: 'glm-5v-turbo', name: 'GLM-5V-Turbo', priority: 2 }],
    },
  },
  // 旧 Key 别名（隐藏，向后兼容）
  { key: 'seedance_api_key', label: '旧-Seedance', description: '', hidden: true },
  { key: 'seedream_api_key', label: '旧-Seedream', description: '', hidden: true },
];

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(SystemConfig)
    private readonly configRepo: Repository<SystemConfig>,
    @InjectRepository(AdminLog)
    private readonly adminLogRepo: Repository<AdminLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Script)
    private readonly scriptRepo: Repository<Script>,
    @InjectRepository(Character)
    private readonly characterRepo: Repository<Character>,
    @InjectRepository(VideoTask)
    private readonly videoRepo: Repository<VideoTask>,
    @InjectRepository(GenerationTask)
    private readonly generationRepo: Repository<GenerationTask>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly em: EntityManager,
  ) {}

  async log(adminId: number, action: string, detail: string, targetType?: string, targetId?: number) {
    await this.adminLogRepo.save({ admin_id: adminId, action, detail, target_type: targetType, target_id: targetId });
  }

  private redisClient: any = null;

  private getRedisClient() {
    if (!this.redisClient) {
      this.redisClient = createClient({ url: `redis://127.0.0.1:6379/${process.env.REDIS_DB || 0}` });
      this.redisClient.connect().catch(() => { });
      this.redisClient.on('error', () => { });
    }
    return this.redisClient;
  }

  private async redisGet(key: string): Promise<string | null> {
    try {
      return await this.getRedisClient().get(key);
    } catch {
      return null;
    }
  }

  private async redisSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.getRedisClient().setEx(key, ttlSeconds, value);
      } else {
        await this.getRedisClient().set(key, value);
      }
    } catch { }
  }

  async getApiKeys() {
    const visibleKeys = API_KEY_KEYS.filter((k) => !k.hidden);
    const keyNames = visibleKeys.map(k => k.key);
    const records = await this.configRepo.find({ where: keyNames.map(key => ({ config_key: key })) });
    const recordMap = new Map(records.map(r => [r.config_key, r]));
    return visibleKeys.map(item => {
      const record = recordMap.get(item.key);
      return {
        key: item.key,
        label: item.label,
        description: item.description,
        capabilities: item.capabilities || [],
        models: item.models || {},
        isSet: !!record?.config_value,
        maskedValue: record?.config_value ? '••••••••' + record.config_value.slice(-4) : '',
        updatedAt: record?.updated_at || null,
      };
    });
  }

  async updateApiKeys(data: Record<string, string>, adminId?: number) {
    const results: { key: string; isSet: boolean }[] = [];
    for (const [key, value] of Object.entries(data)) {
      const known = API_KEY_KEYS.find((k) => k.key === key);
      if (!known) continue;

      let record = await this.configRepo.findOne({ where: { config_key: key } });
      if (record) {
        record.config_value = value || '';
        record.description = known.description;
      } else {
        record = this.configRepo.create({
          config_key: key,
          config_value: value || '',
          description: known.description,
        });
      }

      const saved = await this.configRepo.save(record);
      results.push({ key, isSet: !!saved.config_value });

      // 火山引擎合并 Key 同步到旧 Key 别名（向后兼容）
      if (key === 'volcengine_api_key' && value) {
        for (const alias of ['seedance_api_key', 'seedream_api_key']) {
          let aliasRecord = await this.configRepo.findOne({ where: { config_key: alias } });
          if (aliasRecord) {
            aliasRecord.config_value = value;
          } else {
            aliasRecord = this.configRepo.create({ config_key: alias, config_value: value });
          }
          await this.configRepo.save(aliasRecord);
        }
      }
    }
    if (adminId) {
      const changed = results.filter(r => r.isSet).map(r => r.key).join(', ');
      await this.log(adminId, '更新API密钥', `变更: ${changed || '无'}`, 'config');
    }
    return results;
  }

  async getConfigValue(key: string): Promise<string | null> {
    const record = await this.configRepo.findOne({ where: { config_key: key } });
    return record?.config_value || null;
  }

  async getGenerationLogs(page: number, limit: number, status?: string, keyword?: string) {
    const genQb = this.generationRepo.createQueryBuilder('g')
      .leftJoinAndSelect('g.user', 'user')
      .orderBy('g.created_at', 'DESC');
    const videoQb = this.videoRepo.createQueryBuilder('v')
      .leftJoinAndSelect('v.user', 'vuser')
      .leftJoinAndSelect('v.script', 'script')
      .orderBy('v.created_at', 'DESC');

    if (status && status !== 'all') {
      genQb.andWhere('g.status = :status', { status });
      videoQb.andWhere('v.status = :status', { status });
    }
    if (keyword && keyword.trim()) {
      const q = `%${keyword.trim()}%`;
      genQb.andWhere('(g.model_name LIKE :q OR user.username LIKE :q OR g.type LIKE :q OR g.input_data LIKE :q)', { q });
      videoQb.andWhere('(v.model_name LIKE :q OR vuser.username LIKE :q OR v.prompt LIKE :q OR script.title LIKE :q)', { q });
    }

    const [genItems, genTotal] = await genQb.getManyAndCount();
    const [videoItems, videoTotal] = await videoQb.getManyAndCount();

    const allItems = [
      ...genItems.map((t) => {
        let prompt = '';
        let typeLabel = '';
        try {
          const input = t.input_data ? JSON.parse(t.input_data) : {};
          prompt = input.prompt || input.text || '';
        } catch {
          prompt = t.input_data || '';
        }
        if (t.type === 'text_to_image')
          typeLabel = '文生图';
        else if (t.type === 'text_to_video')
          typeLabel = '文生视频';
        else if (t.type === 'image_to_video')
          typeLabel = '图生视频';
        else
          typeLabel = t.type;
        return {
          id: `gen_${t.id}`,
          source: 'generation',
          type: typeLabel,
          username: (t as any).user?.username || null,
          model_name: t.model_name || '-',
          status: t.status,
          progress: t.progress,
          prompt: prompt ? (prompt.length > 50 ? prompt.slice(0, 50) + '...' : prompt) : '-',
          credit_cost: t.credit_cost,
          error_msg: t.error_msg,
          created_at: t.created_at,
          completed_at: t.completed_at,
        };
      }),
      ...videoItems.map((t) => ({
        id: `video_${t.id}`,
        source: 'video',
        type: '短剧视频',
        username: (t as any).vuser?.username || null,
        model_name: t.model_name || '-',
        status: t.status,
        progress: t.progress,
        prompt: t.prompt ? (t.prompt.length > 50 ? t.prompt.slice(0, 50) + '...' : t.prompt) : '-',
        credit_cost: t.credit_cost,
        error_msg: t.error_msg,
        created_at: t.created_at,
        completed_at: t.completed_at,
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const start = (page - 1) * limit;
    const pagedItems = allItems.slice(start, start + limit);
    return {
      items: pagedItems,
      total: allItems.length,
      page,
      limit,
    };
  }

  async getUsers(page: number, limit: number, keyword?: string) {
    const qb = this.userRepo
      .createQueryBuilder('u')
      .select(['u.id', 'u.username', 'u.phone', 'u.email', 'u.credits', 'u.status', 'u.role', 'u.is_super_admin', 'u.admin_permissions', 'u.created_at'])
      .orderBy('u.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (keyword) {
      qb.where('u.username LIKE :kw OR u.phone LIKE :kw OR u.email LIKE :kw', { kw: `%${keyword}%` });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async toggleBan(userId: number, banned: boolean, adminId?: number, isSuperAdmin?: boolean) {
    const target = await this.userRepo.findOne({ where: { id: userId } });
    if (!target) throw new NotFoundException('用户不存在');
    if (target.is_super_admin) {
      throw new BadRequestException('超级管理员账号不可封禁');
    }
    if (!isSuperAdmin && target.role === 'admin') {
      throw new BadRequestException('普通管理员不可封禁其他管理员');
    }
    target.status = banned ? 0 : 1;
    const saved = await this.userRepo.save(target);
    if (adminId) {
      await this.log(adminId, banned ? '封禁用户' : '解封用户', `用户ID: ${userId}, 用户名: ${target.username}`, 'user', userId);
    }
    return saved;
  }

  async recharge(userId: number, amount: number, adminId?: number, isSuperAdmin?: boolean, adminPermissions?: string | null) {
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000 || !Number.isInteger(amount)) {
      throw new BadRequestException('充值数量必须为 1~100000 的整数');
    }
    if (!isSuperAdmin) {
      let hasPerm = false;
      try {
        const perms = adminPermissions ? JSON.parse(adminPermissions) : [];
        hasPerm = Array.isArray(perms) && (perms.includes('users:recharge') || perms.includes('users'));
      } catch {
        hasPerm = false;
      }
      if (!hasPerm) {
        throw new BadRequestException('您没有充值权限');
      }
      const today = new Date().toISOString().slice(0, 10);
      const dailyKey = `recharge_daily:${userId}:${today}`;
      const count = await this.getRedisClient().incr(dailyKey);
      if (count === 1) {
        await this.getRedisClient().expire(dailyKey, 86400);
      }
      const maxDaily = parseInt(await this.getConfigValue('admin_recharge_max_amount') || '500', 10);
      if (count > maxDaily) {
        await this.getRedisClient().decr(dailyKey);
        throw new BadRequestException(`充值失败：每日充值上限 ${maxDaily} 积分，今日已充 ${count - 1} 积分，超过限额需要和超级管理员进行报备`);
      }
    }
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user)
      throw new NotFoundException('用户不存在');

    const orderNo = `adm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const order = this.orderRepo.create({
      user_id: userId,
      order_no: orderNo,
      plan: 'admin_recharge',
      plan_name: '管理员充值',
      amount: 0,
      credits: amount,
      status: 'paid',
      payment_provider: 'admin',
      paid_at: new Date(),
    });

    await this.em.query('UPDATE users SET credits = credits + ? WHERE id = ?', [amount, userId]);
    await this.orderRepo.save(order);
    if (adminId) {
      await this.log(adminId, '用户充值', `用户ID: ${userId}, 充值: +${amount} 算力`, 'user', userId);
    }
    const updated = await this.userRepo.findOne({ where: { id: userId } });
    return updated;
  }

  async deductCredits(userId: number, amount: number, adminId?: number, isSuperAdmin?: boolean, adminPermissions?: string | null) {
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount) || amount > 100000) {
      throw new BadRequestException('扣除数量必须是 1~100000 的整数');
    }
    if (!isSuperAdmin) {
      let hasPerm = false;
      try {
        const perms = adminPermissions ? JSON.parse(adminPermissions) : [];
        hasPerm = Array.isArray(perms) && (perms.includes('users:recharge') || perms.includes('users'));
      } catch {
        hasPerm = false;
      }
      if (!hasPerm) {
        throw new BadRequestException('您没有扣除权限');
      }
    }
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user)
      throw new NotFoundException('用户不存在');
    if (user.credits < amount) {
      throw new BadRequestException(`余额不足：当前算力 ${user.credits}，无法扣除 ${amount}`);
    }

    const affected = await this.em.query('UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?', [amount, userId, amount]);
    if (affected === 0) {
      throw new BadRequestException('扣减失败：并发冲突或余额不足');
    }

    const orderNo = `adm_ded_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const order = this.orderRepo.create({
      user_id: userId,
      order_no: orderNo,
      plan: 'admin_deduct',
      plan_name: '管理员扣减',
      amount: 0,
      credits: -amount,
      status: 'paid',
      payment_provider: 'admin',
      paid_at: new Date(),
    });
    await this.orderRepo.save(order);
    if (adminId) {
      await this.log(adminId, '用户扣减', `用户ID: ${userId}, 扣减: -${amount} 算力`, 'user', userId);
    }
    const updated = await this.userRepo.findOne({ where: { id: userId } });
    return updated;
  }

  async deleteUser(userId: number, adminId: number, isSuperAdmin?: boolean) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user)
      throw new NotFoundException('用户不存在');
    if (user.is_super_admin)
      throw new BadRequestException('不能删除超级管理员');
    if (user.role === 'admin' && !isSuperAdmin)
      throw new BadRequestException('普通管理员不能删除其他管理员');
    if (!isSuperAdmin && user.role !== 'user')
      throw new BadRequestException('无权删除该用户');

    const deletedFiles = await this.collectAndDeleteUserFiles(userId);
    await this.em.transaction(async (tx) => {
      await tx.query('DELETE FROM task_events WHERE task_id IN (SELECT id FROM generation_tasks WHERE user_id = ?)', [userId]);
      await tx.query('DELETE FROM media_files WHERE task_id IN (SELECT id FROM generation_tasks WHERE user_id = ?)', [userId]);
      await tx.query('DELETE FROM drama_segments WHERE episode_id IN (SELECT id FROM drama_episodes WHERE project_id IN (SELECT id FROM drama_projects WHERE user_id = ?))', [userId]);
      await tx.query('DELETE FROM drama_segment_candidates WHERE segment_id IN (SELECT id FROM drama_segments WHERE episode_id IN (SELECT id FROM drama_episodes WHERE project_id IN (SELECT id FROM drama_projects WHERE user_id = ?)))', [userId]);
      await tx.query('DELETE FROM drama_episodes WHERE project_id IN (SELECT id FROM drama_projects WHERE user_id = ?)', [userId]);
      await tx.query('DELETE FROM drama_outlines WHERE project_id IN (SELECT id FROM drama_projects WHERE user_id = ?)', [userId]);
      await tx.query('DELETE FROM drama_assets WHERE project_id IN (SELECT id FROM drama_projects WHERE user_id = ?)', [userId]);
      for (const table of [
        'global_assets', 'generation_tasks',
        'drama_projects', 'viral_projects', 'viral_templates',
        'canvas_projects', 'canvas_templates', 'editor_projects',
        'scripts', 'characters', 'video_tasks', 'orders',
        'prompt_templates',
      ]) {
        await tx.query(`DELETE FROM \`${table}\` WHERE user_id = ?`, [userId]);
      }
      await tx.query('DELETE FROM users WHERE id = ?', [userId]);
    });
    await this.log(adminId, '删除用户', `用户ID: ${userId}, 用户名: ${user.username}, 清理文件: ${deletedFiles} 个`, 'user', userId);
    return { success: true, deletedFiles };
  }

  private async collectAndDeleteUserFiles(userId: number): Promise<number> {
    const files = new Set<string>();
    const dirs = new Set<string>();
    const outputDir = path.resolve(process.cwd(), 'output');
    const extractFiles = (value: string) => {
      if (!value)
        return;
      const fileMatches = value.match(/\/(?:static\/)?([^/\\"'\s\])]+\.(?:mp4|webm|mov|mkv|jpg|jpeg|png|webp|gif|mp3|m4a|wav))/gi);
      if (fileMatches)
        for (const m of fileMatches) {
          const base = m.replace(/^.*\/(static\/)?/, '');
          if (base)
            files.add(base);
        }
      const winMatches = value.match(/[A-Z]:\\\\[^"'\s]+\.(?:mp4|webm|mov|mkv|jpg|jpeg|png|webp|gif|mp3|m4a|wav)/gi);
      if (winMatches)
        for (const m of winMatches) {
          const base = path.basename(m.replace(/\\\\/g, '/'));
          if (base)
            files.add(base);
        }
      const dirMatches = value.match(/\/(static\/)?(viral_frames_[^/\\"'\s\])]+)\//gi);
      if (dirMatches)
        for (const m of dirMatches) {
          const dir = m.replace(/^.*\/(static\/)?/, '').replace(/\/$/, '');
          if (dir)
            dirs.add(dir);
        }
    };
    const rows = await this.em.query(`
      SELECT output_data AS v FROM generation_tasks WHERE user_id = ?
      UNION ALL SELECT input_data FROM generation_tasks WHERE user_id = ?
      UNION ALL SELECT image_url FROM global_assets WHERE user_id = ?
      UNION ALL SELECT video_url FROM global_assets WHERE user_id = ?
      UNION ALL SELECT audio_url FROM global_assets WHERE user_id = ?
      UNION ALL SELECT cover_url FROM drama_projects WHERE user_id = ?
      UNION ALL SELECT video_url FROM drama_episodes WHERE project_id IN (SELECT id FROM drama_projects WHERE user_id = ?)
      UNION ALL SELECT video_url FROM drama_segments WHERE episode_id IN (SELECT id FROM drama_episodes WHERE project_id IN (SELECT id FROM drama_projects WHERE user_id = ?))
      UNION ALL SELECT video_url FROM drama_segment_candidates WHERE segment_id IN (SELECT id FROM drama_segments WHERE episode_id IN (SELECT id FROM drama_episodes WHERE project_id IN (SELECT id FROM drama_projects WHERE user_id = ?)))
      UNION ALL SELECT image_url FROM drama_assets WHERE project_id IN (SELECT id FROM drama_projects WHERE user_id = ?)
      UNION ALL SELECT result_url FROM viral_projects WHERE user_id = ?
      UNION ALL SELECT scenes FROM viral_projects WHERE user_id = ?
      UNION ALL SELECT media_refs FROM viral_projects WHERE user_id = ?
      UNION ALL SELECT reference_url FROM viral_templates WHERE user_id = ?
      UNION ALL SELECT reference_frames FROM viral_templates WHERE user_id = ?
      UNION ALL SELECT thumbnail FROM viral_templates WHERE user_id = ?
      UNION ALL SELECT source_url FROM viral_templates WHERE user_id = ?
      UNION ALL SELECT result_url FROM canvas_projects WHERE user_id = ?
      UNION ALL SELECT bgm_url FROM canvas_projects WHERE user_id = ?
      UNION ALL SELECT nodes FROM canvas_projects WHERE user_id = ?
      UNION ALL SELECT nodes FROM canvas_templates WHERE user_id = ?
      UNION ALL SELECT result_url FROM editor_projects WHERE user_id = ?
      UNION ALL SELECT timeline FROM editor_projects WHERE user_id = ?
      UNION ALL SELECT video_url FROM video_tasks WHERE user_id = ?
      UNION ALL SELECT cover_url FROM video_tasks WHERE user_id = ?
      UNION ALL SELECT reference_image FROM video_tasks WHERE user_id = ?
      UNION ALL SELECT job_data FROM video_tasks WHERE user_id = ?
      UNION ALL SELECT avatar_url FROM characters WHERE user_id = ?
      UNION ALL SELECT reference_image_anime FROM characters WHERE user_id = ?
      UNION ALL SELECT reference_image_realistic FROM characters WHERE user_id = ?
      UNION ALL SELECT url FROM media_files WHERE task_id IN (SELECT id FROM generation_tasks WHERE user_id = ?)
      UNION ALL SELECT content FROM prompt_templates WHERE user_id = ?
    `, [userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId]);
    for (const r of rows) {
      if (r?.v)
        extractFiles(r.v);
    }
    let count = 0;
    for (const name of files) {
      const fullPath = path.join(outputDir, name);
      try {
        if (fs.existsSync(fullPath)) {
          fs.rmSync(fullPath, { force: true });
          count++;
        }
      }
      catch { }
    }
    for (const dir of dirs) {
      const fullPath = path.join(outputDir, dir);
      try {
        if (fs.existsSync(fullPath)) {
          fs.rmSync(fullPath, { recursive: true, force: true });
          count++;
        }
      }
      catch { }
    }
    this.logger.log(`用户 ${userId} 文件清理完成: ${count} 项`);
    return count;
  }

  async getPublicSiteConfig() {
    const siteName = await this.configRepo.findOne({ where: { config_key: 'site_name' } });
    const siteNotice = await this.configRepo.findOne({ where: { config_key: 'site_notice' } });
    const rechargeEnabled = await this.configRepo.findOne({ where: { config_key: 'recharge_enabled' } });
    return {
      site_name: siteName?.config_value || 'AI 动漫短剧',
      site_notice: siteNotice?.config_value || '',
      recharge_enabled: rechargeEnabled?.config_value || '0',
    };
  }

  async getSystemConfig() {
    const keys = [
      'daily_generation_limit',
      'credit_cost_480p',
      'credit_cost_720p',
      'credit_cost_1080p',
      'max_retry_count',
      'site_name',
      'site_notice',
      'image_provider',
      'video_provider',
      'llm_provider',
      'default_resolution',
      'default_duration',
      'default_style',
      'default_model',
      'default_ratio',
      'credit_plans',
      'recharge_enabled',
    ];

    const configs: Record<string, string> = {};
    for (const key of keys) {
      const record = await this.configRepo.findOne({ where: { config_key: key } });
      configs[key] = record?.config_value || '';
    }
    return configs;
  }

  async updateSystemConfig(data: Record<string, string>, adminId?: number) {
    const allowed = [
      'daily_generation_limit',
      'credit_cost_480p',
      'credit_cost_720p',
      'credit_cost_1080p',
      'max_retry_count',
      'site_name',
      'site_notice',
      'image_provider',
      'video_provider',
      'llm_provider',
      'default_resolution',
      'default_duration',
      'default_style',
      'default_model',
      'default_ratio',
      'credit_plans',
      'recharge_enabled',
    ];

    const changed: string[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (!allowed.includes(key)) continue;
      let record = await this.configRepo.findOne({ where: { config_key: key } });
      if (record) {
        if (record.config_value !== value) changed.push(key);
        record.config_value = value;
      } else {
        record = this.configRepo.create({ config_key: key, config_value: value });
        changed.push(key);
      }
      await this.configRepo.save(record);
    }
    if (adminId && changed.length > 0) {
      await this.log(adminId, '更新系统配置', `变更: ${changed.join(', ')}`, 'config');
    }
    return { success: true };
  }

  async getAdminLogs(page = 1, limit = 20) {
    const qb = this.adminLogRepo.createQueryBuilder('log')
      .leftJoinAndMapOne('log.admin', User, 'admin', 'admin.id = log.admin_id')
      .orderBy('log.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((item: any) => ({
        id: item.id,
        admin_id: item.admin_id,
        admin_name: item.admin?.username || null,
        action: item.action,
        detail: item.detail,
        target_type: item.target_type,
        target_id: item.target_id,
        created_at: item.created_at,
      })),
      total, page, limit,
    };
  }

  async getDashboardStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [userCount, todayGenerations, todayNewUsers, apiKeyCount, todayCalls, recentUsers] = await Promise.all([
      this.userRepo.count(),
      this.generationRepo
        .createQueryBuilder('g')
        .where('g.created_at >= :today', { today: todayStart })
        .getCount(),
      this.userRepo
        .createQueryBuilder('u')
        .where('u.created_at >= :today', { today: todayStart })
        .getCount(),
      this.configRepo
        .createQueryBuilder('c')
        .where('c.config_key LIKE :pattern', { pattern: '%_api_key' })
        .andWhere("c.config_value IS NOT NULL AND c.config_value != ''")
        .getCount(),
      this.videoRepo
        .createQueryBuilder('v')
        .where('v.created_at >= :today', { today: todayStart })
        .getCount(),
      this.userRepo
        .createQueryBuilder('u')
        .orderBy('u.created_at', 'DESC')
        .limit(5)
        .select(['u.id', 'u.username', 'u.email', 'u.created_at'])
        .getMany(),
    ]);
    return { userCount, todayGenerations, todayNewUsers, apiKeyCount, todayCalls, recentUsers };
  }

  async getDashboardTrend() {
    const days = 14;
    const result: { date: string; users: number; tasks: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const dateStr = `${dayStart.getMonth() + 1}/${dayStart.getDate()}`;
      const [users, tasks] = await Promise.all([
        this.userRepo
          .createQueryBuilder('u')
          .where('u.created_at >= :start AND u.created_at < :end', { start: dayStart, end: dayEnd })
          .getCount(),
        this.videoRepo
          .createQueryBuilder('v')
          .where('v.created_at >= :start AND v.created_at < :end', { start: dayStart, end: dayEnd })
          .getCount(),
      ]);
      result.push({ date: dateStr, users, tasks });
    }
    return result;
  }

  async getPaymentRecords(page = 1, limit = 20, status?: string) {
    const qb = this.orderRepo
      .createQueryBuilder('o')
      .leftJoin('users', 'u', 'u.id = o.user_id')
      .select([
        'o.id AS id',
        'o.order_no AS order_no',
        'o.user_id AS user_id',
        'u.username AS username',
        'o.plan_name AS plan_name',
        'o.amount AS amount',
        'o.credits AS credits',
        'o.status AS status',
        'o.payment_provider AS payment_provider',
        'o.transaction_id AS transaction_id',
        'o.paid_at AS paid_at',
        'o.created_at AS created_at',
      ])
      .orderBy('o.created_at', 'DESC');
    if (status) {
      qb.andWhere('o.status = :status', { status });
    }
    const total = await qb.getCount();
    const items = await qb.offset((page - 1) * limit).limit(limit).getRawMany();

    const statsQb = this.orderRepo.createQueryBuilder('o')
      .select([
        'COUNT(*) AS total_count',
        'SUM(CASE WHEN o.status = \'paid\' THEN 1 ELSE 0 END) AS total_paid',
        'COALESCE(SUM(CASE WHEN o.status = \'paid\' THEN CAST(o.amount AS DECIMAL(12,2)) ELSE 0 END), 0) AS total_amount',
      ]);
    if (status) {
      statsQb.andWhere('o.status = :status', { status });
    }
    const [agg] = await statsQb.getRawMany();
    return {
      items, total, page, limit,
      stats: {
        totalCount: Number(agg.total_count) || 0,
        totalPaid: Number(agg.total_paid) || 0,
        totalAmount: Number(agg.total_amount) || 0,
      },
    };
  }

  async changeUserRole(targetUserId: number, newRole: string, operatorId: number, operatorIsSuperAdmin: boolean) {
    if (!operatorIsSuperAdmin) {
      throw new BadRequestException('仅超级管理员可变更用户角色');
    }
    const target = await this.userRepo.findOne({ where: { id: targetUserId } });
    if (!target)
      throw new NotFoundException('用户不存在');
    if (targetUserId === operatorId) {
      throw new BadRequestException('不能修改自己的角色');
    }
    if (target.is_super_admin) {
      throw new BadRequestException('不能修改超级管理员的角色');
    }
    const oldRole = target.role;
    target.role = newRole;
    if (newRole === 'user') {
      target.admin_permissions = null;
    }
    await this.userRepo.save(target);
    await this.log(operatorId, '变更用户角色', `用户ID: ${targetUserId}, 用户名: ${target.username}, ${oldRole} → ${newRole}`, 'user', targetUserId);
    return { success: true, oldRole, newRole };
  }

  async updateAdminPermissions(targetUserId: number, permissions: string[] | undefined, operatorId: number, operatorIsSuperAdmin: boolean) {
    if (!operatorIsSuperAdmin) {
      throw new BadRequestException('仅超级管理员可设置管理员权限');
    }
    const target = await this.userRepo.findOne({ where: { id: targetUserId } });
    if (!target)
      throw new NotFoundException('用户不存在');
    if (target.is_super_admin) {
      throw new BadRequestException('不能修改超级管理员的权限');
    }
    if (target.role !== 'admin') {
      throw new BadRequestException('该用户不是管理员');
    }
    target.admin_permissions = permissions ? JSON.stringify(permissions) : null;
    await this.userRepo.save(target);
    await this.log(operatorId, '更新管理员权限', `用户ID: ${targetUserId}, 用户名: ${target.username}, 权限: ${permissions ? permissions.join(',') : '全部'}`, 'user', targetUserId);
    return { success: true, permissions };
  }

  private assertSuperAdmin(isSuperAdmin?: boolean) {
    if (!isSuperAdmin)
      throw new BadRequestException('仅超级管理员可执行此操作');
  }

  async restartServer(isSuperAdmin?: boolean) {
    this.assertSuperAdmin(isSuperAdmin);
    const isWin = process.platform === 'win32';
    const pm2 = isWin ? 'npx pm2' : 'pm2';
    const cmd = isWin
      ? `${pm2} restart ai-anime-backend`
      : `${pm2} restart ai-anime-backend --update-env`;
    try {
      execSync(cmd, { timeout: 10000 });
      return { success: true, message: '后端服务已重启' };
    } catch (err) {
      throw new BadRequestException('重启失败: ' + err.message);
    }
  }

  async getServerLogs(lines: number, isSuperAdmin?: boolean) {
    this.assertSuperAdmin(isSuperAdmin);
    const isWin = process.platform === 'win32';
    const pm2 = isWin ? 'npx pm2' : 'pm2';
    try {
      const out = execSync(`${pm2} logs ai-anime-backend --nostream --lines ${Math.min(lines, 500)} 2>&1`, { timeout: 10000, encoding: 'utf-8' });
      return { logs: out };
    } catch (err) {
      return { logs: err.stdout || err.message };
    }
  }

  async getServerStatus(isSuperAdmin?: boolean) {
    this.assertSuperAdmin(isSuperAdmin);
    const isWin = process.platform === 'win32';
    const pm2 = isWin ? 'npx pm2' : 'pm2';
    try {
      const jlist = execSync(`${pm2} jlist --silent`, { timeout: 10000, encoding: 'utf-8' });
      const apps = JSON.parse(jlist);
      const backend = apps.find((a: any) => a.name === 'ai-anime-backend');
      return {
        backend: backend ? {
          pid: backend.pid,
          status: backend.pm2_env.status,
          uptime: backend.pm2_env.pm_uptime,
          restarts: backend.pm2_env.restart_time,
          memory: Math.round(backend.monit?.memory / 1024 / 1024) || 0,
          cpu: backend.monit?.cpu || 0,
        } : null,
        platform: process.platform,
        nodeVersion: process.version,
        memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      };
    } catch (err) {
      throw new BadRequestException('获取状态失败: ' + err.message);
    }
  }

  async cleanupServer(type: string, isSuperAdmin?: boolean) {
    this.assertSuperAdmin(isSuperAdmin);
    const isWin = process.platform === 'win32';
    const pm2 = isWin ? 'npx pm2' : 'pm2';
    const outputDir = path.join(process.cwd(), 'output');
    const tmpDir = path.join(process.cwd(), 'tmp');
    let cleaned = 0;
    try {
      if (type === 'output' || type === 'all') {
        if (isWin) {
          const count = execSync(`powershell -Command "(Get-ChildItem '${outputDir}' -File -Recurse | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) }).Count"`, { encoding: 'utf-8' }).trim();
          execSync(`powershell -Command "Get-ChildItem '${outputDir}' -File -Recurse | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } | Remove-Item -Force"`, { timeout: 30000 });
          cleaned += parseInt(count) || 0;
        } else {
          const count = execSync(`find "${outputDir}" -type f -mtime +7 -not -path "*/static/*" 2>/dev/null | wc -l`, { encoding: 'utf-8' }).trim();
          execSync(`find "${outputDir}" -type f -mtime +7 -not -path "*/static/*" -delete 2>/dev/null || true`, { timeout: 30000 });
          cleaned += parseInt(count) || 0;
        }
      }
      if (type === 'tmp' || type === 'all') {
        if (isWin) {
          const count = execSync(`powershell -Command "(Get-ChildItem '${tmpDir}' -File -Recurse | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) }).Count"`, { encoding: 'utf-8' }).trim();
          execSync(`powershell -Command "Get-ChildItem '${tmpDir}' -File -Recurse | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) } | Remove-Item -Force"`, { timeout: 30000 });
          cleaned += parseInt(count) || 0;
        } else {
          const count = execSync(`find "${tmpDir}" -type f -mtime +1 2>/dev/null | wc -l`, { encoding: 'utf-8' }).trim();
          execSync(`find "${tmpDir}" -type f -mtime +1 -delete 2>/dev/null || true`, { timeout: 30000 });
          cleaned += parseInt(count) || 0;
        }
      }
      if (type === 'logs' || type === 'all') {
        execSync(`${pm2} flush ai-anime-backend 2>/dev/null || true`, { timeout: 10000 });
      }
      return { success: true, cleaned, type };
    } catch (err) {
      return { success: true, cleaned, type, warning: err.message };
    }
  }

  async executeQuery(sql: string, isSuperAdmin?: boolean) {
    this.assertSuperAdmin(isSuperAdmin);
    const normalized = sql.trim().toUpperCase();
    const allowed = ['SELECT', 'SHOW', 'DESCRIBE', 'EXPLAIN'];
    const firstWord = normalized.split(/\s+/)[0];
    if (!allowed.includes(firstWord)) {
      throw new BadRequestException('仅允许 SELECT / SHOW / DESCRIBE / EXPLAIN 查询');
    }
    if (sql.includes(';') || sql.includes('--') || sql.includes('/*')) {
      throw new BadRequestException('查询禁止包含分号、注释或多语句');
    }
    const blocked = /\b(UNION|JOIN|SUBQUERY|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT|EXEC|INTO|LOAD|FILE|INTO\s+OUTFILE|INTO\s+DUMPFILE)\b/i;
    if (blocked.test(sql)) {
      throw new BadRequestException('查询包含禁止的关键字');
    }
    const limitedSql = /\bLIMIT\b/i.test(sql) ? sql : `${sql.trim()} LIMIT 1000`;
    try {
      const result = await this.userRepo.query(limitedSql);
      return { rows: result, count: result.length };
    } catch (err) {
      throw new BadRequestException('SQL 执行失败: ' + err.message);
    }
  }

  async getDbTables(isSuperAdmin?: boolean) {
    this.assertSuperAdmin(isSuperAdmin);
    try {
      const tables = await this.userRepo.query('SHOW TABLES');
      return { tables: tables.map((t: any) => Object.values(t)[0]) };
    } catch (err) {
      throw new BadRequestException('获取表列表失败: ' + err.message);
    }
  }
}
