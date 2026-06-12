import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './order.entity';
import { User } from '../user/user.entity';

export const CREDIT_PLANS = [
  { key: 'starter', name: '入门包', amount: 9.9, credits: 120, badge: '适合试用' },
  { key: 'creator', name: '创作者包', amount: 29.9, credits: 420, badge: '推荐' },
  { key: 'studio', name: '工作室包', amount: 99.0, credits: 1800, badge: '批量生产' },
];

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  getPlans() {
    return CREDIT_PLANS;
  }

  async create(userId: number, planKey: string, provider = 'manual') {
    const plan = CREDIT_PLANS.find((item) => item.key === planKey);
    if (!plan) throw new BadRequestException('充值套餐不存在');

    const orderNo = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const order = this.orderRepo.create({
      user_id: userId,
      order_no: orderNo,
      plan: plan.key,
      plan_name: plan.name,
      amount: plan.amount,
      credits: plan.credits,
      status: 'pending',
      payment_provider: provider,
    });
    return this.orderRepo.save(order);
  }

  async findByUser(userId: number, page = 1, limit = 20) {
    const [items, total] = await this.orderRepo.findAndCount({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async mockPay(userId: number, orderId: number) {
    const order = await this.orderRepo.findOne({ where: { id: orderId, user_id: userId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status === 'paid') return order;
    if (order.status !== 'pending') throw new BadRequestException('订单状态不可支付');

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');

    user.credits = (user.credits || 0) + order.credits;
    order.status = 'paid';
    order.paid_at = new Date();

    await this.userRepo.save(user);
    return this.orderRepo.save(order);
  }

  async cancel(userId: number, orderId: number) {
    const order = await this.orderRepo.findOne({ where: { id: orderId, user_id: userId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status !== 'pending') throw new BadRequestException('只有待支付订单可以取消');

    order.status = 'cancelled';
    return this.orderRepo.save(order);
  }
}
