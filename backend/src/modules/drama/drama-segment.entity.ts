import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('drama_segments')
export class DramaSegment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'episode_id' })
  episode_id: number;

  @Column({ name: 'segment_no' })
  segment_no: number;

  @Column({ type: 'text', nullable: true })
  summary: string;

  @Column({ type: 'text', nullable: true })
  prompt: string;

  @Column({ name: 'prompt_cn', type: 'text', nullable: true })
  prompt_cn: string;

  @Column({ type: 'text', nullable: true })
  timeline: string;

  @Column({ type: 'text', nullable: true })
  character_refs: string;

  @Column({ type: 'text', nullable: true })
  prop_refs: string;

  @Column({ type: 'text', nullable: true })
  scene_refs: string;

  @Column({ nullable: true })
  duration: number;

  @Column({ length: 20, default: 'pending' })
  status: string;

  @Column({ name: 'video_url', length: 500, nullable: true })
  video_url: string;

  @Column({ name: 'progress_message', length: 200, nullable: true })
  progress_message: string;

  @Column({ name: 'progress_percent', nullable: true })
  progress_percent: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
