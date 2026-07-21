import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('media_files')
export class MediaFile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  user_id: number;

  @Column({ name: 'project_id', nullable: true })
  project_id: number;

  @Column({ name: 'task_id', nullable: true })
  task_id: number;

  @Column({ length: 20 })
  type: string;

  @Column({ length: 500 })
  url: string;

  @Column({ name: 'thumbnail_url', length: 500, nullable: true })
  thumbnail_url: string;

  @Column({ name: 'original_name', length: 200 })
  original_name: string;

  @Column({ name: 'mime_type', length: 50, nullable: true })
  mime_type: string;

  @Column({ nullable: true })
  file_size: number;

  @Column({ nullable: true })
  width: number;

  @Column({ nullable: true })
  height: number;

  @Column({ nullable: true })
  duration: number;

  @Column({ type: 'text', nullable: true })
  tags: string;

  @Column({ type: 'text', nullable: true })
  metadata: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
