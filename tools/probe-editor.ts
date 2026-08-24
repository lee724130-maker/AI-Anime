const fs = require('fs');
const path = 'C:/Users/Administrator/Desktop/AI-Anime/frontend/src/pages/Editor/EditorPage.tsx';
const l = fs.readFileSync(path, 'utf8').split('\n');
console.log('lines', l.length);
const keys = ['handleAddFromAssetPanel','bindSeg','handleUpload','handleAdd','handleSeek','play','handleTimeUpdate','advanceToNext','useEffect','render','video','audio','interval','toStaticUrl'];
l.forEach((x, i) => {
  const t = x.trim();
  const hits = keys.filter(k => x.includes(k));
  if (hits.length > 0 && /^(const |function |export default|async function|  const|  (async )?function|  const .*=>)/.test(x)) {
    console.log('L' + (i + 1) + '|' + x.slice(0, 140));
  }
});