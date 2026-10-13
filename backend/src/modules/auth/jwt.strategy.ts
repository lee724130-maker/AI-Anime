import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    // H3：构造期（DI，晚于 ConfigModule 的 dotenv 加载）读取，缺失即拒绝启动
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET 未配置，无法启动 JWT 校验');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: number }) {
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || user.status !== 1) return null;
    return user;
  }
}
