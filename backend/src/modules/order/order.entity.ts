import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../user/user.entity';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  user_id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'order_no', length: 80, unique: true })
  order_no: string;

  @Column({ length: 40 })
  plan: string;

  @Column({ name: 'plan_name', length: 80 })
  plan_name: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column()
  credits: number;

  @Column({ default: 'pending' })
  status: string;

  @Column({ name: 'payment_provider', length: 40, default: 'manual' })
  payment_provider: string;

  // 生产新代码字段（未推送到 git），保留数据用
  // 注：union 类型必须显式 type:'varchar'（TypeORM 反射 union 会报 DataTypeNotSupportedError），生产 JS 虽无 type 也保持一致行为
  @Column({ name: 'transaction_id', type: 'varchar', length: 80, nullable: true })
  transaction_id: string | null;

  @Column({ name: 'paid_at', type: 'datetime', nullable: true })
  paid_at: Date;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
