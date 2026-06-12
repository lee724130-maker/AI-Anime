import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { User } from '../modules/user/user.entity';

function getDbConfig(): TypeOrmModuleOptions {
  const type = process.env.DB_TYPE || 'sqlite';

  if (type === 'mysql') {
    return {
      type: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      username: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'ai_anime',
      entities: [User],
      synchronize: true,
    };
  }

  // 默认 SQLite（开发环境免配置）
  return {
    type: 'better-sqlite3',
    database: process.env.DB_PATH || './data/dev.db',
    entities: [User],
    synchronize: true,
  };
}

export const databaseConfig = getDbConfig();
