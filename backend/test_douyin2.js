const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  
  const apiResponses = [];
  
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('aweme') || url.includes('video') || url.includes('play')) {
      const ct = response.headers()['content-type'] || '';
      if (ct.includes('json') || ct.includes('javascript')) {
        try {
          const body = await response.text();
          apiResponses.push({ url: url.substring(0, 150), type: ct, size: body.length });
          if (body.includes('play_addr') || body.includes('video_url')) {
            console.log('\n=== FOUND VIDEO DATA ===');
            console.log('URL:', url.substring(0, 200));
            console.log('Body (first 3000):', body.substring(0, 3000));
          }
        } catch {}
      }
    }
  });
  
  await page.goto('https://v.douyin.com/HIKLaQt7w1s/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(8000);
  
  console.log('\n=== API responses captured ===');
  apiResponses.forEach(r => console.log(`  ${r.url} (${r.type}, ${r.size}B)`));
  
  await browser.close();
})().catch(e => console.error(e.message));
