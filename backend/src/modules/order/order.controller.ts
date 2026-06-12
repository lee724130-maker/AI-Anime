import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrderService } from './order.service';

@Controller('api/order')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get('plans')
  plans() {
    return this.orderService.getPlans();
  }

  @Post('create')
  create(@Body() body: { plan: string; provider?: string }, @Req() req) {
    return this.orderService.create(req.user.id, body.plan, body.provider);
  }

  @Get('list')
  list(@Query('page') page: number, @Query('limit') limit: number, @Req() req) {
    return this.orderService.findByUser(req.user.id, page || 1, limit || 20);
  }

  @Post(':id/mock-pay')
  mockPay(@Param('id') id: number, @Req() req) {
    return this.orderService.mockPay(req.user.id, Number(id));
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: number, @Req() req) {
    return this.orderService.cancel(req.user.id, Number(id));
  }
}
