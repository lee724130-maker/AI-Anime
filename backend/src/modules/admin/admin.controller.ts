import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Query,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AdminService } from './admin.service';
import { AdminNotificationService } from './admin-notification.service';
import { ModelConfigService } from './model-config.service';
import { PromptTemplateService } from './prompt-template.service';

@Controller('api/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly notificationService: AdminNotificationService,
    private readonly modelConfigService: ModelConfigService,
    private readonly promptTemplateService: PromptTemplateService,
  ) {}

  // ── Public Site Config ──
  @Get('site/config')
  @Public()
  getPublicSiteConfig() { return this.adminService.getPublicSiteConfig(); }

  // ── API Keys ──
  @Get('api-keys')
  @Roles('admin')
  getApiKeys() { return this.adminService.getApiKeys(); }

  @Put('api-keys')
  @Roles('admin')
  updateApiKeys(@Body() body: Record<string, string>, @Req() req) {
    return this.adminService.updateApiKeys(body, req.user.id);
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
  toggleBan(@Param('id') id: number, @Body() body: { banned: boolean }, @Req() req) {
    return this.adminService.toggleBan(id, body.banned, req.user.id);
  }

  @Post('users/:id/recharge')
  @Roles('admin')
  recharge(@Param('id') id: number, @Body() body: { amount: number }, @Req() req) {
    return this.adminService.recharge(id, body.amount, req.user.id);
  }

  @Delete('users/:id')
  @Roles('admin')
  deleteUser(@Param('id') id: number, @Req() req) {
    return this.adminService.deleteUser(id, req.user.id);
  }

  // ── System Config ──
  @Get('system/config')
  @Roles('admin')
  getSystemConfig() { return this.adminService.getSystemConfig(); }

  @Put('system/config')
  @Roles('admin')
  updateSystemConfig(@Body() body: Record<string, string>, @Req() req) {
    return this.adminService.updateSystemConfig(body, req.user.id);
  }

  // ── Admin Notifications ──
  @Get('notifications')
  @Roles('admin')
  getNotifications(@Query('page') page: number, @Query('limit') limit: number) {
    return this.notificationService.list(page || 1, limit || 20);
  }

  @Get('notifications/unread')
  @Roles('admin')
  getUnreadCount() {
    return this.notificationService.unreadCount();
  }

  @Put('notifications/:id/read')
  @Roles('admin')
  markRead(@Param('id') id: number) {
    return this.notificationService.markRead(id);
  }

  @Put('notifications/read-all')
  @Roles('admin')
  markAllRead() {
    return this.notificationService.markAllRead();
  }

  // ── Model Configs ──
  @Get('models')
  getModels(@Query('capability') capability: string) {
    if (capability) return this.modelConfigService.findActive(capability);
    return this.modelConfigService.list(1, 100);
  }

  @Get('models/:id')
  @Roles('admin')
  getModel(@Param('id') id: number) {
    return this.modelConfigService.getById(id);
  }

  @Post('models')
  @Roles('admin')
  createModel(@Body() body: Partial<import('./model-config.entity').ModelConfig>) {
    return this.modelConfigService.create(body);
  }

  @Put('models/:id')
  @Roles('admin')
  updateModel(@Param('id') id: number, @Body() body: Partial<import('./model-config.entity').ModelConfig>) {
    return this.modelConfigService.update(id, body);
  }

  @Delete('models/:id')
  @Roles('admin')
  deleteModel(@Param('id') id: number) {
    return this.modelConfigService.delete(id);
  }

  // ── Prompt Templates (public query + admin CRUD) ──
  @Get('prompt-templates')
  getPromptTemplates(@Query('provider') provider: string, @Query('capability') capability: string) {
    return this.promptTemplateService.find(provider, capability);
  }

  @Get('prompt-templates/:id')
  @Roles('admin')
  getPromptTemplate(@Param('id') id: number) {
    return this.promptTemplateService.getById(id);
  }

  @Post('prompt-templates')
  @Roles('admin')
  createPromptTemplate(@Body() body: Partial<import('./prompt-template.entity').PromptTemplate>) {
    return this.promptTemplateService.create(body);
  }

  @Put('prompt-templates/:id')
  @Roles('admin')
  updatePromptTemplate(@Param('id') id: number, @Body() body: Partial<import('./prompt-template.entity').PromptTemplate>) {
    return this.promptTemplateService.update(id, body);
  }

  @Delete('prompt-templates/:id')
  @Roles('admin')
  deletePromptTemplate(@Param('id') id: number) {
    return this.promptTemplateService.delete(id);
  }

  // ── Admin Operation Logs ──
  @Get('logs')
  @Roles('admin')
  getAdminLogs(@Query('page') page: number, @Query('limit') limit: number) {
    return this.adminService.getAdminLogs(page || 1, limit || 20);
  }
}
