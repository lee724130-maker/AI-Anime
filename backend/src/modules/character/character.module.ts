import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Character } from './character.entity';
import { CharacterService } from './character.service';
import { CharacterController } from './character.controller';
import { UtilsModule } from '../../utils/utils.module';

@Module({
  imports: [TypeOrmModule.forFeature([Character]), UtilsModule],
  controllers: [CharacterController],
  providers: [CharacterService],
  exports: [CharacterService],
})
export class CharacterModule {}
