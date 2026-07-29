const Database = require('better-sqlite3');
const db = new Database('./data/dev.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name));
for (const t of tables) {
  const count = db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get();
  console.log(`  ${t.name}: ${count.cnt} rows`);
  if (t.name.includes('segment')) {
    const rows = db.prepare(`SELECT id, segment_no, video_url, status FROM "${t.name}"`).all();
    for (const r of rows) console.log(`    id=${r.id} no=${r.segment_no} status=${r.status} url=${r.video_url}`);
  }
}
db.close();
