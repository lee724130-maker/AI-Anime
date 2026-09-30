/**
 * A：玩法公共常量（admin 校验 / workbench 进度判定共用，防两端白名单漂移）。
 * 进度全部实时从现有数据 COUNT 判定，不落进度表。
 */
export const GAMEPLAY_TYPES = ['newbie_tasks'] as const;

export interface TaskDetector {
  /** COUNT>0 即完成 */
  sql: string;
  title: string;
  defReward: number;
}

export const TASK_DETECTORS: Record<string, TaskDetector> = {
  first_generate: { sql: 'SELECT COUNT(*) c FROM generation_tasks WHERE user_id = ?', title: '完成首次 AI 生成', defReward: 50 },
  first_drama: { sql: 'SELECT COUNT(*) c FROM drama_projects WHERE user_id = ?', title: '创建首个短剧项目', defReward: 50 },
  first_canvas: { sql: 'SELECT COUNT(*) c FROM canvas_projects WHERE user_id = ?', title: '完成首次画布创作', defReward: 50 },
  first_viral: { sql: 'SELECT COUNT(*) c FROM viral_projects WHERE user_id = ?', title: '创建首个热门创作项目', defReward: 50 },
  first_editor: { sql: 'SELECT COUNT(*) c FROM editor_projects WHERE user_id = ?', title: '完成首次视频剪辑', defReward: 50 },
  first_asset: { sql: 'SELECT COUNT(*) c FROM global_assets WHERE user_id = ?', title: '上传首个素材到资产库', defReward: 30 },
};

/** 可选任务 key 列表（admin 前端下拉用：GET /api/admin/activities/task-keys 可后续再加，首版前端硬编码同步本表） */
export const TASK_KEYS = Object.keys(TASK_DETECTORS);
