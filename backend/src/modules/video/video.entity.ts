import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../user/user.entity';
import { Script } from '../script/script.entity';

@Entity('video_tasks')
export class VideoTask {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  user_id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'script_id', nullable: true })
  script_id: number;

  @ManyToOne(() => Script, { nullable: true })
  @JoinColumn({ name: 'script_id' })
  script: Script;

  @Column({ name: 'task_id', length: 100, unique: true, nullable: true })
  task_id: string;

  @Column({ default: 'pending' })
  status: string;

  @Column({ name: 'video_url', length: 500, nullable: true })
  video_url: string;

  @Column({ name: 'cover_url', length: 500, nullable: true })
  cover_url: string;

  @Column({ name: 'error_msg', type: 'text', nullable: true })
  error_msg: string;

  @Column({ name: 'retry_count', default: 0 })
  retry_count: number;

  @Column({ default: '720p' })
  resolution: string;

  @Column({ default: 5 })
  duration: number;

  @Column({ name: 'credit_cost', default: 10 })
  credit_cost: number;

  @Column({ default: 0 })
  progress: number;

  @Column({ name: 'credits_charged', default: false })
  credits_charged: boolean;

  @Column({ default: 'anime' })
  style: string;

  @Column({ name: 'model_name', length: 100, nullable: true })
  model_name: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completed_at: Date;
}
