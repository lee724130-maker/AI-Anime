import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SecurityService } from './security.service';

@Controller('api/admin/access')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SecurityController {
  constructor(private readonly securityService: SecurityService) {}

  @Get('summary')
  @Roles('admin')
  getSummary() {
    return this.securityService.getSummary();
  }

  @Post('ban')
  @Roles('admin')
  ban(@Body('ip') ip: string) {
    return this.securityService.ban(ip);
  }

  @Post('unban')
  @Roles('admin')
  unban(@Body('ip') ip: string) {
    return this.securityService.unban(ip);
  }
}
