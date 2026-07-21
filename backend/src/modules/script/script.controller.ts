import {
  Controller, Get, Post, Put, Delete, Body, Param, Req, Res, UseGuards, StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ScriptService } from './script.service';
import { VideoService } from '../video/video.service';

@Controller('api/script')
@UseGuards(JwtAuthGuard)
export class ScriptController {
  constructor(
    private readonly scriptService: ScriptService,
    private readonly videoService: VideoService,
  ) {}

  @Get('list')
  list(@Req() req) {
    return this.scriptService.findByUser(req.user.id);
  }

  @Get(':id')
  detail(@Param('id') id: number, @Req() req) {
    return this.scriptService.findOne(id, req.user.id);
  }

  @Get(':id/export')
  async exportScript(@Param('id') id: number, @Req() req, @Res({ passthrough: true }) res: Response) {
    const script = await this.scriptService.findOne(id, req.user.id);
    const data = {
      title: script.title,
      content: script.content,
      scenes: script.scenes,
      export_time: new Date().toISOString(),
    };
    const json = JSON.stringify(data, null, 2);
    const filename = encodeURIComponent(`${script.title || 'script'}.json`);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(Buffer.from(json));
  }

  @Post('import')
  async importScript(@Body() body: { title?: string; content: string; scenes?: any }, @Req() req) {
    return this.scriptService.create(req.user.id, {
      title: body.title || '导入的剧本',
      content: body.content || '',
      scenes: body.scenes || undefined,
    });
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

  @Post(':id/split')
  split(@Param('id') id: number, @Req() req) {
    return this.scriptService.splitScenes(id, req.user.id);
  }

  @Put(':id/scene/:index')
  updateScene(
    @Param('id') id: number,
    @Param('index') index: number,
    @Body() body: { prompt?: string; duration?: number },
    @Req() req,
  ) {
    return this.scriptService.updateScene(id, req.user.id, index, body);
  }

  @Post(':id/generate-all')
  async generateAll(
    @Param('id') id: number,
    @Body() body: {
      character_id?: number;
      character_name?: string;
      character_desc?: string;
      characters?: Array<{ character_id?: number; character_name?: string; character_desc?: string }>;
      resolution?: string;
      ratio?: string;
      duration?: number;
      style?: string;
      model?: string;
    },
    @Req() req,
  ) {
    const script = await this.scriptService.findOne(id, req.user.id);
    if (!script.scenes || !Array.isArray(script.scenes) || script.scenes.length === 0) {
      throw new Error('请先拆分场景');
    }

    const results: any[] = [];
    for (let i = 0; i < script.scenes.length; i++) {
      const scene = script.scenes[i];

      // Build context from previous scenes
      const contextParts: string[] = [];
      for (let j = 0; j < i; j++) {
        const prev = script.scenes[j];
        const prevSummary = prev.prompt.slice(0, 120);
        contextParts.push(`[前情提要] ${prevSummary}`);
      }

      let prompt = `[场景 ${i + 1}/${script.scenes.length}] ${scene.prompt}`;
      if (contextParts.length > 0) {
        prompt = contextParts.join('\n') + '\n\n' + prompt;
      }

      const resolution = body.resolution || '720p';
      const ratio = body.ratio || '9:16';
      const style = body.style || 'anime';

      // Generate reference image from first character
      const firstChar = Array.isArray(body.characters) && body.characters.length > 0
        ? body.characters[0]
        : null;
      const charId = firstChar?.character_id || body.character_id;

      const task = await this.videoService.create(req.user.id, {
        script_id: id,
        script_title: script.title || undefined,
        character_id: charId,
        character_name: firstChar?.character_name || body.character_name,
        character_desc: firstChar?.character_desc || body.character_desc,
        characters: body.characters || [],
        prompt,
        resolution,
        ratio,
        duration: scene.duration || body.duration || 5,
        style,
        model: body.model,
        settings: { scene_index: i },
      });

      // Update scene with task_id
      scene.task_id = task.id;
      scene.status = 'pending';
      results.push({ scene_index: i, task_id: task.id, id: task.id });
    }

    await this.scriptService.update(id, req.user.id, { scenes: script.scenes });
    return { total: results.length, scenes: results };
  }

  @Post(':id/stitch-all')
  async stitchAll(@Param('id') id: number, @Req() req) {
    const videoIds = await this.scriptService.getCompletedSceneVideoIds(id, req.user.id);
    if (videoIds.length < 2) {
      throw new Error(`至少需要 2 个已完成场景，当前仅 ${videoIds.length} 个`);
    }
    return this.videoService.stitch(req.user.id, videoIds);
  }
}
