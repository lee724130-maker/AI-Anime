import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DramaService } from './drama.service';

@Controller('api/drama')
@UseGuards(JwtAuthGuard)
export class DramaController {
  constructor(private readonly dramaService: DramaService) {}

  @Get()
  list(@Req() req, @Query('page') page: number, @Query('limit') limit: number) {
    return this.dramaService.list(req.user.id, page || 1, limit || 20);
  }

  @Post()
  create(@Req() req, @Body() body: Partial<{
    title: string; description: string; outline: string;
    genre: string; episodes: number;
  }>) {
    return this.dramaService.create(req.user.id, body);
  }

  @Post(':id/analyze')
  analyze(@Req() req, @Param('id') id: number) {
    return this.dramaService.analyze(req.user.id, id);
  }

  @Get(':id/analysis')
  getAnalysis(@Req() req, @Param('id') id: number) {
    return this.dramaService.getAnalysis(req.user.id, id);
  }

  @Put(':id/analysis')
  saveAnalysis(@Req() req, @Param('id') id: number, @Body() body: { structured_result: any }) {
    return this.dramaService.saveAnalysis(req.user.id, id, body);
  }

  @Post(':id/confirm-analysis')
  confirmAnalysis(@Req() req, @Param('id') id: number) {
    return this.dramaService.confirmAnalysis(req.user.id, id);
  }

  @Get(':id/episodes')
  getEpisodes(@Req() req, @Param('id') id: number) {
    return this.dramaService.getEpisodes(req.user.id, id);
  }

  @Get('episodes/:episodeId')
  getEpisodeDetail(@Req() req, @Param('episodeId') episodeId: number) {
    return this.dramaService.getEpisodeDetail(req.user.id, episodeId);
  }

  @Get(':id/assets')
  getAssets(@Req() req, @Param('id') id: number) {
    return this.dramaService.getAssets(req.user.id, id);
  }

  @Put('assets/:assetId')
  updateAsset(@Req() req, @Param('assetId') assetId: number, @Body() body: Partial<{
    name: string; description: string; prompt: string; prompt_cn: string; image_url: string;
    status: string; locked: boolean;
  }>) {
    return this.dramaService.updateAsset(req.user.id, assetId, body);
  }

  @Post(':id/assets')
  addAsset(@Req() req, @Param('id') id: number, @Body() body: {
    type: string; name: string; description?: string; prompt?: string; prompt_cn?: string;
  }) {
    return this.dramaService.addAsset(req.user.id, id, body);
  }

  @Delete('assets/:assetId')
  removeAsset(@Req() req, @Param('assetId') assetId: number) {
    return this.dramaService.removeAsset(req.user.id, assetId);
  }

  @Post(':id/assets/:assetId/generate')
  generateAsset(@Req() req, @Param('assetId') assetId: number, @Body() body: { width?: number; height?: number; style?: string }) {
    return this.dramaService.generateAsset(req.user.id, assetId, body.width, body.height, body.style);
  }

  @Post(':id/assets/:assetId/plan-prompt')
  planAssetPrompt(@Req() req, @Param('assetId') assetId: number) {
    return this.dramaService.planAssetPrompt(req.user.id, assetId);
  }

  @Post(':id/assets/:assetId/translate')
  translateAssetPrompt(@Req() req, @Param('assetId') assetId: number, @Body() body: { text: string }) {
    return this.dramaService.translateAssetPrompt(req.user.id, assetId, body.text);
  }

  @Post(':id/assets/generate-all')
  generateAllAssets(@Req() req, @Param('id') id: number) {
    return this.dramaService.generateAllAssets(req.user.id, id);
  }

  @Post(':id/assets/:assetId/upload')
  uploadAssetImage(@Req() req, @Param('assetId') assetId: number, @Body() body: { image_url: string }) {
    return this.dramaService.uploadAssetImage(req.user.id, assetId, body.image_url);
  }

  @Post(':id/assets/import-from-global')
  importFromGlobal(@Req() req, @Param('id') id: number, @Body() body: { assetIds: number[] }) {
    return this.dramaService.importFromGlobal(req.user.id, id, body.assetIds);
  }

  @Get('episodes/:episodeId/segments')
  getEpisodeSegments(@Req() req, @Param('episodeId') episodeId: number) {
    return this.dramaService.getEpisodeSegments(req.user.id, episodeId);
  }

  @Put('episodes/:episodeId/segments/:segmentId')
  updateSegment(@Req() req, @Param('segmentId') segmentId: number, @Body() body: Partial<{
    prompt: string; prompt_cn: string; duration: number; character_refs: string;
    prop_refs: string; scene_refs: string;
  }>) {
    return this.dramaService.updateSegment(req.user.id, segmentId, body);
  }

  @Post('episodes/:episodeId/segments/:segmentId/generate')
  generateSegment(@Req() req, @Param('segmentId') segmentId: number) {
    return this.dramaService.generateSegment(req.user.id, segmentId);
  }

  @Get('episodes/:episodeId/segments/:segmentId/status')
  getSegmentStatus(@Req() req, @Param('segmentId') segmentId: number) {
    return this.dramaService.getSegmentStatus(req.user.id, segmentId);
  }

  @Post('episodes/:episodeId/segments/:segmentId/plan')
  planSegment(@Req() req, @Param('segmentId') segmentId: number) {
    return this.dramaService.planSegmentDuration(req.user.id, segmentId);
  }

  @Post('episodes/:episodeId/generate-all')
  generateEpisodeSegments(@Req() req, @Param('episodeId') episodeId: number) {
    return this.dramaService.generateEpisodeSegments(req.user.id, episodeId);
  }

  @Post('episodes/:episodeId/stitch')
  stitchEpisode(@Req() req, @Param('episodeId') episodeId: number) {
    return this.dramaService.stitchEpisode(req.user.id, episodeId);
  }

  @Put('episodes/:episodeId/settings')
  updateEpisodeSettings(@Req() req, @Param('episodeId') episodeId: number,
    @Body() body: { style?: string; ratio?: string; resolution?: string }) {
    return this.dramaService.updateEpisodeSettings(req.user.id, episodeId, body);
  }

  @Get('model-info')
  async getModelInfo() {
    try {
      return await this.dramaService.getModelInfo();
    } catch (err: any) {
      return { error: err.message, stack: err.stack?.split('\n').slice(0,5).join('\n') };
    }
  }

  @Get('ping')
  ping() { return { ok: true }; }

  @Get(':id')
  get(@Req() req, @Param('id') id: number) {
    return this.dramaService.getById(req.user.id, id);
  }

  @Put(':id')
  update(@Req() req, @Param('id') id: number, @Body() body: Partial<{
    title: string; description: string; outline: string;
    status: string; genre: string; episodes: number;
  }>) {
    return this.dramaService.update(req.user.id, id, body);
  }

  @Delete(':id')
  delete(@Req() req, @Param('id') id: number) {
    return this.dramaService.delete(req.user.id, id);
  }
}
