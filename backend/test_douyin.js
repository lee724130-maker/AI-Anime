const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('https://v.douyin.com/HIKLaQt7w1s/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);
  const raw = await page.evaluate(() => {
    const el = document.getElementById('RENDER_DATA');
    return el ? el.textContent : '';
  });
  const decoded = decodeURIComponent(raw);
  
  // Find all mp4-related URLs in the decoded data
  const patterns = [
    /play_addr[^}]+url_list[^}]+/,
    /video[^}]+play_addr[^}]+/,
    /https?:\\\/\\\/[^"\\]+douyinvod[^"\\]+/,
    /https?:\\\/\\\/[^"\\]+\.mp4[^"\\]+/g,
    /"src":"([^"]+\.mp4)"/,
    /"src":\s*"([^"]+)"/g,
  ];
  
  console.log('=== RENDER_DATA decoded (first 2000 chars) ===');
  console.log(decoded.substring(0, 2000));
  console.log('\n=== Video URL patterns ===');
  
  const mp4Matches = decoded.match(/https?:\\\/\\\/[^"\\]+\.mp4[^"\\]*/g);
  if (mp4Matches) {
    console.log('MP4 URLs:', mp4Matches.length);
    mp4Matches.forEach((u, i) => {
      const clean = u.replace(/\\\//g, '/');
      console.log(`  ${i}: ${clean.substring(0, 200)}`);
    });
  } else {
    console.log('No MP4 URLs found in RENDER_DATA');
  }
  
  // Check for video-related fields
  const videoFields = decoded.match(/"video[^"]*"/g);
  if (videoFields) {
    const unique = [...new Set(videoFields)];
    console.log('\nVideo fields:', unique.join(', '));
  }
  
  await browser.close();
})().catch(e => console.error(e));
