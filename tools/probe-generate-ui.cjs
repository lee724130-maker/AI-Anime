// tools/probe-generate-ui.cjs —— 前端质感改造的可视化探针：截图 + 量实测值（暗/浅双主题）
// 为什么入库：诊断脚本只留在会话临时目录会随会话丢失（剪辑应用踩过两次），改造其余页面还要反复用。
// 用法：
//   node tools/probe-generate-ui.cjs                 # 默认 dark，出 tools/.probe/<主题>-<时间戳>.png
//   node tools/probe-generate-ui.cjs light           # 出浅色
//   PW=... EXE=... 可用环境变量覆盖 playwright 与 chromium 路径
// 前置：vite dev 已在 http://localhost:5173 跑着（注意 vite 只听 IPv6 ::1，必须用 localhost）。
// 说明：本探针**桩掉全部 /api**，只为在无登录态下渲染出页面骨架量尺寸；不产生任何计费调用。
const fs = require('fs');
const path = require('path');
const PW = process.env.PW || 'D:/OpenFilm/npm/node_modules/openfilm/node_modules/playwright-core';
const EXE = process.env.EXE || 'D:/OpenFilm/Browsers/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const BASE = process.env.BASE || 'http://localhost:5173';
const THEME = (process.argv[2] || 'dark').toLowerCase();
const ROOT = path.resolve(__dirname, '..');
const OUTDIR = path.join(ROOT, 'tools', '.probe');

const TASKS = {
  items: [
    { id: 101, type: 'image', status: 'completed', created_at: new Date(Date.now() - 5 * 6e4).toISOString(), input: JSON.stringify({ prompt: '赛博朋克雨夜街道，霓虹招牌' }), results: JSON.stringify([{ url: 'https://picsum.photos/seed/a/320/320' }]) },
    { id: 102, type: 'video', status: 'processing', created_at: new Date(Date.now() - 40 * 6e4).toISOString(), input: JSON.stringify({ prompt: '针织毛衣上身展示' }), progress: 45 },
    { id: 103, type: 'image', status: 'failed', created_at: new Date(Date.now() - 90 * 6e4).toISOString(), input: JSON.stringify({ prompt: '白底产品图柔光' }) },
  ],
};
// 兜底 route 必须注册在最前：Playwright 用「最后注册且匹配」的那条
const ROUTES = [
  [/\/api\/\S*/, {}],
  [/\/api\/auth\/me/, { id: 1, username: '探针用户', role: 'user', credits: 1200 }],
  [/\/api\/generate\/tasks/, TASKS],
  [/\/api\/generate\/credit-rules/, { image_per_image: 5, video_720p_per_5s: 20, video_unit_seconds: 5 }],
  [/\/api\/generate\/tts-voices/, []],
  [/\/api\/global-assets/, { items: [] }],
];

(async () => {
  if (!fs.existsSync(PW) || !fs.existsSync(EXE)) { console.error('缺 playwright 或 chromium，用 PW=/EXE= 环境变量指定：', PW, EXE); process.exit(3); }
  fs.mkdirSync(OUTDIR, { recursive: true });
  const pw = require(PW);
  const b = await pw.chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const pg = await (await b.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })).newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
  await pg.addInitScript((t) => {
    localStorage.setItem('token', 'probe-fake-token');           // 只骗过前端 ProtectedRoute，接口全被下面桩掉
    localStorage.setItem('user', JSON.stringify({ id: 1, username: '探针用户', role: 'user', credits: 1200 }));
    localStorage.setItem('frontend-theme', t);
    localStorage.setItem('tn_dismissed_1', '1');
  }, THEME);
  for (const [re, body] of ROUTES) {
    await pg.route(re, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }));
  }
  await pg.goto(BASE + '/generate', { waitUntil: 'load', timeout: 60000 });
  await pg.waitForTimeout(3000);
  try {   // 「测试版说明」弹窗由后端 flag 控制，本地 key 挡不住，勾不再提示再确认
    const c = pg.locator('.ant-modal .ant-checkbox-input').first();
    if (await c.isVisible({ timeout: 1500 })) await c.click();
    const o = pg.locator('.ant-modal button').filter({ hasText: /确\s*认/ }).first();
    if (await o.isVisible({ timeout: 1500 })) await o.click();
  } catch (e) { /* 没弹就当没事 */ }
  await pg.waitForTimeout(1200);

  const shot = path.join(OUTDIR, `generate-${THEME}-${Date.now()}.png`);
  await pg.screenshot({ path: shot });

  // 判「质感」别只靠眼睛：把关键几何与变量量成数字，改坏了立刻能看出来
  const m = await pg.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const rect = (sel) => { const el = document.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().width) : null; };
    const grid = document.querySelector('.gen-params');
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      varCard: cs.getPropertyValue('--card').trim() || '(未定义)',
      varHover: cs.getPropertyValue('--hover').trim() || '(未定义)',
      railW: rect('.gen-rail'), mainW: rect('.gen-main'),
      stageH: (() => { const s = document.querySelector('.gen-stage'); return s ? Math.round(s.getBoundingClientRect().height) : null; })(),
      paramCols: grid ? getComputedStyle(grid).gridTemplateColumns : '(无 .gen-params)',
      formItems: document.querySelectorAll('.ant-form-item').length,
      pageErrors: 0,
    };
  });
  m.pageErrors = errs.length;
  console.log('截图 → ' + shot);
  console.log(JSON.stringify(m, null, 1));
  if (errs.length) console.log('JS 报错：' + errs.slice(0, 3).join(' ;; '));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + e.message); process.exit(1); });
