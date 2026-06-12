import { Processor, Process } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VideoService } from '../modules/video/video.service';
import { AIServiceUtil } from '../utils/ai-service.util';
import { FFmpegUtil } from '../utils/ffmpeg.util';
import { Character } from '../modules/character/character.entity';
import { Script } from '../modules/script/script.entity';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

@Injectable()
@Processor('video')
export class VideoProcessor {
  private readonly logger = new Logger(VideoProcessor.name);

  constructor(
    private readonly videoService: VideoService,
    private readonly aiService: AIServiceUtil,
    private readonly ffmpeg: FFmpegUtil,
    @InjectRepository(Character)
    private readonly characterRepo: Repository<Character>,
    @InjectRepository(Script)
    private readonly scriptRepo: Repository<Script>,
  ) {}

  @Process('generate')
  async handleGenerate(job: any) {
    const { taskId, userId, scriptId, scriptTitle, characterId, characterName, characterDesc, prompt, resolution, duration, style, model } = job.data;
    const videoResolution = resolution || '720p';
    const videoDuration = duration || 5;
    this.logger.log(`Processing video task #${taskId} — ${videoResolution}, ${videoDuration}s`);

    try {
      await this.videoService.updateStatus(taskId, { status: 'processing', progress: 5 });

      // --- Fetch or create character ---
      let character: Character | null = null;

      if (characterId) {
        character = await this.characterRepo.findOne({ where: { id: characterId, user_id: userId } });
      }

      // If no character selected but name/desc provided, create on-the-fly
      if (!character && (characterName || characterDesc)) {
        character = this.characterRepo.create({
          user_id: userId,
          name: characterName || '未命名角色',
          description: characterDesc || '',
        });
        character = await this.characterRepo.save(character);
        this.logger.log(`Created character on-the-fly: ${character.name}`);
      }

      if (character) {
        this.logger.log(`Using character: ${character.name} — ${character.description?.slice(0, 50) || '(no description)'}`);
      }

      // --- Fetch script or use custom prompt ---
      let script: Script | null = null;
      let customPrompt = prompt || '';

      if (scriptId) {
        script = await this.scriptRepo.findOne({ where: { id: scriptId, user_id: userId } });
        if (script) {
          this.logger.log(`Using script: ${script.title}`);
        }
      }

      // If no script but custom prompt provided, create a temp script record
      if (!script && customPrompt) {
        script = this.scriptRepo.create({
          user_id: userId,
          title: scriptTitle || (customPrompt.slice(0, 30) || '自定义剧情') + '...',
          content: customPrompt,
          status: 'draft',
        });
        script = await this.scriptRepo.save(script);
        this.logger.log(`Created script on-the-fly from prompt`);
      }

      // --- Step 1+2: Generate video ---
      const videoPrompt = this.buildVideoPrompt(character, script, customPrompt, style || 'anime');
      let imageUrl = '';
      let videoUrl = '';

      // Try Seedance direct text-to-video first (no image needed!)
      await this.videoService.updateStatus(taskId, { progress: 15 });
      this.logger.log(`Step 1/4: Seedance text-to-video (${videoResolution}, ${videoDuration}s)...`);
      videoUrl = await this.aiService.generateVideo(
        { imageUrl: '', prompt: videoPrompt, duration: videoDuration, resolution: videoResolution, model: model || undefined },
        videoPrompt,
      );
      await this.videoService.updateStatus(taskId, { progress: 35 });

      // Determine what we got back
      const isRemoteVideo = videoUrl && (videoUrl.startsWith('http://') || videoUrl.startsWith('https://'));
      const isLocalPlaceholder = videoUrl && !videoUrl.startsWith('http') && videoUrl.length > 0;

      if (isRemoteVideo) {
        // Seedance returned a real video URL — download it for local compositing
        this.logger.log(`Got real video from Seedance: ${videoUrl.slice(0, 80)}...`);
        videoUrl = await this.downloadToTemp(videoUrl, 'seedance_video');
      } else if (isLocalPlaceholder) {
        // Fallback: generate image first, then animate to video
        this.logger.log(`Seedance unavailable, generating image first...`);
        const imagePrompt = this.buildImagePrompt(character, script, style || 'anime');
        this.logger.log(`Image prompt: ${imagePrompt.slice(0, 100)}...`);
        const [imgW, imgH] = this.resolutionToSize(videoResolution);
        const imageUrls = await this.aiService.generateImage({
          prompt: imagePrompt,
          width: imgW,
          height: imgH,
          numImages: 1,
        });
        imageUrl = imageUrls[0] || '';
        this.logger.log(`Image result: ${imageUrl ? imageUrl.slice(0, 80) : '(empty)'}...`);

        this.logger.log(`Step 2/4: Animating image to video (${videoResolution}, ${videoDuration}s)...`);
        await this.videoService.updateStatus(taskId, { progress: 50 });
        videoUrl = await this.aiService.generateVideo(
          { imageUrl, prompt: videoPrompt, duration: videoDuration, resolution: videoResolution, model: model || undefined },
          videoPrompt,
        );
        this.logger.log(`Video result: ${videoUrl ? videoUrl.slice(0, 80) : '(empty)'}...`);
      } else {
        // videoUrl is empty — all AI services failed, generate placeholder
        this.logger.warn(`⚠️ No video generated — creating local test pattern (${videoResolution}, ${videoDuration}s)`);
        videoUrl = this.aiService.generatePlaceholderVideo({ imageUrl: '', duration: videoDuration, resolution: videoResolution });
      }

      // Safety check: if videoUrl is still empty, create a fallback
      if (!videoUrl || videoUrl.length === 0) {
        this.logger.warn(`⚠️ videoUrl is empty, generating emergency fallback`);
        videoUrl = this.aiService.generateEmergencyPlaceholder(videoResolution, videoDuration);
      }

      // --- Step 3: Generate TTS audio ---
      await this.videoService.updateStatus(taskId, { progress: 65 });
      this.logger.log(`Step 3/4: Generating narration audio...`);
      const ttsText = this.buildTTSText(script, character, customPrompt);
      this.logger.log(`TTS text: ${ttsText.slice(0, 100)}...`);

      let audioPath = '';
      try {
        const audioData = await this.aiService.generateTTS({
          text: ttsText,
          voice: 'alloy',
          speed: 1.0,
        });
        if (audioData && audioData.byteLength > 0) {
          const tmpDir = path.resolve(process.cwd(), 'output');
          if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
          audioPath = path.join(tmpDir, `tts_${taskId}_${Date.now()}.mp3`);
          fs.writeFileSync(audioPath, Buffer.from(audioData));
          this.logger.log(`TTS audio saved: ${audioPath}`);
        }
      } catch (ttsErr: any) {
        this.logger.warn(`TTS failed (key missing or API error): ${ttsErr.message}`);
      }

      // --- Generate subtitles from TTS text ---
      let subtitlePath = '';
      if (audioPath && ttsText) {
        try {
          const subs = await this.generateSubtitles(ttsText, audioPath);
          subtitlePath = subs.path;
          this.logger.log(`Subtitles generated: ${subtitlePath} (${subs.segments.length} segments)`);
        } catch (subErr: any) {
          this.logger.warn(`Subtitle generation failed: ${subErr.message}`);
        }
      }

      // --- Step 4: FFmpeg compositing ---
      await this.videoService.updateStatus(taskId, { progress: 80 });
      this.logger.log(`Step 4/4: Compositing final video... subtitlePath="${subtitlePath}"`);

      let finalOutput: string;

      // Determine if videoUrl is already a usable local video
      const videoUrlIsLocalVideo = videoUrl && !videoUrl.startsWith('http') && fs.existsSync(videoUrl);
      this.logger.log(`Compositing path: videoUrlIsLocalVideo=${videoUrlIsLocalVideo}, hasImage=${!!imageUrl}`);

      if (videoUrlIsLocalVideo) {
        // We have a local video file — either composite with audio or use directly
        if (audioPath && fs.existsSync(audioPath)) {
          this.logger.log(`Compositing local video with audio...`);
          finalOutput = await this.ffmpeg.compositeVideoWithAudio(
            videoUrl,
            audioPath,
            videoDuration,
            undefined,
            subtitlePath || undefined,
          );
        } else {
          this.logger.log(`No audio available — using video directly`);
          finalOutput = videoUrl;
        }
      } else if (imageUrl && imageUrl.length > 0) {
        // We have an image — composite it into a video
        let localImagePath = imageUrl;
        if (imageUrl.startsWith('http')) {
          localImagePath = await this.downloadToTemp(imageUrl, 'frame');
        }
        if (!localImagePath || !fs.existsSync(localImagePath)) {
          this.logger.warn(`Image file not found: ${localImagePath}, generating fallback...`);
          localImagePath = this.aiService.generateEmergencyPlaceholder(videoResolution, 1);
        }
        finalOutput = await this.ffmpeg.composite({
          imagePaths: [localImagePath],
          audioPath: audioPath || undefined,
          subtitlePath: subtitlePath || undefined,
          duration: videoDuration,
          fps: 24,
          resolution: this.resolutionToFFmpeg(videoResolution),
          format: 'mp4',
        });
      } else {
        // Last resort: generate from scratch
        this.logger.warn(`⚠️ No image or video available — creating emergency placeholder`);
        finalOutput = this.aiService.generateEmergencyPlaceholder(videoResolution, videoDuration);
        if (audioPath && fs.existsSync(audioPath)) {
          finalOutput = await this.ffmpeg.compositeVideoWithAudio(
            finalOutput,
            audioPath,
            videoDuration,
            undefined,
            subtitlePath || undefined,
          );
        }
      }

      this.logger.log(`Raw output: ${finalOutput}`);

      // --- Post-process: adjust resolution & duration to match user's selection ---
      const targetRes = this.resolutionToFFmpeg(videoResolution);
      const adjustedOutput = await this.ffmpeg.adjustVideo(finalOutput, targetRes, videoDuration);
      if (adjustedOutput !== finalOutput) {
        this.logger.log(`Video adjusted to ${targetRes}, ${videoDuration}s`);
      }
      finalOutput = adjustedOutput;

      this.logger.log(`Final video: ${finalOutput}`);

      // Build web-accessible URLs
      const videoFilename = path.basename(finalOutput);
      const videoWebUrl = `/static/${videoFilename}`;
      let coverWebUrl = imageUrl;
      if (coverWebUrl && !coverWebUrl.startsWith('http')) {
        coverWebUrl = `/static/${path.basename(coverWebUrl)}`;
      }
      if (!coverWebUrl) {
        coverWebUrl = videoWebUrl; // fallback cover
      }

      await this.videoService.updateStatus(taskId, {
        status: 'completed',
        video_url: videoWebUrl,
        cover_url: coverWebUrl,
        completed_at: new Date(),
        progress: 100,
      });
      await this.videoService.chargeForCompletedTask(taskId);

      this.logger.log(`✅ Video task #${taskId} completed successfully`);
      return { success: true, videoUrl: finalOutput, coverUrl: imageUrl };
    } catch (error: any) {
      this.logger.error(`❌ Video task #${taskId} failed: ${error.message}`);
      const task = await this.videoService.findOne(taskId, userId);
      const retryCount = (task as any).retry_count || 0;
      if (retryCount < 3) {
        await this.videoService.updateStatus(taskId, { status: 'pending', retry_count: retryCount + 1, progress: 0 });
        this.logger.log(`Retrying task #${taskId} (attempt ${retryCount + 1}/3)`);
        throw error;
      } else {
        await this.videoService.updateStatus(taskId, { status: 'failed', error_msg: error.message, completed_at: new Date(), progress: 100 });
        this.logger.error(`Task #${taskId} failed after ${retryCount} retries`);
      }
    }
  }

  /** Build image generation prompt from character + script */
  private buildImagePrompt(character: Character | null, script: Script | null, style = 'anime'): string {
    const isRealistic = style === 'realistic';
    const parts: string[] = [];

    if (isRealistic) {
      parts.push('真人实拍, live action, realistic photo, no animation');
    } else {
      parts.push('anime style, 动漫风格, 二次元, Japanese anime illustration, cel shade, hand-drawn, no realistic, no真人');
    }

    if (character) {
      parts.push(`${isRealistic ? 'Character' : 'Anime character'}: ${character.name}`);
      if (character.description) {
        parts.push(character.description);
      }
    } else {
      parts.push(isRealistic
        ? 'a real person, natural expression'
        : 'anime character, beautiful face, expressive eyes');
    }

    if (script?.title) {
      parts.push(`Scene from: ${script.title}`);
    }

    if (isRealistic) {
      parts.push('photorealistic, cinematic, 9:16 vertical');
    } else {
      parts.push('cinematic lighting, vibrant colors, 9:16 vertical');
    }
    return parts.join(', ');
  }

  /** Build video generation prompt */
  private buildVideoPrompt(character: Character | null, script: Script | null, customPrompt?: string, style = 'anime'): string {
    const isRealistic = style === 'realistic';
    const parts: string[] = [];

    if (isRealistic) {
      parts.push('真人实拍, live action, realistic video, no animation');
    } else {
      parts.push('anime style, 动漫风格, 二次元, Japanese animation, cel shade, 赛璐珞风格, hand-drawn, no realistic, no live action, no真人');
    }

    if (customPrompt) {
      parts.push(customPrompt);
    }

    if (character) {
      parts.push(`${character.name}${character.description ? `，${character.description}` : ''}`);
    }

    if (script?.content && !customPrompt) {
      const cleanText = script.content
        .replace(/\[.*?\]/g, '')
        .replace(/\n/g, '，')
        .trim();
      parts.push(cleanText.slice(0, 200));
    }

    if (isRealistic) {
      parts.push('cinematic quality, 9:16 vertical');
    } else {
      parts.push('cinematic quality, 9:16 vertical');
    }
    return parts.join('，');
  }

  /** Build TTS narration text from script + character + custom prompt */
  private buildTTSText(script: Script | null, character: Character | null, customPrompt?: string): string {
    if (script?.content) {
      const text = script.content.replace(/\[.*?\]/g, '').replace(/\n/g, '，').trim();
      return text.slice(0, 500);
    }
    // If no saved script but user typed custom prompt, use that
    if (customPrompt) {
      return customPrompt.slice(0, 500);
    }
    if (character) {
      return `${character.name}：${character.description || '一个神秘的角色'}，即将展开一段精彩的冒险。`;
    }
    return '欢迎来到AI动漫短剧的世界，让我们一起创造精彩的故事吧！';
  }

  /** Generate SRT subtitles from TTS text, timed proportionally to audio duration */
  private async generateSubtitles(ttsText: string, audioPath: string): Promise<{ path: string; segments: Array<{ start: number; end: number; text: string }> }> {
    const duration = audioPath ? await this.ffmpeg.getAudioDuration(audioPath) : 5;

    // Split into sentences by Chinese/English punctuation
    const sentences = ttsText
      .split(/[。！？；.!?;]/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (sentences.length === 0) {
      sentences.push(ttsText);
    }

    const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
    let currentTime = 0;
    const segments = sentences.map((text) => {
      const charRatio = totalChars > 0 ? text.length / totalChars : 1 / sentences.length;
      const segDuration = Math.max(duration * charRatio, 1.5);
      const start = currentTime;
      currentTime += segDuration;
      const end = Math.min(currentTime, duration);
      return { start, end, text };
    });

    // Make last segment end at exact duration
    if (segments.length > 0) {
      segments[segments.length - 1].end = duration;
    }

    const path = this.ffmpeg.createSubtitleFile(segments);
    return { path, segments };
  }

  /** Map resolution label to pixel dimensions (9:16 vertical) */
  private resolutionToSize(resolution: string): [number, number] {
    switch (resolution) {
      case '480p': return [480, 854];
      case '1080p': return [1080, 1920];
      case '720p':
      default: return [720, 1280];
    }
  }

  /** Map resolution label to FFmpeg format string */
  private resolutionToFFmpeg(resolution: string): string {
    const [w, h] = this.resolutionToSize(resolution);
    return `${w}x${h}`;
  }

  /** Download remote URL to local temp file */
  private async downloadToTemp(url: string, prefix: string): Promise<string> {
    if (!url.startsWith('http://') && !url.startsWith('https://')) return url;
    const tmpDir = path.resolve(process.cwd(), 'output');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const ext = path.extname(url.split('?')[0]) || '.png';
    const localPath = path.join(tmpDir, `${prefix}_${Date.now()}${ext}`);
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
      fs.writeFileSync(localPath, Buffer.from(response.data));
      this.logger.log(`Downloaded → ${localPath}`);
      return localPath;
    } catch (err: any) {
      this.logger.warn(`Download failed: ${err.message}`);
      return url;
    }
  }
}
