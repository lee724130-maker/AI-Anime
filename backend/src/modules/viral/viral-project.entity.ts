import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../user/user.entity';
import { ViralTemplate } from './viral-template.entity';

@Entity('viral_projects')
export class ViralProject {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  user_id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'template_id' })
  template_id: number;

  @ManyToOne(() => ViralTemplate)
  @JoinColumn({ name: 'template_id' })
  template: ViralTemplate;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text' })
  variables: string;

  @Column({ type: 'text' })
  scenes: string;

  @Column({ length: 20, default: 'pending' })
  status: string;

  @Column({ default: 0 })
  progress: number;

  @Column({ name: 'result_url', length: 500, nullable: true })
  result_url: string;

  @Column({ name: 'error_msg', type: 'text', nullable: true })
  error_msg: string;

  @Column({ name: 'media_refs', type: 'text', nullable: true })
  media_refs: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
