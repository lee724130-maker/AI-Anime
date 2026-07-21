import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfig } from './admin.entity';
import { AdminLog } from './admin-log.entity';
import { User } from '../user/user.entity';
import { Script } from '../script/script.entity';
import { Character } from '../character/character.entity';
import { VideoTask } from '../video/video.entity';
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
        { id: 'qwen-plus',    name: 'Qwen-Plus', priority: 1 },
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
      text: [{ id: 'deepseek-chat', name: 'DeepSeek-Chat', priority: 1 }],
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
      text: [{ id: 'glm-5v-turbo', name: 'GLM-5V-Turbo', priority: 1 },
             { id: 'glm-4v',        name: 'GLM-4V',       priority: 2 }],
    },
  },
  // 旧 Key 别名（隐藏，向后兼容）
  { key: 'seedance_api_key', label: '旧-Seedance', description: '', hidden: true },
  { key: 'seedream_api_key', label: '旧-Seedream', description: '', hidden: true },
];

@Injectable()
export class AdminService {
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
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  private async log(adminId: number, action: string, detail: string, targetType?: string, targetId?: number) {
    await this.adminLogRepo.save({ admin_id: adminId, action, detail, target_type: targetType, target_id: targetId });
  }

  async getApiKeys() {
    const visibleKeys = API_KEY_KEYS.filter((k) => !k.hidden);
    const keys = await Promise.all(
      visibleKeys.map(async (item) => {
        const record = await this.configRepo.findOne({
          where: { config_key: item.key },
        });
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
      }),
    );
    return keys;
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

  async getGenerationLogs(page: number, limit: number, status?: string) {
    const qb = this.videoRepo.createQueryBuilder('v')
      .leftJoinAndSelect('v.script', 'script')
      .leftJoinAndSelect('v.user', 'user')
      .orderBy('v.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status && status !== 'all') {
      qb.where('v.status = :status', { status });
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((t) => ({
        id: t.id,
        user_id: t.user_id,
        username: (t as any).user?.username || null,
        task_id: t.task_id,
        display_id: `video_${String(t.id).padStart(3, '0')}`,
        script_id: t.script_id,
        script_title: (t as any).script?.title || null,
        status: t.status,
        progress: t.progress,
        resolution: t.resolution,
        duration: t.duration,
        credit_cost: t.credit_cost,
        video_url: t.video_url,
        error_msg: t.error_msg,
        retry_count: t.retry_count,
        created_at: t.created_at,
        completed_at: t.completed_at,
      })),
      total,
      page,
      limit,
    };
  }

  async getUsers(page: number, limit: number, keyword?: string) {
    const qb = this.userRepo
      .createQueryBuilder('u')
      .select(['u.id', 'u.username', 'u.phone', 'u.credits', 'u.status', 'u.role', 'u.created_at'])
      .orderBy('u.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (keyword) {
      qb.where('u.username LIKE :kw OR u.phone LIKE :kw', { kw: `%${keyword}%` });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async toggleBan(userId: number, banned: boolean, adminId?: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    user.status = banned ? 0 : 1;
    const saved = await this.userRepo.save(user);
    if (adminId) {
      await this.log(adminId, banned ? '封禁用户' : '解封用户', `用户ID: ${userId}, 用户名: ${user.username}`, 'user', userId);
    }
    return saved;
  }

  async recharge(userId: number, amount: number, adminId?: number) {
    if (!amount || amount <= 0) throw new BadRequestException('充值数量必须大于 0');
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    user.credits = (user.credits || 0) + amount;

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

    await this.userRepo.save(user);
    await this.orderRepo.save(order);
    if (adminId) {
      await this.log(adminId, '用户充值', `用户ID: ${userId}, 充值: +${amount} 算力`, 'user', userId);
    }
    return user;
  }

  async deleteUser(userId: number, adminId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    if (user.role === 'admin') throw new BadRequestException('不能删除管理员账号');

    // Cascade delete related data
    await this.scriptRepo.delete({ user_id: userId });
    await this.characterRepo.delete({ user_id: userId });
    await this.videoRepo.delete({ user_id: userId });
    await this.orderRepo.delete({ user_id: userId });
    await this.userRepo.delete(userId);

    await this.log(adminId, '删除用户', `用户ID: ${userId}, 用户名: ${user.username}`, 'user', userId);
    return { success: true };
  }

  async getPublicSiteConfig() {
    const siteName = await this.configRepo.findOne({ where: { config_key: 'site_name' } });
    const siteNotice = await this.configRepo.findOne({ where: { config_key: 'site_notice' } });
    return {
      site_name: siteName?.config_value || 'AI 动漫短剧',
      site_notice: siteNotice?.config_value || '',
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
    const [userCount, scriptCount, apiKeyCount, todayCalls] = await Promise.all([
      this.userRepo.count(),
      this.scriptRepo.count(),
      this.configRepo
        .createQueryBuilder('c')
        .where('c.config_key LIKE :pattern', { pattern: '%_api_key' })
        .andWhere("c.config_value IS NOT NULL AND c.config_value != ''")
        .getCount(),
      this.videoRepo
        .createQueryBuilder('v')
        .where('v.created_at >= :today', { today: todayStart })
        .getCount(),
    ]);

    return { userCount, scriptCount, apiKeyCount, todayCalls };
  }
}
