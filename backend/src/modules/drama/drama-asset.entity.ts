import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('drama_assets')
export class DramaAsset {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id' })
  project_id: number;

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

  @Column({ length: 20, default: 'pending' })
  status: string;

  @Column({ default: false })
  locked: boolean;

  @Column({ type: 'text', nullable: true })
  candidates: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
