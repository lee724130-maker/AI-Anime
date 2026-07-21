import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../user/user.entity';

@Entity('admin_logs')
export class AdminLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'admin_id' })
  admin_id: number;

  @Column({ length: 50 })
  action: string;

  @Column({ type: 'text', nullable: true })
  detail: string;

  @Column({ name: 'target_type', length: 50, nullable: true })
  target_type: string;

  @Column({ name: 'target_id', nullable: true })
  target_id: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
