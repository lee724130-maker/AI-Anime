// tools/probe-ui.cjs —— 前端质感改造的「通用」可视化探针：截图 + 量实测值（暗/浅双主题）
// 由 probe-generate-ui.cjs 泛化而来（2026-11-19），铺其余页面时复用，不再逐页复制脚本。
// 用法：
//   node tools/probe-ui.cjs                       # 默认 /tasks，前缀 task，dark
//   node tools/probe-ui.cjs /tasks task light      # 指定 路由 / 页作用域类名前缀 / 主题
//   PW=... EXE=... BASE=... 可用环境变量覆盖 playwright、chromium、地址
// 前置：vite dev 已在 http://localhost:5173 跑着（vite 只听 IPv6 ::1，必须用 localhost）。
// 说明：本探针**桩掉全部 /api**，只为在无登录态下渲染出页面骨架量尺寸；不产生任何计费调用。
//   MOCKS 里按路由登记必要桩数据，命中则覆盖兜底空 stub，让页面渲染出真实内容而非空态；
//   未登记的路由走兜底空 stub，仍可截图 + 查 pageErrors + 量几何（够用骨架级验证）。
const fs = require('fs');
const path = require('path');
const PW = process.env.PW || 'D:/OpenFilm/npm/node_modules/openfilm/node_modules/playwright-core';
const EXE = process.env.EXE || 'D:/OpenFilm/Browsers/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const BASE = process.env.BASE || 'http://localhost:5173';
const ROOT = path.resolve(__dirname, '..');
const OUTDIR = path.join(ROOT, 'tools', '.probe');

const ROUTE = (process.argv[2] || '/tasks');
const PREFIX = (process.argv[3] || 'task');
const THEME = (process.argv[4] || 'dark').toLowerCase();

const ago = (ms) => new Date(Date.now() - ms).toISOString();

// /tasks 桩数据：字段形态对齐真实后端 /api/workbench/tasks 返回的 items（source/type/status/title/projectId/time）
const TASK_ITEMS = {
  items: [
    { id: 101, source: 'generation', type: 'text-to-image', status: 'processing', title: '赛博朋克雨夜街道，霓虹招牌', projectId: null, time: ago(5 * 6e4) },
    { id: 102, source: 'video', type: 'text-to-video', status: 'processing', title: '针织毛衣上身展示', projectId: null, time: ago(40 * 6e4) },
    { id: 201, source: 'segment', type: 'video', status: 'processing', title: '第 3 集 · 分镜合成', projectId: 88, time: ago(2 * 36e5) },
  ],
};

// 每路由的桩数据表（正则 → body）。兜底 [/\/api\/\S*/, {}] 必须排在最前，
// 因为 Playwright 用「最后注册且匹配」的那条，登记项放后面才能覆盖兜底。
const MOCKS = {
  '/tasks': [
    [/\/api\/workbench\/tasks/, TASK_ITEMS],
  ],
  '/generate': [
    [/\/api\/generate\/tts-voices/, []],
    [/\/api\/generate\/credit-rules/, { image_per_image: 5, video_720p_per_5s: 20, video_unit_seconds: 5 }],
    [/\/api\/global-assets/, { items: [], total: 0 }],
    [/\/api\/generate\/tasks/, { items: [], total: 0 }],
  ],
};

const ROUTES = [
  [/\/api\/\S*/, {}],
  [/\/api\/auth\/me/, { id: 1, username: '探针用户', role: 'user', credits: 1200 }],
  ...(MOCKS[ROUTE] || []),
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
  await pg.goto(BASE + ROUTE, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForTimeout(3000);
  try {   // 「测试版说明」弹窗由后端 flag 控制，本地 key 挡不住，勾不再提示再确认
    const c = pg.locator('.ant-modal .ant-checkbox-input').first();
    if (await c.isVisible({ timeout: 1500 })) await c.click();
    const o = pg.locator('.ant-modal button').filter({ hasText: /确\s*认/ }).first();
    if (await o.isVisible({ timeout: 1500 })) await o.click();
  } catch (e) { /* 没弹就当没事 */ }
  await pg.waitForTimeout(1200);

  const tag = ROUTE.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  const shot = path.join(OUTDIR, `${tag}-${THEME}-${Date.now()}.png`);
  await pg.screenshot({ path: shot });

  // 判「质感」别只靠眼睛：把关键几何与变量量成数字，改坏了立刻能看出来。
  // 通用度量：令牌是否解析、页作用域容器是否出现、antd 组件计数（能反证「换容器」是否生效）。
  const m = await pg.evaluate((pfx) => {
    const cs = getComputedStyle(document.documentElement);
    const rect = (sel) => { const el = document.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().width) : null; };
    const root = document.querySelector('.' + pfx + '-root');
    return {
      route: location.pathname,
      theme: document.documentElement.getAttribute('data-theme'),
      varCard: cs.getPropertyValue('--card').trim() || '(未定义)',
      varHover: cs.getPropertyValue('--hover').trim() || '(未定义)',
      rootFound: !!root,
      rootW: root ? Math.round(root.getBoundingClientRect().width) : null,
      scopedBlocks: document.querySelectorAll('[class*="' + pfx + '-"]').length,
      antCards: document.querySelectorAll('.ant-card').length,
      antTables: document.querySelectorAll('.ant-table').length,
      antEmpty: document.querySelectorAll('.ant-empty').length,
      antSegmented: document.querySelectorAll('.ant-segmented').length,
      formItems: document.querySelectorAll('.ant-form-item').length,
      pageErrors: 0,
    };
  }, PREFIX);
  m.pageErrors = errs.length;
  console.log('截图 → ' + shot);
  console.log(JSON.stringify(m, null, 1));
  if (errs.length) console.log('JS 报错：' + errs.slice(0, 3).join(' ;; '));

  await b.close();
  process.exit(errs.length ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + e.message); process.exit(1); });
