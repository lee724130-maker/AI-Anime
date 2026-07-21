import { Controller, Get, Req, UseGuards } from '@nestjs/common';
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

  @Get('failed-tasks')
  failedTasks(@Req() req) {
    return this.service.getFailedTasks(req.user.id);
  }

  @Get('disk-usage')
  diskUsage() {
    return this.service.getDiskUsage();
  }
}
