import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ViralTemplate } from './viral-template.entity';
import { ViralProject } from './viral-project.entity';
import { ViralService } from './viral.service';
import { ViralController } from './viral.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ViralTemplate, ViralProject])],
  controllers: [ViralController],
  providers: [ViralService],
  exports: [ViralService],
})
export class ViralModule {}
