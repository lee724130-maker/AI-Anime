import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * A：活动栏（dashboard 中部限时活动 banner）。
 * status=online 且在 [starts_at, ends_at] 期内才对外展示；
 * gameplay 非空表示该活动带玩法（首版只有 newbie_tasks 新手任务清单），
 * 前端点「去参与」打开任务面板（GET /api/workbench/gameplay/tasks）。
 */
@Entity('activities')
export class Activity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  subtitle: string | null;

  /** null = 前端灰阶+青 CSS 占位（后续可用文生图回填，见 A.5 提示词） */
  @Column({ name: 'cover_url', type: 'varchar', length: 500, nullable: true })
  cover_url: string | null;

  /** 「去参与」跳转目标（站内路由如 /generate 或 /static/、http(s) 外链） */
  @Column({ name: 'link_url', type: 'varchar', length: 500, nullable: true })
  link_url: string | null;

  /** 按钮文案，缺省「去参与」 */
  @Column({ name: 'button_text', type: 'varchar', length: 20, nullable: true })
  button_text: string | null;

  /** banner（主大图）| card（副活动小卡） */
  @Column({ type: 'varchar', length: 20, default: 'banner' })
  kind: string;

  /** draft|online|offline —— 只有 online 对外展示 */
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: string;

  /** 越大越靠前 */
  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ name: 'starts_at', type: 'datetime', nullable: true })
  starts_at: Date | null;

  @Column({ name: 'ends_at', type: 'datetime', nullable: true })
  ends_at: Date | null;

  /** null = 纯展示跳转；'newbie_tasks' = 新手任务清单玩法 */
  @Column({ type: 'varchar', length: 32, nullable: true })
  gameplay: string | null;

  /** 玩法配置 JSON（newbie_tasks: {tasks:[{key,title,reward}]}） */
  @Column({ type: 'text', nullable: true })
  config: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
