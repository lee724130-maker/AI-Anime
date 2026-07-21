import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('admin_notifications')
export class AdminNotification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 20 })
  type: string;

  @Column({ length: 100 })
  title: string;

  @Column({ type: 'text', nullable: true })
  message: string;

  @Column({ default: false })
  read: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
