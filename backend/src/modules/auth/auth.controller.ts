import { Controller, Post, Body, HttpCode, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SendCodeDto } from './dto/send-code.dto';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
}
