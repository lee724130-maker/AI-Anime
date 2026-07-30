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

@Injectable()
export class ViralService {
  private readonly logger = new Logger(ViralService.name);
  private readonly outputDir: string;

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

    const parsed = items.map(t => ({
      ...t,
      tags: t.tags ? JSON.parse(t.tags) : [],
    }));

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

  async createTemplate(dto: CreateTemplateDto) {
    if (!dto.name) throw new BadRequestException('模板名称不能为空');
    const tpl = this.templateRepo.create({
      ...dto,
      tags: dto.tags || '[]',
      scenes: dto.scenes || '[]',
      variables: dto.variables || '[]',
    });
    return this.templateRepo.save(tpl);
  }

  async updateTemplate(id: number, dto: UpdateTemplateDto) {
    const tpl = await this.templateRepo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException('模板不存在');
    Object.assign(tpl, dto);
    return this.templateRepo.save(tpl);
  }

  async deleteTemplate(id: number) {
    const tpl = await this.templateRepo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException('模板不存在');
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
    fs.mkdirSync(workDir, { recursive: true });

    try {
      // Step 1: Download video
      this.logger.log(`下载视频: ${finalUrl}`);
      const videoPath = path.join(workDir, 'source.mp4');
      await this.downloadVideo(finalUrl, videoPath);

      // Step 2: Get video info
      const info = await this.getVideoInfo(videoPath);
      this.logger.log(`视频信息: ${info.width}x${info.height}, ${info.duration.toFixed(1)}s`);

      // Step 3: Extract keyframes
      const frameCount = Math.min(Math.max(Math.floor(info.duration / 2), 3), 10);
      const frames = await this.extractFrames(videoPath, workDir, frameCount);
      this.logger.log(`提取 ${frames.length} 帧关键帧`);

      // Step 4: Analyze with multimodal LLM
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
      "required": true
    }
  ]
}

注意：
- scenes 是分镜数组，每个场景包含 name(中文)、duration(秒)、description(中文描述)、type(image/video/text)
- variables 是用户需要填写的变量，例如产品名称、广告语等
- 场景数量控制在 3-6 个之间
- 总时长控制在 8-15 秒之间
- category 不限于固定列表，根据视频实际内容动态判断，例如：美食测评、游戏解说、情感故事、产品开箱、旅游vlog、影视剪辑等`;

      const userPrompt = `请分析这个视频的结构，识别出场景分镜和需要用户填写的变量。视频时长约 ${info.duration.toFixed(0)} 秒，分辨率 ${info.width}x${info.height}。`;

      let llmResult = '';
      try {
        llmResult = await this.aiService.chatCompletion([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ], { temperature: 0.3, maxTokens: 2048 });
      } catch (err: any) {
        this.logger.warn(`纯文本分析失败，尝试多模态: ${err.message}`);
        // Fallback: try multimodal with frames (if available)
        if (frames.length > 0) {
          try {
            llmResult = await this.aiService.generateSmartDescription(frames);
            return this.buildBasicTemplate(name, description, category, llmResult, info, frames);
          } catch (err2: any) {
            this.logger.warn(`多模态分析也失败: ${err2.message}`);
          }
        }
        // Ultimate fallback: return a basic template
        return this.buildBasicTemplate(name, description, category, '', info, []);
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

      return {
        name: name || parsed.name || '未命名模板',
        description: description || parsed.description || '',
        category: category || parsed.category || 'general',
        scenes: parsed.scenes || [],
        variables: parsed.variables || [],
        reference_url: finalUrl,
        reference_frames: frames,
        video_info: info,
      };
    } finally {
      // Cleanup temp files
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  private async downloadVideo(url: string, outputPath: string): Promise<void> {
    // Try yt-dlp first (handles Douyin, YouTube, Bilibili, etc.)
    try {
      execSync(`yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" -o "${outputPath}" "${url}"`, {
        timeout: 120000,
        stdio: 'pipe',
      });
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) return;
    } catch (err: any) {
      this.logger.warn(`yt-dlp 下载失败: ${err.message}，尝试 Playwright 降级`);
    }

    // Fallback: Playwright headless browser (handles Douyin/TikTok requiring cookies)
    let playwrightVideoUrl: string | null = null;
    let browserRef: any = null;
    try {
      const browser = await chromium.launch({ headless: true });
      browserRef = browser;
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
        locale: 'zh-CN',
        viewport: { width: 390, height: 844 },
      });
      const page = await context.newPage();

      // Intercept network responses to find video content
      page.on('response', (response) => {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.startsWith('video/') && !playwrightVideoUrl) {
          playwrightVideoUrl = response.url();
          this.logger.log(`Playwright: 从网络请求捕获视频 URL: ${playwrightVideoUrl.substring(0, 100)}`);
        }
      });

      this.logger.log(`Playwright: 打开页面 ${url}`);
      // Use domcontentloaded + short timeout + manual wait (networkidle never completes for Douyin)
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(5000);

      // Try to extract video URL from <video> elements
      if (!playwrightVideoUrl) {
        playwrightVideoUrl = await page.evaluate(() => {
          const videos = document.querySelectorAll('video');
          for (const v of videos) {
            const src = (v as HTMLVideoElement).src;
            if (src && src.startsWith('http')) return src;
          }
          return null;
        }).catch(() => null);
      }

      // Try to extract from page source (Douyin embeds video URL in script data)
      if (!playwrightVideoUrl) {
        playwrightVideoUrl = await page.evaluate(() => {
          const html = document.documentElement.innerHTML;
          const patterns = [
            // Douyin: play_addr → url_list
            /"play_addr":(?:\{[^}]*\}|[^}]*\{[^}]*"url_list":\["([^"]+\.(?:mp4|m3u8)[^"]*)")/,
            /"play_api":"([^"]+\.(?:mp4|m3u8)[^"]*)/,
            // Generic: mp4/m3u8 URLs
            /https?:\/\/[^"'\s>]*\.(mp4|m3u8)[^"'\s>]*/gi,
            // video src attribute
            /<video[^>]*src="([^"]+)"/,
            // Douyin render_data
            /"video":\s*\{[^}]*"src":\s*"([^"]+)"/,
          ];
          for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) {
              const url = match[1] || match[0];
              // Skip placeholder/empty URLs
              if (url && url.includes('.mp4') && !url.includes('uuu_265') && !url.includes('placeholder')) return url;
            }
          }
          return null;
        }).catch(() => null);
      }

      await browser.close().catch(() => {});
      browserRef = null;

      if (playwrightVideoUrl) {
        this.logger.log(`Playwright: 下载视频 ${playwrightVideoUrl.substring(0, 80)}`);
        const resp = await axios.get(playwrightVideoUrl, {
          responseType: 'arraybuffer',
          timeout: 120000,
          headers: { 'Referer': url, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        fs.writeFileSync(outputPath, Buffer.from(resp.data));
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) return;
      }
    } catch (err: any) {
      this.logger.warn(`Playwright 下载失败: ${err.message}`);
    } finally {
      if (browserRef) try { await browserRef.close(); } catch { /* ignore */ }
    }

    // Last resort: direct download (for direct MP4 URLs)
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 120000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    fs.writeFileSync(outputPath, Buffer.from(response.data));
  }

  private async getVideoInfo(videoPath: string): Promise<{ width: number; height: number; duration: number }> {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries stream=width,height,duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
        { timeout: 10000 },
      );
      const lines = stdout.trim().split('\n').map(Number);
      return {
        width: lines[0] || 0,
        height: lines[1] || 0,
        duration: lines[2] || 5,
      };
    } catch {
      return { width: 0, height: 0, duration: 5 };
    }
  }

  private async extractFrames(videoPath: string, outputDir: string, count: number): Promise<string[]> {
    const framePaths: string[] = [];
    for (let i = 0; i < count; i++) {
      const framePath = path.join(outputDir, `frame_${i}.jpg`);
      try {
        await execAsync(
          `ffmpeg -y -i "${videoPath}" -vf "select='gte(n\\,${i * Math.floor(30 * count / count)})'" -vframes 1 -q:v 2 "${framePath}"`,
          { timeout: 30000 },
        );
        if (fs.existsSync(framePath) && fs.statSync(framePath).size > 0) {
          framePaths.push(framePath);
        }
      } catch { /* skip failed frames */ }
    }

    // If the sequential method failed, use scene detect as fallback
    if (framePaths.length < 2) {
      try {
        await execAsync(
          `ffmpeg -y -i "${videoPath}" -vf "select='gt(scene\\,0.1)',setpts=N/FRAME_RATE/TB" -vsync vfr -q:v 2 "${path.join(outputDir, 'scene_%03d.jpg')}"`,
          { timeout: 30000 },
        );
        for (let i = 0; i < count; i++) {
          const fp = path.join(outputDir, `scene_${String(i).padStart(3, '0')}.jpg`);
          if (fs.existsSync(fp) && fs.statSync(fp).size > 0) {
            framePaths.push(fp);
          }
        }
      } catch { /* ignore */ }
    }

    // Convert local paths to base64 for API call
    const base64Frames: string[] = [];
    for (const fp of framePaths.slice(0, 8)) {
      try {
        const buffer = fs.readFileSync(fp);
        const base64 = buffer.toString('base64');
        base64Frames.push(`data:image/jpeg;base64,${base64}`);
      } catch { /* ignore */ }
    }
    return base64Frames;
  }

  private buildBasicTemplate(
    name: string | undefined,
    description: string | undefined,
    category: string | undefined,
    analysis: string,
    info: { width: number; height: number; duration: number },
    frames: string[],
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
        { key: 'main_content', label: '主要内容', type: 'textarea', placeholder: '描述视频的核心内容', required: true },
        { key: 'brand_name', label: '品牌/名称', type: 'text', placeholder: '品牌或产品名称', required: false },
      ],
      reference_url: '',
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
    return items.map(p => ({
      ...p,
      variables: p.variables ? JSON.parse(p.variables) : [],
      scenes: p.scenes ? JSON.parse(p.scenes) : [],
    }));
  }

  async getProjectById(id: number, userId: number) {
    const project = await this.projectRepo.findOne({
      where: { id, user_id: userId },
    });
    if (!project) throw new NotFoundException('项目不存在');
    return {
      ...project,
      variables: project.variables ? JSON.parse(project.variables) : [],
      scenes: project.scenes ? JSON.parse(project.scenes) : [],
      media_refs: project.media_refs ? JSON.parse(project.media_refs) : [],
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

          let videoPath: string | null = null;

          if (scene.type === 'image') {
            // Generate image, then convert to short video
            const urls = await this.aiService.generateImage({
              prompt: description,
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
                  resolution: '1080x1920',
                });
                videoPath = imgVideoPath;
              }
            }
          } else if (scene.type === 'video') {
            // Generate video directly
            const url = await this.aiService.generateVideo({
              prompt: description,
              duration: scene.duration || 5,
              resolution: '1080x1920',
            });
            if (url) {
              videoPath = await this.downloadToLocal(url, workDir, `scene_${i}_video`);
            }
          } else if (scene.type === 'text') {
            // Generate text animation video
            videoPath = await this.ffmpeg.generateTextVideo(description, {
              duration: scene.duration || 3,
              resolution: '1080x1920',
              bgColor: '#1a1a2e',
              textColor: '#FFFFFF',
              fontSize: 48,
            });
          }

          if (videoPath && fs.existsSync(videoPath)) {
            sceneResult.videoPath = videoPath;
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

    let description = scene.description || '';
    for (const [key, val] of Object.entries(varMap)) {
      description = description.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
    }

    project.status = 'processing';
    await this.projectRepo.save(project);

    const workDir = path.join(this.outputDir, `viral_reg_${projectId}_${sceneIndex}_${Date.now()}`);
    fs.mkdirSync(workDir, { recursive: true });

    try {
      let videoPath: string | null = null;

      if (scene.type === 'image') {
        const urls = await this.aiService.generateImage({ prompt: description, numImages: 1 });
        if (urls?.[0]) {
          const imgPath = await this.downloadToLocal(urls[0], workDir, `scene_${sceneIndex}`);
          if (imgPath) {
            const imgVidPath = path.join(workDir, `scene_${sceneIndex}_vid.mp4`);
            await this.ffmpeg['composite']({
              imagePaths: [imgPath],
              outputPath: imgVidPath,
              duration: scene.duration || 3,
              fps: 24,
              resolution: '1080x1920',
            });
            videoPath = imgVidPath;
          }
        }
      } else if (scene.type === 'video') {
        const url = await this.aiService.generateVideo({ prompt: description, duration: scene.duration || 5, resolution: '1080x1920' });
        if (url) videoPath = await this.downloadToLocal(url, workDir, `scene_${sceneIndex}_video`);
      } else if (scene.type === 'text') {
        videoPath = await this.ffmpeg.generateTextVideo(description, {
          duration: scene.duration || 3, resolution: '1080x1920',
        });
      }

      if (videoPath && fs.existsSync(videoPath)) {
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
