import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlipaySdk } from 'alipay-sdk';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private alipaySdk: AlipaySdk | null = null;

  constructor(private readonly config: ConfigService) {
    const appId = this.config.get('ALIPAY_APP_ID');
    const privateKey = this.config.get('ALIPAY_PRIVATE_KEY');
    const alipayPublicKey = this.config.get('ALIPAY_PUBLIC_KEY');
    const gateway = this.config.get('ALIPAY_GATEWAY');
    if (appId && privateKey && alipayPublicKey) {
      this.alipaySdk = new AlipaySdk({
        appId,
        privateKey,
        alipayPublicKey,
        gateway: gateway || 'https://openapi.alipay.com/gateway.do',
        signType: 'RSA2',
      });
      this.logger.log('支付宝 SDK 初始化成功');
    } else {
      this.logger.warn('支付宝 SDK 未配置（缺少 ALIPAY_APP_ID/PRIVATE_KEY/PUBLIC_KEY）');
    }
  }

  isConfigured(): boolean {
    return this.alipaySdk !== null;
  }

  createPagePayUrl(orderNo: string, amount: number | string, subject: string): string {
    if (!this.alipaySdk) throw new Error('支付宝 SDK 未配置');
    const notifyUrl = this.config.get('ALIPAY_NOTIFY_URL') || '';
    const returnUrl = this.config.get('ALIPAY_RETURN_URL');
    const params: any = {
      bizContent: {
        outTradeNo: orderNo,
        totalAmount: Number(amount).toFixed(2),
        subject,
        productCode: 'FAST_INSTANT_TRADE_PAY',
      },
      notifyUrl,
    };
    if (returnUrl) {
      params.returnUrl = returnUrl;
    }
    const payUrl = this.alipaySdk.pageExecute('alipay.trade.page.pay', 'GET', params);
    this.logger.log(`电脑网站支付: orderNo=${orderNo}, amount=${amount}`);
    return payUrl;
  }

  verifyAlipayNotify(body: any):
    | { verified: false }
    | { verified: true; orderNo: string; tradeNo: string; totalAmount?: number; tradeStatus?: string; appId?: string } {
    if (!this.alipaySdk) {
      return { verified: false };
    }
    const verified = this.alipaySdk.checkNotifySignV2(body);
    if (!verified) {
      this.logger.error('支付宝回调验签失败');
      return { verified: false };
    }
    const myAppId = this.config.get('ALIPAY_APP_ID');
    if (body.app_id !== myAppId) {
      this.logger.error(`支付宝回调 app_id 不匹配: ${body.app_id} !== ${myAppId}`);
      return { verified: false };
    }
    return {
      verified: true,
      orderNo: body.out_trade_no,
      tradeNo: body.trade_no,
      totalAmount: body.total_amount ? parseFloat(body.total_amount) : undefined,
      tradeStatus: body.trade_status,
      appId: body.app_id,
    };
  }

  async queryTradeStatus(orderNo: string, expectedAmount?: number): Promise<{ paid: boolean; tradeNo?: string }> {
    if (!this.alipaySdk) return { paid: false };
    try {
      const result: any = await this.alipaySdk.exec('alipay.trade.query', {
        bizContent: { outTradeNo: orderNo },
      });
      if (result.code === '10000' && ['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(result.tradeStatus)) {
        if (expectedAmount !== undefined) {
          const paidAmount = parseFloat(result.totalAmount);
          if (Math.abs(paidAmount - expectedAmount) > 0.01) {
            this.logger.error(`支付宝金额不匹配: 订单=${expectedAmount}, 实际=${paidAmount}, orderNo=${orderNo}`);
            return { paid: false };
          }
        }
        return { paid: true, tradeNo: result.tradeNo };
      }
      return { paid: false };
    } catch (err: any) {
      this.logger.error(`支付宝交易查询失败: ${err.message}`);
      return { paid: false };
    }
  }
}
