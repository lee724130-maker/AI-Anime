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
  ForbiddenException,
  ParseIntPipe,
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
  async updateApiKeys(@Body() body: Record<string, string>, @Req() req) {
    return this.adminService.updateApiKeys(body, req.user.id);
  }

  // ── Dashboard ──
  @Get('dashboard')
  @Roles('admin')
  getDashboard() { return this.adminService.getDashboardStats(); }

  @Get('dashboard/trend')
  @Roles('admin')
  getDashboardTrend() { return this.adminService.getDashboardTrend(); }

  // ── Generation Logs ──
  @Get('generation-logs')
  @Roles('admin')
  getGenerationLogs(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('status') status: string,
    @Query('keyword') keyword: string,
  ) { return this.adminService.getGenerationLogs(page || 1, limit || 20, status, keyword); }

  // ── User Management ──
  @Get('users')
  @Roles('admin')
  getUsers(@Query('page') page: number, @Query('limit') limit: number, @Query('keyword') keyword: string) {
    return this.adminService.getUsers(page || 1, limit || 20, keyword);
  }

  @Put('users/:id/ban')
  @Roles('admin')
  async toggleBan(@Param('id', ParseIntPipe) id: number, @Body() body: { banned: boolean }, @Req() req) {
    const isSuperAdmin = req.user.is_super_admin === true;
    const result = await this.adminService.toggleBan(id, body.banned, req.user.id, isSuperAdmin);
    return result;
  }

  @Post('users/:id/recharge')
  @Roles('admin')
  async recharge(@Param('id', ParseIntPipe) id: number, @Body() body: { amount: number }, @Req() req) {
    const isSuperAdmin = req.user.is_super_admin === true;
    const adminPermissions = req.user.admin_permissions;
    const result = await this.adminService.recharge(id, body.amount, req.user.id, isSuperAdmin, adminPermissions);
    return result;
  }

  @Post('users/:id/deduct')
  @Roles('admin')
  async deductCredits(@Param('id', ParseIntPipe) id: number, @Body() body: { amount: number }, @Req() req) {
    const isSuperAdmin = req.user.is_super_admin === true;
    const adminPermissions = req.user.admin_permissions;
    const result = await this.adminService.deductCredits(id, body.amount, req.user.id, isSuperAdmin, adminPermissions);
    return result;
  }

  @Delete('users/:id')
  @Roles('admin')
  async deleteUser(@Param('id', ParseIntPipe) id: number, @Req() req) {
    const isSuperAdmin = req.user.is_super_admin === true;
    const result = await this.adminService.deleteUser(id, req.user.id, isSuperAdmin);
    await this.adminService.log(req.user.id, '删除用户', `用户ID: ${id}`, 'user', id);
    return result;
  }

  // ── System Config ──
  @Get('system/config')
  @Roles('admin')
  getSystemConfig() { return this.adminService.getSystemConfig(); }

  @Put('system/config')
  @Roles('admin')
  async updateSystemConfig(@Body() body: Record<string, string>, @Req() req) {
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
  markRead(@Param('id', ParseIntPipe) id: number) {
    return this.notificationService.markRead(id);
  }

  @Put('notifications/read-all')
  @Roles('admin')
  markAllRead() {
    return this.notificationService.markAllRead();
  }

  // ── Model Configs ──
  // capability 分支供普通用户 Video 页选择模型（公开只读）；无参全量列表仅管理员
  @Get('models')
  getModels(@Req() req: any, @Query('capability') capability: string) {
    if (capability) return this.modelConfigService.findActive(capability);
    if (!req.user || req.user.role !== 'admin') throw new ForbiddenException('无权限访问');
    return this.modelConfigService.list(1, 100);
  }

  @Get('models/:id')
  @Roles('admin')
  getModel(@Param('id', ParseIntPipe) id: number) {
    return this.modelConfigService.getById(id);
  }

  @Post('models')
  @Roles('admin')
  async createModel(@Body() body: Partial<import('./model-config.entity').ModelConfig>, @Req() req) {
    const result = await this.modelConfigService.create(body);
    await this.adminService.log(req.user.id, '创建模型', `模型: ${body.model_id || '-'}, provider: ${body.provider || '-'}, capability: ${body.capability || '-'}`, 'model', result.id);
    return result;
  }

  @Put('models/:id')
  @Roles('admin')
  async updateModel(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<import('./model-config.entity').ModelConfig>, @Req() req) {
    const result = await this.modelConfigService.update(id, body);
    await this.adminService.log(req.user.id, '更新模型', `模型ID: ${id}, 变更: ${Object.keys(body).join(', ') || '无'}`, 'model', id);
    return result;
  }

  @Delete('models/:id')
  @Roles('admin')
  async deleteModel(@Param('id', ParseIntPipe) id: number, @Req() req) {
    const result = await this.modelConfigService.delete(id);
    await this.adminService.log(req.user.id, '删除模型', `模型ID: ${id}`, 'model', id);
    return result;
  }

  // ── Prompt Templates (公开查询 + admin CRUD) ──
  // 提示词模板含内部生成指令，仅管理员可读
  @Get('prompt-templates')
  @Roles('admin')
  getPromptTemplates(@Query('provider') provider: string, @Query('capability') capability: string) {
    return this.promptTemplateService.find(provider, capability);
  }

  @Get('prompt-templates/:id')
  @Roles('admin')
  getPromptTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.promptTemplateService.getById(id);
  }

  @Post('prompt-templates')
  @Roles('admin')
  async createPromptTemplate(@Body() body: Partial<import('./prompt-template.entity').PromptTemplate>, @Req() req) {
    const result = await this.promptTemplateService.create(body);
    await this.adminService.log(req.user.id, '创建提示词模板', `模板: ${body.name || '-'}, capability: ${body.capability || '-'}`, 'prompt_template', result.id);
    return result;
  }

  @Put('prompt-templates/:id')
  @Roles('admin')
  async updatePromptTemplate(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<import('./prompt-template.entity').PromptTemplate>, @Req() req) {
    const result = await this.promptTemplateService.update(id, body);
    await this.adminService.log(req.user.id, '更新提示词模板', `模板ID: ${id}, 变更: ${Object.keys(body).join(', ') || '无'}`, 'prompt_template', id);
    return result;
  }

  @Delete('prompt-templates/:id')
  @Roles('admin')
  async deletePromptTemplate(@Param('id', ParseIntPipe) id: number, @Req() req) {
    const result = await this.promptTemplateService.delete(id);
    await this.adminService.log(req.user.id, '删除提示词模板', `模板ID: ${id}`, 'prompt_template', id);
    return result;
  }

  // ── Admin Operation Logs ──
  @Get('logs')
  @Roles('admin')
  getAdminLogs(@Query('page') page: number, @Query('limit') limit: number) {
    return this.adminService.getAdminLogs(page || 1, limit || 20);
  }

  // ── Payment Records ──
  @Get('payments')
  @Roles('admin')
  getPaymentRecords(@Query('page') page: number, @Query('limit') limit: number, @Query('status') status: string) {
    return this.adminService.getPaymentRecords(page || 1, limit || 20, status);
  }

  // ── User Role & Admin Permissions ──
  @Put('users/:id/role')
  @Roles('admin')
  async changeUserRole(@Param('id', ParseIntPipe) id: number, @Body() body: { role: string }, @Req() req) {
    const result = await this.adminService.changeUserRole(id, body.role, req.user.id, req.user.is_super_admin === true);
    await this.adminService.log(req.user.id, '修改用户角色', `用户ID: ${id}, 目标角色: ${body.role}`, 'user', id);
    return result;
  }

  @Put('users/:id/permissions')
  @Roles('admin')
  async updateAdminPermissions(@Param('id', ParseIntPipe) id: number, @Body() body: { permissions?: string[] }, @Req() req) {
    const result = await this.adminService.updateAdminPermissions(id, body.permissions, req.user.id, req.user.is_super_admin === true);
    await this.adminService.log(req.user.id, '更新管理员权限', `用户ID: ${id}, 权限: ${body.permissions?.join(',') || '无'}`, 'user', id);
    return result;
  }

  // ── Server Management ──
  @Post('server/restart')
  @Roles('admin')
  async restartServer(@Req() req) {
    const result = await this.adminService.restartServer(req.user.is_super_admin === true);
    await this.adminService.log(req.user.id, '重启服务器', 'PM2 restart ai-anime-backend', 'server');
    return result;
  }

  @Get('server/logs')
  @Roles('admin')
  getServerLogs(@Query('lines') lines: number, @Req() req) {
    return this.adminService.getServerLogs(lines || 100, req.user.is_super_admin === true);
  }

  @Get('server/status')
  @Roles('admin')
  getServerStatus(@Req() req) {
    return this.adminService.getServerStatus(req.user.is_super_admin === true);
  }

  @Post('server/cleanup')
  @Roles('admin')
  async cleanupServer(@Body() body: { type: string }, @Req() req) {
    const result = await this.adminService.cleanupServer(body.type, req.user.is_super_admin === true);
    await this.adminService.log(req.user.id, '清理服务器文件', `类型: ${body.type}, 清理: ${result.cleaned || 0} 个文件`, 'server');
    return result;
  }

  // ── Database Console ──
  @Post('db/query')
  @Roles('admin')
  async executeQuery(@Body() body: { sql: string }, @Req() req) {
    const result = await this.adminService.executeQuery(body.sql, req.user.is_super_admin === true);
    const masked = body.sql.replace(/password\s*=\s*'[^']*'/gi, "password='***'").substring(0, 200);
    await this.adminService.log(req.user.id, '执行数据库查询', `SQL: ${masked}, 返回: ${result.count} 行`, 'database');
    return result;
  }

  @Get('db/tables')
  @Roles('admin')
  getDbTables(@Req() req) {
    return this.adminService.getDbTables(req.user.is_super_admin === true);
  }

  // ── Current Admin Info ──
  @Get('whoami')
  @Roles('admin')
  getMyInfo(@Req() req) {
    return {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      is_super_admin: req.user.is_super_admin === true,
      admin_permissions: req.user.admin_permissions || null,
    };
  }
}
