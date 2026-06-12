import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminService } from './admin.service';

@Controller('api/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── API Keys ──
  @Get('api-keys')
  @Roles('admin')
  getApiKeys() { return this.adminService.getApiKeys(); }

  @Put('api-keys')
  @Roles('admin')
  updateApiKeys(@Body() body: Record<string, string>) {
    return this.adminService.updateApiKeys(body);
  }

  // ── Dashboard ──
  @Get('dashboard')
  @Roles('admin')
  getDashboard() { return this.adminService.getDashboardStats(); }

  // ── Generation Logs ──
  @Get('generation-logs')
  @Roles('admin')
  getGenerationLogs(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('status') status: string,
  ) { return this.adminService.getGenerationLogs(page || 1, limit || 20, status); }

  // ── User Management ──
  @Get('users')
  @Roles('admin')
  getUsers(@Query('page') page: number, @Query('limit') limit: number, @Query('keyword') keyword: string) {
    return this.adminService.getUsers(page || 1, limit || 20, keyword);
  }

  @Put('users/:id/ban')
  @Roles('admin')
  toggleBan(@Param('id') id: number, @Body() body: { banned: boolean }) {
    return this.adminService.toggleBan(id, body.banned);
  }

  @Post('users/:id/recharge')
  @Roles('admin')
  recharge(@Param('id') id: number, @Body() body: { amount: number }) {
    return this.adminService.recharge(id, body.amount);
  }

  // ── System Config ──
  @Get('system/config')
  @Roles('admin')
  getSystemConfig() { return this.adminService.getSystemConfig(); }

  @Put('system/config')
  @Roles('admin')
  updateSystemConfig(@Body() body: Record<string, string>) {
    return this.adminService.updateSystemConfig(body);
  }
}
