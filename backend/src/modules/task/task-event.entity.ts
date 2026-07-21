import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('task_events')
export class TaskEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'task_id' })
  task_id: number;

  @Column({ name: 'from_status', length: 20, nullable: true })
  from_status: string;

  @Column({ name: 'to_status', length: 20 })
  to_status: string;

  @Column({ type: 'text', nullable: true })
  message: string;

  @Column({ type: 'text', nullable: true })
  metadata: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
