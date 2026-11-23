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

// /drama 桩数据：字段形态对齐真实后端 GET /api/drama 的 items
// （backend/src/modules/drama/drama.service.ts:113-117 —— cover_url 会回落到分集/片段的 video_url，即 mp4）
const DRAMA_ITEMS = {
  items: [
    {
      id: 11, user_id: 1, title: '铃与雾', description: '雾锁小镇的铃铛匠人，与一只会说话的白猫共同追查失踪的巡演乐团。',
      cover_url: '/static/drama-11-ep1.mp4', status: 'generating', genre: '悬疑', episodes: 12, duration: 60,
      created_at: ago(3 * 864e5), updated_at: ago(2 * 36e5),
    },
    {
      id: 12, user_id: 1, title: '体面', description: '离婚律师夫妻在同一个案子里站到对立面。',
      cover_url: '/static/cover-12.jpg', status: 'completed', genre: '都市', episodes: 8, duration: 45,
      created_at: ago(9 * 864e5), updated_at: ago(4 * 864e5),
    },
    {
      id: 13, user_id: 1, title: '未命名的草稿项目', description: null,
      cover_url: null, status: 'draft', genre: null, episodes: 6, duration: null,
      created_at: ago(1 * 864e5), updated_at: ago(36e5),
    },
  ],
  total: 3, page: 1, limit: 20,
};

// 每路由的桩数据表（正则 → body）。兜底 [/\/api\/\S*/, {}] 必须排在最前，
// 因为 Playwright 用「最后注册且匹配」的那条，登记项放后面才能覆盖兜底。
const MOCKS = {
  '/tasks': [
    [/\/api\/workbench\/tasks/, TASK_ITEMS],
  ],
  '/drama': [
    [/\/api\/drama/, DRAMA_ITEMS],
  ],
  // /user 桩数据：对齐 GET /api/user/profile（user.service.ts:22-26 直接返回 user 实体）
  '/user': [
    [/\/api\/user\/profile/, {
      id: 16, username: 'lingyu', email: 'lingyu@example.com', phone: '13800001234',
      credits: 1280, role: 'user', created_at: ago(120 * 864e5),
    }],
  ],
  // /viral 桩数据：对齐 GET /api/viral/templates（{items,total}）、/projects（数组）、
  // /categories（数组）、/credit-rules（{analyze_cost, generate.examples, regenerate}，见 CreditRulesAlert）
  '/viral': [
    [/\/api\/viral\/templates/, {
      items: [
        { id: 1, name: '产品种草口播', description: '真人口播 + 字幕 + 产品特写，适合电商短视频起号。', category: '带货', tags: ['口播'], thumbnail: '', cover_url: '/static/viral-t1.jpg', usage_count: 128, is_system: true, created_at: ago(30 * 864e5) },
        { id: 2, name: '剧情反转带货', description: '三段式反转，最后 3 秒挂链接。', category: '剧情', tags: ['反转'], thumbnail: '', cover_url: '/static/viral-t2.mp4', usage_count: 86, is_system: true, created_at: ago(22 * 864e5) },
        { id: 3, name: '开箱测评', description: '', category: '测评', tags: [], thumbnail: '', cover_url: null, usage_count: 41, is_system: false, created_at: ago(11 * 864e5) },
      ],
      total: 21, page: 1, limit: 8,
    }],
    [/\/api\/viral\/projects/, [
      { id: 31, template_id: 1, name: '双十一预热·种草 01', status: 'processing', progress: 62, result_url: null, cover_url: '/static/viral-p31.jpg', created_at: ago(2 * 36e5) },
      { id: 32, template_id: 2, name: '反转剧本·秋装', status: 'completed', progress: 100, result_url: '/static/viral-p32.mp4', cover_url: '/static/viral-p32.jpg', created_at: ago(5 * 864e5) },
      { id: 33, template_id: 3, name: '开箱·新耳机', status: 'failed', progress: 0, result_url: null, cover_url: null, created_at: ago(8 * 864e5) },
    ]],
    [/\/api\/viral\/categories/, [{ category: '带货', count: 9 }, { category: '剧情', count: 7 }, { category: '测评', count: 5 }]],
    [/\/api\/viral\/credit-rules/, { analyze_cost: 50, regenerate: '与首次生成同价', generate: { examples: { '0 图': 50, '1 图': 80, '2 图': 120 } } }],
  ],
  // /canvas 桩数据：GET /api/canvas/projects 与 /api/canvas/templates 均直接返回数组
  '/canvas': [
    [/\/api\/canvas\/projects/, [
      { id: 5, name: '秋冬新品·横版三条', ratio: '16:9', resolution: '720p', nodes: [], bgm_url: null, status: 'rendering', progress: 45, result_url: null, error_msg: null, cover_url: '/static/canvas-5.jpg', created_at: ago(6 * 36e5), updated_at: ago(30 * 6e4) },
      { id: 6, name: '竖版口播成片', ratio: '9:16', resolution: '1080p', nodes: [], bgm_url: null, status: 'completed', progress: 100, result_url: '/static/canvas-6.mp4', error_msg: null, cover_url: '/static/canvas-6b.jpg', created_at: ago(2 * 864e5), updated_at: ago(864e5) },
      { id: 7, name: '未命名的草稿画布', ratio: '1:1', resolution: '720p', nodes: [], bgm_url: null, status: 'pending', progress: 0, result_url: null, error_msg: null, cover_url: null, created_at: ago(4 * 864e5), updated_at: ago(3 * 864e5) },
    ]],
    [/\/api\/canvas\/templates/, [
      { id: 2, name: '三段式种草', description: '开场特写 → 卖点字幕 → 结尾挂链接。', category: '带货', ratio: '9:16', resolution: '720p', nodes: [{ source: { url: '/static/tpl-2.jpg' } }], variables: [{ key: 'title', label: '标题', required: true, default_value: '新品上市' }], usage_count: 12, is_system: true, created_at: ago(20 * 864e5) },
      { id: 3, name: '图文快闪', description: null, category: '快闪', ratio: '16:9', resolution: '1080p', nodes: [], variables: [], usage_count: 3, is_system: false, created_at: ago(9 * 864e5) },
    ]],
  ],
  // /open-gallery 桩数据：对齐 GET /api/comic-studio/open-gallery 的归一化条目
  // （comic-studio.service.ts getOpenCatalog → { faces, costumes, poses }，字段见前端 GalleryItem）
  '/open-gallery': (() => {
    const mk = (kind, n) => Array.from({ length: n }, (_, i) => ({
      kind,
      id: `${kind === 'face' ? 'SPR' : kind === 'styling' ? 'STY' : 'COS'}-${String(1001 + i)}`,
      title: `${kind === 'face' ? '女性' : kind === 'styling' ? '造型' : '服装'} ${1001 + i}`,
      hair: i % 2 ? '长发' : '短发',
      catName: i % 2 ? '春装' : '冬装',
      color: '黑',
      main: '上衣',
      tags: ['测试', 'CC0'],
      thumb: `https://example.com/thumb-${kind}-${i}.webp`,
      full: `https://example.com/full-${kind}-${i}.png`,
    }));
    return [[/\/api\/comic-studio\/open-gallery/, { faces: [...mk('face', 8), ...mk('styling', 4)], costumes: mk('costume', 6), poses: [] }]];
  })(),

  // /order 桩数据：套餐对齐后端默认值（order.service.ts:11-13），订单对齐 GET /api/order/list 的 {items}
  '/order': [
    [/\/api\/admin\/site\/config/, { recharge_enabled: '1' }],
    [/\/api\/order\/plans/, [
      { key: 'starter', name: '体验版', amount: 19.9, credits: 200, badge: '适合试用' },
      { key: 'creator', name: '创作者版', amount: 59.9, credits: 700, badge: '推荐' },
      { key: 'studio', name: '工作室版', amount: 199.0, credits: 2500, badge: '批量生产' },
    ]],
    [/\/api\/order\/list/, {
      items: [
        { id: 91, order_no: 'ALIPAY20261120091', plan_name: '创作者版', amount: 59.9, credits: 700, status: 'pending', created_at: ago(4 * 6e4) },
        { id: 90, order_no: 'ALIPAY20261119882', plan_name: '体验版', amount: 19.9, credits: 200, status: 'paid', created_at: ago(20 * 36e5), paid_at: ago(20 * 36e5 + 6e5) },
        { id: 89, order_no: 'ALIPAY20261118455', plan_name: '工作室版', amount: 199, credits: 2500, status: 'cancelled', created_at: ago(3 * 864e5) },
      ],
      total: 3,
    }],
  ],

  // /comic-studio 桩数据：GET /api/comic-studio 直接返回数组
  // （comic-studio.service.ts:261-264 —— 附 panel_count，并把 panel_spec / characters 置 undefined）
  '/comic-studio': [
    [/\/api\/comic-studio$/, [
      { id: 3, title: '铃与雾 · 第一话', style_mode: 'anime', panel_count: 8, status: 'script_review', updated_at: ago(2 * 36e5), created_at: ago(5 * 864e5) },
      { id: 4, title: '体面 · 都市短篇', style_mode: 'live_action', panel_count: 16, status: 'generating', updated_at: ago(40 * 6e4), created_at: ago(11 * 864e5) },
      { id: 5, title: '未命名的新番企划', style_mode: 'anime', panel_count: 0, status: 'draft', updated_at: ago(3 * 864e5), created_at: ago(3 * 864e5) },
    ]],
  ],

  // /character 桩数据：对齐 GET /api/character/list（直接返回数组）
  '/character': [
    [/\/api\/character\/list/, [
      { id: 1, name: '18岁黑长直古风少女', description: '性格安静，擅吹笛；月白襦裙，外披鸦青斗篷，腰悬一枚铜铃。', avatar_url: '/static/img_1_正面_1786008554728.png', reference_image_anime: '/static/img_11_正面_1786012806432.png', reference_image_realistic: null },
      { id: 2, name: '守桥老人', description: '左腿旧伤，说话很慢，认得每一个过桥的人。', avatar_url: null, reference_image_anime: null, reference_image_realistic: '/static/img_12_正面_1786012808726.png' },
      { id: 3, name: '未填描述的测试角色', description: null, avatar_url: null, reference_image_anime: null, reference_image_realistic: null },
    ]],
  ],

  // /script 桩数据：对齐 GET /api/script/list（直接返回数组）
  '/script': [
    [/\/api\/script\/list/, [
      { id: 11, title: '铃与雾 · 第一幕', status: 'completed' },
      { id: 12, title: '体面 · 都市短篇', status: 'processing' },
      { id: 13, title: '未命名的草稿剧本', status: 'draft' },
    ]],
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
      // 裂图计数：外链/静态图挂了却没藏起来的 img（11-20 在 /open-gallery 实测踩过，浏览器会露裂图图标+alt 文字）
      brokenImgs: [...document.querySelectorAll('img')].filter((i) => {
        const cs = getComputedStyle(i);
        return i.complete && i.naturalWidth === 0 && i.offsetParent !== null && cs.visibility !== 'hidden' && cs.display !== 'none';
      }).length,
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
