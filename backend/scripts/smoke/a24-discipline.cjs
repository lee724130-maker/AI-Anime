'use strict';
// A24 分镜提示词纪律附加 冒烟
// 用法: node backend/scripts/smoke/a24-discipline.cjs
// 直调 DramaService.prototype.buildPromptDiscipline，不触发真实生成、不花积分、不需要后端在跑。
const { db, check, summary } = require('./lib.cjs');
const path = require('path');
const { DramaService } = require(path.resolve(__dirname, '..', '..', 'dist', 'src', 'modules', 'drama', 'drama.service'));

const NOOP = { log: () => {}, warn: () => {} };
const mkSvc = (tpls) => {
  const svc = Object.create(DramaService.prototype);
  svc.logger = NOOP;
  svc.templateService = { find: async () => tpls };
  return svc;
};
const call = (tpls, seg) => DramaService.prototype.buildPromptDiscipline.call(mkSvc(tpls), seg);

(async () => {
  const c = await db();
  const [tpls] = await c.query('SELECT name, template, status FROM prompt_templates');
  await c.end();
  console.log(`读入模板 ${tpls.length} 条`);

  const calm = await call(tpls, {
    prompt: 'A young woman holds a hospital bill, cold white light',
    prompt_cn: '林晚手握缴费单，眼神疲惫', summary: '病房对峙', timeline: '1~2秒：抬头；3~5秒：攥紧单据',
  });
  check('T1 普通镜头 → 附加「纪律 + 转场」，不含打戏块',
    calm.applied.includes('漫剧分镜提示词纪律') && calm.applied.includes('转场衔接附加') && !calm.applied.includes('打戏强化附加'),
    `applied=${calm.applied.join(' / ')} | +${calm.suffix.length} 字`);

  const fight = await call(tpls, {
    prompt: 'The guard swings a sword and charges forward', prompt_cn: '守卫挥剑冲上前来，两人搏斗',
    summary: '打斗', timeline: '1~2秒：挥剑',
  });
  check('T2 中文打戏镜头 → 三条全部附加', fight.applied.length === 3 && fight.applied.includes('打戏强化附加'), `applied=${fight.applied.join(' / ')}`);

  const en = await call(tpls, { prompt: 'a fast chase through the corridor, punch lands', prompt_cn: '', summary: '', timeline: '' });
  check('T3 纯英文提示词也命中打戏关键词', en.applied.includes('打戏强化附加'), `applied=${en.applied.join(' / ')}`);

  const none = await call([], { prompt: 'x', prompt_cn: '', summary: '', timeline: '' });
  check('T4 模板缺失（生产未跑种子）→ 空附加且不抛错', none.suffix === '' && none.applied.length === 0, JSON.stringify(none.applied));

  const svc = mkSvc([]);
  svc.templateService = { find: async () => { throw new Error('db down'); } };
  const boom = await DramaService.prototype.buildPromptDiscipline.call(svc, { prompt: 'x', prompt_cn: '', summary: '', timeline: '' });
  check('T5 模板表查询异常 → 静默降级，不打断生成', boom.suffix === '', `suffix 长度=${boom.suffix.length}`);

  const missing = ['漫剧分镜提示词纪律', '打戏强化附加', '转场衔接附加'].filter(n => !tpls.some(t => t.name === n && t.status === 'active'));
  check('T6 三条模板已在 prompt_templates 且 active', missing.length === 0, missing.length ? `缺: ${missing.join(', ')}` : '全部就位');

  const t67 = tpls.filter(t => ['剧本智能拆分模板', '剧本分段扩展模板'].includes(t.name));
  check('T7 模板 6/7 的时长口径已改（无「5-10 秒」）',
    t67.length === 2 && t67.every(t => /4~5 秒/.test(t.template) && !/5-10 秒/.test(t.template)),
    t67.map(t => `${t.name}:${/5-10 秒/.test(t.template) ? '仍是旧口径' : '已改'}`).join(' | '));

  summary('A24 提示词纪律冒烟');
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
