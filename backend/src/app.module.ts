import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './modules/user/user.entity';
import { Script } from './modules/script/script.entity';
import { Character } from './modules/character/character.entity';
import { SystemConfig } from './modules/admin/admin.entity';
import { VideoTask } from './modules/video/video.entity';
import { Order } from './modules/order/order.entity';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ScriptModule } from './modules/script/script.module';
import { CharacterModule } from './modules/character/character.module';
import { AdminModule } from './modules/admin/admin.module';
import { VideoModule } from './modules/video/video.module';
import { OrderModule } from './modules/order/order.module';
import { QueueModule } from './queues/queue.module';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const type = config.get<'mysql' | 'sqlite'>('DB_TYPE', 'sqlite');
        if (type === 'mysql') {
          return {
            type: 'mysql',
            host: config.get('DB_HOST', 'localhost'),
            port: config.get<number>('DB_PORT', 3306),
            username: config.get('DB_USER', 'root'),
            password: config.get('DB_PASSWORD', ''),
            database: config.get('DB_NAME', 'ai_anime'),
            charset: 'utf8mb4',
            extra: {
              charset: 'utf8mb4',
            },
            entities: [User, Script, Character, SystemConfig, VideoTask, Order],
            synchronize: true,
          };
        }
        return {
          type: 'better-sqlite3',
          database: config.get('DB_PATH', './data/dev.db'),
          entities: [User, Script, Character, SystemConfig, VideoTask, Order],
          synchronize: true,
        };
      },
    }),
    AuthModule,
    UserModule,
    ScriptModule,
    CharacterModule,
    AdminModule,
    VideoModule,
    OrderModule,
    QueueModule,
  ],
  providers: [],
})
export class AppModule {}
