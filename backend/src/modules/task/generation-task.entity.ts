import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('generation_tasks')
export class GenerationTask {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  user_id: number;

  @Column({ name: 'project_id', nullable: true })
  project_id: number;

  @Column({ length: 30 })
  type: string;

  @Column({ length: 20, default: 'pending' })
  status: string;

  @Column({ default: 0 })
  progress: number;

  @Column({ length: 20, nullable: true })
  source: string;

  @Column({ name: 'source_task_id', nullable: true })
  source_task_id: number;

  @Column({ default: 0 })
  priority: number;

  @Column({ name: 'model_name', length: 100, nullable: true })
  model_name: string;

  @Column({ type: 'text', nullable: true })
  input_data: string;

  @Column({ type: 'text', nullable: true })
  output_data: string;

  @Column({ name: 'error_msg', type: 'text', nullable: true })
  error_msg: string;

  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  started_at: Date;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completed_at: Date;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
