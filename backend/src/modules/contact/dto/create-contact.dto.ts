import { IsIn, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

/**
 * L2：联系我们表单 DTO 校验（原为裸 interface + 手写校验，无 class-validator 白名单）。
 * 全局 ValidationPipe({ whitelist: true }) 会剥离未声明字段并按长度上限校验。
 */
export class CreateContactDto {
  @IsString()
  @IsNotEmpty({ message: '请填写称呼' })
  @Length(1, 50, { message: '称呼长度需在 1-50 字之间' })
  name!: string;

  @IsString()
  @IsNotEmpty({ message: '请填写联系方式' })
  @Length(1, 100, { message: '联系方式长度需在 1-100 字之间' })
  contact!: string;

  @IsOptional()
  @IsIn(['phone', 'wechat', 'email'], { message: '联系方式类型仅支持 phone/wechat/email' })
  contactType?: string;

  @IsString()
  @IsNotEmpty({ message: '请填写需求描述' })
  @Length(1, 2000, { message: '需求描述长度需在 1-2000 字之间' })
  description!: string;
}
