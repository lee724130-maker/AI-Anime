import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * generation_tasks 增加 heartbeat_at（2026-10-29 P0：/generate 孤儿任务自愈依赖此列）。
 *
 * 为什么单独一条迁移、不并进 baseline：
 * baseline 用的是 CREATE TABLE IF NOT EXISTS，对**已经存在**的老库（生产、本地 ai_anime）
 * 是 no-op，老表不会因为实体加了列就被它补上。生产把 DB_SYNCHRONIZE 设成 0 之后，
 * 补列只能靠这条 ALTER——没有它，TypeORM 一 SELECT heartbeat_at 就报 Unknown column，全站崩。
 *
 * 幂等：先查 information_schema，列已存在就跳过（本地如果还开着 synchronize，可能已经自动加过）。
 */
export class AddGenerationTaskHeartbeat1793261717251 implements MigrationInterface {
  name = 'AddGenerationTaskHeartbeat1793261717251';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 迁移只服务 MySQL；本地 sqlite 仍走 synchronize，information_schema 那套查询在它上面会直接报错
    if (queryRunner.connection.options.type !== 'mysql') return;

    const db: any[] = await queryRunner.query(`SELECT DATABASE() AS name`);
    const schema = db?.[0]?.name;
    const exists: any[] = await queryRunner.query(
      `SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'generation_tasks' AND COLUMN_NAME = 'heartbeat_at' LIMIT 1`,
      [schema],
    );
    if (exists && exists.length > 0) return;

    await queryRunner.query(
      `ALTER TABLE \`generation_tasks\` ADD COLUMN \`heartbeat_at\` datetime NULL`,
    );
    // 清扫任务按 (status, heartbeat_at) 找孤儿，补个复合索引，别让它长成全表扫
    try {
      await queryRunner.query(
        `CREATE INDEX \`IDX_gen_task_heartbeat\` ON \`generation_tasks\` (\`status\`, \`heartbeat_at\`)`,
      );
    } catch (err: any) {
      // 只放行「索引已存在」，其余错误照抛（避免把真问题静掉）
      if (!['ER_DUP_KEYNAME', 'ER_DUP_INDEX', 'ER_DUP_INDEXNAME'].includes(err?.code)) throw err;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`generation_tasks\` DROP COLUMN \`heartbeat_at\``,
    );
  }
}
