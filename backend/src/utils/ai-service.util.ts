import { Injectable, Logger } from '@nestjs/common';
import { AdminService } from '../modules/admin/admin.service';
import { ModelConfigService } from '../modules/admin/model-config.service';
import axios, { AxiosInstance } from 'axios';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface ImageGenerationOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  style?: string;
  numImages?: number;
  model?: string;
}

export interface VideoGenerationOptions {
  imageUrl?: string;
  media?: Array<{ type: string; url: string }>;
  prompt?: string;
  duration?: number;
  fps?: number;
  resolution?: string;
  ratio?: string;
  style?: string;
  model?: string;
}

export interface TTSOptions {
  text: string;
  voice?: string;
  speed?: number;
  emotion?: string;
}

@Injectable()
export class AIServiceUtil {
  private readonly logger = new Logger(AIServiceUtil.name);
  private clients: Map<string, AxiosInstance> = new Map();

  constructor(
    private readonly adminService: AdminService,
    private readonly modelConfigService: ModelConfigService,
  ) {}

  private async getActiveModels(capability: string) {
    return this.modelConfigService.findActive(capability);
  }

  private validateModelParams(model: any, options: { resolution?: string; ratio?: string; duration?: number }) {
    const errors: string[] = [];
    if (model.supported_resolutions) {
      const resolutions = JSON.parse(model.supported_resolutions);
      if (options.resolution && !resolutions.includes(options.resolution)) {
        errors.push(`分辨率 ${options.resolution} 不被 ${model.model_name} 支持（支持: ${resolutions.join(', ')}）`);
      }
    }
    if (model.supported_ratios) {
      const ratios = JSON.parse(model.supported_ratios);
      if (options.ratio && !ratios.includes(options.ratio)) {
        errors.push(`比例 ${options.ratio} 不被 ${model.model_name} 支持（支持: ${ratios.join(', ')}）`);
      }
    }
    if (model.min_duration && options.duration && options.duration < model.min_duration) {
      errors.push(`时长 ${options.duration}s 小于 ${model.model_name} 最短 ${model.min_duration}s`);
    }
    if (model.max_duration && options.duration && options.duration > model.max_duration) {
      errors.push(`时长 ${options.duration}s 超过 ${model.model_name} 最长 ${model.max_duration}s`);
    }
    return errors;
  }

  private logModelUsage(modelId: string, prompt: string, success: boolean, errorMsg?: string) {
    this.logger.log(`[MODEL_USAGE] model=${modelId} success=${success} prompt_preview=${prompt.slice(0, 80)}${errorMsg ? ` error=${errorMsg}` : ''}`);
  }

  private async getApiKey(key: string): Promise<string | null> {
    return this.adminService.getConfigValue(key);
  }

  private async getConfigValue(key: string): Promise<string | null> {
    return this.adminService.getConfigValue(key);
  }

  /** Generate image from text prompt using configured AI provider */
  async generateImage(options: ImageGenerationOptions): Promise<string[]> {
    const provider = await this.getConfigValue('image_provider') || 'auto';

    // Inject style keywords and strip conflicting ones
    if (options.style === 'realistic') {
      let p = options.prompt.replace(/\banime style\b[,，]?\s*/gi, '').replace(/动漫风格[,，]?\s*/g, '').replace(/Animation[,，]?\s*/gi, '').replace(/Japanese anime[,，]?\s*/gi, '');
      options = { ...options, prompt: `photorealistic,真人实拍质感,超写实风格,highly detailed real person,真实照片,${p}` };
    } else if (options.style === 'anime') {
      let p = options.prompt.replace(/\bphotorealistic[,，]?\s*/gi, '').replace(/真人实拍质感[,，]?\s*/g, '').replace(/超写实风格[,，]?\s*/g, '').replace(/真实照片[,，]?\s*/g, '');
      options = { ...options, prompt: `anime style,动漫风格,Animation,Japanese anime,セル画調,精美二次元,${p}` };
    }
    // If a specific model is requested, route by model prefix and use exclusively
    if (options.model) {
      this.logger.log(`Using requested image model: ${options.model}`);
      if (options.model.startsWith('ep-')) {
        const key = await this.getApiKey('volcengine_api_key');
        if (key) return await this.generateImageWithSeedream(key, options);
        throw new Error('火山引擎 Key 未配置，无法使用 ' + options.model);
      }
      if (options.model.startsWith('wan') || options.model.startsWith('wanx') || options.model.startsWith('happyhorse')) {
        const key = await this.getApiKey('tongyi_api_key');
        if (key) return await this.generateImageWithTongyi(key, options);
        throw new Error('阿里云 Key 未配置，无法使用 ' + options.model);
      }
      if (options.model.startsWith('CogView') || options.model.startsWith('cogview')) {
        const key = await this.getApiKey('zai_api_key');
        if (key) return await this.generateImageWithZhipu(key, options);
        throw new Error('智谱 Key 未配置，无法使用 ' + options.model);
      }
      if (options.model.startsWith('dall-e')) {
        const key = await this.getApiKey('openai_api_key');
        if (key) return await this.generateImageWithOpenAI(key, options);
        throw new Error('OpenAI Key 未配置，无法使用 ' + options.model);
      }
    }

    const isRealistic = options.style === 'realistic';

    // Realistic → 通义万相 (阿里云); Anime → 智谱 CogView-4
    const tongyiKey = await this.getApiKey('tongyi_api_key');
    const zhipuKey = await this.getApiKey('zai_api_key');

    if (isRealistic && tongyiKey) {
      this.logger.log('Using 阿里云通义万相 for image generation (realistic)');
      try { return await this.generateImageWithTongyi(tongyiKey, options); }
      catch (err: any) { this.logger.warn(`通义万相 failed: ${err.message}`); }
    }

    // Forced provider routing (non-auto)
    if (provider === 'volcengine') {
      const key = await this.getApiKey('volcengine_api_key');
      if (key) {
        this.logger.log('Using 火山引擎 Seedream (forced) for image generation');
        try { return await this.generateImageWithSeedream(key, options); }
        catch (err: any) { this.logger.warn(`Seedream failed: ${err.message}`); }
      }
    } else if (provider === 'openai') {
      const key = await this.getApiKey('openai_api_key');
      if (key) {
        this.logger.log('Using OpenAI DALL·E (forced) for image generation');
        try { return await this.generateImageWithOpenAI(key, options); }
        catch (err: any) { this.logger.warn(`OpenAI failed: ${err.message}`); }
      }
    } else if (provider === 'zhipu') {
      const key = await this.getApiKey('zai_api_key');
      if (key) {
        this.logger.log('Using 智谱 CogView-4 (forced) for image generation');
        try { return await this.generateImageWithZhipu(key, options); }
        catch (err: any) { this.logger.warn(`CogView-4 failed: ${err.message}`); }
      }
    }

    // Auto mode fallback chain (priority: 百炼 → 火山 → OpenAI → 智谱)
    const openaiKey = await this.getApiKey('openai_api_key');
    const volcKey = await this.getApiKey('volcengine_api_key');

    if (tongyiKey) {
      this.logger.log('Using 通义万相 for image generation');
      try { return await this.generateImageWithTongyi(tongyiKey, options); }
      catch (err: any) { this.logger.warn(`通义万相 failed: ${err.message}`); }
    }
    if (volcKey) {
      this.logger.log('Using 火山引擎 Seedream for image generation');
      try { return await this.generateImageWithSeedream(volcKey, options); }
      catch (err: any) { this.logger.warn(`Seedream failed: ${err.message}`); }
    }
    if (openaiKey) {
      this.logger.log('Using OpenAI DALL·E for image generation');
      try { return await this.generateImageWithOpenAI(openaiKey, options); }
      catch (err: any) { this.logger.warn(`OpenAI failed: ${err.message}`); }
    }
    if (zhipuKey) {
      this.logger.log('Using 智谱 CogView-4 for image generation');
      return this.generateImageWithZhipu(zhipuKey, options);
    }

    this.logger.warn('No image API key configured. Using placeholder image.');
    return [this.getPlaceholderImage(options)];
  }

  /** Generate image using OpenAI DALL·E */
  private async generateImageWithOpenAI(
    apiKey: string,
    options: ImageGenerationOptions,
  ): Promise<string[]> {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/images/generations',
        {
          model: 'dall-e-3',
          prompt: options.prompt,
          n: options.numImages || 1,
          size: `${options.width || 1024}x${options.height || 1024}`,
          quality: 'standard',
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 120000,
        },
      );
      return (response.data.data || []).map((img: any) => img.url);
    } catch (err: any) {
      this.logger.error(`OpenAI image generation failed: ${err.message}`);
      throw err;
    }
  }

  /** Generate image using 智谱 CogView-4 — OpenAI compatible */
  private async generateImageWithZhipu(
    apiKey: string,
    options: ImageGenerationOptions,
  ): Promise<string[]> {
    try {
      const response = await axios.post(
        'https://api.z.ai/api/paas/v4/images/generations',
        {
          model: 'CogView-4-250304',
          prompt: options.prompt,
          n: options.numImages || 1,
          size: `${options.width || 1024}x${options.height || 1024}`,
          watermark: false,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 120000,
        },
      );
      return (response.data.data || []).map((img: any) => img.url);
    } catch (err: any) {
      this.logger.error(`CogView-4 image generation failed: ${err.message}`);
      throw err;
    }
  }

  /** Generate image using 火山引擎 Seedream (豆包) — OpenAI compatible */
  private async generateImageWithSeedream(
    apiKey: string,
    options: ImageGenerationOptions,
  ): Promise<string[]> {
    const w = options.width || 1080;
    const h = options.height || 1920;
    let size = '1024x1024';
    if (w / h > 1.5) size = '2560x1440';
    else if (h / w > 1.5) size = '1440x2560';
    else if (w / h > 1.2) size = '2304x1728';
    else if (h / w > 1.2) size = '1728x2304';

    const models = await this.getActiveModels('image');
    const volcengineModels = models.filter((m: any) => m.provider === 'volcengine' && m.model_id.startsWith('ep-'));
    const modelIds = volcengineModels.length ? volcengineModels.map((m: any) => m.model_id) : [
      'ep-20260715151858-tt8z7',
      'ep-20260410175357-mm5sq',
    ];

    let lastError: any;
    for (const modelId of modelIds) {
      try {
        const dbModel = volcengineModels.find((m: any) => m.model_id === modelId);
        if (dbModel) {
          const errs = this.validateModelParams(dbModel, {});
          if (errs.length) { this.logger.warn(`Seedream ${modelId} param validation: ${errs.join(', ')}`); }
        }

        this.logger.log(`Trying Seedream model: ${modelId}`);
        const response = await axios.post(
          'https://ark.cn-beijing.volces.com/api/v3/images/generations',
          { model: modelId, prompt: options.prompt, size, n: options.numImages || 1, response_format: 'url', watermark: false },
          { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 120000 },
        );
        const urls = (response.data.data || []).map((img: any) => img.url).filter(Boolean);
        if (urls.length > 0) {
          this.logger.log(`Seedream (${modelId}) generated ${urls.length} image(s)`);
          this.logModelUsage(modelId, options.prompt, true);
          return urls;
        }
      } catch (err: any) {
        lastError = err;
        const errMsg = err.response?.data?.error?.message || err.message;
        this.logger.warn(`Seedream model ${modelId} failed: ${errMsg}`);
        this.logModelUsage(modelId, options.prompt, false, errMsg);
        if (errMsg.includes('not activated') || errMsg.includes('ModelNotOpen') || err.response?.status === 404) continue;
        throw err;
      }
    }

    this.logger.error(`All Seedream models failed. Last error: ${lastError?.message}`);
    throw lastError || new Error('All Seedream models unavailable');
  }

  /** Generate image using Tongyi Wanxiang (通义万相) */
  private async generateImageWithTongyi(
    apiKey: string,
    options: ImageGenerationOptions,
  ): Promise<string[]> {
    try {
      const response = await axios.post(
        'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
        {
          model: 'wanx-v1',
          input: {
            prompt: options.prompt,
            negative_prompt: options.negativePrompt,
          },
          parameters: {
            size: `${options.width || 1024}*${options.height || 1024}`,
            n: options.numImages || 1,
            watermark: false,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 120000,
        },
      );
      const results = response.data?.output?.results || [];
      return results.map((r: any) => r.url);
    } catch (err: any) {
      this.logger.error(`Tongyi image generation failed: ${err.message}`);
      throw err;
    }
  }

  /** Generate video from image/text using configured AI provider */
  async generateVideo(options: VideoGenerationOptions, textPrompt?: string): Promise<string> {
    const provider = await this.getConfigValue('video_provider') || 'auto';

    // Inject style keywords and strip conflicting ones
    if (options.style === 'realistic' && textPrompt) {
      textPrompt = textPrompt.replace(/\banime style\b[,，]?\s*/gi, '').replace(/动漫风格[,，]?\s*/g, '').replace(/Animation[,，]?\s*/gi, '').replace(/Japanese anime[,，]?\s*/gi, '');
      textPrompt = `photorealistic,真人实拍质感,超写实风格,${textPrompt}`;
    } else if (options.style === 'anime' && textPrompt) {
      textPrompt = textPrompt.replace(/\bphotorealistic[,，]?\s*/gi, '').replace(/真人实拍质感[,，]?\s*/g, '').replace(/超写实风格[,，]?\s*/g, '').replace(/真实照片[,，]?\s*/g, '');
      textPrompt = `anime style,动漫风格,Animation,精美二次元,${textPrompt}`;
    }

    // If a specific model is requested, route by model prefix and use exclusively
    if (options.model) {
      this.logger.log(`Using requested model: ${options.model}`);
      if (options.model.startsWith('ep-')) {
        const key = await this.getApiKey('volcengine_api_key');
        if (key) return await this.generateVideoWithSeedance(key, options, textPrompt);
        throw new Error('火山引擎 Key 未配置，无法使用 ' + options.model);
      }
      if (options.model.startsWith('wan') || options.model.startsWith('wanx') || options.model.startsWith('happyhorse')) {
        const key = await this.getApiKey('tongyi_api_key');
        if (key) return await this.generateVideoWithTongyi(key, options, textPrompt);
        throw new Error('阿里云 Key 未配置，无法使用 ' + options.model);
      }
      if (options.model.startsWith('CogVideo')) {
        const key = await this.getApiKey('zai_api_key');
        if (key) return await this.generateVideoWithZhipu(key, options, textPrompt);
        throw new Error('智谱 Key 未配置，无法使用 ' + options.model);
      }
      // Unknown model prefix — fall through to provider-based routing
    }

    if (provider === 'volcengine') {
      const key = await this.getApiKey('volcengine_api_key');
      if (!key) throw new Error('火山引擎 Key 未配置，但视频供应商设为 volcengine');
      this.logger.log('Using 火山引擎 Seedance (forced) for video generation');
      return await this.generateVideoWithSeedance(key, options, textPrompt);
    } else if (provider === 'aliyun') {
      const key = await this.getApiKey('tongyi_api_key');
      if (!key) throw new Error('阿里云 Key 未配置，但视频供应商设为 aliyun');
      this.logger.log('Using 阿里云通义万相 (forced) for video generation');
      return await this.generateVideoWithTongyi(key, options, textPrompt);
    } else if (provider === 'zhipu') {
      const key = await this.getApiKey('zai_api_key');
      if (!key) throw new Error('智谱 Key 未配置，但视频供应商设为 zhipu');
      this.logger.log('Using 智谱 CogVideoX (forced) for video generation');
      return await this.generateVideoWithZhipu(key, options, textPrompt);
    } else if (provider === 'runway') {
      const key = await this.getApiKey('runway_api_key');
      if (!key) throw new Error('Runway Key 未配置，但视频供应商设为 runway');
      this.logger.log('Using Runway (forced) for video generation');
      return await this.generateVideoWithRunway(key, options);
    }

    // Auto mode (default priority chain: 百炼 → 火山 → Runway → 智谱)
    const tongyiKey = await this.getApiKey('tongyi_api_key');
    const zhipuKey = await this.getApiKey('zai_api_key');
    const volcKey = await this.getApiKey('volcengine_api_key');
    const runwayKey = await this.getApiKey('runway_api_key');
    const activeVideoModels = await this.getActiveModels('video');

    if (tongyiKey) {
      this.logger.log('Using 通义万相 for video generation');
      try { return await this.generateVideoWithTongyi(tongyiKey, options, textPrompt); }
      catch (err: any) { this.logger.error(`通义万相 failed: ${err.message}`); }
    }
    if (volcKey && activeVideoModels.some((m: any) => m.provider === 'volcengine')) {
      this.logger.log('Using 火山引擎 Seedance for video generation');
      try { return await this.generateVideoWithSeedance(volcKey, options, textPrompt); }
      catch (err: any) { this.logger.error(`Seedance failed: ${err.message}`); }
    }
    if (runwayKey && activeVideoModels.some((m: any) => m.provider === 'runway')) {
      this.logger.log('Using Runway Gen-3 for video generation');
      try { return await this.generateVideoWithRunway(runwayKey, options); }
      catch (err: any) { this.logger.error(`Runway failed: ${err.message}`); }
    }
    if (zhipuKey && activeVideoModels.some((m: any) => m.provider === 'zhipu')) {
      this.logger.log('Using 智谱 CogVideoX for video generation');
      try { return await this.generateVideoWithZhipu(zhipuKey, options, textPrompt); }
      catch (err: any) { this.logger.error(`CogVideoX failed: ${err.message}`); }
    }

    this.logger.warn('No video API key configured. Using FFmpeg Ken Burns effect.');
    if (options.imageUrl && options.imageUrl.endsWith('.mp4') && !options.imageUrl.startsWith('http')) {
      return options.imageUrl;
    }
    return this.generatePlaceholderVideo(options);
  }

  /** Generate video using 通义万相 (Aliyun Bailian) — async task-based API */
  private async generateVideoWithTongyi(
    apiKey: string,
    options: VideoGenerationOptions,
    textPrompt?: string,
  ): Promise<string> {
    const prompt = textPrompt || options.prompt || 'cinematic video';
    this.logger.log(`通义万相 video prompt: ${prompt.slice(0, 120)}...`);
    const res = options.resolution || '720p';
    const duration = options.duration || 5;
    const ratio = options.ratio || '9:16';

    if (options.model) {
      const dbModels = await this.getActiveModels('video');
      const dbModel = dbModels.find((m: any) => m.model_id === options.model);
      if (dbModel) {
        const errs = this.validateModelParams(dbModel, options);
        if (errs.length) throw new Error(errs.join('; '));
      }
    }

    const modelsToTry = options.model ? [options.model] : await this.getTongyiVideoModels();
    let lastError: any;
    for (const model of modelsToTry) {
      try {
        this.logger.log(`Trying 通义万相 model: ${model}`);

        // Skip I2V/R2V models when no image provided
        const needsImage = model.includes('-i2v') || model.includes('-r2v');
        const hasMedia = !!(options.media?.length || options.imageUrl);
        if (needsImage && !hasMedia) {
          this.logger.warn(`Skipping ${model} — no input image/reference provided`);
          continue;
        }

        const input: any = { prompt };
        // Add negative prompt when realistic style to exclude anime
        if (options.style === 'realistic') {
          input.negative_prompt = '动画,动漫,二次元,anime,cartoon,illustration,手绘,cel shade,赛璐珞,绘画感';
        } else if (options.style === 'anime') {
          input.negative_prompt = '真人实拍,photorealistic,真实照片,写实';
        }
        // Support both single imageUrl and media array (R2V multi-reference)
        if (options.media && options.media.length > 0) {
          // Convert local file paths to base64 for each media item
          input.media = options.media.map(m => ({
            ...m,
            url: m.url.startsWith('/static/')
              ? `data:image/jpeg;base64,${fs.readFileSync(path.join(process.cwd(), 'output', path.basename(m.url))).toString('base64')}`
              : m.url,
          }));
        } else if (options.imageUrl) {
          input.media = options.imageUrl.startsWith('/static/')
            ? `data:image/jpeg;base64,${fs.readFileSync(path.join(process.cwd(), 'output', path.basename(options.imageUrl))).toString('base64')}`
            : options.imageUrl;
        }

        const submitRes = await axios.post(
          'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
          {
            model,
            input,
            parameters: {
              duration,
              resolution: res.toUpperCase(), // 720p → 720P
              ratio,
              prompt_extend: true,
              watermark: false,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'X-DashScope-Async': 'enable',
            },
            timeout: 30000,
          },
        );

      const taskId = submitRes.data.output?.task_id || submitRes.data.output?.taskId;
      if (!taskId) {
        this.logger.error(`通义万相 response: ${JSON.stringify(submitRes.data)}`);
        throw new Error('No task ID returned from 通义万相');
      }

      this.logger.log(`通义万相 video task submitted: ${taskId} (model: ${model})`);

      // Poll for result via DashScope generic tasks API
      for (let i = 0; i < 60; i++) {
        await this.delay(5000);
        const pollRes = await axios.get(
          `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 15000,
          },
        );
        const status = pollRes.data.output?.task_status || pollRes.data.status;
        if (status === 'SUCCEEDED' || status === 'succeeded') {
          const videoUrl = pollRes.data.output?.video_url;
          if (videoUrl) {
            this.logger.log(`通义万相 video ready: ${videoUrl.slice(0, 80)}...`);
            return videoUrl;
          }
        }
        if (status === 'FAILED' || status === 'failed') {
          const msg = pollRes.data.output?.message || 'unknown';
          this.logger.error(`通义万相 ${model} task failed: ${msg}`);
          throw new Error(`通义万相 video task failed: ${msg}`);
        }
        if (i % 6 === 0) {
          this.logger.log(`通义万相 ${model} task ${taskId}: ${status} (${i * 5}s)`);
        }
      }
      throw new Error(`通义万相 ${model} task timed out`);
    } catch (err: any) {
      lastError = err;
      const errMsg = err.response?.data?.error?.message || err.message;
      const errCode = err.response?.status;
      this.logger.warn(`通义万相 model ${model} failed: [${errCode}] ${errMsg}`);
      // Only retry on auth/permission errors (403) or model not found
      if (errCode === 403 || errCode === 404) continue;
      throw err;
    }
    }

    this.logger.error(`All 通义万相 models failed. Last error: ${lastError?.message}`);
    throw lastError || new Error('All 通义万相 models unavailable');
  }

  /** Generate a placeholder video locally using FFmpeg (public for fallback use) */
  generatePlaceholderVideo(options: VideoGenerationOptions): string {
    const outputDir = path.resolve(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `placeholder_video_${Date.now()}.mp4`);
    const dur = options.duration || 5;
    const ratio = options.ratio || '9:16';
    const [w, h] = this.resolveVideoDimensions(options.resolution || '720p', ratio);
    const resStr = `${w}x${h}`;

    try {
      // If imageUrl is a local file, use it; otherwise generate test pattern
      if (options.imageUrl && options.imageUrl.length > 0 && !options.imageUrl.startsWith('http') && fs.existsSync(options.imageUrl)) {
        execSync(
          `ffmpeg -y -loop 1 -i "${options.imageUrl}" -t ${dur} -r 24 -vf "scale=${resStr}" ` +
          `-c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p "${outputPath}"`,
          { timeout: 15000, stdio: 'pipe' },
        );
        this.logger.log(`Placeholder video created from image (${resStr}, ${dur}s): ${outputPath}`);
        return outputPath;
      } else {
        // Generate test pattern video
        execSync(
          `ffmpeg -y -f lavfi -i "testsrc=duration=${dur}:size=${resStr}:rate=24" ` +
          `-c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p "${outputPath}"`,
          { timeout: 15000, stdio: 'pipe' },
        );
        this.logger.log(`Placeholder test-pattern video created (${resStr}, ${dur}s): ${outputPath}`);
        return outputPath;
      }
    } catch (err: any) {
      // Emit a proper fallback — never return empty string
      this.logger.error(`Placeholder video generation failed: ${err.message}, trying emergency fallback...`);
      return this.generateEmergencyPlaceholder(options.resolution || '720p', options.duration || 5, ratio);
    }
  }

  /**
   * Emergency fallback: generate a bare-minimum video when everything else fails.
   * Uses the simplest possible ffmpeg command to guarantee a valid output file.
   */
  generateEmergencyPlaceholder(resolution: string, duration: number, ratio?: string): string {
    const outputDir = path.resolve(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `emergency_${Date.now()}.mp4`);

    const [width, height] = this.resolveVideoDimensions(resolution, ratio || '9:16');

    try {
      // Generate a colored test card with text — very simple, very reliable
      execSync(
        `ffmpeg -y -f lavfi -i "color=c=0x7C3AED:s=${width}x${height}:d=${duration}:r=24" ` +
        `-c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p "${outputPath}"`,
        { timeout: 15000, stdio: 'pipe' },
      );
      this.logger.log(`Emergency placeholder created: ${outputPath}`);
      return outputPath;
    } catch (err: any) {
      // Absolute last resort — create a minimal valid mp4 via ffmpeg's most basic command
      this.logger.error(`Emergency placeholder failed: ${err.message}`);
      try {
        execSync(
          `ffmpeg -y -f lavfi -i "color=c=0x000000:s=320x240:d=1:r=1" ` +
          `-c:v libx264 -preset ultrafast -crf 35 "${outputPath}"`,
          { timeout: 10000, stdio: 'pipe' },
        );
        return outputPath;
      } catch {
        // If even this fails, return a path that at least ends with .mp4
        // (the caller should still check fs.existsSync)
        this.logger.error(`ALL placeholder generation failed!`);
        return outputPath;
      }
    }
  }

  /** Get Seedance model IDs from DB or fallback to hardcoded defaults */
  private async getSeedanceModels(): Promise<string[]> {
    const models = await this.getActiveModels('video');
    const seedanceModels = models.filter((m: any) => m.provider === 'volcengine');
    if (seedanceModels.length) return seedanceModels.map((m: any) => m.model_id);
    return [
      'ep-20260715152154-4kc87',
      'ep-20260715152610-7hnr7',
    ];
  }

  /** Get Tongyi video model IDs from DB or fallback to hardcoded defaults */
  private async getTongyiVideoModels(): Promise<string[]> {
    const models = await this.getActiveModels('video');
    const tongyiModels = models.filter((m: any) => m.provider === 'aliyun');
    if (tongyiModels.length) return tongyiModels.map((m: any) => m.model_id);
    return [
      'happyhorse-1.1-t2v', 'happyhorse-1.1-i2v',
      'happyhorse-1.1-r2v', 'happyhorse-1.0-t2v',
      'happyhorse-1.0-i2v', 'happyhorse-1.0-r2v',
      'happyhorse-1.0-video-edit',
      'wan2.7-videoedit', 'wan2.7-t2v', 'wanx2.1-t2v-plus', 'wan2.6-t2v',
      'wan2.7-i2v', 'wanx2.1-i2v-plus', 'wan2.6-i2v',
      'wan2.7-r2v', 'wanx2.1-t2v-turbo', 'wan2.5-t2v-preview',
      'wan2.7-t2v-2026-06-12', 'wan2.7-i2v-2026-04-25', 'wan2.7-r2v-2026-06-12',
    ];
  }

  /** Base URL for content generation tasks API */
  private readonly CONTENT_TASKS_URL = 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks';

  /** Generate video using 火山引擎 Seedance via the content generation tasks API */
  private async generateVideoWithSeedance(
    apiKey: string,
    options: VideoGenerationOptions,
    textPrompt?: string,
  ): Promise<string> {
    // Build the content array (text prompt + optional reference image)
    const contentItems: any[] = [];
    const prompt = textPrompt || options.prompt || 'cinematic video, smooth motion, high quality';

    // Add text prompt
    contentItems.push({ type: 'text', text: prompt });

    // If we have an image, add it as first_frame reference
    if (options.imageUrl) {
      if (options.imageUrl.startsWith('http')) {
        contentItems.push({
          type: 'image_url',
          image_url: { url: options.imageUrl },
          role: 'first_frame',
        });
      } else if (fs.existsSync(options.imageUrl)) {
        // Read local file and encode as base64 data URI
        const imgBuffer = fs.readFileSync(options.imageUrl);
        const ext = path.extname(options.imageUrl).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.webp': 'image/webp',
          '.bmp': 'image/bmp',
        };
        const mime = mimeTypes[ext] || 'image/png';
        const dataUri = `data:${mime};base64,${imgBuffer.toString('base64')}`;
        contentItems.push({
          type: 'image_url',
          image_url: { url: dataUri },
          role: 'first_frame',
        });
      }
    }

    // Build parameters
    const seedanceResolution = options.resolution || '720p';
    const parameters: any = {
      resolution: seedanceResolution,
      ratio: options.ratio || '9:16',
      duration: options.duration || 5,
      watermark: false,
    };

    // Validate params against selected model if specified
    if (options.model) {
      const allModels = await this.getSeedanceModels();
      const matched = allModels.find((m: string) => m === options.model);
      if (matched) {
        const dbModels = await this.getActiveModels('video');
        const dbModel = dbModels.find((m: any) => m.model_id === options.model);
        if (dbModel) {
          const errs = this.validateModelParams(dbModel, options);
          if (errs.length) throw new Error(errs.join('; '));
        }
      }
    }

    // Try models — either the specified one or the full priority chain from DB
    const modelsToTry = options.model ? [options.model] : await this.getSeedanceModels();
    let lastError: any;
    for (const model of modelsToTry) {
      try {
        this.logger.log(`Trying Seedance model: ${model}`);

        // Submit the generation task
        const submitRes = await axios.post(
          this.CONTENT_TASKS_URL,
          { model, content: contentItems, parameters },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          },
        );

        const taskId = submitRes.data.id;
        if (!taskId) {
          this.logger.warn(`Seedance ${model}: no task ID returned`);
          continue;
        }
        this.logger.log(`Seedance task submitted: ${taskId} (model: ${model})`);

        // Poll for result
        const videoUrl = await this.pollSeedanceTask(apiKey, taskId, model);
        if (videoUrl) {
          this.logger.log(`Seedance video ready: ${videoUrl.slice(0, 100)}...`);
          return videoUrl;
        }

        this.logger.warn(`Seedance ${model}: task completed but no video URL`);
      } catch (err: any) {
        lastError = err;
        const errMsg = err.response?.data?.error?.message || err.message;
        const errCode = err.response?.data?.error?.code || '';

        this.logger.warn(`Seedance model ${model} failed: [${errCode}] ${errMsg}`);

        // If model not activated, try next one
        if (errMsg.includes('not activated') || errMsg.includes('ModelNotOpen') || errCode === 'ModelNotOpen') {
          continue;
        }
        // If model doesn't support this endpoint, try next
        if (errMsg.includes('only supported by certain models') || errCode === 'InvalidParameter') {
          continue;
        }
        // For other errors (auth, network, etc.), stop trying
        throw err;
      }
    }

    // All models failed
    this.logger.error(`All Seedance models failed. Last error: ${lastError?.message}`);
    throw lastError || new Error('All Seedance models unavailable');
  }

  /** Poll a Seedance content generation task until completion */
  private async pollSeedanceTask(
    apiKey: string,
    taskId: string,
    model: string,
  ): Promise<string | null> {
    const pollUrl = `${this.CONTENT_TASKS_URL}/${taskId}`;
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes with 5s intervals

    while (attempts < maxAttempts) {
      await this.delay(5000);
      attempts++;

      try {
        const pollRes = await axios.get(pollUrl, {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 15000,
        });

        const status = pollRes.data.status;
        if (attempts === 1 || attempts % 6 === 0) {
          this.logger.log(`Seedance ${model} task ${taskId}: ${status} (${attempts * 5}s elapsed)`);
        }

        if (status === 'succeeded') {
          // The video URL is in content.video_url
          const videoUrl = pollRes.data.content?.video_url;
          if (videoUrl) {
            return videoUrl;
          }
          // Also try alternative locations
          return pollRes.data.output?.video_url || pollRes.data.video_url || null;
        }

        if (status === 'failed' || status === 'cancelled' || status === 'expired') {
          const errorMsg = pollRes.data.error?.message || pollRes.data.error || status;
          this.logger.error(`Seedance task ${taskId} ${status}: ${errorMsg}`);
          return null;
        }

        // submitted / queued / running → continue polling
      } catch (pollErr: any) {
        this.logger.warn(`Poll error for task ${taskId}: ${pollErr.message}`);
        // Continue polling on transient errors
      }
    }

    this.logger.error(`Seedance task ${taskId} timed out after ${maxAttempts * 5}s`);
    return null;
  }

  /** Generate video using 智谱 CogVideoX — async task-based API */
  private async generateVideoWithZhipu(
    apiKey: string,
    options: VideoGenerationOptions,
    textPrompt?: string,
  ): Promise<string> {
    const prompt = textPrompt || options.prompt || '';
    try {
      const response = await axios.post(
        'https://api.z.ai/api/paas/v4/video/generations',
        {
          model: 'CogVideoX-3',
          prompt,
          duration: options.duration || 5,
          image_url: options.imageUrl || undefined,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );
      const taskId = response.data?.id || response.data?.task_id;
      if (!taskId) {
        return response.data?.data?.[0]?.url || response.data?.video_url || '';
      }
      // Poll for result
      for (let i = 0; i < 60; i++) {
        await this.delay(5000);
        const pollRes = await axios.get(
          `https://api.z.ai/api/paas/v4/video/result?task_id=${taskId}`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 15000,
          },
        );
        const status = pollRes.data?.task_status || pollRes.data?.status;
        if (status === 'succeeded' || status === 'SUCCEEDED') {
          return pollRes.data?.data?.[0]?.url || pollRes.data?.video_url || '';
        }
        if (status === 'failed' || status === 'FAILED') {
          throw new Error(`CogVideoX task failed: ${pollRes.data?.message || 'unknown'}`);
        }
      }
      throw new Error('CogVideoX task timed out');
    } catch (err: any) {
      this.logger.error(`CogVideoX generation failed: ${err.message}`);
      throw err;
    }
  }

  /** Generate video using Runway Gen-3 */
  private async generateVideoWithRunway(
    apiKey: string,
    options: VideoGenerationOptions,
  ): Promise<string> {
    try {
      // Step 1: Create the task
      const createRes = await axios.post(
        'https://api.runwayml.com/v1/tasks',
        {
          model: 'gen3',
          input: {
            image_url: options.imageUrl,
            prompt: options.prompt || 'A cinematic anime scene',
            duration: options.duration || 4,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      const taskId = createRes.data.id;

      // Step 2: Poll until complete
      let attempts = 0;
      while (attempts < 60) {
        const pollRes = await axios.get(
          `https://api.runwayml.com/v1/tasks/${taskId}`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 15000,
          },
        );

        if (pollRes.data.status === 'SUCCEEDED') {
          return pollRes.data.output?.video_url || '';
        }
        if (pollRes.data.status === 'FAILED') {
          throw new Error(`Runway task failed: ${pollRes.data.error || 'unknown'}`);
        }

        await this.delay(5000);
        attempts++;
      }
      throw new Error('Runway task timed out');
    } catch (err: any) {
      this.logger.error(`Runway video generation failed: ${err.message}`);
      throw err;
    }
  }

  /** Generate TTS audio */
  async generateTTS(options: TTSOptions): Promise<ArrayBuffer> {
    const openaiKey = await this.getApiKey('openai_api_key');
    const ttsKey = await this.getApiKey('tts_api_key');

    const apiKey = openaiKey || ttsKey;
    if (apiKey) {
      return this.generateTTSWithOpenAI(apiKey, options);
    }

    this.logger.warn('No TTS API key configured. Returning empty audio.');
    return new ArrayBuffer(0);
  }

  /** Generate TTS using OpenAI TTS */
  private async generateTTSWithOpenAI(
    apiKey: string,
    options: TTSOptions,
  ): Promise<ArrayBuffer> {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/audio/speech',
        {
          model: 'tts-1',
          input: options.text,
          voice: options.voice || 'alloy',
          speed: options.speed || 1.0,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          timeout: 60000,
        },
      );
      return response.data;
    } catch (err: any) {
      this.logger.error(`TTS generation failed: ${err.message}`);
      throw err;
    }
  }

  /** Chat completion using configured LLM provider */
  async chatCompletion(
    messages: Array<{ role: string; content: string }>,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<string> {
    const provider = await this.getConfigValue('llm_provider') || 'auto';

    if (provider === 'aliyun') {
      const key = await this.getApiKey('tongyi_api_key');
      if (key) {
        this.logger.log('Using 阿里云 Qwen (forced) for chat');
        try {
          return await this.chatWithOpenAI(
            key,
            'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
            'qwen-plus',
            messages,
            options,
          );
        } catch (err: any) { this.logger.warn(`Qwen failed: ${err.message}`); }
      }
    } else if (provider === 'volcengine') {
      const key = await this.getApiKey('volcengine_api_key');
      if (key) {
        this.logger.log('Using 火山引擎 Doubao (forced) for chat');
        const textModels = await this.getActiveModels('text');
        const volcModels = textModels.filter((m: any) => m.provider === 'volcengine')
          .sort((a: any, b: any) => a.priority - b.priority);
        const modelIds = volcModels.length
          ? volcModels.map((m: any) => m.model_id)
          : ['ep-20260715151139-8svqj', 'ep-20260410180453-t9zr7'];
        let lastError: any;
        for (const modelId of modelIds) {
          try {
            return await this.chatWithOpenAI(key, 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', modelId, messages, options);
          } catch (err: any) {
            lastError = err;
            this.logger.warn(`Doubao ${modelId} failed: ${err.message}`);
          }
        }
        if (lastError) throw lastError;
      }
    } else if (provider === 'openai') {
      const key = await this.getApiKey('openai_api_key');
      if (key) {
        this.logger.log('Using OpenAI (forced) for chat');
        try {
          return await this.chatWithOpenAI(
            key, 'https://api.openai.com/v1/chat/completions', 'gpt-4o',
            messages, options,
          );
        } catch (err: any) { this.logger.warn(`OpenAI failed: ${err.message}`); }
      }
    } else if (provider === 'deepseek') {
      const key = await this.getApiKey('deepseek_api_key');
      if (key) {
        this.logger.log('Using DeepSeek (forced) for chat');
        try {
          return await this.chatWithOpenAI(
            key, 'https://api.deepseek.com/v1/chat/completions', 'deepseek-chat',
            messages, options,
          );
        } catch (err: any) { this.logger.warn(`DeepSeek failed: ${err.message}`); }
      }
    } else if (provider === 'zhipu') {
      const key = await this.getApiKey('zai_api_key');
      if (key) {
        this.logger.log('Using 智谱 GLM-4.5-Air (forced) for chat');
        try {
          return await this.chatWithOpenAI(
            key, 'https://api.z.ai/api/paas/v4/chat/completions', 'GLM-4.5-Air',
            messages, options,
          );
        } catch (err: any) { this.logger.warn(`GLM-4.5-Air failed: ${err.message}`); }
      }
    }

    // Auto mode - try each configured provider in priority order
    const aliyunKey = await this.getApiKey('tongyi_api_key');
    const zhipuKey = await this.getApiKey('zai_api_key');
    const volcKey = await this.getApiKey('volcengine_api_key');
    const openaiKey = await this.getApiKey('openai_api_key');
    const deepseekKey = await this.getApiKey('deepseek_api_key');

    if (aliyunKey) {
      try {
        return await this.chatWithOpenAI(aliyunKey, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', 'qwen-plus', messages, options);
      } catch (err: any) { this.logger.warn(`阿里云 Qwen chat failed: ${err.message}`); }
    }

    if (zhipuKey) {
      try {
        return await this.chatWithOpenAI(zhipuKey, 'https://api.z.ai/api/paas/v4/chat/completions', 'GLM-4.5-Air', messages, options);
      } catch (err: any) { this.logger.warn(`智谱 GLM-4.5-Air chat failed: ${err.message}`); }
      try {
        return await this.chatWithOpenAI(zhipuKey, 'https://api.z.ai/api/paas/v4/chat/completions', 'GLM-4.7-Flash', messages, options);
      } catch (err: any) { this.logger.warn(`智谱 GLM-4.7-Flash failed: ${err.message}`); }
    }

    if (volcKey) {
      const volcTextModels = await this.getActiveModels('text');
      const volcModels = volcTextModels.filter((m: any) => m.provider === 'volcengine')
        .sort((a: any, b: any) => a.priority - b.priority);
      const volcModelIds = volcModels.length
        ? volcModels.map((m: any) => m.model_id)
        : ['ep-20260715151139-8svqj', 'ep-20260410180453-t9zr7'];
      for (const mid of volcModelIds) {
        try {
          return await this.chatWithOpenAI(volcKey, 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', mid, messages, options);
        } catch (err: any) { this.logger.warn(`火山引擎 Doubao ${mid} chat failed: ${err.message}`); }
      }
    }

    if (openaiKey) {
      try {
        return await this.chatWithOpenAI(openaiKey, 'https://api.openai.com/v1/chat/completions', 'gpt-4o', messages, options);
      } catch (err: any) { this.logger.warn(`OpenAI chat failed: ${err.message}`); }
    }

    if (deepseekKey) {
      try {
        return await this.chatWithOpenAI(deepseekKey, 'https://api.deepseek.com/v1/chat/completions', 'deepseek-chat', messages, options);
      } catch (err: any) { this.logger.warn(`DeepSeek chat failed: ${err.message}`); }
    }

    this.logger.warn('No LLM API key configured or all providers failed');
    return '';
  }

  private async chatWithOpenAI(
    apiKey: string,
    url: string,
    model: string,
    messages: Array<{ role: string; content: string }>,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<string> {
    try {
      const response = await axios.post(
        url,
        {
          model,
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 2000,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 300000,
        },
      );
      return response.data.choices?.[0]?.message?.content || '';
    } catch (err: any) {
      this.logger.error(`LLM call failed: ${err.message}`);
      throw err;
    }
  }

  private getPlaceholderImage(options: ImageGenerationOptions): string {
    const outputDir = path.resolve(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const width = options.width || 1080;
    const height = options.height || 1920;
    const outputPath = path.join(outputDir, `placeholder_${Date.now()}.png`);

    try {
      // Generate a single-frame PNG image with a gradient-like colored background
      execSync(
        `ffmpeg -y -f lavfi -i "color=c=0x7C3AED:s=${width}x${height}:d=0.1" -frames:v 1 "${outputPath}"`,
        { timeout: 10000, stdio: 'pipe' },
      );
      this.logger.log(`Placeholder image created: ${outputPath}`);
      return outputPath;
    } catch {
      // Ultra-fallback: tiny colored square
      const fallbackPath = path.join(outputDir, `placeholder_fallback_${Date.now()}.png`);
      try {
        execSync(
          `ffmpeg -y -f lavfi -i "color=c=0x7c3aed:s=${width}x${height}:d=0.1" -frames:v 1 "${fallbackPath}"`,
          { timeout: 10000, stdio: 'pipe' },
        );
        return fallbackPath;
      } catch {
        this.logger.error(`Cannot generate placeholder image — ffmpeg may be broken`);
        // Return a path anyway; caller will check fs.existsSync
        return fallbackPath;
      }
    }
  }

  /** Convert resolution label + ratio to pixel dimensions */
  resolveVideoDimensions(resolution: string, ratio: string): [number, number] {
    const [rw, rh] = ratio.split(':').map(Number);
    const base = parseInt(resolution);
    if (rw <= rh) {
      return [base, Math.round(base * rh / rw)];
    }
    return [Math.round(base * rw / rh), base];
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Return display-friendly info about the models currently in use */
  async getModelDisplayInfo() {
    try {
      const imageModels = await this.getActiveModels('image');
      const videoModels = await this.getActiveModels('video');
      this.logger.log(`imageModels count: ${imageModels?.length ?? 0}, videoModels count: ${videoModels?.length ?? 0}`);
  
      const image = imageModels?.[0] || null;
  
      const r2v = videoModels?.find((m: any) => m.model_id?.toLowerCase().includes('r2v')) || null;
      const i2v = videoModels?.find((m: any) => m.model_id?.toLowerCase().includes('i2v')) || null;
  
      const llmProvider = (await this.getConfigValue('llm_provider')) || 'auto';
      const hasAliKey = await this.getApiKey('tongyi_api_key');
      const hasZhipuKey = await this.getApiKey('zai_api_key');
      const hasVolcKey = await this.getApiKey('volcengine_api_key');
      const hasOpenaiKey = await this.getApiKey('openai_api_key');
      const hasDeepseekKey = await this.getApiKey('deepseek_api_key');
      const useAli = llmProvider === 'aliyun' || (llmProvider === 'auto' && hasAliKey);
      const useZhipu = !useAli && (llmProvider === 'zhipu' || (llmProvider === 'auto' && hasZhipuKey));
      const useVolc = !useAli && !useZhipu && (llmProvider === 'volcengine' || (llmProvider === 'auto' && hasVolcKey));
      const useOpenai = !useAli && !useZhipu && !useVolc && (llmProvider === 'openai' || (llmProvider === 'auto' && hasOpenaiKey));
      const useDeepseek = !useAli && !useZhipu && !useVolc && !useOpenai && (llmProvider === 'deepseek' || (llmProvider === 'auto' && hasDeepseekKey));
  
      let llmName = '未配置';
      if (useAli) llmName = '通义千问 Plus (阿里云)';
      else if (useZhipu) llmName = '智谱 GLM-4.5-Air';
      else if (useVolc) llmName = '豆包 Doubao (火山引擎)';
      else if (useOpenai) llmName = 'GPT-4o (OpenAI)';
      else if (useDeepseek) llmName = 'DeepSeek Chat';
  
      if (llmName === '未配置') {
        const textModels = await this.getActiveModels('text');
        if (textModels?.[0]) {
          llmName = `${textModels[0].model_name} (${textModels[0].provider})`;
        }
      }
  
      return {
        llm: llmName,
        image: image ? `${image.model_name}` : '未配置',
        videoR2V: r2v ? `${r2v.model_name}` : '未配置',
        videoI2V: i2v ? `${i2v.model_name}` : '未配置',
      };
    } catch (err: any) {
      this.logger.error(`getModelDisplayInfo failed: ${err.message}`, err.stack);
      throw err;
    }
  }
}
