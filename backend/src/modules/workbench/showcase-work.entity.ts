import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * B：优秀作品展（dashboard 底部策展位）。
 * 首版由管理员手工挑选站内作品录入；status=online 才对外展示。
 */
@Entity('showcase_works')
export class ShowcaseWork {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 120 })
  title: string;

  /** 分类 key（showcase_categories 字典：event/drama_series/short_video/ad 等） */
  @Column({ length: 40 })
  category: string;

  @Column({ name: 'video_url', type: 'varchar', length: 500 })
  video_url: string;

  /** null = 无封面走 tint 占位（C 自动封面产出后可回填） */
  @Column({ name: 'cover_url', type: 'varchar', length: 500, nullable: true })
  cover_url: string | null;

  @Column({ type: 'int', nullable: true })
  duration: number | null;

  @Column({ name: 'author_name', type: 'varchar', length: 50, nullable: true })
  author_name: string | null;

  /** drama|generate|viral|editor|upload */
  @Column({ name: 'source_type', length: 20, default: 'generate' })
  source_type: string;

  @Column({ name: 'source_id', type: 'int', nullable: true })
  source_id: number | null;

  @Column({ type: 'int', default: 0 })
  likes: number;

  @Column({ type: 'int', default: 0 })
  views: number;

  /** pending|online|offline —— 只有 online 对外展示 */
  @Column({ type: 'varchar', length: 20, default: 'online' })
  status: string;

  @Column({ type: 'int', default: 0 })
  sort: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
