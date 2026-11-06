import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * 漫画工作室项目（2026-11-06，见 docs/漫画工作室-生图流程编排-2026-11-06.md §3）。
 * 分格脚本整体存 panel_spec JSON：页数是 8~24 的小集合，需要整包编辑/人审/导出，
 * 不需要拆成多张表。文字层（nar/bubs/ch）只给剪辑应用排版层，不进生图提示词。
 */
@Entity('comic_projects')
export class ComicProject {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  user_id: number;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  outline: string;

  /** live_action（真人，默认先测） / anime（动漫） */
  @Column({ name: 'style_mode', length: 20, default: 'live_action' })
  style_mode: string;

  @Column({ name: 'character_id', type: 'int', nullable: true })
  character_id: number | null;

  /** 角色参考图（按 style_mode 从 characters 双风格字段或素材库取） */
  @Column({ name: 'character_ref', length: 500, nullable: true })
  character_ref: string;

  /** 角色卡全文：全片逐字复用，一次写定 */
  @Column({ name: 'character_card', type: 'text', nullable: true })
  character_card: string;

  @Column({ name: 'costume_ref', length: 500, nullable: true })
  costume_ref: string;

  /** 服装卡全文：逐件描述，跨格最容易漂移 */
  @Column({ name: 'costume_card', type: 'text', nullable: true })
  costume_card: string;

  @Column({ name: 'style_block', type: 'text', nullable: true })
  style_block: string;

  @Column({ name: 'scene_anchor', type: 'text', nullable: true })
  scene_anchor: string;

  @Column({ length: 50, default: 'agnes-image-2.5-flash' })
  model: string;

  @Column({ name: 'image_size', length: 10, default: '1K' })
  image_size: string;

  @Column({ length: 10, default: '2:3' })
  ratio: string;

  @Column({ name: 'page_count', default: 16 })
  page_count: number;

  /** JSON: { version, panels: [...] } —— 唯一真相源 */
  @Column({ name: 'panel_spec', type: 'text', nullable: true })
  panel_spec: string;

  /** V2：模型从大纲识别出的全部人物（含人设、设定本块任务、sheet_url、locked） */
  @Column({ type: 'text', nullable: true })
  characters: string;

  /** V2 三阶段门控状态：draft → review → confirmed / locked */
  @Column({ name: 'outline_status', length: 20, default: 'draft' })
  outline_status: string;

  @Column({ name: 'characters_status', length: 20, default: 'draft' })
  characters_status: string;

  @Column({ name: 'sheet_status', length: 20, default: 'draft' })
  sheet_status: string;

  /** blocks = 分块生成 + 后端拼版（推荐）；single = 一次出整张 */
  @Column({ name: 'sheet_mode', length: 20, default: 'blocks' })
  sheet_mode: string;

  /** draft → script_review → generating → completed */
  @Column({ length: 20, default: 'draft' })
  status: string;

  @Column({ name: 'total_credits', default: 0 })
  total_credits: number;

  @Column({ name: 'export_url', length: 500, nullable: true })
  export_url: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
