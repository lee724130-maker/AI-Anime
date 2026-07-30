import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../user/user.entity';

@Entity('viral_templates')
export class ViralTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 50, default: 'general' })
  category: string;

  @Column({ type: 'text', nullable: true })
  tags: string;

  @Column({ name: 'thumbnail', length: 500, nullable: true })
  thumbnail: string;

  @Column({ name: 'reference_url', length: 500, nullable: true })
  reference_url: string;

  @Column({ name: 'reference_frames', type: 'text', nullable: true })
  reference_frames: string;

  @Column({ type: 'text' })
  scenes: string;

  @Column({ type: 'text' })
  variables: string;

  @Column({ type: 'text', nullable: true })
  audio: string;

  @Column({ name: 'usage_count', default: 0 })
  usage_count: number;

  @Column({ name: 'is_system', default: false })
  is_system: boolean;

  @Column({ name: 'user_id', nullable: true })
  user_id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'source_url', length: 500, nullable: true })
  source_url: string;

  @Column({ length: 20, default: 'active' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
