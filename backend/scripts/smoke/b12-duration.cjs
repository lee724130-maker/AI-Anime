'use strict';
// A14 分镜时长纪律 + 字段白名单 冒烟（B12）
// 用法: node backend/scripts/smoke/b12-duration.cjs [segmentId]
// 默认取第一个 pending 且带提示词的片段；跑完自动还原原值。需要后端在 3000 端口运行。
const axios = require('./lib.cjs').dep('axios');
const { db, tokenFor, API, check, summary } = require('./lib.cjs');

(async () => {
  const c = await db();
  const argSeg = Number(process.argv[2]);
  const picked = argSeg
    ? await c.query('SELECT s.id, s.episode_id, s.duration, s.status, s.video_url, p.user_id FROM drama_segments s JOIN drama_episodes e ON e.id=s.episode_id JOIN drama_projects p ON p.id=e.project_id WHERE s.id=?', [argSeg])
    : await c.query('SELECT s.id, s.episode_id, s.duration, s.status, s.video_url, p.user_id FROM drama_segments s JOIN drama_episodes e ON e.id=s.episode_id JOIN drama_projects p ON p.id=e.project_id WHERE s.status=\'pending\' AND CHAR_LENGTH(IFNULL(s.prompt,\'\'))>0 ORDER BY s.id LIMIT 1');
  const seg = picked[0][0];
  if (!seg) { console.log('❌ 本地库没有可测片段（跑过剧本分析的项目才行）'); process.exit(1); }
  console.log(`测试片段 #${seg.id}（集 ${seg.episode_id}，owner user#${seg.user_id}）原值 duration=${seg.duration} status=${seg.status} video_url=${seg.video_url}`);

  const auth = await tokenFor(seg.user_id);
  const url = `${API()}/api/drama/episodes/${seg.episode_id}/segments/${seg.id}`;
  const put = (body) => axios.put(url, body, auth);
  const read = async () => (await c.query('SELECT duration, status, video_url, episode_id, progress_percent FROM drama_segments WHERE id=?', [seg.id]))[0][0];

  let r = await put({ duration: 20 });
  const msg = String(r.data?.message || '');
  check('T1 duration=20 → 400 且报错说清原因（B12 判据）',
    r.status === 400 && /不合法/.test(msg) && /15/.test(msg) && /拆成多个片段/.test(msg), `HTTP ${r.status} | ${msg.slice(0, 150)}`);

  let row = await read();
  check('T1b 被拒后库里没被写脏', row.duration === seg.duration, `db duration=${row.duration}（原 ${seg.duration}）`);

  r = await put({ duration: 15 });
  row = await read();
  check('T2 duration=15 → 放行（目标区间外但没越硬上限）', r.status === 200 && row.duration === 15, `HTTP ${r.status} | db=${row.duration}`);

  r = await put({ duration: 4 });
  row = await read();
  check('T3 duration=4 → 放行（目标区间内）', r.status === 200 && row.duration === 4, `HTTP ${r.status} | db=${row.duration}`);

  r = await put({ duration: 5, status: 'completed', video_url: '/static/HACK.mp4', episode_id: 999, id: 99999, progress_percent: 100 });
  row = await read();
  check('T4 夹带 status/video_url/episode_id/id/progress_percent 全部被忽略（白名单）',
    r.status === 200 && row.status === seg.status && row.video_url === seg.video_url
    && row.episode_id === seg.episode_id && row.duration === 5,
    `HTTP ${r.status} | 回读 ${JSON.stringify(row)}`);

  r = await put({ duration: 'abc' });
  check('T5 duration="abc" → 400 说清要数字', r.status === 400 && /必须是数字/.test(String(r.data?.message || '')), `HTTP ${r.status} | ${String(r.data?.message).slice(0, 100)}`);

  await c.query('UPDATE drama_segments SET duration=?, status=?, video_url=? WHERE id=?', [seg.duration, seg.status, seg.video_url, seg.id]);
  const back = await read();
  console.log(`已还原: duration=${back.duration} status=${back.status} video_url=${back.video_url}`);
  await c.end();
  summary('B12 时长纪律冒烟');
})().catch(e => { console.log('ERR', e.response ? `${e.response.status} ${JSON.stringify(e.response.data)}` : e.message); process.exit(1); });
