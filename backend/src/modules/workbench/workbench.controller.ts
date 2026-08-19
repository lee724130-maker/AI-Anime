import { Controller, Get, Delete, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WorkbenchService } from './workbench.service';

@Controller('api/workbench')
@UseGuards(JwtAuthGuard)
export class WorkbenchController {
  constructor(private readonly service: WorkbenchService) {}

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
}
