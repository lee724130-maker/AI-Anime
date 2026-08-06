import { IsEmail } from 'class-validator';

export class SendCodeDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string;
}
