import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, EntityManager } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { DramaProject } from '../drama/drama-project.entity';
import { DramaEpisode } from '../drama/drama-episode.entity';
import { DramaSegment } from '../drama/drama-segment.entity';
import { DramaAsset } from '../drama/drama-asset.entity';
import { GlobalAsset } from '../global-asset/global-asset.entity';
import { GenerationTask } from '../task/generation-task.entity';
import { VideoTask } from '../video/video.entity';
import { ShowcaseWork } from './showcase-work.entity';
import { User } from '../user/user.entity';

const ERROR_MAP: Record<string, string> = {
  'timeout': '请求超时，AI 服务未及时响应',
  'ETIMEDOUT': '网络连接超时，请检查网络',
  'ECONNREFUSED': 'AI 服务连接被拒绝，请确认服务状态',
  'ECONNRESET': '网络连接被重置',
  'ENOTFOUND': 'DNS 解析失败，无法访问 AI 服务',
  'rate limit': '请求频率过高，请稍后重试',
  'RateLimitError': 'API 调用次数超限',
  'quota': 'API 配额不足',
  'insufficient': '余额不足',
  'balance': '账户余额不足',
  'authentication': 'API 密钥认证失败',
  'unauthorized': 'API 密钥未授权',
  'forbidden': 'API 访问被拒绝',
  'not found': '请求的资源不存在',
  'internal server error': 'AI 服务内部错误',
  'bad gateway': 'AI 服务网关错误',
  'service unavailable': 'AI 服务暂时不可用',
  'no face': '检测不到人脸，请更换图片',
  'content_filter': '内容被过滤，请调整提示词',
  'safety': '内容安全审核未通过',
  'invalid': '请求参数无效',
  'parse': 'AI 返回格式解析失败',
  'empty': 'AI 返回内容为空',
};

const PROJECT_NEXT_STEP: Record<string, string> = {
  draft: '完成剧本分析',
  outline_pending: '等待剧本分析',
  analysis_done: '生成角色和场景资产',
  generating: '生成视频片段',
  completed: '已全部完成',
  failed: '查看失败原因并重试',
};

/** 「我的作品」条目（按模块聚合该用户在各区块生成的视频） */
export interface WorkItem {
  id: string;            // `module:id`，前端 key
  module: string;        // generate | drama | viral | canvas | editor
  title: string;
  video_url: string | null;
  cover_url: string | null;
  status: string;
  time: Date | string;
  link: string;          // 无视频时点击跳转的模块页面
}

/** 模块字典（剪辑仅管理员可见 —— 与 AppShell 侧边栏一致） */
const WORK_MODULES: Record<string, { label: string; link: (id: string) => string }> = {
  generate: { label: 'AI 生成', link: () => '/generate/history' },
  drama:    { label: '短剧', link: (id) => `/drama/${id}` },
  viral:    { label: '热门创作', link: (id) => `/viral/projects/${id}` },
  canvas:   { label: '画布', link: (id) => `/canvas/editor/${id}` },
  editor:   { label: '剪辑', link: (id) => `/editor/${id}` },
};

function localizeError(msg: string | null | undefined): string {
  if (!msg) return '未知错误';
  const lower = msg.toLowerCase();
  for (const [key, chinese] of Object.entries(ERROR_MAP)) {
    if (lower.includes(key)) return chinese;
  }
  return msg.length > 100 ? msg.substring(0, 100) + '…' : msg;
}

@Injectable()
export class WorkbenchService {
  constructor(
    @InjectRepository(DramaProject)
    private readonly projectRepo: Repository<DramaProject>,
    @InjectRepository(DramaEpisode)
    private readonly episodeRepo: Repository<DramaEpisode>,
    @InjectRepository(DramaSegment)
    private readonly segmentRepo: Repository<DramaSegment>,
    @InjectRepository(DramaAsset)
    private readonly assetRepo: Repository<DramaAsset>,
    @InjectRepository(GlobalAsset)
    private readonly globalAssetRepo: Repository<GlobalAsset>,
    @InjectRepository(GenerationTask)
    private readonly genTaskRepo: Repository<GenerationTask>,
    @InjectRepository(VideoTask)
    private readonly videoTaskRepo: Repository<VideoTask>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(ShowcaseWork)
    private readonly showcaseRepo: Repository<ShowcaseWork>,
    private readonly entityManager: EntityManager,
  ) {}

  async getSummary(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    const projects = await this.projectRepo.find({
      where: { user_id: userId },
      order: { updated_at: 'DESC' },
    });

    const projectIds = projects.map(p => p.id);
    const episodes = projectIds.length
      ? await this.episodeRepo.find({ where: { project_id: In(projectIds) } })
      : [];
    const episodeIds = episodes.map(e => e.id);
    const segments = episodeIds.length
      ? await this.segmentRepo.find({ where: { episode_id: In(episodeIds) } })
      : [];

    const [assets, genTasks, videoTasks] = await Promise.all([
      this.assetRepo.find({ where: { project_id: In(projectIds.length ? projectIds : [0]) } }),
      this.genTaskRepo.find({ where: { user_id: userId }, order: { created_at: 'DESC' }, take: 50 }),
      this.videoTaskRepo.find({ where: { user_id: userId }, order: { created_at: 'DESC' }, take: 50 }),
    ]);

    const projectByStatus: Record<string, number> = {};
    for (const p of projects) {
      projectByStatus[p.status] = (projectByStatus[p.status] || 0) + 1;
    }

    const segmentByStatus: Record<string, number> = {};
    for (const s of segments) {
      segmentByStatus[s.status] = (segmentByStatus[s.status] || 0) + 1;
    }

    const assetByType: Record<string, number> = {};
    for (const a of assets) {
      assetByType[a.type] = (assetByType[a.type] || 0) + 1;
    }

    const allFailedTasks = [
      ...this.tasksFromGen(genTasks.filter(t => t.status === 'failed').slice(-5)),
      ...this.tasksFromVideo(videoTasks.filter(t => t.status === 'failed').slice(-5)),
      ...this.failedSegments(segments.filter(s => s.status === 'failed').slice(-5)),
    ];
    allFailedTasks.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    return {
      credits: user?.credits ?? 0,
      projectStats: { total: projects.length, byStatus: projectByStatus },
      assetStats: {
        drama: { total: assets.length, byType: assetByType },
        global: { total: await this.globalAssetRepo.count({ where: { user_id: userId } }) },
      },
      segmentStats: { total: segments.length, byStatus: segmentByStatus },
      projects: projects.slice(0, 10).map(p => ({
        id: p.id,
        title: p.title,
        status: p.status,
        genre: p.genre,
        episodes: p.episodes,
        cover_url: p.cover_url,
        nextStep: PROJECT_NEXT_STEP[p.status] || '未知',
        updated_at: p.updated_at,
      })),
      failedTasks: allFailedTasks.slice(0, 10),
      totalGenerations: genTasks.length,
      processingCount:
        genTasks.filter(t => t.status === 'processing').length +
        videoTasks.filter(t => t.status === 'processing').length +
        segments.filter(s => s.status === 'generating').length,
      pendingCount:
        genTasks.filter(t => t.status === 'pending').length +
        videoTasks.filter(t => t.status === 'pending').length +
        segments.filter(s => s.status === 'pending').length,
    };
  }

  async getProjects(userId: number) {
    const projects = await this.projectRepo.find({
      where: { user_id: userId },
      order: { updated_at: 'DESC' },
    });

    return Promise.all(projects.map(async (p) => {
      const episodeIds = (await this.episodeRepo.find({
        where: { project_id: p.id },
        select: ['id'],
      })).map(e => e.id);

      const [assetCount, segmentCount, completedSegments] = await Promise.all([
        this.assetRepo.count({ where: { project_id: p.id } }),
        episodeIds.length ? this.segmentRepo.count({ where: { episode_id: In(episodeIds) } }) : 0,
        episodeIds.length ? this.segmentRepo.count({ where: { episode_id: In(episodeIds), status: 'completed' } }) : 0,
      ]);

      return {
        id: p.id,
        title: p.title,
        status: p.status,
        genre: p.genre,
        episodes: p.episodes,
        cover_url: p.cover_url,
        description: p.description,
        assetCount,
        segmentProgress: segmentCount > 0 ? Math.round((completedSegments / segmentCount) * 100) : 0,
        nextStep: PROJECT_NEXT_STEP[p.status] || '未知',
        created_at: p.created_at,
        updated_at: p.updated_at,
      };
    }));
  }

  async getTasks(userId: number, status: 'processing' | 'pending') {
    const genStatus = status;
    const videoStatus = status;
    const segStatus = status === 'processing' ? 'generating' : 'pending';

    const [genTasks, videoTasks] = await Promise.all([
      this.genTaskRepo.find({
        where: { user_id: userId, status: genStatus },
        order: { created_at: 'DESC' },
        take: 200,
      }),
      this.videoTaskRepo.find({
        where: { user_id: userId, status: videoStatus },
        order: { created_at: 'DESC' },
        take: 200,
      }),
    ]);

    const projects = await this.projectRepo.find({ where: { user_id: userId }, select: ['id', 'title'] });
    const episodeIds = (await this.episodeRepo.find({
      where: { project_id: In(projects.map(p => p.id)) },
      select: ['id', 'project_id', 'episode_no'],
    }));
    const segments = episodeIds.length
      ? await this.segmentRepo.find({
          where: { episode_id: In(episodeIds.map(e => e.id)), status: segStatus },
          order: { created_at: 'DESC' },
          take: 200,
        })
      : [];
    const episodeById = new Map(episodeIds.map(e => [e.id, e]));

    const items = [
      ...genTasks.map(t => ({
        id: t.id,
        source: 'generation',
        type: t.type || 'unknown',
        status,
        title: this.genTitle(t.input_data) || (t.type || '生成任务'),
        time: t.started_at || t.created_at,
      })),
      ...videoTasks.map(t => ({
        id: t.id,
        source: 'video',
        type: 'video',
        status,
        title: t.prompt ? (t.prompt.length > 60 ? t.prompt.substring(0, 60) + '…' : t.prompt) : `视频任务 #${t.id}`,
        time: t.completed_at || t.created_at,
      })),
      ...segments.map(s => {
        const ep = episodeById.get(s.episode_id);
        return {
          id: s.id,
          source: 'segment',
          type: `片段 #${s.segment_no}`,
          status,
          title: (ep
            ? `第 ${ep.episode_no} 集 · `
            : '') + (s.prompt_cn ? (s.prompt_cn.length > 60 ? s.prompt_cn.substring(0, 60) + '…' : s.prompt_cn) : '短剧片段'),
          projectId: ep?.project_id ?? null,
          time: s.updated_at,
        };
      }),
    ];
    items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    return { status, total: items.length, items };
  }

  private genTitle(inputData: string | null): string | null {
    if (!inputData) return null;
    try {
      const data = JSON.parse(inputData);
      const prompt = data?.prompt || data?.text || data?.prompt_cn;
      if (typeof prompt === 'string' && prompt.trim()) {
        return prompt.trim().length > 60 ? prompt.trim().substring(0, 60) + '…' : prompt.trim();
      }
    } catch { /* not json */ }
    try {
      const firstLine = inputData.split(/\r?\n/)[0]?.trim();
      if (firstLine && firstLine.length < 150) return firstLine;
    } catch { /* ignore */ }
    return null;
  }

  async getFailedTasks(userId: number) {
    const [genTasks, videoTasks] = await Promise.all([
      this.genTaskRepo.find({ where: { user_id: userId, status: 'failed' }, order: { created_at: 'DESC' }, take: 50 }),
      this.videoTaskRepo.find({ where: { user_id: userId, status: 'failed' }, order: { created_at: 'DESC' }, take: 50 }),
    ]);

    const projects = await this.projectRepo.find({ where: { user_id: userId }, select: ['id'] });
    const episodeIds = (await this.episodeRepo.find({
      where: { project_id: In(projects.map(p => p.id)) },
      select: ['id'],
    })).map(e => e.id);
    const segments = episodeIds.length
      ? await this.segmentRepo.find({ where: { episode_id: In(episodeIds), status: 'failed' }, order: { created_at: 'DESC' }, take: 50 })
      : [];

    const all = [
      ...this.tasksFromGen(genTasks),
      ...this.tasksFromVideo(videoTasks),
      ...this.failedSegments(segments),
    ];
    all.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    return all.slice(0, 50);
  }

  async clearFailedTasks(userId: number) {
    const outputDir = path.resolve(process.cwd(), 'output');

    const deleteFilesOf = (data: any) => {
      if (!data) return;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { return; }
      }
      const urls: string[] = [];
      if (Array.isArray(data)) {
        data.forEach((item: any) => { if (item.url) urls.push(item.url); });
      } else if (data.url) {
        urls.push(data.url);
      } else if (data.video?.url) {
        urls.push(data.video.url);
      } else if (data.images) {
        data.images.forEach((img: any) => { if (img.url) urls.push(img.url); });
      }
      for (const url of urls) {
        if (url.startsWith('/static/')) {
          const filePath = path.join(outputDir, path.basename(url));
          try { if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); } }
          catch { /* ignore */ }
        }
      }
    };

    // 1. failed generation tasks → remove records + related rows + output files
    const genTasks = await this.genTaskRepo.find({ where: { user_id: userId, status: 'failed' } });
    for (const t of genTasks) {
      deleteFilesOf(t.output_data);
      await this.entityManager.query('DELETE FROM task_events WHERE task_id = ?', [t.id]);
      await this.entityManager.query('DELETE FROM media_files WHERE task_id = ?', [t.id]);
    }
    if (genTasks.length) {
      await this.genTaskRepo.delete({ user_id: userId, status: 'failed' });
    }

    // 2. failed video tasks → remove records + result files
    const vTasks = await this.videoTaskRepo.find({ where: { user_id: userId, status: 'failed' } });
    for (const t of vTasks) {
      for (const u of [t.video_url, t.cover_url]) {
        if (u && u.startsWith('/static/')) {
          const filePath = path.join(outputDir, path.basename(u));
          try { if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); } } catch { /* ignore */ }
        }
      }
    }
    if (vTasks.length) {
      await this.videoTaskRepo.delete({ user_id: userId, status: 'failed' });
    }

    // 3. failed drama segments → keep the segment, reset to pending & drop ERROR marker
    const projects = await this.projectRepo.find({ where: { user_id: userId }, select: ['id'] });
    const episodeIds = (await this.episodeRepo.find({
      where: { project_id: In(projects.map(p => p.id)) },
      select: ['id'],
    })).map(e => e.id);
    const segments = episodeIds.length
      ? await this.segmentRepo.find({ where: { episode_id: In(episodeIds), status: 'failed' } })
      : [];
    for (const s of segments) {
      s.status = 'pending';
      if (s.video_url?.startsWith('ERROR:')) s.video_url = null;
      await this.segmentRepo.save(s);
    }

    return {
      message: '已清空失败记录',
      cleared: { generation: genTasks.length, video: vTasks.length, segment: segments.length },
    };
  }

  async getDiskUsage() {
    const outputDir = path.resolve(process.cwd(), 'output');
    const uploadDir = path.resolve(process.cwd(), 'uploads');
    const getSize = (dir: string): number => {
      try {
        if (!fs.existsSync(dir)) return 0;
        let size = 0;
        const walk = (d: string) => {
          for (const f of fs.readdirSync(d)) {
            const p = path.join(d, f);
            const stat = fs.statSync(p);
            if (stat.isDirectory()) walk(p);
            else size += stat.size;
          }
        };
        walk(dir);
        return size;
      } catch { return 0; }
    };
    const outputSize = getSize(outputDir);
    const uploadSize = getSize(uploadDir);
    return {
      output: { path: outputDir, sizeBytes: outputSize, sizeReadable: this.formatBytes(outputSize) },
      upload: { path: uploadDir, sizeBytes: uploadSize, sizeReadable: this.formatBytes(uploadSize) },
    };
  }

  /**
   * B：优秀作品展 —— 只回 status=online，最新在前（首版只 tab + 最新，无搜索/热度）。
   * 分类字典读 system_configs.showcase_categories（JSON [{key,label}]），缺省用内置 4 类。
   */
  async getShowcase(category?: string) {
    const items = await this.showcaseRepo.find({
      where: { status: 'online' },
      order: { created_at: 'DESC', id: 'DESC' },
      take: 100,
    });
    let categories: Array<{ key: string; label: string }> = [
      { key: 'event', label: '活动制作' },
      { key: 'short_video', label: '视频短片' },
      { key: 'series', label: '长篇漫剧' },
      { key: 'ad', label: '广告' },
    ];
    try {
      const row = await this.entityManager.query(
        `SELECT config_value FROM system_configs WHERE config_key = 'showcase_categories'`,
      );
      const raw = row?.[0]?.config_value;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) categories = parsed;
      }
    } catch { /* 字典坏了用内置默认 */ }
    const k = (category || '').trim();
    const filtered = k && k !== 'all' ? items.filter((w) => w.category === k) : items;
    return { categories, items: filtered };
  }

  /**
   * 我的作品：按模块聚合该用户生成的视频（AI 生成 / 短剧 / 热门创作 / 画布 / 剪辑）。
   * - 有视频的条目（completed）+ 正在生成/失败的条目（给状态反馈）；pending 空项目不进列表。
   * - 每模块最多 40 条，前端按 tab 客户端过滤；剪辑模块仅管理员返回（侧边栏同规则）。
   */
  async getWorks(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    const isAdmin = user?.role === 'admin';

    const [genTasks, dramaRows, viralRows, canvasRows, editorRows] = await Promise.all([
      this.genTaskRepo.find({
        where: { user_id: userId, type: 'video' },
        order: { created_at: 'DESC' },
        take: 40,
      }),
      this.entityManager.query(
        `SELECT s.id, s.segment_no, s.status, s.video_url, s.updated_at AS time,
                e.id AS episode_id, e.episode_no, p.id AS project_id, p.title AS project_title, p.cover_url
           FROM drama_segments s
           JOIN drama_episodes e ON e.id = s.episode_id
           JOIN drama_projects p ON p.id = e.project_id
          WHERE p.user_id = ?
            AND ((s.video_url IS NOT NULL AND s.video_url NOT LIKE 'ERROR:%')
                 OR s.status IN ('generating','failed'))
          ORDER BY s.updated_at DESC LIMIT 40`,
        [userId],
      ),
      this.entityManager.query(
        `SELECT id, name AS title, result_url, status, updated_at AS time
           FROM viral_projects
          WHERE user_id = ?
            AND ((result_url IS NOT NULL AND result_url <> '') OR status IN ('generating','failed'))
          ORDER BY updated_at DESC LIMIT 40`,
        [userId],
      ),
      this.entityManager.query(
        `SELECT id, name AS title, result_url, status, updated_at AS time
           FROM canvas_projects
          WHERE user_id = ?
            AND ((result_url IS NOT NULL AND result_url <> '') OR status IN ('rendering','failed'))
          ORDER BY updated_at DESC LIMIT 40`,
        [userId],
      ),
      isAdmin
        ? this.entityManager.query(
            `SELECT id, name AS title, result_url, status, updated_at AS time
               FROM editor_projects
              WHERE user_id = ?
                AND ((result_url IS NOT NULL AND result_url <> '') OR status IN ('rendering','failed'))
              ORDER BY updated_at DESC LIMIT 40`,
            [userId],
          )
        : Promise.resolve([]),
    ]);

    const items: WorkItem[] = [];

    for (const t of genTasks) {
      items.push({
        id: `generate:${t.id}`,
        module: 'generate',
        title: this.genTitle(t.input_data) || `视频任务 #${t.id}`,
        video_url: this.genVideoUrl(t.output_data),
        cover_url: t.cover_url || null,
        status: t.status,
        time: t.completed_at || t.created_at,
        link: WORK_MODULES.generate.link(String(t.id)),
      });
    }

    for (const r of dramaRows as any[]) {
      const video = r.video_url && !String(r.video_url).startsWith('ERROR:') ? r.video_url : null;
      items.push({
        id: `drama:${r.id}`,
        module: 'drama',
        title: `${r.project_title || '短剧'} · 第 ${r.episode_no} 集 片段 ${r.segment_no}`,
        video_url: video,
        cover_url: r.cover_url || null,
        status: r.status === 'generating' ? 'processing' : r.status,
        time: r.time,
        link: WORK_MODULES.drama.link(`${r.project_id}/episodes/${r.episode_id}`),
      });
    }

    for (const [mod, rows] of [['viral', viralRows], ['canvas', canvasRows], ['editor', editorRows]] as Array<[string, any[]]>) {
      for (const r of rows) {
        const video = r.result_url && String(r.result_url).trim() ? r.result_url : null;
        items.push({
          id: `${mod}:${r.id}`,
          module: mod,
          title: r.title || `${WORK_MODULES[mod].label} #${r.id}`,
          video_url: video,
          cover_url: null,
          status: r.status,
          time: r.time,
          link: WORK_MODULES[mod].link(String(r.id)),
        });
      }
    }

    items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    const modules = (['generate', 'drama', 'viral', 'canvas', 'editor'] as const)
      .filter((k) => (k !== 'editor' || isAdmin))
      .map((k) => ({ key: k, label: WORK_MODULES[k].label }));

    return { modules, items };
  }

  /** 生成任务 output_data → 视频 url（{url} / [{url}] 两种形态） */
  private genVideoUrl(outputData: string | null): string | null {
    if (!outputData) return null;
    try {
      const data = JSON.parse(outputData);
      if (Array.isArray(data)) return data.find((d: any) => d?.url)?.url || null;
      if (data?.video?.url) return data.video.url;
      if (data?.url) return data.url;
    } catch { /* 非 JSON */ }
    return null;
  }

  private tasksFromGen(tasks: GenerationTask[]) {
    return tasks.map(t => ({
      id: t.id, source: 'generation', type: t.type || 'unknown',
      status: 'failed', error: localizeError(t.error_msg),
      errorRaw: t.error_msg, time: t.completed_at || t.created_at,
    }));
  }

  private tasksFromVideo(tasks: VideoTask[]) {
    return tasks.map(t => ({
      id: t.id, source: 'video', type: 'video',
      status: 'failed', error: localizeError(t.error_msg),
      errorRaw: t.error_msg, time: t.completed_at || t.created_at,
    }));
  }

  private failedSegments(segments: DramaSegment[]) {
    return segments.map(s => ({
      id: s.id, source: 'segment', type: `片段 #${s.segment_no}`,
      status: 'failed',
      error: localizeError(s.video_url?.startsWith('ERROR:') ? s.video_url.replace('ERROR:', '') : null),
      errorRaw: s.video_url, time: s.updated_at,
    }));
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
