import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, ParseIntPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GlobalAssetService } from './global-asset.service';

@Controller('api/global-assets')
@UseGuards(JwtAuthGuard)
export class GlobalAssetController {
  constructor(private readonly service: GlobalAssetService) {}

  @Get()
  list(@Req() req, @Query() query: { type?: string; tag?: string; keyword?: string; page?: number; limit?: number }) {
    return this.service.list(query, req.user.id);
  }

  @Get('stats')
  stats(@Req() req) {
    return this.service.stats(req.user.id);
  }

  @Get('tags')
  tags(@Req() req) {
    return this.service.getDistinctTags(req.user.id);
  }

  @Get(':id')
  get(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.getById(id, req.user.id);
  }

  @Post()
  create(@Req() req, @Body() body: Partial<{
    type: string; name: string; description: string;
    prompt: string; prompt_cn: string; tags: string;
    image_url: string; video_url: string; audio_url: string;
  }>) {
    return this.service.create(body, req.user.id);
  }

  @Put(':id')
  update(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() body: Partial<{
    name: string; description: string; prompt: string; prompt_cn: string;
    image_url: string; video_url: string; audio_url: string; tags: string; status: string;
  }>) {
    return this.service.update(id, body, req.user.id);
  }

  @Delete(':id')
  remove(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id, req.user.id);
  }

  @Post(':id/generate')
  generate(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() body: { width?: number; height?: number; style?: string }) {
    return this.service.generateImage(id, body.width, body.height, body.style, req.user.id);
  }

  @Post(':id/translate')
  translate(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() body: { text: string }) {
    return this.service.translatePrompt(id, body.text, req.user.id);
  }

  @Post(':id/plan-prompt')
  planPrompt(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.planPrompt(id, req.user.id);
  }

  @Post(':id/thumbnail')
  thumbnail(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.generateThumbnail(id, req.user.id);
  }
}
