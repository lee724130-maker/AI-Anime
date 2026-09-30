import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * A：新功能上新（dashboard 上新区 NEW 卡片）。
 * status=online 才对外展示；一~两周发一张卡，运营节奏由 admin 维护。
 */
@Entity('feature_releases')
export class FeatureRelease {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  summary: string | null;

  /** null = 前端灰阶+青 CSS 占位 */
  @Column({ name: 'cover_url', type: 'varchar', length: 500, nullable: true })
  cover_url: string | null;

  /** 「立即体验」跳转目标 */
  @Column({ name: 'link_url', type: 'varchar', length: 500, nullable: true })
  link_url: string | null;

  /** NEW|BETA|HOT 角标 */
  @Column({ type: 'varchar', length: 8, default: 'NEW' })
  tag: string;

  @Column({ type: 'int', default: 0 })
  priority: number;

  /** draft|online|offline —— 只有 online 对外展示 */
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: string;

  @Column({ name: 'released_at', type: 'datetime', nullable: true })
  released_at: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
