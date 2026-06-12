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
import { ScriptService } from './script.service';

@Controller('api/script')
@UseGuards(JwtAuthGuard)
export class ScriptController {
  constructor(private readonly scriptService: ScriptService) {}

  @Get('list')
  list(@Req() req) {
    return this.scriptService.findByUser(req.user.id);
  }

  @Get(':id')
  detail(@Param('id') id: number, @Req() req) {
    return this.scriptService.findOne(id, req.user.id);
  }

  @Post()
  create(@Body() body: { title?: string; content: string }, @Req() req) {
    return this.scriptService.create(req.user.id, body);
  }

  @Put(':id')
  update(
    @Param('id') id: number,
    @Body() body: { title?: string; content?: string; scenes?: any; status?: string },
    @Req() req,
  ) {
    return this.scriptService.update(id, req.user.id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: number, @Req() req) {
    return this.scriptService.remove(id, req.user.id);
  }
}
