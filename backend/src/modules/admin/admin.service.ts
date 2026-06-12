import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfig } from './admin.entity';
import { User } from '../user/user.entity';
import { Script } from '../script/script.entity';
import { VideoTask } from '../video/video.entity';

export const API_KEY_KEYS = [
  { key: 'seedance_api_key', label: 'Seedance 2.0 视频生成 Key', description: '火山引擎 ARK API Key - 文生视频/图生视频' },
  { key: 'seedream_api_key', label: 'Seedream 图片生成 Key', description: '火山引擎 ARK API Key - 支持 4.5/4.0/1.0 Pro 自动切换' },
  { key: 'volcengine_api_key', label: '火山引擎通用 Key (备用)', description: '图片+视频通用；如 Key 相同，可填上面两个独立配置' },
  { key: 'openai_api_key', label: 'OpenAI API Key', description: 'DALL-E 图片生成 + TTS 语音' },
  { key: 'deepseek_api_key', label: 'DeepSeek API Key', description: 'DeepSeek 大模型文本理解' },
  { key: 'tongyi_api_key', label: '通义万相 API Key', description: '阿里通义万相图片生成' },
  { key: 'runway_api_key', label: 'Runway API Key', description: 'Runway Gen-3 视频生成' },
  { key: 'heygen_api_key', label: 'HeyGen API Key', description: '唇形同步/数字人' },
  { key: 'tts_api_key', label: '其他 TTS 语音 Key', description: '备用配音服务' },
];

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(SystemConfig)
    private readonly configRepo: Repository<SystemConfig>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Script)
    private readonly scriptRepo: Repository<Script>,
    @InjectRepository(VideoTask)
    private readonly videoRepo: Repository<VideoTask>,
  ) {}

  async getApiKeys() {
    const keys = await Promise.all(
      API_KEY_KEYS.map(async (item) => {
        const record = await this.configRepo.findOne({
          where: { config_key: item.key },
        });
        return {
          key: item.key,
          label: item.label,
          description: item.description,
          isSet: !!record?.config_value,
          maskedValue: record?.config_value ? '••••••••' + record.config_value.slice(-4) : '',
          updatedAt: record?.updated_at || null,
        };
      }),
    );
    return keys;
  }

  async updateApiKeys(data: Record<string, string>) {
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
    }
    return results;
  }

  async getConfigValue(key: string): Promise<string | null> {
    const record = await this.configRepo.findOne({ where: { config_key: key } });
    return record?.config_value || null;
  }

  async getGenerationLogs(page: number, limit: number, status?: string) {
    const where: any = {};
    if (status && status !== 'all') where.status = status;

    const [items, total] = await this.videoRepo.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: items.map((t) => ({
        id: t.id,
        user_id: t.user_id,
        task_id: t.task_id,
        script_id: t.script_id,
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

  async toggleBan(userId: number, banned: boolean) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new Error('用户不存在');
    user.status = banned ? 0 : 1;
    return this.userRepo.save(user);
  }

  async recharge(userId: number, amount: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new Error('用户不存在');
    user.credits = (user.credits || 0) + amount;
    return this.userRepo.save(user);
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
    ];

    const configs: Record<string, string> = {};
    for (const key of keys) {
      const record = await this.configRepo.findOne({ where: { config_key: key } });
      configs[key] = record?.config_value || '';
    }
    return configs;
  }

  async updateSystemConfig(data: Record<string, string>) {
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
    ];

    for (const [key, value] of Object.entries(data)) {
      if (!allowed.includes(key)) continue;
      let record = await this.configRepo.findOne({ where: { config_key: key } });
      if (record) {
        record.config_value = value;
      } else {
        record = this.configRepo.create({ config_key: key, config_value: value });
      }
      await this.configRepo.save(record);
    }
    return { success: true };
  }

  async getDashboardStats() {
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
        .where('DATE(v.created_at) = CURDATE()')
        .getCount(),
    ]);

    return { userCount, scriptCount, apiKeyCount, todayCalls };
  }
}
