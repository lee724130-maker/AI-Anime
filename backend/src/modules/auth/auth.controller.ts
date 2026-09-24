import { Controller, Post, Body, HttpCode, Req, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SendCodeDto } from './dto/send-code.dto';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('send-code')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  sendCode(@Body() dto: SendCodeDto) {
    return this.authService.sendEmailCode(dto.email);
  }

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  register(@Body() dto: RegisterDto, @Req() req) {
    const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '').trim();
    return this.authService.register(dto, ip);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /** 超级管理员登录需二次验证：先校验登录返回的 tempToken，再发邮件验证码 */
  @Post('send-admin-code')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async sendAdminCode(@Body() body: { tempToken: string }) {
    let payload: any;
    try {
      payload = this.jwtService.verify(body.tempToken);
    } catch {
      throw new BadRequestException('无效的验证令牌或令牌已过期');
    }
    if (payload.type !== 'super_admin_verify') {
      throw new BadRequestException('无效的验证令牌');
    }
    return this.authService.sendSuperAdminVerifyCode(payload.sub);
  }

  @Post('verify-admin')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  verifyAdmin(@Body() body: { tempToken: string; code: string }) {
    return this.authService.verifySuperAdminCode(body.tempToken, body.code);
  }
}
