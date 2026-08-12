import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('drama_segment_candidates')
export class DramaSegmentCandidate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'segment_id' })
  segment_id: number;

  /** 候选序号（0 起） */
  @Column({ name: 'candidate_index', default: 0 })
  candidate_index: number;

  @Column({ name: 'video_url', length: 500, nullable: true })
  video_url: string;

  /** pending / completed / failed */
  @Column({ length: 20, default: 'pending' })
  status: string;

  /** 质检结果：pass / flag / unknown（unknown=质检模型不可用） */
  @Column({ length: 20, nullable: true })
  quality: string;

  /** 质检详情（JSON：issues 缺陷列表 / consistency 一致性结论） */
  @Column({ name: 'quality_report', type: 'text', nullable: true })
  quality_report: string;

  /** 用户采纳标记 */
  @Column({ name: 'is_accepted', default: false })
  is_accepted: boolean;

  @Column({ name: 'error_msg', type: 'text', nullable: true })
  error_msg: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
