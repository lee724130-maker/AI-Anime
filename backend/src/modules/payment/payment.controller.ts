import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  Res,
  UseGuards,
  ParseIntPipe,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { PaymentService } from './payment.service';
import { OrderService } from '../order/order.service';

@Controller('api/payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly orderService: OrderService,
  ) {}

  @Post('create')
  @UseGuards(JwtAuthGuard)
  async create(@Body() body: { plan: string }, @Req() req) {
    const order = await this.orderService.create(req.user.id, body.plan, 'alipay');
    const payUrl = this.paymentService.createPagePayUrl(order.order_no, order.amount, 'AI Anime');
    return {
      orderId: order.id,
      orderNo: order.order_no,
      payUrl,
      amount: order.amount,
      credits: order.credits,
    };
  }

  @Get('status/:orderId')
  @UseGuards(JwtAuthGuard)
  async status(@Param('orderId', ParseIntPipe) orderId: number, @Req() req) {
    const order = await this.orderService.getOrderById(req.user.id, orderId);
    if (order.status === 'pending' && order.payment_provider === 'alipay' && this.paymentService.isConfigured()) {
      const result = await this.paymentService.queryTradeStatus(order.order_no, Number(order.amount));
      if (result.paid) {
        await this.orderService.markPaid(order.id, result.tradeNo);
        order.status = 'paid';
        if (result.tradeNo) order.transaction_id = result.tradeNo;
      }
    }
    return {
      orderId: order.id,
      status: order.status,
      paidAt: order.paid_at,
      credits: order.credits,
    };
  }

  @Get('payUrl/:orderId')
  @UseGuards(JwtAuthGuard)
  async getPayUrl(@Param('orderId', ParseIntPipe) orderId: number, @Req() req) {
    const order = await this.orderService.getOrderById(req.user.id, orderId);
    if (order.status !== 'pending') {
      return { payUrl: null, message: '订单状态不可支付' };
    }
    const payUrl = this.paymentService.createPagePayUrl(order.order_no, order.amount, 'AI Anime');
    return { payUrl };
  }

  @Post('alipay/notify')
  @Public()
  async alipayNotify(@Body() body: any, @Res() res) {
    this.logger.log(`收到支付宝回调: out_trade_no=${body.out_trade_no}, trade_status=${body.trade_status}`);
    try {
      const result = this.paymentService.verifyAlipayNotify(body);
      if (!result.verified) {
        this.logger.error('支付宝回调验签失败，拒绝处理');
        return res.type('text').send('fail');
      }
      const order = await this.orderService.getOrderByNo(result.orderNo);
      if (!order) {
        this.logger.error(`支付宝回调：订单不存在 ${result.orderNo}`);
        return res.type('text').send('fail');
      }
      if (result.totalAmount === undefined || Math.abs(Number(order.amount) - result.totalAmount) > 0.01) {
        this.logger.error(`支付宝回调：金额不匹配 order=${order.amount} (type=${typeof order.amount}) paid=${result.totalAmount}`);
        return res.type('text').send('fail');
      }
      if (result.tradeStatus === 'TRADE_SUCCESS' || result.tradeStatus === 'TRADE_FINISHED') {
        await this.orderService.markPaid(order.id, result.tradeNo);
        this.logger.log(`订单 ${order.order_no} 支付宝支付成功，积分已到账`);
      }
      return res.type('text').send('success');
    } catch (err: any) {
      this.logger.error(`支付宝回调处理异常: ${err.message}`);
      return res.type('text').send('fail');
    }
  }
}
