'use strict';
// 冒烟脚本共用工具：读 backend/.env、连库、给指定用户签一个本地测试令牌。
// 纪律：绝不回显任何 key / 密码；只在本地库操作，不碰生产。
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const BACKEND = path.resolve(__dirname, '..', '..');
function dep(name) { return require(path.join(BACKEND, 'node_modules', name)); }

function envVal(name) {
  for (const f of ['.env', '.env.local']) {
    try {
      for (const line of fs.readFileSync(path.join(BACKEND, f), 'utf8').split(/\r?\n/)) {
        const m = line.match(new RegExp('^\\s*' + name + '\\s*=\\s*(.*)$'));
        if (m) return m[1].replace(/^"|"$/g, '').trim();
      }
    } catch (e) { /* 文件可能不存在，继续找下一个 */ }
  }
  return '';
}

async function db() {
  return mysql.createConnection({
    host: envVal('DB_HOST') || 'localhost',
    port: Number(envVal('DB_PORT') || 3306),
    user: envVal('DB_USER'), password: envVal('DB_PASSWORD'),
    database: envVal('DB_NAME'), multipleStatements: true, charset: 'utf8mb4',
  });
}

/** 给 userId 签一个本地 API 令牌（不猜密码、不改数据；仅本地冒烟用） */
async function tokenFor(userId) {
  const jwt = dep('jsonwebtoken');
  const c = await db();
  const [rows] = await c.query('SELECT id, username, role, is_super_admin FROM users WHERE id=?', [userId]);
  await c.end();
  if (!rows.length) throw new Error(`本地库里没有 user#${userId}`);
  const u = rows[0];
  const token = jwt.sign(
    { sub: u.id, username: u.username, role: u.role, is_super_admin: u.is_super_admin },
    envVal('JWT_SECRET'), { expiresIn: envVal('JWT_EXPIRES_IN') || '1h' },
  );
  return {
    user: u,
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,
  };
}

const API = () => `http://${envVal('HOST') || '127.0.0.1'}:${envVal('PORT') || 3000}`;

let pass = 0, failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${detail ? '\n        ' + detail : ''}`);
  ok ? pass++ : failed++;
}
function summary(label) {
  console.log(`\n=== ${label}：${pass} 通过 / ${failed} 失败 ===`);
  process.exit(failed ? 1 : 0);
}

module.exports = { envVal, db, dep, tokenFor, API, check, summary, BACKEND };
