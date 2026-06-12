import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CharacterService } from './character.service';

@Controller('api/character')
@UseGuards(JwtAuthGuard)
export class CharacterController {
  constructor(private readonly characterService: CharacterService) {}

  @Get('list')
  list(@Req() req) {
    return this.characterService.findByUser(req.user.id);
  }

  @Get(':id')
  detail(@Param('id') id: number, @Req() req) {
    return this.characterService.findOne(id, req.user.id);
  }

  @Post()
  create(
    @Body() body: { name: string; description?: string; avatar_url?: string },
    @Req() req,
  ) {
    return this.characterService.create(req.user.id, body);
  }

  @Put(':id')
  update(
    @Param('id') id: number,
    @Body() body: { name?: string; description?: string; avatar_url?: string; lora_model_id?: string },
    @Req() req,
  ) {
    return this.characterService.update(id, req.user.id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: number, @Req() req) {
    return this.characterService.remove(id, req.user.id);
  }
}
