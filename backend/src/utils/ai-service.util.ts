import { Injectable, Logger } from '@nestjs/common';
import { AdminService } from '../modules/admin/admin.service';
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
}

export interface VideoGenerationOptions {
  imageUrl: string;
  prompt?: string;
  duration?: number;
  fps?: number;
  resolution?: string; // e.g. '720x1280', '1080x1920'
  model?: string; // specific model ID to use, overrides priority chain
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

  constructor(private readonly adminService: AdminService) {}

  private async getApiKey(key: string): Promise<string | null> {
    return this.adminService.getConfigValue(key);
  }

  private async getConfigValue(key: string): Promise<string | null> {
    return this.adminService.getConfigValue(key);
  }

  /** Generate image from text prompt using configured AI provider */
  async generateImage(options: ImageGenerationOptions): Promise<string[]> {
    const provider = await this.getConfigValue('image_provider') || 'auto';

    if (provider === 'volcengine') {
      const key = await this.getApiKey('seedream_api_key') || await this.getApiKey('volcengine_api_key');
      if (key) {
        this.logger.log('Using 火山引擎 Seedream (forced) for image generation');
        try { return await this.generateImageWithSeedream(key, options); }
        catch (err: any) { this.logger.warn(`Seedream failed: ${err.message}`); }
      }
    } else if (provider === 'aliyun') {
      const key = await this.getApiKey('tongyi_api_key');
      if (key) {
        this.logger.log('Using 阿里云通义万相 (forced) for image generation');
        try { return await this.generateImageWithTongyi(key, options); }
        catch (err: any) { this.logger.warn(`通义万相 failed: ${err.message}`); }
      }
    } else if (provider === 'openai') {
      const key = await this.getApiKey('openai_api_key');
      if (key) {
        this.logger.log('Using OpenAI DALL·E (forced) for image generation');
        try { return await this.generateImageWithOpenAI(key, options); }
        catch (err: any) { this.logger.warn(`OpenAI failed: ${err.message}`); }
      }
    }

    // Auto mode (default priority chain)
    const seedreamKey = await this.getApiKey('seedream_api_key');
    const volcengineKey = await this.getApiKey('volcengine_api_key');
    const openaiKey = await this.getApiKey('openai_api_key');
    const tongyiKey = await this.getApiKey('tongyi_api_key');

    if (seedreamKey) {
      this.logger.log('Using 豆包 Seedream (dedicated key) for image generation');
      try { return await this.generateImageWithSeedream(seedreamKey, options); }
      catch (err: any) { this.logger.warn(`Seedream failed: ${err.message}`); }
    }
    if (volcengineKey) {
      this.logger.log('Trying 火山引擎通用 Key for Seedream...');
      try { return await this.generateImageWithSeedream(volcengineKey, options); }
      catch (err: any) { this.logger.warn(`Seedream via volcengine key failed: ${err.message}`); }
    }
    if (openaiKey) {
      this.logger.log('Using OpenAI DALL·E for image generation');
      return this.generateImageWithOpenAI(openaiKey, options);
    }
    if (tongyiKey) {
      this.logger.log('Using 通义万相 for image generation');
      return this.generateImageWithTongyi(tongyiKey, options);
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

  /** Seedream model IDs in priority order (try newest first, fall back to older) */
  private readonly SEEDREAM_MODELS = [
    'doubao-seedream-4-5-251128',   // 4.5 (免费在线推理)
    'doubao-seedream-4-0-250828',   // 4.0
    'doubao-seedream-1-0-pro',      // 1.0 Pro
  ];

  /** Generate image using 火山引擎 Seedream (豆包) — OpenAI compatible */
  private async generateImageWithSeedream(
    apiKey: string,
    options: ImageGenerationOptions,
  ): Promise<string[]> {
    const w = options.width || 1080;
    const h = options.height || 1920;
    // Map our size to Seedream supported ratios
    let size = '1024x1024';
    if (w / h > 1.5) size = '2560x1440';       // 16:9
    else if (h / w > 1.5) size = '1440x2560';   // 9:16 vertical (抖音)
    else if (w / h > 1.2) size = '2304x1728';   // 4:3
    else if (h / w > 1.2) size = '1728x2304';   // 3:4

    // Try each model in priority order
    let lastError: any;
    for (const model of this.SEEDREAM_MODELS) {
      try {
        this.logger.log(`Trying Seedream model: ${model}`);
        const response = await axios.post(
          'https://ark.cn-beijing.volces.com/api/v3/images/generations',
          {
            model,
            prompt: options.prompt,
            size,
            n: options.numImages || 1,
            response_format: 'url',
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 120000,
          },
        );
        const urls = (response.data.data || []).map((img: any) => img.url).filter(Boolean);
        if (urls.length > 0) {
          this.logger.log(`Seedream (${model}) generated ${urls.length} image(s)`);
          return urls;
        }
      } catch (err: any) {
        lastError = err;
        const errMsg = err.response?.data?.error?.message || err.message;
        this.logger.warn(`Seedream model ${model} failed: ${errMsg}`);
        // If it's a "model not activated" error, try next model
        if (errMsg.includes('not activated') || errMsg.includes('ModelNotOpen') || err.response?.status === 404) {
          continue;
        }
        // For other errors (auth, network, etc.), stop trying
        throw err;
      }
    }

    // All models failed
    this.logger.error(`All Seedream models failed. Last error: ${lastError?.message}`);
    if (lastError?.response?.data) {
      this.logger.error(`Response: ${JSON.stringify(lastError.response.data)}`);
    }
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

    // If a specific model is requested, route by model prefix and use exclusively
    if (options.model) {
      this.logger.log(`Using requested model: ${options.model}`);
      if (options.model.startsWith('doubao-seedance')) {
        const key = await this.getApiKey('seedance_api_key') || await this.getApiKey('volcengine_api_key');
        if (key) return await this.generateVideoWithSeedance(key, options, textPrompt);
        throw new Error('火山引擎 Key 未配置，无法使用 ' + options.model);
      }
      if (options.model.startsWith('wan') || options.model.startsWith('wanx') || options.model.startsWith('happyhorse')) {
        const key = await this.getApiKey('tongyi_api_key');
        if (key) return await this.generateVideoWithTongyi(key, options, textPrompt);
        throw new Error('阿里云 Key 未配置，无法使用 ' + options.model);
      }
      // Unknown model prefix — fall through to provider-based routing
    }

    if (provider === 'volcengine') {
      const key = await this.getApiKey('seedance_api_key') || await this.getApiKey('volcengine_api_key');
      if (!key) throw new Error('火山引擎 Key 未配置，但视频供应商设为 volcengine');
      this.logger.log('Using 火山引擎 Seedance (forced) for video generation');
      return await this.generateVideoWithSeedance(key, options, textPrompt);
    } else if (provider === 'aliyun') {
      const key = await this.getApiKey('tongyi_api_key');
      if (!key) throw new Error('阿里云 Key 未配置，但视频供应商设为 aliyun');
      this.logger.log('Using 阿里云通义万相 (forced) for video generation');
      return await this.generateVideoWithTongyi(key, options, textPrompt);
    } else if (provider === 'runway') {
      const key = await this.getApiKey('runway_api_key');
      if (!key) throw new Error('Runway Key 未配置，但视频供应商设为 runway');
      this.logger.log('Using Runway (forced) for video generation');
      return await this.generateVideoWithRunway(key, options);
    }

    // Auto mode (default priority chain)
    const seedanceKey = await this.getApiKey('seedance_api_key');
    const volcengineKey = await this.getApiKey('volcengine_api_key');
    const runwayKey = await this.getApiKey('runway_api_key');

    if (seedanceKey) {
      this.logger.log('Using Seedance (dedicated key) for video generation');
      try { return await this.generateVideoWithSeedance(seedanceKey, options, textPrompt); }
      catch (err: any) { this.logger.error(`Seedance failed: ${err.message}`); }
    }
    if (volcengineKey && volcengineKey !== seedanceKey) {
      this.logger.log('Trying 火山引擎通用 Key for Seedance...');
      try { return await this.generateVideoWithSeedance(volcengineKey, options, textPrompt); }
      catch (err: any) { this.logger.error(`Seedance via volcengine key failed: ${err.message}`); }
    }
    if (runwayKey) {
      this.logger.log('Using Runway Gen-3 for video generation');
      try { return await this.generateVideoWithRunway(runwayKey, options); }
      catch (err: any) { this.logger.error(`Runway failed: ${err.message}`); }
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
    const ratio = '9:16';

    const modelsToTry = options.model ? [options.model] : this.TONGYI_VIDEO_MODELS;
    let lastError: any;
    for (const model of modelsToTry) {
      try {
        this.logger.log(`Trying 通义万相 model: ${model}`);
        const submitRes = await axios.post(
          'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
          {
            model,
            input: { prompt },
            parameters: {
              duration,
              resolution: res.toUpperCase(), // 720p → 720P
              ratio,
              prompt_extend: false,
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
    const res = options.resolution || '1080x1920';
    // Parse resolution label like '480p', '720p', '1080p'
    let resStr = res;
    if (res === '480p') resStr = '480x854';
    else if (res === '720p') resStr = '720x1280';
    else if (res === '1080p') resStr = '1080x1920';

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
      return this.generateEmergencyPlaceholder(res, options.duration || 5);
    }
  }

  /**
   * Emergency fallback: generate a bare-minimum video when everything else fails.
   * Uses the simplest possible ffmpeg command to guarantee a valid output file.
   */
  generateEmergencyPlaceholder(resolution: string, duration: number): string {
    const outputDir = path.resolve(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `emergency_${Date.now()}.mp4`);

    // Map resolution to pixel dimensions
    let width = 720, height = 1280;
    switch (resolution) {
      case '480p': width = 480; height = 854; break;
      case '1080p': width = 1080; height = 1920; break;
      case '720p':
      default: width = 720; height = 1280; break;
    }

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

  /** Seedance model IDs in priority order (try newest first, fall back to older) */
  private readonly SEEDANCE_MODELS = [
    'doubao-seedance-1-5-pro-251215',    // 1.5 Pro ⭐ 主力
    'doubao-seedance-2-0-260128',        // 2.0 (需充值)
    'doubao-seedance-2-0-fast-260128',   // 2.0 Fast
    'doubao-seedance-1-0-pro-fast-251015', // 1.0 Pro Fast
    'doubao-seedance-1-0-pro-250528',    // 1.0 Pro (兜底)
  ];

  /** 通义万相 video models in priority order */
  private readonly TONGYI_VIDEO_MODELS = [
    'wan2.7-t2v-2026-04-25',     // 用户确认有免费额度
    'wan2.7-t2v',
    'wan2.7-i2v-2026-04-25',
    'wan2.7-r2v',
    'happyhorse-1.0-video-edit',
    'wan2.6-t2v',
    'wanx2.1-t2v-turbo',
  ];

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
      ratio: '9:16',
      duration: options.duration || 5,
      watermark: false,
    };

    // Try models — either the specified one or the full priority chain
    const modelsToTry = options.model ? [options.model] : this.SEEDANCE_MODELS;
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
      const key = await this.getApiKey('seedance_api_key') || await this.getApiKey('volcengine_api_key');
      if (key) {
        this.logger.log('Using 火山引擎 Doubao (forced) for chat');
        try {
          return await this.chatWithOpenAI(
            key,
            'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
            'doubao-1-5-pro-256k-250715',
            messages,
            options,
          );
        } catch (err: any) { this.logger.warn(`Doubao failed: ${err.message}`); }
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
    }

    // Auto mode (default priority chain)
    const openaiKey = await this.getApiKey('openai_api_key');
    const deepseekKey = await this.getApiKey('deepseek_api_key');

    if (openaiKey) {
      return this.chatWithOpenAI(
        openaiKey,
        'https://api.openai.com/v1/chat/completions',
        'gpt-4o',
        messages,
        options,
      );
    }
    if (deepseekKey) {
      return this.chatWithOpenAI(
        deepseekKey,
        'https://api.deepseek.com/v1/chat/completions',
        'deepseek-chat',
        messages,
        options,
      );
    }

    this.logger.warn('No LLM API key configured');
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
          timeout: 120000,
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
