const { chromium } = require('playwright');
const keyword = process.argv[2];
if (!keyword) { console.error('Usage: node baike-fetcher.js <keyword>'); process.exit(1); }

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  let context;
  try {
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });
    const page = await context.newPage();

    const urls = [
      `https://baike.baidu.com/item/${encodeURIComponent(keyword)}`,
      `https://baike.baidu.com/view/${encodeURIComponent(keyword)}`,
    ];

    let content = '';
    for (const url of urls) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);

        const metaDesc = await page.$('meta[name="description"]');
        if (metaDesc) {
          const desc = await metaDesc.getAttribute('content');
          if (desc) content += desc + ' ';
        }

        const paras = await page.$$eval('.para', els =>
          els.slice(0, 5).map(el => el.textContent.trim()).filter(t => t.length > 20)
        );
        content += paras.join(' ') + ' ';

        if (content.trim().length > 30) break;
        content = '';
      } catch { continue; }
    }

    const final = content.replace(/\s+/g, ' ').trim();
    if (final.length > 30) {
      console.log(final);
    } else {
      process.exit(2);
    }
  } finally {
    if (context) await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
})().catch(e => { console.error(e.message); process.exit(1); });
