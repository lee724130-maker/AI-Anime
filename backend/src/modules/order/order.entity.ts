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

  @Column({ name: 'paid_at', type: 'datetime', nullable: true })
  paid_at: Date;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
