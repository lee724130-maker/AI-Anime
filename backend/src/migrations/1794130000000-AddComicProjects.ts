import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 漫画工作室项目表（2026-11-06）。
 * 本地 DB_SYNCHRONIZE=1 会按实体自动建表；生产 DB_SYNCHRONIZE=0，靠本迁移建表。
 * 用 IF NOT EXISTS 保持幂等，避免误开 DB_MIGRATIONS_RUN 时把已有库打挂。
 */
export class AddComicProjects1794130000000 implements MigrationInterface {
  name = 'AddComicProjects1794130000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS comic_projects (
        id int NOT NULL AUTO_INCREMENT,
        user_id int NOT NULL,
        title varchar(200) NOT NULL,
        outline text NULL,
        style_mode varchar(20) NOT NULL DEFAULT 'live_action',
        character_id int NULL,
        character_ref varchar(500) NULL,
        character_card text NULL,
        costume_ref varchar(500) NULL,
        costume_card text NULL,
        style_block text NULL,
        scene_anchor text NULL,
        model varchar(50) NOT NULL DEFAULT 'agnes-image-2.5-flash',
        image_size varchar(10) NOT NULL DEFAULT '1K',
        ratio varchar(10) NOT NULL DEFAULT '2:3',
        page_count int NOT NULL DEFAULT 16,
        panel_spec text NULL,
        characters text NULL,
        outline_status varchar(20) NOT NULL DEFAULT 'draft',
        characters_status varchar(20) NOT NULL DEFAULT 'draft',
        sheet_status varchar(20) NOT NULL DEFAULT 'draft',
        sheet_mode varchar(20) NOT NULL DEFAULT 'blocks',
        status varchar(20) NOT NULL DEFAULT 'draft',
        total_credits int NOT NULL DEFAULT 0,
        export_url varchar(500) NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY idx_comic_projects_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // V2（2026-11-06）：老库若已按 V1 建过表，补加人物列表与阶段状态列。
    // MySQL 无 ADD COLUMN IF NOT EXISTS，只吞「字段已存在」，其余错误照常抛出。
    const v2Columns = [
      'ADD COLUMN characters text NULL',
      "ADD COLUMN outline_status varchar(20) NOT NULL DEFAULT 'draft'",
      "ADD COLUMN characters_status varchar(20) NOT NULL DEFAULT 'draft'",
      "ADD COLUMN sheet_status varchar(20) NOT NULL DEFAULT 'draft'",
      "ADD COLUMN sheet_mode varchar(20) NOT NULL DEFAULT 'blocks'",
    ];
    for (const col of v2Columns) {
      try {
        await qr.query(`ALTER TABLE comic_projects ${col}`);
      } catch (err: any) {
        if (err?.code === 'ER_DUP_FIELDNAME') continue;
        throw err;
      }
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE IF EXISTS comic_projects');
  }
}
