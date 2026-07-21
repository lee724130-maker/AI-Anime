import { Controller, Get, Post, Put, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TaskService } from './task.service';

@Controller('api/tasks')
@UseGuards(JwtAuthGuard)
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get()
  list(@Req() req, @Query() query: { type?: string; status?: string; project_id?: number; page?: number; limit?: number }) {
    return this.taskService.list(req.user.id, query);
  }

  @Get(':id')
  get(@Req() req, @Param('id') id: number) {
    return this.taskService.getById(req.user.id, id);
  }

  @Post()
  create(@Req() req, @Body() body: {
    project_id?: number; type: string; source?: string; source_task_id?: number;
    priority?: number; input_data?: string; model_name?: string;
  }) {
    return this.taskService.create(req.user.id, body);
  }

  @Put(':id/status')
  updateStatus(@Req() req, @Param('id') id: number, @Body() body: { status: string; progress?: number; error_msg?: string; output_data?: string }) {
    return this.taskService.updateStatus(req.user.id, id, body.status, body);
  }

  @Get(':id/events')
  getEvents(@Req() req, @Param('id') id: number) {
    return this.taskService.getEvents(id);
  }
}
