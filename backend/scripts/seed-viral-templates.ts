import { createConnection } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';

// Minimal entity classes for seeding
import { ViralTemplate } from '../src/modules/viral/viral-template.entity';
import { User } from '../src/modules/user/user.entity';
import { Script } from '../src/modules/script/script.entity';
import { Character } from '../src/modules/character/character.entity';
import { SystemConfig } from '../src/modules/admin/admin.entity';
import { AdminLog } from '../src/modules/admin/admin-log.entity';
import { ModelConfig } from '../src/modules/admin/model-config.entity';
import { AdminNotification } from '../src/modules/admin/admin-notification.entity';
import { PromptTemplate } from '../src/modules/admin/prompt-template.entity';
import { VideoTask } from '../src/modules/video/video.entity';
import { Order } from '../src/modules/order/order.entity';
import { DramaProject } from '../src/modules/drama/drama-project.entity';
import { DramaOutline } from '../src/modules/drama/drama-outline.entity';
import { DramaEpisode } from '../src/modules/drama/drama-episode.entity';
import { DramaSegment } from '../src/modules/drama/drama-segment.entity';
import { DramaAsset } from '../src/modules/drama/drama-asset.entity';
import { GlobalAsset } from '../src/modules/global-asset/global-asset.entity';
import { MediaFile } from '../src/modules/media/media-file.entity';
import { GenerationTask } from '../src/modules/task/generation-task.entity';
import { TaskEvent } from '../src/modules/task/task-event.entity';
import { ViralProject } from '../src/modules/viral/viral-project.entity';

const TEMPLATES = [
  {
    name: '快餐新品广告',
    description: '快速制作产品展示广告，包含产品特写、文案展示、使用场景和品牌收尾',
    category: 'product',
    tags: JSON.stringify(['快餐', '广告', '产品展示']),
    is_system: true,
    scenes: JSON.stringify([
      { name: '产品特写', duration: 3, description: '产品居中展示，缓慢旋转，背景干净', type: 'image' },
      { name: '文案展示', duration: 2, description: 'slogan 文字动画弹出', type: 'text' },
      { name: '使用场景', duration: 4, description: '人物使用产品的场景', type: 'video' },
      { name: '品牌收尾', duration: 2, description: 'Logo + 品牌色背景 + 行动号召', type: 'text' },
    ]),
    variables: JSON.stringify([
      { key: 'product_name', label: '产品名称', type: 'text', placeholder: 'eg. 香辣鸡腿堡', required: true },
      { key: 'slogan', label: '广告语', type: 'text', placeholder: 'eg. 一口就上瘾', required: true },
      { key: 'brand_color', label: '品牌色', type: 'text', placeholder: 'eg. #FF0000', required: true },
      { key: 'product_desc', label: '产品描述', type: 'textarea', placeholder: '描述产品的特点、卖点', required: true },
      { key: 'cta_text', label: '行动号召', type: 'text', placeholder: 'eg. 立即购买', required: false },
    ]),
    usage_count: 128,
  },
  {
    name: '开箱评测模板',
    description: '产品开箱评测视频模板，包含开箱、外观展示、功能演示和总结推荐',
    category: 'product',
    tags: JSON.stringify(['开箱', '评测', '产品展示']),
    is_system: true,
    scenes: JSON.stringify([
      { name: '开箱', duration: 3, description: '打开包装盒，取出产品', type: 'video' },
      { name: '外观展示', duration: 3, description: '产品 360° 旋转展示外观', type: 'image' },
      { name: '功能演示', duration: 4, description: '展示产品核心功能和使用方法', type: 'video' },
      { name: '总结推荐', duration: 2, description: '优缺点总结 + 推荐评分', type: 'text' },
    ]),
    variables: JSON.stringify([
      { key: 'product_name', label: '产品名称', type: 'text', placeholder: 'eg. iPhone 15 Pro', required: true },
      { key: 'category', label: '产品类别', type: 'text', placeholder: 'eg. 手机、耳机、相机', required: true },
      { key: 'features', label: '核心卖点', type: 'textarea', placeholder: '列举 3-5 个核心卖点', required: true },
      { key: 'rating', label: '推荐评分', type: 'text', placeholder: 'eg. 4.5/5', required: false },
      { key: 'summary', label: '总结语', type: 'textarea', placeholder: '一句话总结推荐', required: true },
    ]),
    usage_count: 89,
  },
  {
    name: '节日祝福模板',
    description: '通用节日祝福视频，适合春节、中秋、国庆等节日问候',
    category: 'holiday',
    tags: JSON.stringify(['节日', '祝福', '通用']),
    is_system: true,
    scenes: JSON.stringify([
      { name: '开场氛围', duration: 3, description: '节日元素背景 + 温馨氛围', type: 'image' },
      { name: '祝福文案', duration: 4, description: '主要祝福语缓缓出现', type: 'text' },
      { name: '情感升华', duration: 3, description: '温暖画面 + 感人文案', type: 'video' },
      { name: '署名收尾', duration: 2, description: '署名 + Logo + 节日快乐', type: 'text' },
    ]),
    variables: JSON.stringify([
      { key: 'holiday_name', label: '节日名称', type: 'text', placeholder: 'eg. 春节', required: true },
      { key: 'greeting', label: '祝福语', type: 'textarea', placeholder: 'eg. 祝你新的一年万事如意', required: true },
      { key: 'sender_name', label: '署名', type: 'text', placeholder: 'eg. 张三团队', required: true },
      { key: 'theme_color', label: '主题色', type: 'text', placeholder: 'eg. #FFD700', required: true },
      { key: 'bgm_mood', label: '音乐风格', type: 'text', placeholder: 'eg. 温馨、喜庆、舒缓', required: false },
    ]),
    usage_count: 256,
  },
];

async function seed() {
  const dbPath = path.resolve(process.cwd(), 'data', 'dev.db');
  const entities = [User, Script, Character, SystemConfig, AdminLog, ModelConfig, AdminNotification, PromptTemplate, VideoTask, Order, DramaProject, DramaOutline, DramaEpisode, DramaSegment, DramaAsset, GlobalAsset, MediaFile, GenerationTask, TaskEvent, ViralTemplate, ViralProject];

  const connection = await createConnection({
    type: 'better-sqlite3',
    database: dbPath,
    entities,
    synchronize: true,
  });

  const repo = connection.getRepository(ViralTemplate);

  for (const tpl of TEMPLATES) {
    const existing = await repo.findOne({ where: { name: tpl.name, is_system: true } });
    if (existing) {
      console.log(`  SKIP ${tpl.name} (already exists)`);
      continue;
    }
    await repo.save(repo.create(tpl));
    console.log(`  CREATED ${tpl.name}`);
  }

  await connection.close();
  console.log('\nSeed complete!');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
