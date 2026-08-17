import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../user/user.entity';

@Entity('editor_projects')
export class EditorProject {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  user_id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 10, default: '9:16' })
  ratio: string;

  @Column({ length: 10, default: '720p' })
  resolution: string;

  @Column({ type: 'text' })
  timeline: string;

  @Column({ length: 20, default: 'pending' })
  status: string;

  @Column({ default: 0 })
  progress: number;

  @Column({ name: 'result_url', type: 'varchar', length: 500, nullable: true })
  result_url: string | null;

  @Column({ name: 'error_msg', type: 'text', nullable: true })
  error_msg: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}