import { Controller, Get, Post, Delete, Body, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WorkbenchService } from './workbench.service';
import { PromoService } from './promo.service';

@Controller('api/workbench')
@UseGuards(JwtAuthGuard)
export class WorkbenchController {
  constructor(
    private readonly service: WorkbenchService,
    private readonly promoService: PromoService,
  ) {}

  @Get('summary')
  summary(@Req() req) {
    return this.service.getSummary(req.user.id);
  }

  @Get('projects')
  projects(@Req() req) {
    return this.service.getProjects(req.user.id);
  }

  @Get('tasks')
  tasks(@Req() req, @Query('status') status?: string) {
    if (status !== 'processing' && status !== 'pending') {
      throw new BadRequestException('status 仅支持 processing 或 pending');
    }
    return this.service.getTasks(req.user.id, status);
  }

  @Get('failed-tasks')
  failedTasks(@Req() req) {
    return this.service.getFailedTasks(req.user.id);
  }

  @Delete('failed-tasks')
  clearFailedTasks(@Req() req) {
    return this.service.clearFailedTasks(req.user.id);
  }

  @Get('disk-usage')
  diskUsage() {
    return this.service.getDiskUsage();
  }

  /** 我的作品：按模块聚合该用户生成的视频（tab 客户端过滤） */
  @Get('works')
  works(@Req() req) {
    return this.service.getWorks(req.user.id);
  }

  /** B：优秀作品展（online + 最新；?category= 可选过滤） */
  @Get('showcase')
  showcase(@Query('category') category?: string) {
    return this.service.getShowcase(category);
  }

  /** A：活动栏 + 新功能上新（online 且在期；dashboard 一次性拉取） */
  @Get('promo')
  promo() {
    return this.promoService.getPromo();
  }

  /** A：新手任务清单面板（进度实时判定） */
  @Get('gameplay/tasks')
  gameplayTasks(@Req() req) {
    return this.promoService.gameplayTasks(req.user.id);
  }

  /** A：领取新手任务奖励（发积分） */
  @Post('gameplay/claim')
  claim(@Req() req, @Body() body: { task_key?: string }) {
    return this.promoService.claim(req.user.id, body?.task_key);
  }
}
