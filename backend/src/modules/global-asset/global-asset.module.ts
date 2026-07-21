import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GlobalAsset } from './global-asset.entity';
import { GlobalAssetService } from './global-asset.service';
import { GlobalAssetController } from './global-asset.controller';
import { UtilsModule } from '../../utils/utils.module';

@Module({
  imports: [TypeOrmModule.forFeature([GlobalAsset]), UtilsModule],
  controllers: [GlobalAssetController],
  providers: [GlobalAssetService],
  exports: [GlobalAssetService],
})
export class GlobalAssetModule {}
