import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GlobalAssetService } from './global-asset.service';

@Controller('api/global-assets')
@UseGuards(JwtAuthGuard)
export class GlobalAssetController {
  constructor(private readonly service: GlobalAssetService) {}

  @Get()
  list(@Query() query: { type?: string; tag?: string; keyword?: string; page?: number; limit?: number }) {
    return this.service.list(query);
  }

  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @Get('tags')
  tags() {
    return this.service.getDistinctTags();
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.service.getById(id);
  }

  @Post()
  create(@Body() body: Partial<{
    type: string; name: string; description: string;
    prompt: string; prompt_cn: string; tags: string;
  }>) {
    return this.service.create(body);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<{
    name: string; description: string; prompt: string; prompt_cn: string;
    image_url: string; tags: string; status: string;
  }>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post(':id/generate')
  generate(@Param('id', ParseIntPipe) id: number, @Body() body: { width?: number; height?: number; style?: string }) {
    return this.service.generateImage(id, body.width, body.height, body.style);
  }

  @Post(':id/translate')
  translate(@Param('id', ParseIntPipe) id: number, @Body() body: { text: string }) {
    return this.service.translatePrompt(id, body.text);
  }

  @Post(':id/plan-prompt')
  planPrompt(@Param('id', ParseIntPipe) id: number) {
    return this.service.planPrompt(id);
  }
}
