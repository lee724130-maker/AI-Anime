import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('drama_episodes')
export class DramaEpisode {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id' })
  project_id: number;

  @Column({ name: 'episode_no' })
  episode_no: number;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  summary: string;

  @Column({ nullable: true })
  duration: number;

  @Column({ name: 'video_url', length: 500, nullable: true })
  video_url: string;

  @Column({ name: 'stitch_status', length: 20, default: 'pending' })
  stitch_status: string;

  @Column({ name: 'style', length: 20, nullable: true })
  style: string;

  @Column({ name: 'ratio', length: 10, nullable: true })
  ratio: string;

  @Column({ name: 'resolution', length: 10, nullable: true })
  resolution: string;

  @Column({ name: 'audio_lang', length: 10, default: 'zh' })
  audio_lang: string;

  @Column({ name: 'stitch_progress_message', length: 200, nullable: true })
  stitch_progress_message: string;

  @Column({ name: 'stitch_progress_percent', nullable: true })
  stitch_progress_percent: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
