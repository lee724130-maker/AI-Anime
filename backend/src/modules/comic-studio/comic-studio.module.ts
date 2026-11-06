import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComicProject } from './comic-project.entity';
import { GenerationTask } from '../task/generation-task.entity';
import { Character } from '../character/character.entity';
import { GlobalAsset } from '../global-asset/global-asset.entity';
import { PromptTemplate } from '../admin/prompt-template.entity';
import { ComicStudioService } from './comic-studio.service';
import { ComicStudioController } from './comic-studio.controller';
import { GenerateModule } from '../generate/generate.module';
import { UtilsModule } from '../../utils/utils.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ComicProject, GenerationTask, Character, GlobalAsset, PromptTemplate]),
    GenerateModule,
    UtilsModule,
  ],
  controllers: [ComicStudioController],
  providers: [ComicStudioService],
  exports: [ComicStudioService],
})
export class ComicStudioModule {}
