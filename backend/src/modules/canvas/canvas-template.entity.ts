import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../user/user.entity';

@Entity('canvas_templates')
export class CanvasTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  user_id: number | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 50, default: '通用' })
  category: string;

  @Column({ length: 10, default: '9:16' })
  ratio: string;

  @Column({ length: 10, default: '720p' })
  resolution: string;

  @Column({ type: 'text' })
  nodes: string;

  @Column({ type: 'text' })
  variables: string;

  @Column({ default: 0 })
  usage_count: number;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  is_system: boolean;

  @Column({ length: 20, default: 'active' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
