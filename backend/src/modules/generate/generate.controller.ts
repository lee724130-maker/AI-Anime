import { Controller, Get, Post, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GenerateService } from './generate.service';

@Controller('api/generate')
@UseGuards(JwtAuthGuard)
export class GenerateController {
  constructor(private readonly generateService: GenerateService) {}

  @Post('text-to-image')
  textToImage(@Req() req, @Body() body: {
    prompt: string;
    style?: string;
    num_images?: number;
    model?: string;
    width?: number;
    height?: number;
  }) {
    return this.generateService.textToImage(req.user.id, body);
  }

  @Post('text-to-video')
  textToVideo(@Req() req, @Body() body: {
    prompt: string;
    style?: string;
    resolution?: string;
    ratio?: string;
    duration?: number;
    model?: string;
  }) {
    return this.generateService.textToVideo(req.user.id, body);
  }

  @Post('image-to-video')
  imageToVideo(@Req() req, @Body() body: {
    image_url: string;
    media?: Array<{ type: string; url: string }>;
    prompt?: string;
    style?: string;
    resolution?: string;
    ratio?: string;
    duration?: number;
    model?: string;
  }) {
    return this.generateService.imageToVideo(req.user.id, body);
  }

  @Post('image-merge')
  imageMerge() {
    return { message: '多图合并功能正在开发中，敬请期待' };
  }

  @Post('smart-describe')
  smartDescribe(@Req() req, @Body() body: { images: string[] }) {
    return this.generateService.smartDescribe(req.user.id, body);
  }

  @Post('smart-plan')
  smartPlan(@Req() req, @Body() body: { prompt: string; images?: string[]; mode?: string }) {
    return this.generateService.smartPlan(req.user.id, body);
  }

  @Get('tasks')
  listTasks(@Req() req, @Query('page') page: number, @Query('limit') limit: number) {
    return this.generateService.listTasks(req.user.id, page || 1, limit || 20);
  }

  @Post('tasks/:id/retry')
  retryTask(@Req() req, @Param('id') id: number) {
    return this.generateService.retryTask(req.user.id, id);
  }

  @Delete('tasks/:id')
  deleteTask(@Req() req, @Param('id') id: number) {
    return this.generateService.deleteTask(req.user.id, id);
  }
}
