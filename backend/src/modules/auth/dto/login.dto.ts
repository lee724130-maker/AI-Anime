import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  username: string;

  @IsString()
  password: string;

  /**
   * 仅限**非生产环境**的测试便利开关：跳过超级管理员邮箱二次验证。
   * 生产（NODE_ENV=production）一律忽略该字段——超管必须走 2FA，
   * 客户端无法再通过传 skipVerification 绕过（2026-10 漏洞修复）。
   */
  @IsOptional()
  @IsBoolean()
  skipVerification?: boolean;
}
