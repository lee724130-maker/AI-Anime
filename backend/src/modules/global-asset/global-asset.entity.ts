import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('global_assets')
export class GlobalAsset {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 20 })
  type: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  prompt: string;

  @Column({ name: 'prompt_cn', type: 'text', nullable: true })
  prompt_cn: string;

  @Column({ name: 'image_url', length: 500, nullable: true })
  image_url: string;

  @Column({ type: 'text', nullable: true })
  candidates: string;

  @Column({ length: 20, default: 'pending' })
  status: string;

  @Column({ type: 'text', nullable: true })
  tags: string;

  @Column({ name: 'source_type', length: 20, default: 'manual' })
  source_type: string;

  @Column({ name: 'source_project_id', nullable: true })
  source_project_id: number;

  @Column({ name: 'usage_count', default: 0 })
  usage_count: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
