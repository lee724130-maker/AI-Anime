import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * 孤儿清扫按 (status, heartbeat_at) 查，索引名与迁移
 * `1793261717251-AddGenerationTaskHeartbeat` 保持一致——实体声明 + 迁移建索引两边对齐，
 * 否则开着 synchronize 的环境会把这个它不认识的索引当多余对象处理。
 */
@Index('IDX_gen_task_heartbeat', ['status', 'heartbeat_at'])
@Entity('generation_tasks')
export class GenerationTask {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  user_id: number;

  @Column({ name: 'project_id', nullable: true })
  project_id: number;

  @Column({ length: 30 })
  type: string;

  @Column({ length: 20, default: 'pending' })
  status: string;

  @Column({ default: 0 })
  progress: number;

  @Column({ length: 20, nullable: true })
  source: string;

  @Column({ name: 'source_task_id', nullable: true })
  source_task_id: number;

  @Column({ default: 0 })
  priority: number;

  @Column({ name: 'model_name', length: 100, nullable: true })
  model_name: string;

  @Column({ type: 'text', nullable: true })
  input_data: string;

  @Column({ type: 'text', nullable: true })
  output_data: string;

  @Column({ name: 'error_msg', type: 'text', nullable: true })
  error_msg: string;

  @Column({ name: 'credit_cost', type: 'int', default: 0 })
  credit_cost: number;

  @Column({ name: 'credits_charged', type: 'boolean', default: false })
  credits_charged: boolean;

  /** C：视频完成后文生图自动生成的封面（/static/cover_*.jpg；null = 未生成/失败，走占位） */
  @Column({ name: 'cover_url', type: 'varchar', length: 500, nullable: true })
  cover_url: string | null;

  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  started_at: Date;

  /**
   * 执行体心跳：/generate 走进程内队列（非 Bull），执行期间由 GenerateService 每 20s 刷新。
   * 用途 = 区分「还在真跑」和「进程已重启/崩溃留下的孤儿行」，供启动自愈与超时清扫判定。
   * null = 老数据或不经进程内队列写入的行（清扫时按 created_at 兜底判定）。
   */
  @Column({ name: 'heartbeat_at', type: 'datetime', nullable: true })
  heartbeat_at: Date | null;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completed_at: Date;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
