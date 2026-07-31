import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { chromium } from 'playwright';
import { ViralTemplate } from './viral-template.entity';
import { ViralProject } from './viral-project.entity';
import { CreateTemplateDto, UpdateTemplateDto, CreateProjectDto, UpdateProjectDto, AnalyzeVideoDto } from './viral.dto';
import { AIServiceUtil } from '../../utils/ai-service.util';
import { FFmpegUtil } from '../../utils/ffmpeg.util';

const execAsync = promisify(exec);

/** Map user-chosen ratio to pixel dimensions used by local ffmpeg compositing */
function ratioToRes(ratio?: string): string {
  switch (ratio) {
    case '16:9': return '1920x1080';
    case '1:1': return '1080x1080';
    case '4:3': return '1440x1080';
    default: return '1080x1920'; // 9:16
  }
}

/** Language names for translation prompts */
const LANG_NAMES: Record<string, string> = {
  zh: 'Chinese (Simplified)',
  en: 'English',
  ja: 'Japanese',
};

@Injectable()
export class ViralService {
  private readonly logger = new Logger(ViralService.name);
  private readonly outputDir: string;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(ViralTemplate)
    private readonly templateRepo: Repository<ViralTemplate>,
    @InjectRepository(ViralProject)
    private readonly projectRepo: Repository<ViralProject>,
    private readonly aiService: AIServiceUtil,
    private readonly ffmpeg: FFmpegUtil,
  ) {
    this.outputDir = path.resolve(process.cwd(), 'output');
    if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });

    // Periodic orphan frames cleanup (every 6 hours), runs in background
    this.cleanupOrphanFrames().catch(() => {});
    this.cleanupTimer = setInterval(() => {
      this.cleanupOrphanFrames().catch(() => {});
    }, 6 * 60 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  /**
   * Remove `viral_frames_*` / `viral_analyze_*` directories and
   * `viral_source_*.mp4` files that are not referenced by any template.
   * Only deletes entries older than 2h (protects in-progress analysis).
   * Referenced entries are NEVER deleted.
   */
  private async cleanupOrphanFrames() {
    try {
      // Collect all frame dirs / source videos referenced by templates
      const templates = await this.templateRepo.find();
      const referencedDirs = new Set<string>();
      const referencedFiles = new Set<string>();
      for (const t of templates) {
        if (t.reference_frames) {
          try {
            const frames = JSON.parse(t.reference_frames);
            for (const f of frames || []) {
              const m = String(f).match(/\/static\/(viral_frames_[^/]+)\//);
              if (m) referencedDirs.add(m[1]);
            }
          } catch { /* ignore */ }
        }
        if (t.reference_url) {
          const m = String(t.reference_url).match(/\/static\/(viral_source_[^/]+\.mp4)$/);
          if (m) referencedFiles.add(m[1]);
        }
      }

      const now = Date.now();
      let removed = 0;
      const entries = fs.readdirSync(this.outputDir, { withFileTypes: true });
      for (const e of entries) {
        const fullPath = path.join(this.outputDir, e.name);
        let relevant = false;
        if (e.isDirectory()) {
          if (!e.name.startsWith('viral_frames_') && !e.name.startsWith('viral_analyze_')) continue;
          if (referencedDirs.has(e.name)) continue;
          relevant = true;
        } else if (e.isFile() && e.name.startsWith('viral_source_') && e.name.endsWith('.mp4')) {
          if (referencedFiles.has(e.name)) continue;
          relevant = true;
        }
        if (!relevant) continue;
        try {
          const stat = fs.statSync(fullPath);
          // Skip entries created within the last 2 hours (possibly in-progress analysis)
          if (now - stat.mtimeMs < 2 * 60 * 60 * 1000) continue;
        } catch { continue; }
        fs.rmSync(fullPath, { recursive: true, force: true });
        removed++;
      }
      if (removed > 0) this.logger.log(`清理孤儿帧图/原视频/临时目录 ${removed} 个`);
    } catch (err: any) {
      this.logger.warn(`清理孤儿帧图目录失败: ${err.message}`);
    }
  }

  // ───── Templates ─────

  async listTemplates(query: {
    category?: string; keyword?: string; sort?: string;
    page?: number; limit?: number;
  }) {
    const { category, keyword, sort, page = 1, limit = 20 } = query;
    const where: any = { status: 'active' };
    if (category && category !== 'all') where.category = category;
    if (keyword) where.name = Like(`%${keyword}%`);

    const order: any = sort === 'popular' ? { usage_count: 'DESC' } : { created_at: 'DESC' };

    const [items, total] = await this.templateRepo.findAndCount({
      where,
      order,
      skip: (page - 1) * limit,
      take: limit,
    });

    const parsed = items.map(t => {
      let cover = t.thumbnail || null;
      if (!cover && t.reference_frames) {
        try {
          const frames = JSON.parse(t.reference_frames);
          if (Array.isArray(frames) && frames.length) cover = frames[0];
        } catch { /* ignore */ }
      }
      return {
        ...t,
        tags: t.tags ? JSON.parse(t.tags) : [],
        cover_url: cover,
      };
    });

    return { items: parsed, total, page, limit };
  }

  async getTemplateById(id: number) {
    const tpl = await this.templateRepo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException('模板不存在');
    return {
      ...tpl,
      tags: tpl.tags ? JSON.parse(tpl.tags) : [],
      scenes: tpl.scenes ? JSON.parse(tpl.scenes) : [],
      variables: tpl.variables ? JSON.parse(tpl.variables) : [],
      reference_frames: tpl.reference_frames ? JSON.parse(tpl.reference_frames) : null,
      audio: tpl.audio ? JSON.parse(tpl.audio) : null,
    };
  }

  /** Extract a clean URL from pasted share text (e.g. Douyin share format) */
  private cleanShareUrl(input: string): string {
    if (!input) return input;
    const match = input.match(/https?:\/\/[^\s,，。、]+/);
    return match ? match[0] : input.trim();
  }

  async createTemplate(dto: CreateTemplateDto) {
    if (!dto.name) throw new BadRequestException('模板名称不能为空');
    const referenceUrl = dto.reference_url ? this.cleanShareUrl(dto.reference_url) : undefined;
    const tpl = this.templateRepo.create({
      ...dto,
      reference_url: referenceUrl,
      tags: dto.tags || '[]',
      scenes: dto.scenes || '[]',
      variables: dto.variables || '[]',
    });
    return this.templateRepo.save(tpl);
  }

  async updateTemplate(id: number, dto: UpdateTemplateDto) {
    const tpl = await this.templateRepo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException('模板不存在');
    const clean: any = { ...dto };
    if (clean.reference_url) clean.reference_url = this.cleanShareUrl(clean.reference_url);
    Object.assign(tpl, clean);
    return this.templateRepo.save(tpl);
  }

  /**
   * For templates whose reference_url is still an external link (created before
   * local persistence existed), download the source video, compress it into
   * output/ and update the template to point at the local copy.
   */
  async refreshTemplateSourceVideo(id: number) {
    const tpl = await this.templateRepo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException('模板不存在');

    // Already local
    if (tpl.reference_url?.startsWith('/static/')) {
      return { updated: false, message: '模板已使用本地视频' };
    }

    const finalUrl = this.cleanShareUrl(tpl.reference_url || '');
    if (!finalUrl) throw new BadRequestException('模板没有可用的参考视频链接');

    const taskId = Date.now();
    const workDir = path.join(this.outputDir, `viral_analyze_${taskId}`);
    fs.mkdirSync(workDir, { recursive: true });

    try {
      const videoPath = path.join(workDir, 'source.mp4');
      this.logger.log(`为模板 #${id} 下载原视频: ${finalUrl}`);
      await this.downloadVideo(finalUrl, videoPath);

      if (!fs.existsSync(videoPath) || fs.statSync(videoPath).size <= 1000) {
        throw new BadRequestException('原视频下载失败');
      }

      const localVideoUrl = await this.persistSourceVideo(videoPath, finalUrl, taskId);
      if (!localVideoUrl) {
        throw new BadRequestException('原视频持久化失败');
      }

      tpl.reference_url = localVideoUrl;
      tpl.source_url = finalUrl;
      await this.templateRepo.save(tpl);
      this.logger.log(`模板 #${id} 原视频已更新为本地文件: ${localVideoUrl}`);
      return { updated: true, reference_url: localVideoUrl };
    } finally {
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  async deleteTemplate(id: number) {
    const tpl = await this.templateRepo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException('模板不存在');

    // Clean up associated frame image directories and persisted source video
    try {
      if (tpl.reference_frames) {
        const frames: string[] = JSON.parse(tpl.reference_frames);
        const dirs = new Set<string>();
        for (const f of frames || []) {
          const m = String(f).match(/\/static\/([^/]+)\//);
          if (m) dirs.add(m[1]);
        }
        for (const dir of dirs) {
          const fullPath = path.join(this.outputDir, dir);
          if (fullPath.startsWith(this.outputDir) && fs.existsSync(fullPath)) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            this.logger.log(`已删除模板关联帧图目录: ${dir}`);
          }
        }
      }
      if (tpl.reference_url) {
        const m = String(tpl.reference_url).match(/\/static\/(viral_source_[^/]+\.mp4)$/);
        if (m) {
          const fullPath = path.join(this.outputDir, m[1]);
          if (fullPath.startsWith(this.outputDir) && fs.existsSync(fullPath)) {
            fs.rmSync(fullPath, { force: true });
            this.logger.log(`已删除模板关联原视频: ${m[1]}`);
          }
        }
      }
    } catch { /* ignore cleanup errors */ }

    await this.templateRepo.remove(tpl);
    return { deleted: true };
  }

  async duplicateTemplate(id: number, userId: number) {
    const tpl = await this.templateRepo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException('模板不存在');

    const copy = this.templateRepo.create({
      name: `${tpl.name} (副本)`,
      description: tpl.description,
      category: tpl.category,
      tags: tpl.tags,
      scenes: tpl.scenes,
      variables: tpl.variables,
      audio: tpl.audio,
      reference_url: tpl.reference_url,
      source_url: tpl.source_url,
      is_system: false,
      user_id: userId,
      status: 'active',
    });
    return this.templateRepo.save(copy);
  }

  async getCategories() {
    const result = await this.templateRepo
      .createQueryBuilder('t')
      .select('t.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .where('t.status = :status', { status: 'active' })
      .groupBy('t.category')
      .orderBy('count', 'DESC')
      .getRawMany();
    return result.map(r => ({ category: r.category, count: Number(r.count) }));
  }

  async incrementUsage(id: number) {
    await this.templateRepo.increment({ id }, 'usage_count', 1);
  }

  // ───── Video Analysis ─────

  async analyzeVideo(dto: AnalyzeVideoDto) {
    const { videoUrl, name, category, description } = dto;
    if (!videoUrl) throw new BadRequestException('视频 URL 不能为空');

    // Extract the first valid URL from pasted text (handles TikTok share text with extra description)
    const extractedUrl = videoUrl.match(/https?:\/\/[^\s,，。、]+/);
    const finalUrl = extractedUrl ? extractedUrl[0] : videoUrl;
    if (finalUrl !== videoUrl) {
      this.logger.log(`从粘贴文本中提取 URL: ${finalUrl}`);
    }

    const taskId = Date.now();
    const workDir = path.join(this.outputDir, `viral_analyze_${taskId}`);
    const framesDir = path.join(this.outputDir, `viral_frames_${taskId}`);
    fs.mkdirSync(workDir, { recursive: true });
    fs.mkdirSync(framesDir, { recursive: true });

    try {
      // Step 1: Download video
      this.logger.log(`下载视频: ${finalUrl}`);
      const videoPath = path.join(workDir, 'source.mp4');
      // Step 2: Download video (returns API metadata if available)
      const apiMeta = await this.downloadVideo(finalUrl, videoPath);

      // Step 2.5: Persist the downloaded original video for later playback.
      // The workDir gets cleaned up in finally, so save a compressed copy to
      // a persistent location under output/ (served as /static/...).
      // Optimization: reuse an existing persisted file for the same source URL,
      // and compress (max 720p width, full duration) to save disk space.
      const localVideoUrl = await this.persistSourceVideo(videoPath, finalUrl, taskId);

      // Step 3: Get video info (use API metadata as primary source)
      const info = await this.ffmpeg.getVideoInfo(videoPath);
      const videoDuration = (apiMeta?.duration && apiMeta.duration > 0 && apiMeta.duration < 300) ? apiMeta.duration : info.duration;
      const videoTitle = apiMeta?.title || '';
      this.logger.log(`视频信息: ${info.width}x${info.height}, ${info.duration.toFixed(1)}s (API时长: ${apiMeta?.duration || 'N/A'}s)`);

      // Step 4: Extract keyframes (use API duration for frame count)
      const frameCount = Math.min(Math.max(Math.floor(videoDuration / 2), 3), 10);
      const { base64Frames, frameUrls } = await this.extractFrames(videoPath, framesDir, frameCount);
      this.logger.log(`提取 ${frameUrls.length} 帧关键帧: ${JSON.stringify(frameUrls)}`);

      // Step 5: Analyze with multimodal LLM
      const systemPrompt = `你是一个专业的视频结构分析师。分析提供的视频帧序列，识别出视频的分镜结构。

请严格按照以下 JSON 格式返回（不要包含任何其他文字）：
{
  "name": "模板名称",
  "description": "模板简短描述",
  "category": "根据视频内容自动判断的类别，如：美食测评、游戏解说、情感故事、产品开箱、旅游vlog、知识科普、美妆教程、搞笑段子、品牌广告、节日祝福、影视解说等（中文，不限以上列表）",
  "scenes": [
  {
    "name": "场景名",
    "duration": 3,
    "description": "场景描述",
    "type": "image/video/text"
  }
  ],
  "variables": [
    {
      "key": "变量名(英文)",
      "label": "变量标签(中文)",
      "type": "text/textarea/select",
      "placeholder": "填写提示",
      "default_value": "根据视频内容给出的建议默认值，方便用户一键采用，例如品牌名、广告语等（尽量给出有意义的内容，不要留空）",
      "required": true
    }
  ]
}

注意：
- scenes 是分镜数组，每个场景包含 name(中文)、duration(秒)、description(中文描述)、type(image/video/text)
- description 必须写成可直接用于 AI 视频/图片生成的详细提示词，包含：画面主体与动作、镜头类型（特写/中景/远景）、运镜方式（推/拉/摇/移/升降）、光线氛围（自然光/暖光/霓虹/逆光）、色调风格（胶片感/高对比/清新/赛博朋克等），并适当使用形容词增强画面质感，例如：'女主近景镜头缓缓推进，暖黄灯光下微笑品尝咖啡，背景虚化的城市夜景，胶片质感，画面细腻'
- type 选择：video=动态画面场景（动作/运镜/连续变化），image=静态画面场景（特写/定格/海报），text=字幕/标题场景（纯文字展示）
- 变量出现在场景描述中时使用 {{变量名}} 占位，例如 {{品牌名}} 的招牌
- variables 是用户需要填写的变量，例如产品名称、广告语等，必须给出 default_value 建议值（从视频内容中提炼，让用户可以直接采用或修改）
- 场景数量控制在 3-6 个之间
- 总时长控制在 8-15 秒之间
- category 不限于固定列表，根据视频实际内容动态判断，例如：美食测评、游戏解说、情感故事、产品开箱、旅游vlog、影视剪辑等`;

      const pageTitle = videoTitle || await this.getPageTitle(finalUrl);
      const userPrompt = `请分析这个视频的结构，识别出场景分镜和需要用户填写的变量。
视频时长约 ${videoDuration.toFixed(0)} 秒。
${pageTitle ? `页面标题: "${pageTitle}"。根据页面标题判断视频内容类型。` : ''}`;

      let llmResult = '';
      // Primary path: use vision model with frames (can see actual content)
      if (base64Frames.length > 0) {
        try {
          this.logger.log(`尝试多模态分析 (${base64Frames.length} 帧)`);
          llmResult = await this.aiService.analyzeFrames(systemPrompt, userPrompt, base64Frames);
          this.logger.log('多模态分析成功');
        } catch (err: any) {
          this.logger.warn(`多模态分析失败: ${err.message}，降级到纯文本`);
        }
      }
      // Fallback: text-only analysis using video metadata
      if (!llmResult) {
        try {
          this.logger.log('尝试纯文本分析');
          llmResult = await this.aiService.chatCompletion([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ], { temperature: 0.3, maxTokens: 2048 });
        } catch (err: any) {
          this.logger.warn(`纯文本分析失败: ${err.message}`);
        }
      }
      // Last resort: generateSmartDescription for free-form description
      if (!llmResult && base64Frames.length > 0) {
        try {
          this.logger.log('尝试 generateSmartDescription 兜底');
          const desc = await this.aiService.generateSmartDescription(base64Frames);
          return this.buildBasicTemplate(name, description, category, desc, info, frameUrls, localVideoUrl, finalUrl);
        } catch (err2: any) {
          this.logger.warn(`兜底分析也失败: ${err2.message}`);
        }
      }
      // Ultimate fallback
      if (!llmResult) {
        return this.buildBasicTemplate(name, description, category, '', info, [], localVideoUrl, finalUrl);
      }

      // Parse LLM result
      let parsed: any;
      try {
        const cleaned = llmResult.replace(/```(?:json)?\s*/gi, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        const match = llmResult.match(/\{[\s\S]*\}/);
        if (match) {
          try { parsed = JSON.parse(match[0]); } catch { throw new BadRequestException('AI 返回格式无法解析'); }
        } else {
          throw new BadRequestException('AI 返回格式无法解析');
        }
      }

      const result = {
        name: name || parsed.name || '未命名模板',
        description: description || parsed.description || '',
        category: category || parsed.category || 'general',
        scenes: parsed.scenes || [],
        variables: parsed.variables || [],
        reference_url: localVideoUrl || finalUrl,
        source_url: finalUrl,
        reference_frames: frameUrls,
        video_info: info,
      };
      this.logger.log(`========== AI 视频分析结果 ==========`);
      this.logger.log(`名称: ${result.name}`);
      this.logger.log(`分类: ${result.category}`);
      this.logger.log(`描述: ${result.description}`);
      this.logger.log(`场景 (${result.scenes.length} 个):`);
      for (const s of result.scenes) {
        this.logger.log(`  [${s.type}] ${s.name} (${s.duration}s): ${s.description}`);
      }
      this.logger.log(`变量 (${result.variables.length} 个):`);
      for (const v of result.variables) {
        this.logger.log(`  ${v.key} (${v.label}, ${v.type}, ${v.required ? '必填' : '选填'}): ${v.placeholder}`);
      }
      this.logger.log(`====================================`);
      return result;
    } finally {
      // Cleanup temp video dir only (keep framesDir for user reference images)
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  /**
   * Compress a downloaded source video into output/ and return its public
   * URL, or reuse an existing persisted file for the same source URL.
   * Returns null if the source file is missing/invalid.
   */
  private async persistSourceVideo(videoPath: string, sourceUrl: string, taskId: number): Promise<string | null> {
    if (!fs.existsSync(videoPath) || fs.statSync(videoPath).size <= 1000) {
      this.logger.warn(`原视频下载失败或文件无效，将使用原始链接作为参考`);
      return null;
    }

    // 1) Reuse if this URL was already analyzed before
    try {
      const existing = await this.templateRepo.findOne({
        where: { source_url: sourceUrl },
      });
      const existingMatch = existing?.reference_url?.match(/\/static\/(viral_source_[^/]+\.mp4)$/);
      if (existingMatch && fs.existsSync(path.join(this.outputDir, existingMatch[1]))) {
        this.logger.log(`复用已持久化原视频: ${existingMatch[1]}`);
        return `/static/${existingMatch[1]}`;
      }
    } catch { /* ignore */ }

    // 2) Otherwise compress and save
    const persistName = `viral_source_${taskId}.mp4`;
    const persistPath = path.join(this.outputDir, persistName);
    try {
      await this.ffmpeg.compressForStorage(videoPath, persistPath, { maxWidth: 720 });
      if (fs.existsSync(persistPath) && fs.statSync(persistPath).size > 1000) {
        this.logger.log(`原视频已压缩持久化: ${persistName}`);
        return `/static/${persistName}`;
      }
      this.logger.warn(`压缩产物无效，原样保存: ${persistName}`);
    } catch (err: any) {
      this.logger.warn(`压缩持久化失败 (${err.message})，原样保存`);
    }
    try {
      fs.copyFileSync(videoPath, persistPath);
      return `/static/${persistName}`;
    } catch { /* ignore */ }
    return null;
  }

  private async downloadVideo(url: string, outputPath: string): Promise<{ duration: number; title: string } | null> {
    // Try yt-dlp first (handles Douyin, YouTube, Bilibili, etc.)
    try {
      const ytOutput = execSync(`yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" -o "${outputPath}" --print-json "${url}"`, {
        timeout: 120000,
        stdio: 'pipe',
      });
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
        try {
          const ytMeta = JSON.parse(ytOutput.toString());
          this.logger.log(`yt-dlp 下载成功: ${ytMeta.title || ''} (${ytMeta.duration || 0}s)`);
          return { duration: ytMeta.duration || 0, title: ytMeta.title || '' };
        } catch { return null; }
      }
    } catch (err: any) {
      this.logger.warn(`yt-dlp 下载失败: ${err.message}，尝试 Playwright 降级`);
    }

    // Fallback: Playwright headless browser
    let browserRef: any = null;
    try {
      const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
      browserRef = browser;
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        locale: 'zh-CN',
        viewport: { width: 1920, height: 1080 },
      });
      const page = await context.newPage();

      // Capture both API metadata and video URL from network responses
      let apiMeta: any = null;

      page.on('response', (response) => {
        const rUrl = response.url();
        const ct = response.headers()['content-type'] || '';

        // Priority: Douyin aweme detail API → extract metadata + video URL
        if (!apiMeta && rUrl.includes('/aweme/v1/web/aweme/detail') && ct.includes('json')) {
          response.text().then((text) => {
            try {
              if (!text || text.length < 10) return;
              const body = JSON.parse(text);
              const detail = body?.aweme_detail || (body?.item_list ? body.item_list[0] : null);
              if (!detail) return;
              const title = detail.desc || '';
              const duration = detail.video?.duration ? Math.floor(detail.video.duration / 1000) : 0;
              const playUrl = (detail.video?.play_addr?.url_list?.[0] || '').replace(/\\u0026/g, '&').replace('/playwm/', '/play/');
              this.logger.log(`Playwright: API 视频标题: "${title.substring(0, 100)}" (${duration}s)`);
              if (playUrl) this.logger.log(`Playwright: API 视频 URL: ${playUrl.substring(0, 100)}`);
              apiMeta = { duration, title, videoUrl: playUrl };
            } catch { /* ignore */ }
          }).catch(() => {});
        }
      });

      // Navigate directly (short URL auto-redirects to full page)
      this.logger.log(`Playwright: 打开页面 ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(8000);

      // Log the current URL after navigation
      const currentUrl = page.url();
      this.logger.log(`Playwright: 当前页面 URL: ${currentUrl}`);

      await browser.close().catch(() => {});
      browserRef = null;

      // Try to download using API URL
      if (apiMeta && apiMeta.videoUrl) {
        try {
          this.logger.log(`Playwright: 下载视频 ${apiMeta.videoUrl.substring(0, 80)}`);
          const resp = await axios.get(apiMeta.videoUrl, {
            responseType: 'arraybuffer',
            timeout: 120000,
            headers: {
              'Referer': currentUrl,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
            },
          });
          fs.writeFileSync(outputPath, Buffer.from(resp.data));
          if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
            this.logger.log(`Playwright: 下载成功 (${fs.statSync(outputPath).size} bytes)`);
            return { duration: apiMeta.duration, title: apiMeta.title };
          }
        } catch (e: any) {
          this.logger.warn(`Playwright: 下载失败 (${e.message})`);
        }
      }

      this.logger.warn('Playwright: 未能获取视频');
    } catch (err: any) {
      this.logger.warn(`Playwright 失败: ${err.message}`);
    } finally {
      if (browserRef) try { await browserRef.close(); } catch { /* ignore */ }
    }

    // Last resort: direct download (for direct MP4 URLs)
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 120000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      fs.writeFileSync(outputPath, Buffer.from(response.data));
    } catch { /* ignore */ }
    return null;
  }



  private async extractFrames(videoPath: string, framesDir: string, count: number): Promise<{ base64Frames: string[]; frameUrls: string[] }> {
    const framePaths: string[] = [];
    const keptHashes: string[] = [];

    // Probe the real video duration so frames are spread across the whole video
    let duration = 5;
    try {
      const info = await this.ffmpeg.getVideoInfo(videoPath);
      if (info.duration > 0) duration = info.duration;
    } catch { /* keep default */ }
    this.logger.log(`抽帧: 视频时长 ${duration.toFixed(1)}s，分 ${count} 段均匀提取`);

    // Divide the timeline into `count` equal segments (skip the very first 0.3s
    // of black/fade-in). Each segment contributes one representative frame.
    const n = Math.max(2, Math.min(count, 8));
    const segLen = duration / n;
    for (let i = 0; i < n; i++) {
      const start = Math.min(Math.max(0.3, i * segLen), Math.max(0.3, duration - 0.5));
      const segDuration = Math.max(0.5, Math.min(segLen, duration - start));
      const candidates: string[] = [];

      // 1) Clip the segment (fast stream copy), then run scene detection on it.
      //    Clipping first is required: -ss + select filter on the full file
      //    ignores the seek position, so scene cuts must be detected per-clip.
      const segPath = path.join(framesDir, `seg_${i}.mp4`);
      let clipped = false;
      try {
        await execAsync(
          `ffmpeg -y -ss ${start.toFixed(2)} -t ${segDuration.toFixed(2)} -i "${videoPath}" -c copy "${segPath}"`,
          { timeout: 30000 },
        );
        clipped = fs.existsSync(segPath) && fs.statSync(segPath).size > 0;
      } catch { /* clip failed */ }
      if (clipped) {
        try {
          const pat = path.join(framesDir, `seg_${i}_%02d.jpg`);
          await execAsync(
            `ffmpeg -y -i "${segPath}" -vf "select='gt(scene\\,0.1)',setpts=N/FRAME_RATE/TB" -vsync vfr -frames:v 3 -q:v 2 "${pat}"`,
            { timeout: 30000 },
          );
          for (let k = 0; k < 3; k++) {
            const fp = pat.replace('%02d', String(k).padStart(2, '0'));
            if (fs.existsSync(fp) && fs.statSync(fp).size > 0) candidates.push(fp);
          }
        } catch { /* no scene cuts in this segment */ }
        try { fs.unlinkSync(segPath); } catch { /* ignore */ }
      }

      // 2) Fallback: sample 3 points (25%/50%/75%) inside the segment
      if (candidates.length === 0) {
        for (const frac of [0.25, 0.5, 0.75]) {
          const t = start + segDuration * frac;
          const fp = path.join(framesDir, `seg_${i}_pt${Math.round(frac * 100)}.jpg`);
          try {
            await execAsync(
              `ffmpeg -y -ss ${t.toFixed(2)} -i "${videoPath}" -vframes 1 -q:v 2 "${fp}"`,
              { timeout: 30000 },
            );
            if (fs.existsSync(fp) && fs.statSync(fp).size > 0) candidates.push(fp);
          } catch { /* ignore */ }
        }
      }

      // 3) Pick a candidate that is NOT too similar to already-kept frames
      //    (dHash distance < 8 => visually near-identical). Prefer later
      //    scene-detected frames (they accumulate the most change).
      let picked: string | null = null;
      for (const c of [...candidates].reverse()) {
        const h = await this.dHash(c);
        const similar = keptHashes.some((kh) => this.hamming(h, kh) < 8);
        if (!similar) {
          picked = c;
          if (h) keptHashes.push(h);
          break;
        }
      }
      if (!picked && candidates.length > 0) {
        // Segment is visually uniform — still keep one frame for coverage
        picked = candidates[0];
        const h = await this.dHash(picked);
        if (h) keptHashes.push(h);
      }
      if (picked) framePaths.push(picked);
    }

    // Cap at 8 frames for the multimodal analysis call
    const kept = framePaths.slice(0, 8);
    // Convert local paths to base64 for API call
    const base64Frames: string[] = [];
    const frameUrls: string[] = [];
    for (const fp of kept) {
      try {
        const buffer = fs.readFileSync(fp);
        base64Frames.push(`data:image/jpeg;base64,${buffer.toString('base64')}`);
        frameUrls.push(`/static/${path.basename(framesDir)}/${path.basename(fp)}`);
      } catch { /* ignore */ }
    }
    return { base64Frames, frameUrls };
  }

  /**
   * Perceptual hash (dHash): resize to 9x8 grayscale and compare adjacent
   * pixels to build a 64-bit signature. Used to skip near-duplicate frames.
   */
  private async dHash(imagePath: string): Promise<string> {
    const dir = path.dirname(imagePath);
    const rawPath = path.join(dir, `hash_${Date.now()}_${Math.random().toString(36).slice(2)}.raw`);
    try {
      await execAsync(
        `ffmpeg -y -i "${imagePath}" -vf "scale=9:8,format=gray" -f rawvideo -pix_fmt gray -frames:v 1 "${rawPath}"`,
        { timeout: 10000 },
      );
      const buf = fs.readFileSync(rawPath);
      if (buf.length < 72) return '';
      let bits = '';
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          bits += buf[y * 9 + x] > buf[y * 9 + x + 1] ? '1' : '0';
        }
      }
      return bits;
    } catch {
      return '';
    } finally {
      try { fs.unlinkSync(rawPath); } catch { /* ignore */ }
    }
  }

  private hamming(a: string, b: string): number {
    if (!a || !b || a.length !== b.length) return 99;
    let d = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) d++;
    }
    return d;
  }

  private async getPageTitle(url: string): Promise<string> {
    try {
      const resp = await axios.get(url, {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      const match = resp.data.match(/<title[^>]*>(.*?)<\/title>/i);
      return match ? match[1].trim() : '';
    } catch { return ''; }
  }

  private buildBasicTemplate(
    name: string | undefined,
    description: string | undefined,
    category: string | undefined,
    analysis: string,
    info: { width: number; height: number; duration: number },
    frames: string[],
    localVideoUrl: string | null,
    sourceUrl: string,
  ) {
    return {
      name: name || '分析结果',
      description: description || analysis.substring(0, 100),
      category: category || '',
      scenes: [
        { name: '开场', duration: 3, description: analysis.substring(0, 80), type: 'image' },
        { name: '主体内容', duration: Math.max(Math.floor(info.duration / 2), 3), description: '核心展示内容', type: 'video' },
        { name: '收尾', duration: 2, description: '结束画面', type: 'text' },
      ],
      variables: [
        { key: 'main_content', label: '主要内容', type: 'textarea', placeholder: '描述视频的核心内容', default_value: analysis.substring(0, 40), required: true },
        { key: 'brand_name', label: '品牌/名称', type: 'text', placeholder: '品牌或产品名称', default_value: '', required: false },
      ],
      reference_url: localVideoUrl || sourceUrl,
      source_url: sourceUrl,
      reference_frames: frames,
      video_info: info,
    };
  }

  // ───── Projects ─────

  async listProjects(userId: number) {
    const items = await this.projectRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });
    const toStatic = (p: string) => {
      const m = p.replace(/\\/g, '/').match(/output\/([^/]+)$/);
      return m ? `/static/${m[1]}` : p;
    };
    return items.map(p => {
      const scenes = p.scenes ? JSON.parse(p.scenes) : [];
      let cover: string | null = null;
      for (const s of scenes) {
        if (s.status !== 'completed') continue;
        if (s.videoPath) { cover = toStatic(s.videoPath); break; }
        if (s.imagePath) { cover = toStatic(s.imagePath); break; }
      }
      if (!cover && p.result_url) cover = p.result_url;
      return {
        ...p,
        variables: p.variables ? JSON.parse(p.variables) : [],
        scenes,
        cover_url: cover,
      };
    });
  }

  async getProjectById(id: number, userId: number) {
    const project = await this.projectRepo.findOne({
      where: { id, user_id: userId },
    });
    if (!project) throw new NotFoundException('项目不存在');

    // Attach the source (original) video URL from the associated template
    let referenceUrl: string | null = null;
    let templateName: string | null = null;
    if (project.template_id) {
      const tpl = await this.templateRepo.findOne({ where: { id: project.template_id } });
      if (tpl) {
        referenceUrl = tpl.reference_url || null;
        templateName = tpl.name || null;
      }
    }

    return {
      ...project,
      variables: project.variables ? JSON.parse(project.variables) : [],
      scenes: project.scenes ? JSON.parse(project.scenes) : [],
      media_refs: project.media_refs ? JSON.parse(project.media_refs) : [],
      reference_url: referenceUrl,
      template_name: templateName,
    };
  }

  async createProject(userId: number, dto: CreateProjectDto) {
    const tpl = await this.templateRepo.findOne({ where: { id: dto.template_id } });
    if (!tpl) throw new NotFoundException('模板不存在');

    let variables: any[];
    try {
      variables = JSON.parse(dto.variables);
    } catch {
      throw new BadRequestException('variables 必须是有效的 JSON');
    }

    const project = this.projectRepo.create({
      user_id: userId,
      template_id: dto.template_id,
      name: dto.name,
      variables: dto.variables,
      scenes: tpl.scenes,
      media_refs: dto.media_refs || undefined,
      ratio: dto.ratio || '9:16',
      resolution: dto.resolution || '720p',
      style: dto.style || 'anime',
      language: dto.language || 'zh',
      status: 'pending',
      progress: 0,
    });

    await this.incrementUsage(dto.template_id);
    return this.projectRepo.save(project);
  }

  async updateProject(id: number, userId: number, dto: UpdateProjectDto) {
    const project = await this.projectRepo.findOne({ where: { id, user_id: userId } });
    if (!project) throw new NotFoundException('项目不存在');
    Object.assign(project, dto);
    return this.projectRepo.save(project);
  }

  async deleteProject(id: number, userId: number) {
    const project = await this.projectRepo.findOne({ where: { id, user_id: userId } });
    if (!project) throw new NotFoundException('项目不存在');

    // Clean up result file if it exists
    if (project.result_url) {
      const m = String(project.result_url).match(/\/static\/([^/]+\.mp4)$/);
      if (m) {
        const fullPath = path.join(this.outputDir, m[1]);
        if (fullPath.startsWith(this.outputDir) && fs.existsSync(fullPath)) {
          fs.rmSync(fullPath, { force: true });
          this.logger.log(`已删除项目结果文件: ${m[1]}`);
        }
      }
    }

    // Clean up persisted scene videos for this project
    try {
      const entries = fs.readdirSync(this.outputDir);
      for (const e of entries) {
        if (e.startsWith(`viral_scene_${id}_`) && e.endsWith('.mp4')) {
          const fullPath = path.join(this.outputDir, e);
          if (fullPath.startsWith(this.outputDir)) {
            fs.rmSync(fullPath, { force: true });
            this.logger.log(`已删除项目场景文件: ${e}`);
          }
        }
      }
    } catch { /* ignore */ }

    await this.projectRepo.remove(project);
    return { deleted: true };
  }

  // ───── Generation ─────

  async startGeneration(projectId: number, userId: number) {
    const project = await this.projectRepo.findOne({ where: { id: projectId, user_id: userId } });
    if (!project) throw new NotFoundException('项目不存在');

    const template = await this.templateRepo.findOne({ where: { id: project.template_id } });
    if (!template) throw new NotFoundException('关联模板不存在');

    // Parse project data
    let scenes: any[];
    let variables: any[];
    try {
      scenes = JSON.parse(project.scenes);
      variables = JSON.parse(project.variables);
    } catch {
      throw new BadRequestException('项目数据格式错误');
    }

    const varMap: Record<string, string> = {};
    for (const v of variables) {
      varMap[v.key] = String(v.value || '');
    }

    // Parse media_refs (reference images from 大资产库) for I2V/R2V generation
    let mediaRefs: Array<{ type: string; url: string }> = [];
    if (project.media_refs) {
      try {
        const parsed = JSON.parse(project.media_refs);
        if (Array.isArray(parsed)) {
          mediaRefs = parsed
            .map((m: any) => typeof m === 'string' ? { type: 'image', url: m } : { type: m.type || 'image', url: m.url || m.image_url })
            .filter((m: any) => m.url);
        }
      } catch {
        this.logger.warn('media_refs 解析失败，忽略');
      }
    }
    if (mediaRefs.length > 0) {
      this.logger.log(`使用 ${mediaRefs.length} 个参考图 (media_refs)`);
    }

    // Update status
    project.status = 'processing';
    project.progress = 0;
    await this.projectRepo.save(project);

    const workDir = path.join(this.outputDir, `viral_gen_${projectId}_${Date.now()}`);
    fs.mkdirSync(workDir, { recursive: true });

    const sceneResults: Array<{ name: string; status: string; videoPath?: string; error?: string }> = [];

    try {
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const sceneResult: any = { name: scene.name, status: 'processing' };
        sceneResults.push(sceneResult);

        try {
          // Substitute variables in description
          let description = scene.description || '';
          for (const [key, val] of Object.entries(varMap)) {
            description = description.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
          }
          // Translate to the project's selected language if not Chinese
          const lang = project.language || 'zh';
          if (lang !== 'zh' && description) {
            try {
              const langName = LANG_NAMES[lang] || lang;
              const translated = await this.aiService.chatCompletion([
                { role: 'system', content: `You are a professional translator for video scene descriptions. Translate the following scene description into ${langName}. Keep product/brand names and proper nouns as-is. Preserve any scene timing or duration hints. Output ONLY the translated text, no quotes.` },
                { role: 'user', content: description.slice(0, 800) },
              ], { temperature: 0.2, maxTokens: 1000 });
              const cleaned = (translated || '').trim().replace(/^["'“”]+|["'“”]+$/g, '');
              if (cleaned) {
                this.logger.log(`Scene ${i} translated to ${lang}: ${cleaned.slice(0, 60)}...`);
                description = cleaned;
              }
            } catch (transErr: any) {
              this.logger.warn(`Scene ${i} translation to ${lang} failed, using original: ${transErr.message}`);
            }
          }

          let videoPath: string | null = null;

          if (scene.type === 'image') {
            // Generate image, then convert to short video
            const urls = await this.aiService.generateImage({
              prompt: `${description}。高质量画面，细节丰富，光影自然，色彩高级`,
              width: project.ratio === '16:9' ? 1280 : project.ratio === '1:1' ? 1024 : 720,
              height: project.ratio === '16:9' ? 720 : project.ratio === '1:1' ? 1024 : 1280,
              style: project.style || 'anime',
              numImages: 1,
            });
            if (urls && urls.length > 0 && urls[0]) {
              videoPath = await this.downloadToLocal(urls[0], workDir, `scene_${i}`);
              if (videoPath) {
                // Convert image to video with duration
                const imgVideoPath = path.join(workDir, `scene_${i}_vid.mp4`);
                await this.ffmpeg['composite']({
                  imagePaths: [videoPath],
                  outputPath: imgVideoPath,
                  duration: scene.duration || 3,
                  fps: 24,
                  resolution: ratioToRes(project.ratio),
                });
                videoPath = imgVideoPath;
              }
            }
          } else if (scene.type === 'video') {
            // Generate video directly (pass media_refs for I2V/R2V when available)
            const url = await this.aiService.generateVideo({
              prompt: `${description}。电影级运镜，画面流畅自然，细节丰富，光影质感好，适合短视频`,
              duration: scene.duration || 5,
              resolution: project.resolution || '720p',
              ratio: project.ratio || '9:16',
              style: project.style || 'anime',
              media: mediaRefs.length > 0 ? mediaRefs : undefined,
            });
            if (url) {
              videoPath = await this.downloadToLocal(url, workDir, `scene_${i}_video`);
            }
          } else if (scene.type === 'text') {
            // Generate text animation video
            videoPath = await this.ffmpeg.generateTextVideo(description, {
              duration: scene.duration || 3,
              resolution: ratioToRes(project.ratio),
              bgColor: '#7C3AED',
              textColor: '#FFFFFF',
              fontSize: 48,
            });
          }

          if (videoPath && fs.existsSync(videoPath)) {
            // Persist scene video outside workDir (workDir gets cleaned in finally,
            // but project.scenes stores videoPath for later re-merge on regenerate)
            const persistedScene = path.join(this.outputDir, `viral_scene_${projectId}_${i}.mp4`);
            try {
              fs.copyFileSync(videoPath, persistedScene);
              sceneResult.videoPath = persistedScene;
            } catch {
              sceneResult.videoPath = videoPath;
            }
            sceneResult.status = 'completed';
          } else {
            sceneResult.status = 'failed';
            sceneResult.error = '生成结果为空';
          }
        } catch (err: any) {
          sceneResult.status = 'failed';
          sceneResult.error = err.message.substring(0, 200);
          this.logger.error(`Scene ${i} (${scene.name}) failed: ${err.message}`);
        }

        // Update progress
        project.progress = Math.round(((i + 1) / scenes.length) * 100);
        project.scenes = JSON.stringify(sceneResults);
        await this.projectRepo.save(project);
      }

      // Step 2: Concatenate all successful scene videos
      const successfulPaths = sceneResults
        .filter(s => s.status === 'completed' && s.videoPath && fs.existsSync(s.videoPath))
        .map(s => s.videoPath!);

      if (successfulPaths.length === 0) {
        project.status = 'failed';
        project.error_msg = '所有场景生成失败';
        await this.projectRepo.save(project);
        return this.sanitizeProject(project);
      }

      // Merge videos
      let mergedPath: string;
      try {
        mergedPath = await this.ffmpeg.mergeVideos(successfulPaths);
      } catch (err: any) {
        this.logger.error(`Merge failed: ${err.message}`);
        // Fallback: use first video as result
        mergedPath = successfulPaths[0];
      }

      // Step 3: Add background music if specified
      const audioConfig = template.audio ? JSON.parse(template.audio) : null;
      if (audioConfig?.bgm_url) {
        try {
          const audioPath = await this.downloadToLocal(audioConfig.bgm_url, workDir, 'bgm');
          if (audioPath) {
            mergedPath = await this.ffmpeg.compositeVideoWithAudio(mergedPath, audioPath);
          }
        } catch (err: any) {
          this.logger.warn(`Background music failed: ${err.message}`);
        }
      }

      // Copy result to static directory
      const finalFilename = `viral_result_${projectId}_${Date.now()}.mp4`;
      const finalPath = path.join(this.outputDir, finalFilename);
      fs.copyFileSync(mergedPath, finalPath);

      project.status = 'completed';
      project.progress = 100;
      project.result_url = `/static/${finalFilename}`;
      project.scenes = JSON.stringify(sceneResults);
      await this.projectRepo.save(project);
    } catch (err: any) {
      project.status = 'failed';
      project.error_msg = err.message.substring(0, 500);
      project.scenes = JSON.stringify(sceneResults);
      await this.projectRepo.save(project);
    } finally {
      // Cleanup temp files
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }

    return this.sanitizeProject(project);
  }

  async regenerateScene(projectId: number, userId: number, sceneIndex: number) {
    const project = await this.projectRepo.findOne({ where: { id: projectId, user_id: userId } });
    if (!project) throw new NotFoundException('项目不存在');

    let scenes: any[];
    let variables: any[];
    try {
      scenes = JSON.parse(project.scenes);
      variables = JSON.parse(project.variables);
    } catch {
      throw new BadRequestException('项目数据格式错误');
    }

    if (sceneIndex < 0 || sceneIndex >= scenes.length) {
      throw new BadRequestException(`场景索引无效: ${sceneIndex}, 共 ${scenes.length} 个场景`);
    }

    const scene = scenes[sceneIndex];
    const varMap: Record<string, string> = {};
    for (const v of variables) varMap[v.key] = String(v.value || '');

    let mediaRefs: Array<{ type: string; url: string }> = [];
    if (project.media_refs) {
      try {
        const parsed = JSON.parse(project.media_refs);
        if (Array.isArray(parsed)) {
          mediaRefs = parsed
            .map((m: any) => typeof m === 'string' ? { type: 'image', url: m } : { type: m.type || 'image', url: m.url || m.image_url })
            .filter((m: any) => m.url);
        }
      } catch {
        this.logger.warn('media_refs 解析失败，忽略');
      }
    }
    if (mediaRefs.length > 0) {
      this.logger.log(`重新生成场景 ${sceneIndex}: 使用 ${mediaRefs.length} 个参考图 (media_refs)`);
    }

    let description = scene.description || '';
    for (const [key, val] of Object.entries(varMap)) {
      description = description.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
    }
    // Translate to the project's selected language if not Chinese
    const lang = project.language || 'zh';
    if (lang !== 'zh' && description) {
      try {
        const langName = LANG_NAMES[lang] || lang;
        const translated = await this.aiService.chatCompletion([
          { role: 'system', content: `You are a professional translator for video scene descriptions. Translate the following scene description into ${langName}. Keep product/brand names and proper nouns as-is. Preserve any scene timing or duration hints. Output ONLY the translated text, no quotes.` },
          { role: 'user', content: description.slice(0, 800) },
        ], { temperature: 0.2, maxTokens: 1000 });
        const cleaned = (translated || '').trim().replace(/^["'“”]+|["'“”]+$/g, '');
        if (cleaned) {
          this.logger.log(`Scene ${sceneIndex} translated to ${lang}: ${cleaned.slice(0, 60)}...`);
          description = cleaned;
        }
      } catch (transErr: any) {
        this.logger.warn(`Scene ${sceneIndex} translation to ${lang} failed, using original: ${transErr.message}`);
      }
    }

    project.status = 'processing';
    await this.projectRepo.save(project);

    const workDir = path.join(this.outputDir, `viral_reg_${projectId}_${sceneIndex}_${Date.now()}`);
    fs.mkdirSync(workDir, { recursive: true });

    try {
      let videoPath: string | null = null;

      if (scene.type === 'image') {
        const urls = await this.aiService.generateImage({
          prompt: `${description}。高质量画面，细节丰富，光影自然，色彩高级`,
          width: project.ratio === '16:9' ? 1280 : project.ratio === '1:1' ? 1024 : 720,
          height: project.ratio === '16:9' ? 720 : project.ratio === '1:1' ? 1024 : 1280,
          style: project.style || 'anime',
          numImages: 1,
        });
        if (urls?.[0]) {
          const imgPath = await this.downloadToLocal(urls[0], workDir, `scene_${sceneIndex}`);
          if (imgPath) {
            const imgVidPath = path.join(workDir, `scene_${sceneIndex}_vid.mp4`);
            await this.ffmpeg['composite']({
              imagePaths: [imgPath],
              outputPath: imgVidPath,
              duration: scene.duration || 3,
              fps: 24,
              resolution: ratioToRes(project.ratio),
            });
            videoPath = imgVidPath;
          }
        }
      } else if (scene.type === 'video') {
        const url = await this.aiService.generateVideo({ prompt: `${description}。电影级运镜，画面流畅自然，细节丰富，光影质感好，适合短视频`, duration: scene.duration || 5, resolution: project.resolution || '720p', ratio: project.ratio || '9:16', style: project.style || 'anime', media: mediaRefs.length > 0 ? mediaRefs : undefined });
        if (url) videoPath = await this.downloadToLocal(url, workDir, `scene_${sceneIndex}_video`);
      } else if (scene.type === 'text') {
        videoPath = await this.ffmpeg.generateTextVideo(description, {
          duration: scene.duration || 3, resolution: ratioToRes(project.ratio),
        });
      }

      if (videoPath && fs.existsSync(videoPath)) {
        // Persist scene video outside workDir so it survives for later re-merges
        const persistedScene = path.join(this.outputDir, `viral_scene_${projectId}_${sceneIndex}.mp4`);
        try {
          fs.copyFileSync(videoPath, persistedScene);
          videoPath = persistedScene;
        } catch { /* keep workDir path as fallback */ }
        scenes[sceneIndex].videoPath = videoPath;
        scenes[sceneIndex].status = 'completed';
        scenes[sceneIndex].error = undefined;
      } else {
        throw new Error('生成结果为空');
      }

      project.scenes = JSON.stringify(scenes);
      project.status = 'processing';
      await this.projectRepo.save(project);

      // Try to re-merge if all scenes are done
      const completedPaths = scenes
        .filter((s: any) => s.status === 'completed' && s.videoPath && fs.existsSync(s.videoPath))
        .map((s: any) => s.videoPath!);

      if (completedPaths.length > 0) {
        try {
          let mergedPath = await this.ffmpeg.mergeVideos(completedPaths);

          // Re-apply background music (consistent with startGeneration)
          const template = await this.templateRepo.findOne({ where: { id: project.template_id } });
          const audioConfig = template?.audio ? JSON.parse(template.audio) : null;
          if (audioConfig?.bgm_url) {
            try {
              const audioPath = await this.downloadToLocal(audioConfig.bgm_url, workDir, 'bgm');
              if (audioPath) {
                mergedPath = await this.ffmpeg.compositeVideoWithAudio(mergedPath, audioPath);
              }
            } catch (err: any) {
              this.logger.warn(`Background music failed: ${err.message}`);
            }
          }

          const finalFilename = `viral_result_${projectId}_${Date.now()}.mp4`;
          const finalPath = path.join(this.outputDir, finalFilename);
          fs.copyFileSync(mergedPath, finalPath);
          project.result_url = `/static/${finalFilename}`;
          project.progress = 100;
          project.status = 'completed';
          await this.projectRepo.save(project);
        } catch {
          project.status = 'processing';
          await this.projectRepo.save(project);
        }
      }
    } catch (err: any) {
      scenes[sceneIndex].status = 'failed';
      scenes[sceneIndex].error = err.message.substring(0, 200);
      project.scenes = JSON.stringify(scenes);
      await this.projectRepo.save(project);
    } finally {
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }

    return this.sanitizeProject(project);
  }

  async getProjectResult(projectId: number, userId: number) {
    const project = await this.projectRepo.findOne({ where: { id: projectId, user_id: userId } });
    if (!project) throw new NotFoundException('项目不存在');
    return { status: project.status, result_url: project.result_url, progress: project.progress };
  }

  private async downloadToLocal(url: string, workDir: string, prefix: string): Promise<string | null> {
    try {
      if (url.startsWith('data:')) return null; // base64, skip
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
      const ext = '.mp4';
      const filename = `${prefix}_${Date.now()}${ext}`;
      const localPath = path.join(workDir, filename);
      fs.writeFileSync(localPath, Buffer.from(response.data));
      return localPath;
    } catch (err: any) {
      this.logger.warn(`Download failed: ${url.substring(0, 80)} - ${err.message}`);
      return null;
    }
  }

  private sanitizeProject(project: ViralProject) {
    return {
      ...project,
      variables: project.variables ? JSON.parse(project.variables) : [],
      scenes: project.scenes ? JSON.parse(project.scenes) : [],
      media_refs: project.media_refs ? JSON.parse(project.media_refs) : [],
    };
  }

  // ───── Stats ─────

  async getStats() {
    const [templateCount, projectCount] = await Promise.all([
      this.templateRepo.count({ where: { status: 'active' } }),
      this.projectRepo.count(),
    ]);
    return { templateCount, projectCount };
  }
}
