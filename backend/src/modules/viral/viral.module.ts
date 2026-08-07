import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ViralTemplate } from './viral-template.entity';
import { ViralProject } from './viral-project.entity';
import { ViralService } from './viral.service';
import { ViralController } from './viral.controller';
import { UtilsModule } from '../../utils/utils.module';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [TypeOrmModule.forFeature([ViralTemplate, ViralProject]), UtilsModule, CreditsModule],
  controllers: [ViralController],
  providers: [ViralService],
  exports: [ViralService],
})
export class ViralModule {}
