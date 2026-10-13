import { BadRequestException, Controller, Post, Body, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ContactService } from './contact.service';
import { CreateContactDto } from './dto/create-contact.dto';

@Controller('api/contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async submit(@Body() body: CreateContactDto) {
    // L2：校验交给 class-validator DTO（长度上限 + 白名单 + 400 语义），
    // 不再用 throw Error（会被全局异常过滤器当 500）
    if (!body.name?.trim()) throw new BadRequestException('请填写称呼');
    if (!body.contact?.trim()) throw new BadRequestException('请填写联系方式');
    if (!body.description?.trim()) throw new BadRequestException('请填写需求描述');
    const typeMap: Record<string, string> = { phone: '手机号', wechat: '微信号', email: '邮箱' };
    const typeName = typeMap[body.contactType || 'phone'] || '联系方式';
    await this.contactService.sendContactEmail({
      name: body.name.trim(),
      contact: `${typeName}：${body.contact.trim()}`,
      description: body.description.trim(),
    });
    return { message: '提交成功，我们会尽快与您联系' };
  }
}
