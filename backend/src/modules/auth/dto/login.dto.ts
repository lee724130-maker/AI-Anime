import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  username: string;

  @IsString()
  password: string;

  /**
   * 前台站点登录跳过超级管理员邮箱二次验证（仅用户名+密码即可登录）。
   * 管理后台登录不传该字段，保持与生产一致的 2FA 流程。
   */
  @IsOptional()
  @IsBoolean()
  skipVerification?: boolean;
}
