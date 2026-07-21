import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('drama_projects')
export class DramaProject {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  user_id: number;

  @Column({ length: 100 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  outline: string;

  @Column({ name: 'cover_url', length: 500, nullable: true })
  cover_url: string;

  @Column({ length: 20, default: 'draft' })
  status: string;

  @Column({ length: 20, nullable: true })
  genre: string;

  @Column({ default: 1 })
  episodes: number;

  @Column({ nullable: true })
  duration: number;

  @Column({ name: 'target_style', length: 20, nullable: true })
  target_style: string;

  @Column({ name: 'target_ratio', length: 10, nullable: true })
  target_ratio: string;

  @Column({ name: 'target_resolution', length: 10, nullable: true })
  target_resolution: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
