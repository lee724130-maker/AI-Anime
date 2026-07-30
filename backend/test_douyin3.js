const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('aweme/v1/web/aweme/detail') && url.includes('aweme_id=')) {
      try {
        const body = await response.json();
        const detail = body.aweme_detail;
        if (detail && detail.video) {
          console.log('=== VIDEO DETAIL FOUND ===');
          console.log('Title:', detail.desc || '(no title)');
          console.log('Author:', detail.author?.nickname || '(unknown)');
          console.log('Duration:', detail.duration ? (detail.duration / 1000).toFixed(1) + 's' : '(unknown)');
          
          // Extract video URL from play_addr
          const video = detail.video;
          const playAddr = video.play_addr;
          if (playAddr && playAddr.url_list) {
            console.log('\nVideo URL list:');
            playAddr.url_list.forEach((u, i) => {
              // Clean URL (remove \u0026 -> &)
              const clean = u.replace(/\\u0026/g, '&');
              console.log(`  ${i}: ${clean.substring(0, 200)}`);
            });
          }
          
          // Also check other video sources
          if (video.play_api) {
            console.log('\nPlay API:', video.play_api);
          }
          if (video.download_addr) {
            console.log('\nDownload URL:', video.download_addr.url_list?.[0]?.substring(0, 200));
          }
        }
      } catch (e) {
        console.log('Error parsing detail response:', e.message);
      }
    }
  });
  
  await page.goto('https://v.douyin.com/HIKLaQt7w1s/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(10000);
  
  await browser.close();
})().catch(e => console.error(e));
