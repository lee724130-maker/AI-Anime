import { Controller, Get, Post, Put, Delete, Body, Param, Req, ParseIntPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ComicStudioService } from './comic-studio.service';

@Controller('api/comic-studio')
@UseGuards(JwtAuthGuard)
export class ComicStudioController {
  constructor(private readonly service: ComicStudioService) {}

  @Get()
  list(@Req() req) {
    return this.service.list(req.user.id);
  }

  /** 可选用作固定角色的列表：角色库 + 素材库人物 */
  @Get('characters')
  characters(@Req() req) {
    return this.service.listCharacters(req.user.id);
  }

  /** 开源图鉴目录（RuiC-PoseAtlas：人脸/造型/服装，CC0），服务端缓存 1 小时 */
  @Get('open-gallery')
  openGallery(@Req() req) {
    return this.service.getOpenCatalog();
  }

  /** 导入开源图鉴原图 → /static/gallery/，返回可粘贴到设定本素材图的路径 */
  @Post('open-gallery/import')
  importOpenImage(@Req() req, @Body() body: any) {
    return this.service.importOpenImage(req.user.id, body);
  }

  @Get(':id')
  get(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.getById(req.user.id, id);
  }

  /** 生成前预检：审格步骤的逐项检查 + 是否允许开始生成（服务端硬门控共用） */
  @Get(':id/preflight')
  preflight(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.preflight(req.user.id, id);
  }

  @Post()
  create(@Req() req, @Body() body: any) {
    return this.service.create(req.user.id, body);
  }

  @Put(':id')
  update(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.service.update(req.user.id, id, body);
  }

  @Delete(':id')
  remove(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(req.user.id, id);
  }

  // ---------- V2 阶段 1：剧情大纲 → 人物识别 ----------
  @Post(':id/outline')
  generateOutline(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.service.generateOutline(req.user.id, id, body || {});
  }

  @Put(':id/outline')
  saveOutline(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.service.saveOutline(req.user.id, id, body);
  }

  @Post(':id/characters/extract')
  extractCharacters(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.extractCharacters(req.user.id, id);
  }

  @Put(':id/characters')
  saveCharacters(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.service.saveCharacters(req.user.id, id, body);
  }

  // ---------- V2 阶段 2：人设提示词 → 角色设定本 ----------
  @Post(':id/characters/prompts')
  generateCharacterPrompts(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.generateCharacterPrompts(req.user.id, id);
  }

  @Post(':id/sheets/generate')
  generateCharacterSheet(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.service.generateCharacterSheet(req.user.id, id, body);
  }

  @Put(':id/sheets/lock')
  lockSheet(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.service.lockSheet(req.user.id, id, body);
  }

  /** 块级素材来源：用现成图（/static/ 路径）替换某个设定本块，0 次生成 */
  @Put(':id/sheets/block-asset')
  setBlockAsset(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.service.setBlockAsset(req.user.id, id, body);
  }

  /** 块级参考图：把某块绑定一张大资产库图片作为 i2i 参考（不直接生成，等生成设定本时按图生图） */
  @Put(':id/sheets/block-reference')
  setBlockReference(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.service.setBlockReference(req.user.id, id, body);
  }

  /** V2 阶段 3：LLM 一次性生成完整分格脚本 */
  @Post(':id/script')
  generateScript(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.service.generateScript(req.user.id, id, body || {});
  }

  /** 阶段 B 人审：保存逐格编辑 */
  @Put(':id/panels')
  savePanels(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.service.savePanels(req.user.id, id, body);
  }

  /** 阶段 C：门控前的用量预估 */
  @Get(':id/estimate')
  estimate(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.estimate(req.user.id, id);
  }

  /** 阶段 D：确认后按复用组串行生成底图 */
  @Post(':id/generate')
  startGeneration(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.startGeneration(req.user.id, id);
  }

  /** 前端 3 秒轮询：任务状态与成图回填 */
  @Get(':id/status')
  status(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.status(req.user.id, id);
  }

  /** 单格重生成（自动移出复用组） */
  @Post(':id/regenerate/:pageNo')
  regenerate(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
    @Param('pageNo', ParseIntPipe) pageNo: number,
    @Body() body: any,
  ) {
    return this.service.regeneratePanel(req.user.id, id, pageNo, body || {});
  }

  /** 阶段 E：导出漫画包 ZIP（格NN.png + panel-spec.json + manifest.json） */
  @Post(':id/export')
  exportPackage(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.exportPackage(req.user.id, id);
  }
}
