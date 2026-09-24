import { BadRequestException, Injectable, NotFoundException, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order } from './order.entity';
import { User } from '../user/user.entity';
import { SystemConfig } from '../admin/admin.entity';

export const DEFAULT_CREDIT_PLANS = [
  { key: 'starter', name: '体验版', amount: 19.9, credits: 200, badge: '适合试用' },
  { key: 'creator', name: '创作者版', amount: 59.9, credits: 700, badge: '推荐' },
  { key: 'studio', name: '工作室版', amount: 199.0, credits: 2500, badge: '批量生产' },
];

@Injectable()
export class OrderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderService.name);
  private expireTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(SystemConfig)
    private readonly configRepo: Repository<SystemConfig>,
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit() {
    // 每分钟清理超过 15 分钟未支付的 pending 订单（与生产一致）
    this.expireTimer = setInterval(async () => {
      try {
        const count = await this.cancelExpiredOrders();
        if (count > 0) this.logger.log(`已取消 ${count} 个超时订单`);
      } catch (err: any) {
        this.logger.error(`超时订单清理失败: ${err.message}`);
      }
    }, 60_000);
    this.logger.log('订单超时清理任务已启动（每分钟，超时 15 分钟）');
  }

  onModuleDestroy() {
    if (this.expireTimer) clearInterval(this.expireTimer);
  }

  private async getPlansFromDb() {
    const record = await this.configRepo.findOne({ where: { config_key: 'credit_plans' } });
    if (record?.config_value) {
      try { return JSON.parse(record.config_value); }
      catch { this.logger.warn('credit_plans JSON 解析失败，使用默认套餐'); }
    }
    return null;
  }

  async getPlans() {
    return (await this.getPlansFromDb()) || DEFAULT_CREDIT_PLANS;
  }

  async create(userId: number, planKey: string, provider = 'manual') {
    const plans = await this.getPlans();
    const plan = plans.find((item: any) => item.key === planKey);
    if (!plan) throw new BadRequestException('充值套餐不存在');

    const now = new Date();
    const mmdd = String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
    let orderNo = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
      orderNo = `AI-${mmdd}${rand}`;
      const exists = await this.orderRepo.findOne({ where: { order_no: orderNo }, withDeleted: true });
      if (!exists) break;
      if (attempt === 9) throw new BadRequestException('订单号生成失败，请重试');
    }
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
    // 模拟支付仅限本地开发使用；任何环境默认禁用（防止白嫖积分）。
    // 双保险：① NODE_ENV=production 直接拒；② system_configs.mock_pay_enabled 必须显式 ='1'
    // 才放行（生产库永远不需要该键；本地开发在库里开启后可用）。
    const cfg = await this.configRepo.findOne({ where: { config_key: 'mock_pay_enabled' } });
    const mockEnabled = cfg?.config_value === '1';
    if (process.env.NODE_ENV === 'production' || !mockEnabled) {
      throw new BadRequestException('支付功能尚未开通，敬请期待');
    }
    const order = await this.orderRepo.findOne({ where: { id: orderId, user_id: userId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status === 'paid') return order;
    if (order.status !== 'pending') throw new BadRequestException('订单状态不可支付');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 与生产一致：原子 UPDATE 抢占 pending → 订单入账 + 积分原子累加
      const result = await queryRunner.manager.createQueryBuilder()
        .update(Order)
        .set({ status: 'paid', paid_at: new Date() })
        .where('id = :id AND status = :status', { id: orderId, status: 'pending' })
        .execute();
      if (!result.affected) {
        await queryRunner.rollbackTransaction();
        return this.orderRepo.findOne({ where: { id: orderId } });
      }
      await queryRunner.manager.query('UPDATE users SET credits = credits + ? WHERE id = ?', [order.credits, userId]);
      await queryRunner.commitTransaction();
      return this.orderRepo.findOne({ where: { id: orderId } });
    } catch (err) {
      try { await queryRunner.rollbackTransaction(); } catch {}
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async cancel(userId: number, orderId: number) {
    const order = await this.orderRepo.findOne({ where: { id: orderId, user_id: userId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status !== 'pending') throw new BadRequestException('只有待支付订单可以取消');

    order.status = 'cancelled';
    return this.orderRepo.save(order);
  }

  async getOrderById(userId: number, orderId: number) {
    const order = await this.orderRepo.findOne({ where: { id: orderId, user_id: userId } });
    if (!order) throw new NotFoundException('订单不存在');
    return order;
  }

  async getOrderByNo(orderNo: string) {
    return this.orderRepo.findOne({ where: { order_no: orderNo } });
  }

  /** 支付到账入账：原子抢占 pending + 事务内累加积分（支付宝回调/主动查询共用） */
  async markPaid(orderId: number, transactionId?: string) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status === 'paid') return order;
    if (order.status !== 'pending') throw new BadRequestException('订单状态不可支付');
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const result = await queryRunner.manager.createQueryBuilder()
        .update(Order)
        .set({
          status: 'paid',
          paid_at: new Date(),
          ...(transactionId ? { transaction_id: transactionId } : {}),
        })
        .where('id = :id AND status = :status', { id: orderId, status: 'pending' })
        .execute();
      if (!result.affected) {
        await queryRunner.rollbackTransaction();
        const reloaded = await this.orderRepo.findOne({ where: { id: orderId } });
        return reloaded;
      }
      await queryRunner.manager.createQueryBuilder()
        .update(User)
        .set({ credits: () => `credits + ${order.credits}` })
        .where('id = :id', { id: order.user_id })
        .execute();
      await queryRunner.commitTransaction();
      return this.orderRepo.findOne({ where: { id: orderId } });
    } catch (err) {
      try {
        await queryRunner.rollbackTransaction();
      } catch {}
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /** 取消创建超过 15 分钟仍未支付的 pending 订单（onModuleInit 定时调用） */
  async cancelExpiredOrders(): Promise<number> {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);
    const result = await this.orderRepo
      .createQueryBuilder()
      .update(Order)
      .set({ status: 'cancelled' })
      .where('status = :status', { status: 'pending' })
      .andWhere('created_at < :cutoff', { cutoff })
      .execute();
    return result.affected || 0;
  }
}
