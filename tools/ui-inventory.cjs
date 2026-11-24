#!/usr/bin/env node
// 剩余工作盘点（11-24 批次F 后新增）：重跑可复核完成度。用法 node tools/ui-inventory.cjs按「疑似暗色发白」的浅色底/硬编码 UI 色统计，区分内容默认色
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/AI-Anime/frontend/src';

const walk = (d, out = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) out.push(p);
  }
  return out;
};

// 暗色下会变「亮白块」的可疑底色（批次A/B/D/F 反复出现的那一类）
const LIGHT_BG = /background(?:Color)?:\s*['"](#[fFeEeE][0-9a-fA-F]{2,5}|#[fF][0-9a-fA-F]{5}|white|#d9d9d9|#bbb|#ccc|#eee|#f0f0f0|#fafafa|#fff[0-9a-fA-F]*)['"]/g;
const BRAND_OLD = /#7c3aed|#a855f7|#6d28d9|#f5222d|#22c55e|#16a34a|#0ea5e9|#10b981/g;
const GRAY_TEXT = /color:\s*['"](#[0-9a-fA-F]{3,6})['"]/g;
const HAS_CSS = /import\s+'[^']+\.css'/;
// 内容/数据默认色（不该动）：出现在对象字面量里作为字段默认值
const CONTENT_HINT = /color:\s*'#[fF]{6}'\s*[,}]/;

const rows = [];
for (const f of walk(ROOT)) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = f.replace(ROOT + path.sep, '').replace(/\\/g, '/');
  const hexTotal = (src.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
  if (!hexTotal) continue;
  const lightBg = (src.match(LIGHT_BG) || []).length;
  const brandOld = (src.match(BRAND_OLD) || []).length;
  const grayTexts = [...src.matchAll(GRAY_TEXT)].map((m) => m[1].toLowerCase());
  const darkish = grayTexts.filter((c) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(c) && parseInt(c[1] + c[1] + c[2] + c[2] + c[3] + c[3], 16) < 8).length;
  const importsCss = HAS_CSS.test(src);
  const inline = (src.match(/style=\{\{/g) || []).length;
  rows.push({
    rel, hexTotal, lightBg, brandOld, textHardcoded: grayTexts.length - darkish,
    inline, importsCss,
    isHome: rel.includes('pages/Home'),
    isTheme: rel.includes('theme/'),
  });
}

const bucket = (r) => {
  if (r.isTheme) return 'D-主题配置(非样式)';
  if (r.isHome) return 'D-约定不动(/dashboard)';
  if (r.lightBg > 0 || r.brandOld >= 3) return 'A-必修:暗色发白/旧主色';
  if (r.hexTotal >= 5 && !r.importsCss) return 'B-未纳入改造';
  if (r.importsCss && r.hexTotal <= 8) return 'C-多为内容默认色(核对即可)';
  return 'B-未纳入改造';
};

const groups = {};
for (const r of rows) { const k = bucket(r); (groups[k] = groups[k] || []).push(r); }

for (const k of Object.keys(groups).sort()) {
  const list = groups[k].sort((a, b) => (b.lightBg - a.lightBg) || (b.hexTotal - a.hexTotal));
  const sumH = list.reduce((s, x) => s + x.hexTotal, 0);
  const sumL = list.reduce((s, x) => s + x.lightBg, 0);
  console.log(`\n===== ${k}  (${list.length} 文件, hex合计 ${sumH}, 浅色底 ${sumL}) =====`);
  for (const x of list.slice(0, 14)) {
    console.log(`  ${x.rel.padEnd(50)} hex=${String(x.hexTotal).padStart(3)} 浅色底=${String(x.lightBg).padStart(2)} 旧主色=${String(x.brandOld).padStart(2)} 内联=${String(x.inline).padStart(3)} ${x.importsCss ? '有css' : '无css'}`);
  }
  if (list.length > 14) console.log(`  … 其余 ${list.length - 14} 个`);
}
