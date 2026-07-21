import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { DramaProject } from '../drama/drama-project.entity';
import { DramaEpisode } from '../drama/drama-episode.entity';
import { DramaSegment } from '../drama/drama-segment.entity';
import { DramaAsset } from '../drama/drama-asset.entity';
import { GlobalAsset } from '../global-asset/global-asset.entity';
import { GenerationTask } from '../task/generation-task.entity';
import { VideoTask } from '../video/video.entity';
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
        global: { total: await this.globalAssetRepo.count() },
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
