import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  async sendContactEmail(data: { name: string; contact: string; description: string }) {
    const host = process.env.SMTP_HOST || 'smtp.qq.com';
    const port = Number(process.env.SMTP_PORT || 465);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!user || !pass) {
      this.logger.warn('SMTP 未配置，跳过发送联系邮件');
      return;
    }
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: `"AI Anime 网站咨询" <${user}>`,
      to: user,
      subject: `【网站咨询】${data.name} - ${data.contact}`,
      text: `称呼：${data.name}\n联系方式：${data.contact}\n需求描述：${data.description}`,
      html: `<div style="font-family:sans-serif;padding:24px;max-width:500px;margin:0 auto;border:1px solid #eee;border-radius:12px">
  <h2 style="color:#7c3aed;margin:0 0 16px">AI Anime · 网站咨询</h2>
  <table style="width:100%;font-size:14px;color:#333;border-collapse:collapse">
    <tr><td style="padding:8px 0;color:#999;width:80px">称呼</td><td style="padding:8px 0">${data.name}</td></tr>
    <tr><td style="padding:8px 0;color:#999">联系方式</td><td style="padding:8px 0">${data.contact}</td></tr>
    <tr><td style="padding:8px 0;color:#999;vertical-align:top">需求描述</td><td style="padding:8px 0;white-space:pre-wrap">${data.description}</td></tr>
  </table>
  <p style="color:#999;font-size:12px;margin-top:16px;border-top:1px solid #eee;padding-top:12px">此邮件由 AI Anime 网站「联系我们」表单自动发送</p>
</div>`,
    });
    this.logger.log(`联系邮件已发送: ${data.name} (${data.contact})`);
  }
}
