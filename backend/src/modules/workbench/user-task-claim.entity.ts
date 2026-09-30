import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * A：新手任务清单领取记录（user_id + task_key 唯一，防重复领取）。
 * 任务进度本身不落库（实时从现有数据判定：首次生成/首个短剧/首次画布…），
 * 只有「领取」动作写本表。
 */
@Entity('user_task_claims')
@Index(['user_id', 'task_key'], { unique: true })
export class UserTaskClaim {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int' })
  user_id: number;

  /** 首版任务 key 白名单：first_generate / first_drama / first_canvas / first_viral / first_editor / first_asset */
  @Column({ name: 'task_key', type: 'varchar', length: 40 })
  task_key: string;

  @Column({ type: 'int', default: 0 })
  reward: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
