/**
 * TypeORM CLI 专用数据源（migration:generate / migration:run）。
 *
 * 运行时连接仍在 app.module.ts 里配置，这份只服务于命令行，两边共用同一套 env 键，
 * 因此「本地 .env / .env.local → 生产同名键」这条既有约定不变。
 * ⚠️ 改 env 键值记得 .env 与 .env.local 两份都改（.env.local 优先，10-23 事故血泪）。
 *
 * 常用命令见 package.json 的 migration:* 脚本。给全新环境建表：
 *   DB_SYNCHRONIZE=0 DB_MIGRATIONS_RUN=1 → migration 会自动执行 baseline。
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';

// 手动按 .env.local → .env 顺序读取，与 ConfigModule 的 envFilePath 优先级保持一致
function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      // 已存在的进程环境变量优先（便于命令行临时覆盖，如 DB_NAME=xxx_baseline）
      if (process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
}
loadEnv();

const entities = [path.join(__dirname, 'modules', '**', '*.entity.{ts,js}')];
const migrations = [path.join(__dirname, 'migrations', '*.{ts,js}')];

const type = (process.env.DB_TYPE || 'sqlite') as 'mysql' | 'sqlite';

export const AppDataSource: any = type === 'mysql'
  ? new DataSource({
      type: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      username: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'ai_anime',
      charset: 'utf8mb4',
      extra: { charset: 'utf8mb4' },
      entities,
      migrations,
      migrationsTableName: 'typeorm_migrations',
      // CLI 里永远不要 synchronize：否则 migration:generate 会把差异算成 0，生成空迁移
      synchronize: false,
    })
  : new DataSource({
      type: 'better-sqlite3',
      database: process.env.DB_PATH || './data/dev.db',
      entities,
      migrations,
      migrationsTableName: 'typeorm_migrations',
      synchronize: false,
    });

// ⚠️ 不要再加 `export default AppDataSource`：TypeORM CLI 要求数据源文件里
// 只能有一个 DataSource 导出，具名 + default 双导出会直接报
// "Given data source file must contain only one export of DataSource instance"。
