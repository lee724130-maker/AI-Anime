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
  videoType?: 'i2v' | 't2v' | 'r2v';
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
  private providerCooldowns = new Map<string, number>();

  constructor(
    private readonly adminService: AdminService,
    private readonly modelConfigService: ModelConfigService,
  ) {}

  private async getActiveModels(capability: string, subCapability?: string) {
    if (subCapability) {
      return this.modelConfigService.findActive(capability, subCapability);
    }
    return this.modelConfigService.findActive(capability);
  }

  private validateModelParams(model: any, options: { resolution?: string; ratio?: string; duration?: number }) {
    const errors: string[] = [];
    if (model.supported_resolutions) {
      const resolutions = JSON.parse(model.supported_resolutions);
      if (options.resolution) {
        const lowerRes = options.resolution.toLowerCase();
        const matched = resolutions.find((r: string) => r.toLowerCase() === lowerRes);
        if (!matched) {
          errors.push(`分辨率 ${options.resolution} 不被 ${model.model_name} 支持（支持: ${resolutions.join(', ')}）`);
        }
      }
    }
    if (model.supported_ratios) {
      const ratios = JSON.parse(model.supported_ratios);
      if (options.ratio) {
        const matched = ratios.find((r: string) => r === options.ratio);
        if (!matched) {
          errors.push(`比例 ${options.ratio} 不被 ${model.model_name} 支持（支持: ${ratios.join(', ')}）`);
        }
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

  private isProviderOnCooldown(provider: string): boolean {
    const until = this.providerCooldowns.get(provider);
    return !!until && Date.now() < until;
  }

  private cooldownProvider(provider: string, ms = 10000): void {
    const until = Date.now() + ms;
    this.providerCooldowns.set(provider, until);
    this.logger.warn(`Provider ${provider} 冷却 ${ms}ms → ${new Date(until).toISOString().slice(11, 19)}`);
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
      try {
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
      } catch (err: any) {
        this.logger.warn(`Requested image model ${options.model} failed: ${err.message}. Falling back to auto mode.`);
        delete options.model;
      }
      // Requested model failed — fall through to auto mode
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
    const models = (await this.getActiveModels('image'))
      .filter((m: any) => m.provider === 'aliyun')
      .map((m: any) => m.model_id);
    const fallbackModels = models.length ? models : ['wanx-v1', 'wanx2.1-t2i-turbo', 'wanx2.1-t2i-plus'];

    const allowedSizes = ['1024*1024', '720*1280', '1280*720', '768*1152'];

    let lastError: any;
    for (const model of fallbackModels) {
      try {
        this.logger.log(`Trying 通义万相 image model: ${model}`);

        const reqWidth = options.width || 1080;
        const reqHeight = options.height || 1920;
        const reqSize = `${reqWidth}*${reqHeight}`;
        let size = allowedSizes.includes(reqSize) ? reqSize : null;
        if (!size) {
          const ratio = reqWidth / reqHeight;
          size = allowedSizes.reduce((best, s) => {
            const [w, h] = s.split('*').map(Number);
            const diff = Math.abs(w / h - ratio);
            const bestDiff = Math.abs(Number(best.split('*')[0]) / Number(best.split('*')[1]) - ratio);
            return diff < bestDiff ? s : best;
          });
          this.logger.log(`${model} size ${reqSize} not supported, using ${size} (closest ratio)`);
        }

        const submitRes = await axios.post(
          'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
          {
            model,
            input: {
              prompt: options.prompt,
              negative_prompt: options.negativePrompt,
            },
            parameters: {
              size,
              n: options.numImages || 1,
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

        // Try synchronous result first
        const syncResults = submitRes.data?.output?.results;
        if (syncResults && syncResults.length > 0) {
          this.logger.log(`通义万相 ${model} generated ${syncResults.length} image(s) synchronously`);
          this.logModelUsage(model, options.prompt, true);
          return syncResults.map((r: any) => r.url);
        }

        // Async mode — poll for result
        const taskId = submitRes.data?.output?.task_id || submitRes.data?.output?.taskId;
        if (!taskId) {
          this.logger.warn(`通义万相 ${model} no sync results and no task_id, trying next model...`);
          continue;
        }

        this.logger.log(`通义万相 image task submitted: ${taskId} (model: ${model})`);

        for (let i = 0; i < 60; i++) {
          const interval = i < 15 ? 2000 : 5000;
          await this.delay(interval);
          const pollRes = await axios.get(
            `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
            {
              headers: { Authorization: `Bearer ${apiKey}` },
              timeout: 15000,
            },
          );
          const status = pollRes.data.output?.task_status || pollRes.data.status;
          if (status === 'SUCCEEDED' || status === 'succeeded') {
            const results = pollRes.data.output?.results || [];
            if (results.length > 0) {
              this.logger.log(`通义万相 ${model} generated ${results.length} image(s)`);
              this.logModelUsage(model, options.prompt, true);
              return results.map((r: any) => r.url);
            }
            this.logger.warn(`通义万相 ${model} succeeded but no images in results`);
            continue;
          }
          if (status === 'FAILED' || status === 'failed') {
            const msg = pollRes.data.output?.message || 'unknown';
            this.logger.warn(`通义万相 ${model} task failed: ${msg}`);
            throw new Error(`通义万相 image task failed: ${msg}`);
          }
          if (i % 10 === 0) {
            this.logger.log(`通义万相 ${model} task ${taskId}: ${status} (${Math.round(i * (i < 15 ? 2 : 5))}s)`);
          }
        }
        this.logger.warn(`通义万相 ${model} task timed out, trying next model...`);
        continue;
      } catch (err: any) {
        lastError = err;
        const errMsg = err.response?.data?.message || err.message;
        this.logger.warn(`通义万相 ${model} failed: ${errMsg}`);
        this.logModelUsage(model, options.prompt, false, errMsg);
        if (err.response?.status === 403) {
          this.logger.warn(`${model} 返回 403 (${errMsg})，尝试下一个模型...`);
          continue;
        }
        throw err;
      }
    }

    this.logger.error(`All 通义万相 image models failed. Last error: ${lastError?.message}`);
    throw lastError || new Error('All 通义万相 image models unavailable');
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
      try {
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
      } catch (err: any) {
        this.logger.warn(`Requested model ${options.model} failed: ${err.message}. Falling back to auto mode.`);
        delete options.model; // clear specific model so auto mode uses full priority chain
      }
      // Requested model failed — fall through to auto mode
    }

    if (provider === 'volcengine') {
      const key = await this.getApiKey('volcengine_api_key');
      if (key) {
        this.logger.log('Using 火山引擎 Seedance (forced) for video generation');
        try { return await this.generateVideoWithSeedance(key, options, textPrompt); }
        catch (err: any) { this.logger.error(`火山引擎失败: ${err.message}`); }
      } else { this.logger.warn('火山引擎 Key 未配置'); }
    } else if (provider === 'aliyun') {
      if (this.isProviderOnCooldown('aliyun')) {
        this.logger.warn('通义万相冷却中，跳过');
      } else {
        const key = await this.getApiKey('tongyi_api_key');
        if (key) {
          this.logger.log('Using 阿里云通义万相 (forced) for video generation');
          try { return await this.generateVideoWithTongyi(key, options, textPrompt); }
          catch (err: any) { this.logger.error(`通义万相失败: ${err.message}`); }
        } else { this.logger.warn('阿里云 Key 未配置'); }
      }
    } else if (provider === 'zhipu') {
      const key = await this.getApiKey('zai_api_key');
      if (key) {
        this.logger.log('Using 智谱 CogVideoX (forced) for video generation');
        try { return await this.generateVideoWithZhipu(key, options, textPrompt); }
        catch (err: any) { this.logger.error(`智谱失败: ${err.message}`); }
      } else { this.logger.warn('智谱 Key 未配置'); }
    } else if (provider === 'runway') {
      const key = await this.getApiKey('runway_api_key');
      if (key) {
        this.logger.log('Using Runway (forced) for video generation');
        try { return await this.generateVideoWithRunway(key, options); }
        catch (err: any) { this.logger.error(`Runway失败: ${err.message}`); }
      } else { this.logger.warn('Runway Key 未配置'); }
    }

    // Auto mode (default priority chain: 百炼 → 火山 → Runway → 智谱)
    const tongyiKey = await this.getApiKey('tongyi_api_key');
    const zhipuKey = await this.getApiKey('zai_api_key');
    const volcKey = await this.getApiKey('volcengine_api_key');
    const runwayKey = await this.getApiKey('runway_api_key');
    const activeVideoModels = await this.getActiveModels('video');

    if (tongyiKey && !this.isProviderOnCooldown('aliyun')) {
      this.logger.log('Using 通义万相 for video generation');
      try { return await this.generateVideoWithTongyi(tongyiKey, options, textPrompt); }
      catch (err: any) { this.logger.error(`通义万相 failed: ${err.message}`); }
    }
    if (volcKey && !this.isProviderOnCooldown('volcengine') && activeVideoModels.some((m: any) => m.provider === 'volcengine')) {
      this.logger.log('Using 火山引擎 Seedance for video generation');
      try { return await this.generateVideoWithSeedance(volcKey, options, textPrompt); }
      catch (err: any) { this.logger.error(`Seedance failed: ${err.message}`); }
    }
    if (runwayKey && !this.isProviderOnCooldown('runway') && activeVideoModels.some((m: any) => m.provider === 'runway')) {
      this.logger.log('Using Runway Gen-3 for video generation');
      try { return await this.generateVideoWithRunway(runwayKey, options); }
      catch (err: any) { this.logger.error(`Runway failed: ${err.message}`); }
    }
    if (zhipuKey && !this.isProviderOnCooldown('zhipu') && activeVideoModels.some((m: any) => m.provider === 'zhipu')) {
      // Small random delay to avoid 429 rate limit
      await this.delay(Math.floor(Math.random() * 2000) + 500);
      this.logger.log('Using 智谱 CogVideoX for video generation');
      try { return await this.generateVideoWithZhipu(zhipuKey, options, textPrompt); }
      catch (err: any) {
        if (err.response?.status === 429) {
          this.logger.warn('CogVideoX rate limited (429), 等待3s重试');
          await this.delay(3000);
          try {
            return await this.generateVideoWithZhipu(zhipuKey, options, textPrompt);
          } catch (retryErr: any) {
            this.logger.error(`CogVideoX 重试失败: ${retryErr.message}`);
          }
        } else {
          this.logger.error(`CogVideoX failed: ${err.message}`);
        }
      }
    }

    throw new Error('所有视频供应商均不可用');
  }

  /** Generate video using 通义万相 (Aliyun Bailian) — async task-based API */
  private async generateVideoWithTongyi(
    apiKey: string,
    options: VideoGenerationOptions,
    textPrompt?: string,
    downgradeDepth = 0,
  ): Promise<string> {
    const prompt = textPrompt || options.prompt || 'cinematic video';
    this.logger.log(`通义万相 video prompt: ${prompt.slice(0, 120)}...`);

    if (options.model) {
      const dbModels = await this.getActiveModels('video');
      const dbModel = dbModels.find((m: any) => m.model_id === options.model);
      if (dbModel) {
        const errs = this.validateModelParams(dbModel, options);
        if (errs.length) throw new Error(errs.join('; '));
      }
    }

    const modelsToTry = options.model ? [options.model] : await this.getTongyiVideoModels(options.videoType);
    let lastError: any;
    const dbModelMap = new Map<string, any>();
    const dbModels = await this.getActiveModels('video', options.videoType);
    for (const m of dbModels) dbModelMap.set(m.model_id, m);
    
    const hasMedia = !!(options.media?.length || options.imageUrl);
    
    // 不再预先按时长过滤模型，因为循环内的自适应逻辑（adapt duration to model range）
    // 会正确处理时长不匹配的情况。预过滤会导致本可以自适应调整的模型被错误跳过。
    let filteredModels = [...modelsToTry];
    
    // 按 I2V/R2V/T2V 分类重新排序（优先匹配用户输入类型）
    if (hasMedia) {
      const i2v = filteredModels.filter(m => m.includes('-i2v'));
      const r2v = filteredModels.filter(m => m.includes('-r2v'));
      if ((options.media?.length ?? 0) > 1) {
        filteredModels.splice(0, filteredModels.length, ...r2v, ...i2v);
      } else {
        filteredModels.splice(0, filteredModels.length, ...i2v, ...r2v);
      }
      this.logger.log(`Has ${options.media?.length || 0} media items, will try I2V/R2V models first`);
    } else {
      filteredModels.splice(0, filteredModels.length, ...filteredModels.filter(m => !m.includes('-i2v') && !m.includes('-r2v')));
      this.logger.log(`No media, will try T2V models only`);
    }
    for (const model of filteredModels) {
      let lastInput: any = null;
      let lastParams: any = null;
      try {
        this.logger.log(`Trying 通义万相 model: ${model}`);

        // 动态调整参数以适配模型能力
        let adaptedOptions = { ...options };
        const dbModel = dbModelMap.get(model);
        if (dbModel) {
          // 自动调整时长到模型支持的范围
          if (adaptedOptions.duration && dbModel.min_duration && dbModel.max_duration) {
            if (adaptedOptions.duration < dbModel.min_duration) {
              this.logger.warn(`时长 ${adaptedOptions.duration}s 小于 ${model} 最小 ${dbModel.min_duration}s，调整为 ${dbModel.min_duration}s`);
              adaptedOptions.duration = dbModel.min_duration;
            } else if (adaptedOptions.duration > dbModel.max_duration) {
              this.logger.warn(`时长 ${adaptedOptions.duration}s 超过 ${model} 最大 ${dbModel.max_duration}s，调整为 ${dbModel.max_duration}s`);
              adaptedOptions.duration = dbModel.max_duration;
            }
          }
          
          // 自动调整比例到模型支持的范围（优先保留当前比例）
          if (adaptedOptions.ratio && dbModel.supported_ratios) {
            const supportedRatios = JSON.parse(dbModel.supported_ratios);
            if (!supportedRatios.includes(adaptedOptions.ratio)) {
              // 优先选择16:9，如果不支持就用第一个支持的比例
              if (supportedRatios.includes('16:9')) {
                this.logger.warn(`比例 ${adaptedOptions.ratio} 不被 ${model} 支持，调整为 16:9`);
                adaptedOptions.ratio = '16:9';
              } else {
                this.logger.warn(`比例 ${adaptedOptions.ratio} 不被 ${model} 支持，调整为 ${supportedRatios[0]}`);
                adaptedOptions.ratio = supportedRatios[0];
              }
            }
          }
          
          // 自动调整分辨率到模型支持的范围（大小写不敏感比较）
          if (adaptedOptions.resolution && dbModel.supported_resolutions) {
            const supportedResolutions = JSON.parse(dbModel.supported_resolutions);
            const lowerRes = adaptedOptions.resolution.toLowerCase();
            const matched = supportedResolutions.find((r: string) => r.toLowerCase() === lowerRes);
            if (!matched) {
              this.logger.warn(`分辨率 ${adaptedOptions.resolution} 不被 ${model} 支持，调整为 ${supportedResolutions[0]}`);
              adaptedOptions.resolution = supportedResolutions[0];
            } else {
              // 使用数据库中的正确格式（大写）
              adaptedOptions.resolution = matched;
            }
          }
          
          // 再次验证调整后的参数
          const valErrs = this.validateModelParams(dbModel, adaptedOptions);
          if (valErrs.length) {
            this.logger.warn(`通义万相 model ${model} 仍不兼容: ${valErrs.join('; ')}`);
            continue;
          }
        }

        // Determine model type and handle media accordingly
        const isT2V = !model.includes('-i2v') && !model.includes('-r2v');
        const isI2V = model.includes('-i2v');
        const isR2V = model.includes('-r2v');

        if ((isI2V || isR2V) && !hasMedia) {
          this.logger.warn(`Skipping ${model} — no input image/reference provided`);
          continue;
        }

        const input: any = { prompt };
        if (options.style === 'realistic') {
          input.negative_prompt = '动画,动漫,二次元,anime,cartoon,illustration,手绘,cel shade,赛璐珞,绘画感';
        } else if (options.style === 'anime') {
          input.negative_prompt = '真人实拍,photorealistic,真实照片,写实';
        }

        // Build media input based on model type
        if (hasMedia && !isT2V) {
          const allItems = options.media?.length ? options.media : [];
          const singleUrl = allItems.length > 0
            ? allItems[0].url
            : (options.imageUrl || '');
          const isWan26 = /wan2\.6/.test(model);
          // Convert local /static/ files (incl. full http://localhost:3000/static/... URLs)
          // to base64 so the cloud provider can read them. Keeps remote URLs as-is.
          const toBase64 = (url: string) => {
            if (!url.startsWith('/static/')) {
              const m = url.match(/^https?:\/\/[^/]+\/static\/(.+)$/);
              if (!m) return url; // remote public URL — provider can access it
              url = `/static/${m[1]}`;
            }
            try {
              const ext = path.extname(url).toLowerCase();
              const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
              const localPath = path.join(process.cwd(), 'output', url.replace('/static/', ''));
              if (!fs.existsSync(localPath)) {
                this.logger.warn(`File not found for base64 conversion: ${localPath}`);
                return url;
              }
              const b64 = fs.readFileSync(localPath).toString('base64');
              return `data:${mime};base64,${b64}`;
            } catch (err: any) {
              this.logger.warn(`Failed to convert to base64: ${err.message}`);
              return url;
            }
          };
          // Cap R2V reference count: wan2.6 requires <5, others typically <=5
          const maxR2VRefs = isR2V ? (isWan26 ? 4 : 5) : 1;
          const r2vItems = allItems.slice(0, maxR2VRefs);

          if (isI2V) {
            // I2V — single reference image
            // 老版本模型 (wan2.0-2.5, wanx2.1, happyhorse) 需要 img_url 格式
            // wan2.6 需要 reference_url 格式
            // 新版本模型 (wan2.7+) 需要 media 格式
            const needsImgUrl = /wan2\.[0-5]/.test(model) || model.startsWith('wanx') || model.startsWith('happyhorse');
            
            if (needsImgUrl) {
              input.img_url = toBase64(singleUrl);
              this.logger.log(`${model} using img_url format (old API)`);
            } else if (isWan26) {
              // wan2.6 系列需要 reference_url 格式
              input.reference_url = toBase64(singleUrl);
              this.logger.log(`${model} using reference_url format (wan2.6 API)`);
            } else {
              // wan2.7+ 使用 media 格式 (first_frame 类型)
              input.media = [{ type: 'first_frame', url: toBase64(singleUrl) }];
              this.logger.log(`${model} using media format with first_frame type (new API)`);
            }
          } else if (isR2V) {
            // R2V — multiple reference images
            // 老版本模型需要 img_urls 格式
            // wan2.6 需要 reference_urls 格式
            // 新版本 (wan2.7+) 需要 media 格式
            const needsImgUrl = /wan2\.[0-5]/.test(model) || model.startsWith('wanx') || model.startsWith('happyhorse');
            if (r2vItems.length < allItems.length) {
              this.logger.warn(`${model} 参考图 ${allItems.length} 张超过上限 ${maxR2VRefs}，截取前 ${r2vItems.length} 张`);
            }
            
            if (needsImgUrl) {
              input.img_urls = r2vItems.map(m => toBase64(m.url));
              this.logger.log(`${model} using img_urls format (old API)`);
            } else if (isWan26) {
              // wan2.6 系列需要 reference_urls 格式
              input.reference_urls = r2vItems.map(m => toBase64(m.url));
              this.logger.log(`${model} using reference_urls format (wan2.6 API)`);
            } else {
              input.media = r2vItems.map(m => ({ type: 'reference_image', url: toBase64(m.url) }));
              this.logger.log(`${model} using media format with reference_image type (new API)`);
            }
          }
        }

        const res = adaptedOptions.resolution || '720p';
        const duration = Math.round(adaptedOptions.duration || 5);
        const ratio = adaptedOptions.ratio || '16:9';
        
        // 根据模型类型决定参数格式
        // wan2.7+ I2V: 不需要 ratio，比例由输入素材决定
        // wan2.7+ R2V/T2V/videoedit: 需要 ratio 参数
        // 其他模型: 需要 ratio 参数
        const isWan27I2V = /wan2\.[7-9].*-i2v/.test(model);
        
        const params: any = {
              resolution: res.toUpperCase(),
              prompt_extend: true,
              watermark: false,
            };
            
        if (isWan27I2V) {
          // wan2.7+ I2V 不需要 ratio 参数，比例由输入素材决定
          this.logger.log(`${model} using wan2.7+ I2V API (no ratio, ratio from input)`);
        } else {
          // wan2.7+ R2V/T2V/videoedit 以及其他模型需要 ratio 参数
          params.ratio = ratio;
          this.logger.log(`${model} using ratio=${ratio}`);
        }
            
        if (!model.includes('turbo')) {
          params.duration = duration;
        } else {
          // Turbo 模型有固定时长
          this.logger.log(`Turbo 模型 ${model} 使用固定时长，忽略自定义 ${duration}s`);
        }
        this.logger.log(`模型 ${model} 参数: resolution=${res}, duration=${duration}`);
            
            // 调试日志：显示传递给模型的完整输入
            this.logger.log(`[DEBUG] ${model} input keys: ${Object.keys(input).join(', ')}`);
            this.logger.log(`[DEBUG] ${model} prompt (first 200): ${(input.prompt || '').slice(0, 200)}`);
            if (input.media) {
              this.logger.log(`[DEBUG] ${model} media count: ${input.media.length}, first url type: ${input.media[0]?.url?.startsWith('data:') ? 'base64' : 'url'}`);
            }
            if (input.img_url) {
              this.logger.log(`[DEBUG] ${model} img_url type: ${input.img_url.startsWith('data:') ? 'base64' : 'url'}`);
            }

            // 保存用于错误调试
            lastInput = input;
            lastParams = params;

        const submitRes = await axios.post(
          'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
          {
            model,
            input,
            parameters: params,
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

      // Poll for result via DashScope generic tasks API (up to 10 min)
      // 优化轮询策略：前30秒使用短间隔(2秒)，之后使用5秒间隔
      for (let i = 0; i < 120; i++) {
        // 动态轮询间隔：前15次(30秒)用2秒，之后用5秒
        const interval = i < 15 ? 2000 : 5000;
        await this.delay(interval);
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
      const data = err.response?.data;
      const errBody = data?.error?.message || data?.message || err.message || '';
      const errCode = err.response?.status;
      // 记录完整的错误响应，方便调试
      this.logger.warn(`通义万相 model ${model} failed: [${errCode}] ${errBody}`);
      if (data) {
        this.logger.error(`[DEBUG] ${model} error response: ${JSON.stringify(data).slice(0, 500)}`);
      }
      if (lastInput && lastParams) {
        this.logger.error(`[DEBUG] ${model} request body: ${JSON.stringify({ model, input: lastInput, parameters: lastParams }).slice(0, 500)}`);
      }

      // B: 权限类错误 → key 无此模型权限，整 provider 判死
      if (errCode === 403) {
        const lower = errBody.toLowerCase();
        if (lower.includes('permission') || lower.includes('not authorized') || lower.includes('access denied') || lower.includes('no permission')) {
          this.cooldownProvider('aliyun', 30000); // 冷却30秒
          throw new Error(`通义万相 key 无视频模型权限 (${model})`);
        }
        // 403 但不是权限错误（可能是配额或其他问题），继续尝试其他模型
        this.logger.warn(`403 error for ${model} (not permission-related), trying next model...`);
      }
      
      // C: 配额耗尽错误 → 跳过这个模型，继续尝试其他模型
      if (errCode === 429 || errCode === 402) {
        const lower = errBody.toLowerCase();
        if (lower.includes('quota') || lower.includes('exhausted') || lower.includes('rate limit') || lower.includes('free tier')) {
          this.logger.warn(`Model ${model} quota exhausted, trying next model...`);
          continue;
        }
      }
      
      // 所有其他错误（格式不匹配、任务失败等）→ 跳过，试下一个模型
      continue;
    }
    }

    // 所有通义万相模型都失败了，尝试降级策略（递归复用主循环，确保格式/数量/参数适配一致）
    this.logger.error(`All 通义万相 models failed. Last error: ${lastError?.message}`);

    // 降级策略1: 如果是 R2V 模式（多图），回退到 I2V 模式（只用第一张图）
    if (downgradeDepth < 1 && options.media && options.media.length > 1) {
      this.logger.warn('R2V 所有模型失败，降级到 I2V 模式（仅使用第一张图片）');
      try {
        return await this.generateVideoWithTongyi(
          apiKey,
          { ...options, media: [options.media[0]] },
          textPrompt,
          downgradeDepth + 1,
        );
      } catch (err: any) {
        this.logger.warn(`I2V 降级也失败: ${err.message}`);
      }
    }

    // 降级策略2: 回退到 T2V 模式（不使用图片）
    if (downgradeDepth < 2 && options.media && options.media.length > 0) {
      this.logger.warn('I2V 降级也失败，回退到 T2V 模式（纯文字生成视频）');
      try {
        return await this.generateVideoWithTongyi(
          apiKey,
          { ...options, media: undefined },
          textPrompt,
          downgradeDepth + 1,
        );
      } catch (err: any) {
        this.logger.warn(`T2V 降级也失败: ${err.message}`);
      }
    }

    // 所有降级策略都失败了
    throw lastError || new Error('All 通义万相 models and fallback strategies failed');
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
  private async getTongyiVideoModels(videoType?: 'i2v' | 't2v' | 'r2v'): Promise<string[]> {
    if (videoType) {
      const models = await this.getActiveModels('video', videoType);
      const tongyiModels = models.filter((m: any) => m.provider === 'aliyun');
      if (tongyiModels.length) return tongyiModels.map((m: any) => m.model_id);
      const fallback: Record<string, string[]> = {
        'i2v': ['wan2.7-i2v-2026-04-25', 'wan2.6-i2v', 'wan2.5-i2v-preview', 'wan2.2-i2v-plus', 'wanx2.1-i2v-plus'],
        't2v': ['wan2.7-t2v', 'wan2.6-t2v', 'wanx2.1-t2v-turbo', 'wanx2.1-t2v-plus', 'wan2.5-t2v-preview'],
        'r2v': ['wan2.6-r2v', 'wan2.6-r2v-flash', 'wan2.7-r2v', 'wan2.7-r2v-2026-06-12'],
      };
      return fallback[videoType] || [];
    }
    const models = await this.getActiveModels('video');
    const tongyiModels = models.filter((m: any) => m.provider === 'aliyun');
    if (tongyiModels.length) return tongyiModels.map((m: any) => m.model_id);
    return [
      'wan2.7-i2v', 'wan2.7-r2v', 'wan2.7-t2v',
      'wan2.7-i2v-2026-04-25', 'wan2.7-r2v-2026-06-12', 'wan2.7-t2v-2026-06-12',
      'wan2.6-i2v', 'wan2.6-r2v', 'wan2.6-r2v-flash', 'wan2.6-t2v',
      'wan2.7-videoedit',
      'wanx2.1-i2v-plus', 'wanx2.1-t2v-plus', 'wanx2.1-t2v-turbo',
      'wan2.5-i2v-preview', 'wan2.5-t2v-preview', 'wan2.2-i2v-plus',
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
      if (options.imageUrl.startsWith('data:')) {
        contentItems.push({
          type: 'image_url',
          image_url: { url: options.imageUrl },
          role: 'first_frame',
        });
      } else if (options.imageUrl.startsWith('http')) {
        // Convert localhost/static URLs to base64 (cloud can't reach localhost),
        // keep remote public URLs as-is
        try {
          const m = options.imageUrl.match(/^https?:\/\/[^/]+\/static\/(.+)$/);
          if (m) {
            const b64 = await this.imageToBase64(`/static/${m[1]}`);
            contentItems.push({
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${b64}` },
              role: 'first_frame',
            });
          } else {
            contentItems.push({ type: 'image_url', image_url: { url: options.imageUrl }, role: 'first_frame' });
          }
        } catch (err: any) {
          this.logger.warn(`Seedance image base64 conversion failed: ${err.message}, falling back to raw URL`);
          contentItems.push({ type: 'image_url', image_url: { url: options.imageUrl }, role: 'first_frame' });
        }
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
    const maxAttempts = 120; // 10 minutes with dynamic intervals

    while (attempts < maxAttempts) {
      // 动态轮询间隔：前15次(30秒)用2秒，之后用5秒
      const interval = attempts < 15 ? 2000 : 5000;
      await this.delay(interval);
      attempts++;

      try {
        const pollRes = await axios.get(pollUrl, {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 15000,
        });

        const status = pollRes.data.status;
        if (attempts === 1 || attempts % 6 === 0) {
          this.logger.log(`Seedance ${model} task ${taskId}: ${status} (${attempts * (attempts < 15 ? 2 : 5)}s elapsed)`);
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
      // Convert localhost/static URLs to data URI (cloud can't reach localhost)
      let imageUrl: string | undefined;
      if (options.imageUrl) {
        const m = options.imageUrl.match(/^https?:\/\/[^/]+\/static\/(.+)$/);
        if (m) {
          try {
            const b64 = await this.imageToBase64(`/static/${m[1]}`);
            imageUrl = `data:image/jpeg;base64,${b64}`;
          } catch { imageUrl = options.imageUrl; }
        } else if (options.imageUrl.startsWith('/static/') || (!options.imageUrl.startsWith('http') && !options.imageUrl.startsWith('data:'))) {
          try {
            const b64 = await this.imageToBase64(options.imageUrl);
            imageUrl = `data:image/jpeg;base64,${b64}`;
          } catch { imageUrl = options.imageUrl; }
        } else {
          imageUrl = options.imageUrl;
        }
      }
      const response = await axios.post(
        'https://api.z.ai/api/paas/v4/videos/generations',
        {
          model: 'cogvideox-3',
          prompt,
          image_url: imageUrl || undefined,
          quality: 'quality',
          with_audio: true,
          size: (options.resolution || '720p').toUpperCase().replace('P', ''),
          fps: 30,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );
      const taskId = response.data?.id;
      if (!taskId) {
        return '';
      }
      for (let i = 0; i < 60; i++) {
        const interval = i < 10 ? 2000 : 5000;
        await this.delay(interval);
        const pollRes = await axios.get(
          `https://api.z.ai/api/paas/v4/async-result/${taskId}`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 15000,
          },
        );
        const status = pollRes.data?.task_status;
        if (status === 'SUCCESS') {
          return pollRes.data?.video_result?.[0]?.url || '';
        }
        if (status === 'FAIL') {
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
      // Convert localhost/static URLs to data URI (cloud can't reach localhost)
      let imageUrl: string | undefined;
      if (options.imageUrl) {
        const m = options.imageUrl.match(/^https?:\/\/[^/]+\/static\/(.+)$/);
        if (m) {
          try {
            const b64 = await this.imageToBase64(`/static/${m[1]}`);
            imageUrl = `data:image/jpeg;base64,${b64}`;
          } catch { imageUrl = options.imageUrl; }
        } else if (options.imageUrl.startsWith('/static/') || (!options.imageUrl.startsWith('http') && !options.imageUrl.startsWith('data:'))) {
          try {
            const b64 = await this.imageToBase64(options.imageUrl);
            imageUrl = `data:image/jpeg;base64,${b64}`;
          } catch { imageUrl = options.imageUrl; }
        } else {
          imageUrl = options.imageUrl;
        }
      }

      // Step 1: Create the task
      const createRes = await axios.post(
        'https://api.runwayml.com/v1/tasks',
        {
          model: 'gen3',
          input: {
            image_url: imageUrl,
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

        const interval = attempts < 10 ? 2000 : 5000;
        await this.delay(interval);
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

  async generateSmartDescription(imageUrls: string[]): Promise<string> {
    if (!imageUrls || imageUrls.length === 0) {
      throw new Error('请提供至少一张图片');
    }

    const provider = await this.getConfigValue('llm_provider') || 'auto';
    const systemPrompt = '你是一个专业的视频创作助手。请仔细观察提供的图片，生成一个详细的中文描述，适合用于AI视频生成。描述应包含：1. 画面中的主要角色/物体 2. 场景环境 3. 人物动作或姿态 4. 情绪氛围 5. 镜头运动建议。描述要生动具体，200字以内。';

    const userPrompt = `请根据提供的${imageUrls.length}张图片，生成一段用于AI视频生成的中文描述。`;

    if (provider === 'aliyun' || provider === 'auto') {
      const key = await this.getApiKey('tongyi_api_key');
      if (key) {
        const visionModels = [
          'qwen3.5-omni-plus-2026-03-15',
          'qwen3-omni-flash-realtime-2025-09-15',
          'qwen3-omni-flash-realtime',
          'qwen3-vl-plus',
          'qwen-vl-max',
          'qwen-vl-plus',
          'qwen3-vl-flash',
        ];
        for (const model of visionModels) {
          try {
            this.logger.log(`尝试阿里云视觉模型: ${model}`);
            const result = await this.chatWithVision(key, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model, systemPrompt, userPrompt, imageUrls);
            if (result) {
              this.logger.log(`阿里云视觉模型 ${model} 调用成功`);
              return result;
            }
          } catch (err: any) {
            this.logger.warn(`${model} failed: ${err.message}`);
          }
        }
      }
    }

    if (provider === 'volcengine' || provider === 'auto') {
      const key = await this.getApiKey('volcengine_api_key');
      if (key) {
        try {
          this.logger.log('Using 火山引擎 Doubao-VL for image description');
          const textModels = await this.getActiveModels('text');
          const volcModels = textModels.filter((m: any) => m.provider === 'volcengine' && (m.sub_capability === 'vision' || m.model_id.includes('vision')))
            .sort((a: any, b: any) => a.priority - b.priority);
          const modelId = volcModels.length
            ? volcModels[0].model_id
            : 'doubao-vision-pro-32k-250115';
          const result = await this.chatWithVision(key, 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', modelId, systemPrompt, userPrompt, imageUrls);
          if (result) return result;
        } catch (err: any) {
          this.logger.warn(`Doubao-VL failed: ${err.message}`);
        }
      }
    }

    if (provider === 'zhipu' || provider === 'auto') {
      const key = await this.getApiKey('zai_api_key');
      if (key) {
        try {
          this.logger.log('Using 智谱 glm-4v for image description');
          const result = await this.chatWithVision(key, 'https://api.z.ai/api/paas/v4/chat/completions', 'glm-4v', systemPrompt, userPrompt, imageUrls);
          if (result) return result;
        } catch (err: any) {
          this.logger.warn(`glm-4v failed: ${err.message}`);
        }
      }
    }

    if (provider === 'openai' || provider === 'auto') {
      const key = await this.getApiKey('openai_api_key');
      if (key) {
        try {
          this.logger.log('Using GPT-4o Vision for image description');
          const result = await this.chatWithVision(key, 'https://api.openai.com/v1/chat/completions', 'gpt-4o', systemPrompt, userPrompt, imageUrls);
          if (result) return result;
        } catch (err: any) {
          this.logger.warn(`GPT-4o failed: ${err.message}`);
        }
      }
    }

    // 降级：如果所有多模态模型都失败，使用纯文本模型生成通用描述
    this.logger.warn('所有多模态模型不可用，降级为纯文本生成通用描述');
    const textFallback = await this.generateDescriptionFromText(imageUrls);
    if (textFallback) return textFallback;

    throw new Error('所有模型均不可用，请检查API密钥配置或手动输入描述');
  }

  /**
   * 通用多模态分析：发送自定义提示词 + 图片帧到视觉模型
   */
  async analyzeFrames(systemPrompt: string, userPrompt: string, imageUrls: string[]): Promise<string> {
    if (!imageUrls || imageUrls.length === 0) throw new Error('请提供至少一张图片');

    const provider = await this.getConfigValue('llm_provider') || 'auto';

    // Aliyun vision models
    if (provider === 'aliyun' || provider === 'auto') {
      const key = await this.getApiKey('tongyi_api_key');
      if (key) {
        const visionModels = [
          'qwen3.5-omni-plus-2026-03-15',
          'qwen3-omni-flash-realtime-2025-09-15',
          'qwen3-omni-flash-realtime',
          'qwen3-vl-plus',
          'qwen-vl-max',
          'qwen-vl-plus',
          'qwen3-vl-flash',
        ];
        for (const model of visionModels) {
          try {
            this.logger.log(`尝试阿里云视觉模型: ${model}`);
            const result = await this.chatWithVision(key, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model, systemPrompt, userPrompt, imageUrls);
            if (result) return result;
          } catch (err: any) {
            this.logger.warn(`${model} failed: ${err.message}`);
          }
        }
      }
    }

    // Volcengine vision
    if (provider === 'volcengine' || provider === 'auto') {
      const key = await this.getApiKey('volcengine_api_key');
      if (key) {
        try {
          const textModels = await this.getActiveModels('text');
          const volcModels = textModels.filter((m: any) => m.provider === 'volcengine' && (m.sub_capability === 'vision' || m.model_id.includes('vision')))
            .sort((a: any, b: any) => a.priority - b.priority);
          const modelId = volcModels.length ? volcModels[0].model_id : 'doubao-vision-pro-32k-250115';
          const result = await this.chatWithVision(key, 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', modelId, systemPrompt, userPrompt, imageUrls);
          if (result) return result;
        } catch (err: any) {
          this.logger.warn(`Doubao-VL failed: ${err.message}`);
        }
      }
    }

    // Zhipu vision
    if (provider === 'zhipu' || provider === 'auto') {
      const key = await this.getApiKey('zai_api_key');
      if (key) {
        try {
          const result = await this.chatWithVision(key, 'https://api.z.ai/api/paas/v4/chat/completions', 'glm-4v', systemPrompt, userPrompt, imageUrls);
          if (result) return result;
        } catch (err: any) {
          this.logger.warn(`glm-4v failed: ${err.message}`);
        }
      }
    }

    // OpenAI vision
    if (provider === 'openai' || provider === 'auto') {
      const key = await this.getApiKey('openai_api_key');
      if (key) {
        try {
          const result = await this.chatWithVision(key, 'https://api.openai.com/v1/chat/completions', 'gpt-4o', systemPrompt, userPrompt, imageUrls);
          if (result) return result;
        } catch (err: any) {
          this.logger.warn(`GPT-4o failed: ${err.message}`);
        }
      }
    }

    throw new Error('所有多模态模型均不可用');
  }

  private async generateDescriptionFromText(imageUrls: string[]): Promise<string> {
    try {
      const provider = await this.getConfigValue('llm_provider') || 'auto';
      const systemPrompt = `你是一个专业的视频创作助手。请根据用户提供的图片信息，生成一个详细的中文描述，适合用于AI视频生成。描述应生动具体，200字以内。`;
      const imageInfo = imageUrls.map((url, i) => `图片${i + 1}: ${url.split('/').pop() || url}`).join('\n');
      const userPrompt = `以下是用户上传的图片列表，请为这些图片生成一个视频描述：\n${imageInfo}\n\n请生成一个适合AI视频生成的中文描述，包含：主要角色/物体、场景环境、动作姿态、情绪氛围等。`;

      if (provider === 'aliyun' || provider === 'auto') {
        const key = await this.getApiKey('tongyi_api_key');
        if (key) {
          const result = await this.chatCompletion([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ], { temperature: 0.7, maxTokens: 2000 });
          if (result) return result;
        }
      }

      if (provider === 'zhipu' || provider === 'auto') {
        const key = await this.getApiKey('zai_api_key');
        if (key) {
          const result = await this.chatCompletion([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ], { temperature: 0.7, maxTokens: 2000 });
          if (result) return result;
        }
      }

      return `根据上传的${imageUrls.length}张图片生成的视频描述。请在图片生视频页面补充具体的场景、人物和动作描述。`;
    } catch (err) {
      this.logger.warn(`文本降级也失败了: ${err.message}`);
      return `根据上传的${imageUrls.length}张图片生成的视频描述。请补充具体描述。`;
    }
  }

  private async chatWithVision(
    apiKey: string,
    url: string,
    model: string,
    systemPrompt: string,
    userPrompt: string,
    imageUrls: string[],
  ): Promise<string> {
    try {
      const content: any[] = [{ type: 'text', text: userPrompt }];
      let successCount = 0;
      let failCount = 0;

      for (const imgUrl of imageUrls) {
        let imageContent: any;
        try {
          // 尝试下载图片并转换为 base64，确保多模态模型可以访问
          const base64Image = await this.imageToBase64(imgUrl);
          let mimeType = 'image/jpeg';
          
          // 从 URL 推断 MIME 类型
          if (imgUrl.includes('.')) {
            const ext = imgUrl.split('?')[0].split('.').pop()?.toLowerCase();
            const mimeMap: Record<string, string> = {
              'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 
              'png': 'image/png', 'gif': 'image/gif', 
              'webp': 'image/webp', 'bmp': 'image/bmp'
            };
            mimeType = mimeMap[ext || ''] || 'image/jpeg';
          }
          
          // 检查 base64 长度，太小可能是无效图片
          if (base64Image.length < 100) {
            this.logger.warn(`图片 ${imgUrl.substring(0, 50)}... base64 太小 (${base64Image.length} chars)，可能无效`);
            failCount++;
            continue;
          }
          
          imageContent = { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } };
          this.logger.log(`成功转换图片 ${imgUrl.substring(0, 50)}... 为 base64 (${base64Image.length} chars)`);
          successCount++;
        } catch (imgErr) {
          this.logger.error(`图片下载失败: ${imgUrl.substring(0, 50)}... - ${imgErr.message}`);
          // 不再降级使用原始 URL，因为阿里云无法访问 localhost 或内网 URL
          failCount++;
          continue;
        }
        content.push(imageContent);
      }

      // 如果没有成功下载任何图片，抛出错误
      if (successCount === 0) {
        throw new Error(`所有图片下载失败 (${imageUrls.length}/${imageUrls.length})，无法调用多模态模型。请检查图片 URL 是否为公网可访问地址。`);
      }

      this.logger.log(`图片处理完成: 成功 ${successCount}, 失败 ${failCount}`);

      const requestBody = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      };

      this.logger.log(`调用多模态 API: model=${model}, images=${successCount}, url=${url}`);
      this.logger.debug(`请求体预览: ${JSON.stringify(requestBody).substring(0, 500)}`);

      const response = await axios.post(
        url,
        requestBody,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        },
      );
      this.logger.log(`多模态 API 响应成功`);
      return response.data.choices?.[0]?.message?.content || '';
    } catch (err: any) {
      this.logger.error(`Vision LLM call failed: ${err.message}`);
      if (err.response) {
        this.logger.error(`响应状态码: ${err.response.status}`);
        this.logger.error(`响应详情: ${JSON.stringify(err.response.data).substring(0, 500)}`);
      }
      throw err;
    }
  }

  private async imageToBase64(imagePath: string): Promise<string> {
    try {
      // 处理 data: URI（前端上传的 base64 图片）
      if (imagePath.startsWith('data:')) {
        const match = imagePath.match(/^data:image\/\w+;base64,(.+)$/);
        if (match) {
          this.logger.log(`从 data URI 提取 base64 (${match[1].length} chars)`);
          return match[1];
        }
        throw new Error(`无效的 data URI 格式`);
      }

      // 处理本地文件路径
      if (!imagePath.startsWith('http')) {
        // 尝试多种可能的路径格式
        let filePath = imagePath;
        
        // 如果是 /static/xxx 格式，转换为实际路径
        if (filePath.startsWith('/static/')) {
          filePath = path.join(process.cwd(), 'output', filePath.replace('/static/', ''));
        }
        
        // 如果是其他相对路径，尝试从 output 目录查找
        if (!path.isAbsolute(filePath) && !fs.existsSync(filePath)) {
          const altPath = path.join(process.cwd(), 'output', path.basename(filePath));
          if (fs.existsSync(altPath)) {
            filePath = altPath;
          }
        }
        
        if (!fs.existsSync(filePath)) {
          throw new Error(`本地文件不存在: ${filePath}`);
        }
        
        const data = fs.readFileSync(filePath);
        if (data.length < 100) {
          throw new Error(`文件太小 (${data.length} bytes)，可能无效: ${filePath}`);
        }
        
        this.logger.log(`读取本地文件: ${filePath} (${data.length} bytes)`);
        return data.toString('base64');
      }
      
      // 处理远程 URL
      const response = await axios.get(imagePath, { 
        responseType: 'arraybuffer',
        timeout: 15000,
        maxRedirects: 5,
      });
      
      if (response.data.length < 100) {
        throw new Error(`下载文件太小 (${response.data.length} bytes)，可能无效`);
      }
      
      this.logger.log(`下载远程文件: ${imagePath.substring(0, 50)}... (${response.data.length} bytes)`);
      return Buffer.from(response.data).toString('base64');
    } catch (err) {
      this.logger.error(`Failed to convert image to base64: ${err.message}`);
      throw err;
    }
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
    };
    return mimeMap[ext] || 'image/jpeg';
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
