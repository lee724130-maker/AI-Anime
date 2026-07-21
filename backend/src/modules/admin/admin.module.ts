import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemConfig } from './admin.entity';
import { AdminLog } from './admin-log.entity';
import { ModelConfig } from './model-config.entity';
import { AdminNotification } from './admin-notification.entity';
import { PromptTemplate } from './prompt-template.entity';
import { User } from '../user/user.entity';
import { Script } from '../script/script.entity';
import { Character } from '../character/character.entity';
import { VideoTask } from '../video/video.entity';
import { Order } from '../order/order.entity';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminNotificationService } from './admin-notification.service';
import { AdminNotificationGateway } from './admin-notification.gateway';
import { ModelConfigService } from './model-config.service';
import { PromptTemplateService } from './prompt-template.service';

@Module({
  imports: [TypeOrmModule.forFeature([SystemConfig, AdminLog, ModelConfig, AdminNotification, PromptTemplate, User, Script, Character, VideoTask, Order])],
  controllers: [AdminController],
  providers: [AdminService, AdminNotificationService, AdminNotificationGateway, ModelConfigService, PromptTemplateService],
  exports: [AdminService, AdminNotificationService, AdminNotificationGateway, ModelConfigService, PromptTemplateService],
})
export class AdminModule {}
