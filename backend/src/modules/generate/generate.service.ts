import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository, InjectEntityManager } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { AIServiceUtil } from '../../utils/ai-service.util';
import { ModelConfigService } from '../admin/model-config.service';
import { MediaFile } from '../media/media-file.entity';
import { GenerationTask } from '../task/generation-task.entity';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
const execFileAsync = promisify(execFile);

@Injectable()
export class GenerateService {
  private readonly logger = new Logger(GenerateService.name);

  constructor(
    private readonly aiService: AIServiceUtil,
    private readonly modelConfigService: ModelConfigService,
    @InjectRepository(MediaFile)
    private readonly mediaRepo: Repository<MediaFile>,
    @InjectRepository(GenerationTask)
    private readonly taskRepo: Repository<GenerationTask>,
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  async textToImage(userId: number, dto: {
    prompt: string;
    style?: string;
    num_images?: number;
    model?: string;
    width?: number;
    height?: number;
  }) {
    const { prompt, style, num_images, model } = dto;
    if (!prompt) throw new BadRequestException('请输入描述');

    let expandedPrompt = prompt;
    if (prompt.length < 15) {
      try {
        const systemPrompt = `你是一个AI绘图Prompt扩写专家，对各类动漫、游戏、小说角色了如指掌。

用户会输入简短的关键词（如角色名、作品名等），你需要：

1. 调用你的知识库，补全角色的完整视觉特征：
   - 外貌：发色、发型、瞳色、肤色、脸型、体型
   - 服装：上衣、下装、外套、鞋子、饰品、武器/道具
   - 气质：冷酷、温柔、英气、可爱等

2. 补充场景和构图：
   - 背景环境、光影氛围
   - 视角（全身/半身/特写）、构图
   - 画风（日系动画风、厚涂、赛璐璐、写实等）

3. 输出一段50-150字的纯描述文本，直接用作文生图模型的提示词

4. 规则：
   - 如果确定角色设定，按准确设定描述
   - 如果不确定某些细节，用合理且美观的创作填补，不要写"不确定"
   - 直接输出描述，不要任何解释、前缀、引号`;
        const expanded = await this.aiService.chatCompletion([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `请扩写以下关键词，生成详细的视觉描述：${prompt}` },
        ], { temperature: 0.7, maxTokens: 500 });
        if (expanded && expanded.length > prompt.length) {
          expandedPrompt = expanded;
          this.logger.log(`Prompt auto-expanded: "${prompt}" → "${expanded.slice(0, 100)}..."`);
        }
      } catch (err: any) {
        this.logger.warn(`Prompt expansion failed, using original: ${err.message}`);
      }
    }

    let modelName = model || '';
    if (model) {
      const models = await this.modelConfigService.findActive('image');
      const match = models.find((m: any) => m.model_id === model);
      if (!match) throw new BadRequestException(`模型 ${model} 不存在或未启用`);
      modelName = match.model_name;
    }

    const task = await this.taskRepo.save({
      user_id: userId,
      type: 'image',
      status: 'processing',
      model_name: modelName,
      input_data: JSON.stringify(dto),
    });

    dto.prompt = expandedPrompt;

    const viewConfigs: Array<{ label: string; promptSuffix: string }> = [];
    const count = num_images || 1;
    if (count === 1) {
      viewConfigs.push({ label: '正面', promptSuffix: '' });
    } else if (count === 2) {
      viewConfigs.push({ label: '正面', promptSuffix: ', front view, character facing camera, full body' });
      viewConfigs.push({ label: '背面', promptSuffix: ', back view, character facing away, showing full back' });
    } else if (count === 4) {
      viewConfigs.push({ label: '正面', promptSuffix: ', front view, character facing camera, full body' });
      viewConfigs.push({ label: '背面', promptSuffix: ', back view, character facing away, showing full back' });
      viewConfigs.push({ label: '左侧', promptSuffix: ', left side view, character facing left, full body profile' });
      viewConfigs.push({ label: '右侧', promptSuffix: ', right side view, character facing right, full body profile' });
    }

    try {
      const results: any[] = [];
      for (const view of viewConfigs) {
        const viewPrompt = expandedPrompt + view.promptSuffix;
        const urls = await this.aiService.generateImage({
          prompt: viewPrompt,
          style: style || 'anime',
          numImages: 1,
          width: dto.width || 1080,
          height: dto.height || 1920,
          model: model || undefined,
        });
        for (const url of urls) {
          const localUrl = await this.downloadToLocal(url, `img_${task.id}_${view.label}`);
          const file = await this.mediaRepo.save({
            user_id: userId,
            task_id: task.id,
            type: 'image',
            url: localUrl,
            original_name: path.basename(localUrl),
            mime_type: 'image/png',
          });
          results.push({ id: file.id, url: localUrl, view: view.label });
        }
      }

      task.status = 'completed';
      task.output_data = JSON.stringify(results);
      task.completed_at = new Date();
      await this.taskRepo.save(task);

      return { taskId: task.id, images: results };
    } catch (err: any) {
      task.status = 'failed';
      task.error_msg = err.message;
      task.completed_at = new Date();
      await this.taskRepo.save(task);
      throw new BadRequestException(`图片生成失败: ${err.message}`);
    }
  }

  async textToVideo(userId: number, dto: {
    prompt: string;
    style?: string;
    resolution?: string;
    ratio?: string;
    duration?: number;
    model?: string;
  }) {
    const { prompt, style, resolution, ratio, duration, model } = dto;
    if (!prompt) throw new BadRequestException('请输入描述');

    let modelName = model || '';
    if (model) {
      const models = await this.modelConfigService.findActive('video', 't2v');
      const match = models.find((m: any) => m.model_id === model);
      if (!match) throw new BadRequestException(`模型 ${model} 不存在或未启用`);
      modelName = match.model_name;
    }

    const task = await this.taskRepo.save({
      user_id: userId,
      type: 'video',
      status: 'processing',
      model_name: modelName,
      input_data: JSON.stringify(dto),
    });

    try {
      const videoUrl = await this.aiService.generateVideo({
        imageUrl: '',
        prompt,
        duration: duration || 5,
        resolution: resolution || '720p',
        ratio: ratio || '9:16',
        model: model || '',
        videoType: 't2v',
      }, prompt);

      const localUrl = await this.downloadToLocal(videoUrl, `vid_${task.id}`);
      const file = await this.mediaRepo.save({
        user_id: userId,
        task_id: task.id,
        type: 'video',
        url: localUrl,
        original_name: path.basename(localUrl),
        mime_type: 'video/mp4',
      });

      task.status = 'completed';
      task.output_data = JSON.stringify({ id: file.id, url: localUrl });
      task.completed_at = new Date();
      await this.taskRepo.save(task);

      return { taskId: task.id, video: { id: file.id, url: localUrl } };
    } catch (err: any) {
      task.status = 'failed';
      task.error_msg = err.message;
      task.completed_at = new Date();
      await this.taskRepo.save(task);
      throw new BadRequestException(`视频生成失败: ${err.message}`);
    }
  }

  async imageToVideo(userId: number, dto: {
    image_url: string;
    media?: Array<{ type: string; url: string }>;
    prompt?: string;
    style?: string;
    resolution?: string;
    ratio?: string;
    duration?: number;
    model?: string;
  }) {
    const { image_url, media, prompt, style, resolution, ratio, duration, model } = dto;
    if (!image_url && (!media || media.length === 0)) throw new BadRequestException('请提供参考图片');

    let modelName = model || '';
    if (model) {
      const models = await this.modelConfigService.findActive('video', 'i2v');
      const match = models.find((m: any) => m.model_id === model);
      if (!match) throw new BadRequestException(`模型 ${model} 不存在或未启用`);
      modelName = match.model_name;
    }

    const task = await this.taskRepo.save({
      user_id: userId,
      type: 'video',
      source: 'image_to_video',
      status: 'processing',
      model_name: modelName,
      input_data: JSON.stringify(dto),
    });

    try {
      // 自动判断使用 I2V 还是 R2V
      const videoType = media && media.length > 1 ? 'r2v' : 'i2v';
      const videoUrl = await this.aiService.generateVideo({
        imageUrl: image_url,
        media: media,
        prompt: prompt || '',
        duration: duration || 5,
        resolution: resolution || '720p',
        ratio: ratio || '9:16',
        model: model || '',
        videoType,
      }, prompt);

      const localUrl = await this.downloadToLocal(videoUrl, `i2v_${task.id}`);
      const file = await this.mediaRepo.save({
        user_id: userId,
        task_id: task.id,
        type: 'video',
        url: localUrl,
        original_name: path.basename(localUrl),
        mime_type: 'video/mp4',
      });

      task.status = 'completed';
      task.output_data = JSON.stringify({ id: file.id, url: localUrl });
      task.completed_at = new Date();
      await this.taskRepo.save(task);

      return { taskId: task.id, video: { id: file.id, url: localUrl } };
    } catch (err: any) {
      task.status = 'failed';
      task.error_msg = err.message;
      task.completed_at = new Date();
      await this.taskRepo.save(task);
      throw new BadRequestException(`视频生成失败: ${err.message}`);
    }
  }

  async listTasks(userId: number, page = 1, limit = 20) {
    const [items, total] = await this.taskRepo.findAndCount({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async retryTask(userId: number, taskId: number) {
    const task = await this.taskRepo.findOne({ where: { id: taskId, user_id: userId } });
    if (!task) throw new BadRequestException('任务不存在');
    if (task.status !== 'failed') throw new BadRequestException('只能重试失败的任务');

    const input = JSON.parse(task.input_data || '{}');
    task.status = 'pending';
    task.error_msg = '';
    task.completed_at = undefined as any;
    await this.taskRepo.save(task);

    if (task.type === 'image') {
      return this.textToImage(userId, input);
    }
    if (task.type === 'video') {
      if (input.image_url) {
        return this.imageToVideo(userId, input);
      }
      return this.textToVideo(userId, input);
    }
    throw new BadRequestException('不支持的任务类型');
  }

  async smartDescribe(userId: number, dto: { images: string[] }) {
    const { images } = dto;
    if (!images || images.length === 0) {
      throw new BadRequestException('请提供至少一张图片');
    }
    if (images.length > 9) {
      throw new BadRequestException('最多支持9张图片');
    }

    try {
      const description = await this.aiService.generateSmartDescription(images);
      return { description };
    } catch (err: any) {
      throw new BadRequestException(`智能描述生成失败: ${err.message}`);
    }
  }

  // ─── 百度百科搜索 ──────────────────────────────────
  private async searchBaike(keyword: string): Promise<string | null> {
    try {
      const name = keyword.replace(/角色|人物|鸣潮|原神|崩坏|星穹铁道/gi, '').trim() || keyword;
      const nameClean = encodeURIComponent(name);
      const urls = [
        `https://baike.baidu.com/item/${nameClean}`,
        `https://baike.baidu.com/view/${nameClean}`,
      ];
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://baike.baidu.com/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      };

      // 方案1: axios 直接请求
      let text = '';
      for (const url of urls) {
        this.logger.log(`[百度百科] axios 尝试: ${url}`);
        try {
          const resp = await axios.get(url, { timeout: 8000, headers });
          if (resp.status !== 200) continue;
          const html: string = resp.data;
          const metaMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
          if (metaMatch) text += metaMatch[1] + ' ';
          const paraRegex = /<div\s+class="para"[^>]*>([\s\S]*?)<\/div>/gi;
          let m; let c = 0;
          while ((m = paraRegex.exec(html)) !== null && c < 5) {
            const clean = m[1].replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').trim();
            if (clean.length > 20) { text += clean + ' '; c++; }
          }
          text = text.replace(/\s+/g, ' ').trim();
          if (text.length >= 30) break;
          text = '';
        } catch { continue; }
      }

      // 方案2: axios 失败，降级 Playwright 无头浏览器
      if (text.length < 30) {
        this.logger.log(`[百度百科] axios 失败，降级 Playwright 无头浏览器: ${name}`);
        try {
          const scriptPath = path.join(__dirname, '..', '..', '..', 'scripts', 'baike-fetcher.js');
          const { stdout } = await execFileAsync('node', [scriptPath, name], { timeout: 30000 });
          const out = stdout.trim();
          if (out.length >= 30) {
            text = out;
            this.logger.log(`[百度百科] Playwright 获取到 ${text.length} 字`);
          }
        } catch (e: any) {
          this.logger.warn(`[百度百科] Playwright 也失败: ${e.message}`);
        }
      }

      if (text.length < 30) {
        this.logger.warn(`[百度百科] 内容太少(${text.length}字)，跳过`);
        return null;
      }
      this.logger.log(`[百度百科] 获取到 ${text.length} 字: ${text.slice(0, 100)}...`);
      return text;
    } catch (err: any) {
      this.logger.warn(`[百度百科] 搜索失败: ${err.message}`);
      return null;
    }
  }

  // ─── T2I 策略：文字→图片 ─────────────────────────────
  private async handleT2i(prompt: string, images?: string[]) {
    this.logger.log(`[T2I] 文字→图片智能规划: "${prompt}"`);

    let imageDescription = '';
    if (images && images.length > 0) {
      try { imageDescription = await this.aiService.generateSmartDescription(images); }
      catch (err) { this.logger.warn(`[T2I] 图片分析失败: ${err.message}`); }
    }

    // 第一步：尝试百度百科获取真实资料
    const baikeData = await this.searchBaike(prompt);
    let referenceText = '';
    if (baikeData) {
      referenceText = `以下是从百度百科获取的角色资料（真实来源，优先采用）：\n${baikeData}`;
      if (imageDescription) referenceText += `\n\n以下是从用户提供的图片中提取的内容：\n${imageDescription}`;
    } else if (imageDescription) {
      referenceText = `以下是从用户提供的图片中提取的内容：\n${imageDescription}`;
    }

    if (referenceText) {
      // 有真实资料，直接基于资料生成 prompt
      const buildPrompt = `你是一个AI绘图Prompt构建专家。

用户提供了角色的真实资料（来自百度百科或参考图片）。你需要基于这些资料，生成一段高质量的文生图模型提示词。

要求：
1. 必须严格基于提供的资料描述角色，不要额外编造
2. 如果资料信息不足，用泛化描述填补（如"身着某风格服装"），不要编造具体细节
3. 补全构图信息：视角（全身/半身/特写）、光线风格、画风（日系动画/厚涂/赛璐璐/写实）
4. 输出150-300字，直接作为文生图提示词
5. 不要解释、不要引号、不要前缀`;

      return await this.aiService.chatCompletion([
        { role: 'system', content: buildPrompt },
        { role: 'user', content: `${referenceText}\n\n用户关键词：${prompt}\n\n请基于以上资料，生成一段文生图提示词。` }
      ], { temperature: 0.5, maxTokens: 1500 });
    }

    // 第二步：没有百科资料，用 LLM 知识分析
    const analysisPrompt = `你是一个动漫游戏角色分析专家。用户输入一个角色名或关键词，你需要：

1. 先回忆你对这个角色的所有认知（来自训练数据）
2. 逐项列出以下细节，并用【确定】/【推测】标注你的确信度：

【外貌】发色、发型、瞳色、肤色、脸型、身高体型、特殊特征
【服装】上衣款式及颜色、下装、鞋履、首饰、武器/道具
【气质】表情、神态、常见姿态、标志性动作
【场景】常见的背景设定、光影氛围
【画风】该角色所属作品的艺术风格

格式要求：
- 【确定】表示你有明确的训练数据依据
- 【推测】表示你的合理推断
- 最后用一句话总结你最确定的5个核心特征`;

    const analysisResult = await this.aiService.chatCompletion([
      { role: 'system', content: analysisPrompt },
      { role: 'user', content: `请分析角色：${prompt}\n\n基于你的训练数据，逐项标注确定和推测的细节。` }
    ], { temperature: 0.3, maxTokens: 1000 });

    this.logger.log(`[T2I] LLM分析结果: ${analysisResult?.slice(0, 200)}...`);

    // 第三步：基于分析结果生成 prompt
    const buildPrompt = `你是一个AI绘图Prompt构建专家。

你会收到一份角色分析报告，其中标注了【确定】和【推测】的细节。

构建规则：
1. 【确定】的细节原样保留，优先放在前面
2. 【推测】的细节用更泛化的描述（如"深色系服装"而非具体颜色）
3. 不确定的细节不要编造具体数字/颜色/名称
4. 补全构图信息：视角、光线风格、画风
5. 输出150-300字，直接作为文生图提示词
6. 不要标注【确定】/【推测】标记，不要解释、不要引号、不要前缀`;

    return await this.aiService.chatCompletion([
      { role: 'system', content: buildPrompt },
      { role: 'user', content: `角色分析报告：\n${analysisResult}\n\n请基于以上分析，生成一段高质量文生图提示词。` }
    ], { temperature: 0.5, maxTokens: 1500 });
  }

  // ─── T2V 策略：文字→视频 ─────────────────────────────
  private async handleT2v(prompt: string, images?: string[]) {
    this.logger.log(`[T2V] 文字→视频智能规划: "${prompt}"`);

    let imageDescription = '';
    if (images && images.length > 0) {
      try { imageDescription = await this.aiService.generateSmartDescription(images); }
      catch (err) { this.logger.warn(`[T2V] 图片分析失败: ${err.message}`); }
    }

    const systemPrompt = `你是一个AI视频分镜创意专家。

用户输入一段创意描述，你将其扩展成适合视频生成的动态场景描述。

请包含以下要素：
1. 场景设定：时间、地点、环境氛围（如黄昏街道、晨雾森林）
2. 角色动态：出场方式、动作流程、表情变化（至少2个关键帧变化）
3. 镜头语言：景别（远景/中景/特写）、运镜方式（推/拉/摇/移/环绕）
4. 光线氛围：光线变化、色调、特效（雨/雪/光晕/粒子）

规则：
- 突出"动态"——这要用于生成视频，不是静态图片
- 保持用户核心理念不变
- 100-200字
- 如果提供了图片分析结果，必须结合图片内容`;

    return await this.aiService.chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: imageDescription
        ? `图片内容分析：${imageDescription}\n\n用户创意：${prompt}\n\n请结合图片内容和用户创意，生成一段详细的视频分镜描述。`
        : `用户创意：${prompt}\n\n请将这个简短的创意扩展成一段详细的视频分镜描述，包含场景、角色动态、镜头运动等。` }
    ], { temperature: 0.7, maxTokens: 1500 });
  }

  // ─── I2V 策略：图片→视频 ─────────────────────────────
  private async handleI2v(prompt: string, images?: string[]) {
    this.logger.log(`[I2V] 图片→视频智能规划: "${prompt}"`);

    if (!images || images.length === 0) {
      this.logger.warn('[I2V] 没有参考图片，降级为T2V');
      return this.handleT2v(prompt);
    }

    let imageDescription = '';
    try { imageDescription = await this.aiService.generateSmartDescription(images); }
    catch (err) { this.logger.warn(`[I2V] 图片分析失败: ${err.message}`); }

    if (!imageDescription) {
      this.logger.warn('[I2V] 图片分析无结果，降级为T2V');
      return this.handleT2v(prompt);
    }

    const systemPrompt = `你是一个AI视频动作指导专家。用户提供了参考图片的分析结果和一段文字描述。

你需要基于图片分析结果，规划一段连贯的视频动作描述，让图片内容"动起来"。

请包含以下要素：
1. 画面主体：保持与参考图一致的角色位置、姿态、表情
2. 动作设计：以细微动作为主（转头、眨眼、呼吸起伏、衣摆飘动、发丝飘动）
3. 镜头调度：缓慢推近、环绕、平移（避免剧烈运动）
4. 氛围延续：保持参考图的光影、色调、环境一致性

规则：
- 必须保持角色形象和场景与参考图一致
- 动作要自然流畅，避免剧烈变化
- 如果用户有文字描述，结合描述规划具体动作
- 100-200字`;

    return await this.aiService.chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `图片内容分析：${imageDescription}\n\n用户描述：${prompt}\n\n请结合图片内容，规划一段自然的视频动作描述。` }
    ], { temperature: 0.7, maxTokens: 1500 });
  }

  // ─── 智能规划主入口：三路分发 ─────────────────────────
  async smartPlan(userId: number, dto: { prompt: string; images?: string[]; mode?: string }) {
    const { prompt, images } = dto;
    const mode = dto.mode || 't2i';
    if (!prompt || prompt.trim().length < 2) {
      throw new BadRequestException('请提供至少2个字的描述');
    }

    try {
      let enhancedPrompt: string | undefined;

      switch (mode) {
        case 't2i':
          enhancedPrompt = await this.handleT2i(prompt, images);
          break;
        case 't2v':
          enhancedPrompt = await this.handleT2v(prompt, images);
          break;
        case 'i2v':
          enhancedPrompt = await this.handleI2v(prompt, images);
          break;
        default:
          enhancedPrompt = await this.handleT2i(prompt, images);
      }

      return {
        prompt: enhancedPrompt || prompt,
        original_prompt: prompt,
        mode,
      };
    } catch (err: any) {
      this.logger.error(`[${mode}] 智能规划失败: ${err.message}`);
      return { prompt, original_prompt: prompt, mode };
    }
  }

  async deleteTask(userId: number, taskId: number) {
    const task = await this.taskRepo.findOne({ where: { id: taskId, user_id: userId } });
    if (!task) throw new BadRequestException('任务不存在');

    const outputDir = path.resolve(process.cwd(), 'output');

    const deleteFiles = (data: any) => {
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
          try { if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); this.logger.log(`Deleted file: ${path.basename(url)}`); } }
          catch (e: any) { this.logger.warn(`Failed to delete file ${url}: ${e.message}`); }
        }
      }
    };

    deleteFiles(task.output_data);

    await this.entityManager.query('DELETE FROM task_events WHERE task_id = ?', [taskId]);

    await this.mediaRepo.delete({ task_id: taskId });

    await this.taskRepo.delete({ id: taskId, user_id: userId });

    this.logger.log(`Task ${taskId} and associated data deleted by user ${userId}`);
    return { message: '删除成功' };
  }

  private async downloadToLocal(url: string, prefix: string): Promise<string> {
    if (!url.startsWith('http')) return url;
    const outputDir = path.resolve(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const ext = path.extname(url.split('?')[0]) || '.mp4';
    const filename = `${prefix}_${Date.now()}${ext}`;
    const localPath = path.join(outputDir, filename);
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
      fs.writeFileSync(localPath, Buffer.from(response.data));
      this.logger.log(`Downloaded to local: ${filename}`);
      return `/static/${filename}`;
    } catch (err: any) {
      this.logger.warn(`Download failed, using original URL: ${err.message}`);
      return url;
    }
  }
}
