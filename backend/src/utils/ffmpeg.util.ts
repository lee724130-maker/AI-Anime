import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export interface FFmpegCompositeOptions {
  imagePaths: string[];
  audioPath?: string;
  subtitlePath?: string;
  outputPath?: string;
  duration?: number;
  fps?: number;
  resolution?: string;
  format?: string;
}

@Injectable()
export class FFmpegUtil {
  private readonly logger = new Logger(FFmpegUtil.name);
  private readonly outputDir: string;

  constructor() {
    // Use project-relative path to avoid Windows short-name (~) issues
    this.outputDir = path.resolve(process.cwd(), 'output');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    this.logger.log(`FFmpeg output directory: ${this.outputDir}`);
  }

  /**
   * Composite images + audio + subtitles into a video using FFmpeg
   */
  async composite(options: FFmpegCompositeOptions): Promise<string> {
    const {
      imagePaths,
      audioPath,
      subtitlePath,
      duration,
      fps = 24,
      resolution = '1080x1920', // default 9:16 vertical
      format = 'mp4',
    } = options;

    // --- Input validation ---
    const validImagePaths = (imagePaths || []).filter((p) => p && p.length > 0 && fs.existsSync(p));
    if (validImagePaths.length === 0) {
      throw new Error('视频合成失败: 没有有效的输入图片路径');
    }

    const outputPath = options.outputPath || path.join(
      this.outputDir,
      `composite_${Date.now()}.${format}`,
    );

    this.logger.log(`Compositing ${validImagePaths.length} images into ${outputPath}`);

    try {
      // Build FFmpeg command using array-based arguments (safer than string building)
      const args: string[] = ['-y'];

      // Input images
      if (validImagePaths.length === 1) {
        // Single image → treat as static video with duration
        args.push('-loop', '1', '-i', validImagePaths[0], '-t', String(duration || 5));
      } else {
        // Multiple images → create image sequence via concat file
        const concatFile = path.join(this.outputDir, 'concat.txt');
        const concatContent = validImagePaths
          .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
          .join('\n');
        fs.writeFileSync(concatFile, concatContent);
        args.push('-f', 'concat', '-safe', '0', '-i', concatFile);
      }

      // Input audio
      if (audioPath && fs.existsSync(audioPath)) {
        args.push('-i', audioPath);
      }

      // Video filter: scale + Ken Burns pan/zoom effect for single images
      const filters: string[] = [];
      if (validImagePaths.length === 1) {
        // Build Ken Burns zoompan filter
        const [rw, rh] = resolution.split('x').map(Number);
        const targetW = rw || 720;
        const targetH = rh || 1280;
        filters.push(
          `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase` +
          `,crop=${targetW}:${targetH}` +
          `,zoompan=z='min(zoom+0.001,1.05)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${targetW}x${targetH}`,
        );
      } else {
        filters.push(`scale=${resolution.replace('x', ':')}`);
      }

      // Add subtitles if provided
      this.logger.log(`composite: subtitlePath="${subtitlePath}", exists=${!!subtitlePath && fs.existsSync(subtitlePath)}`);
      if (subtitlePath && fs.existsSync(subtitlePath)) {
        const subForward = subtitlePath.replace(/\\/g, '/');
        // FFmpeg filter syntax: escape colons with \\: so drive letter C: doesn't become an option separator
        const subEscaped = subForward.replace(/:/g, '\\:');
        const subFilter = `subtitles=${subEscaped}`;
        this.logger.log(`Subtitle filter: ${subFilter}`);
        filters.push(subFilter);
      }

      if (filters.length > 0) {
        args.push('-vf', filters.join(','));
      }

      // Frame rate
      args.push('-r', String(fps));

      // Codec settings
      if (format === 'mp4') {
        args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23');
      } else {
        args.push('-c:v', 'libvpx-vp9');
      }

      // Audio codec (only if audio input present)
      if (audioPath && fs.existsSync(audioPath)) {
        args.push('-c:a', 'aac', '-b:a', '128k');
      }

      // Output path
      args.push(outputPath);

      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Build display command (for logging only)
      const displayCmd = args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ');
      this.logger.log(`FFmpeg command: ffmpeg ${displayCmd}`);

      const { stderr } = await execAsync(`ffmpeg ${displayCmd}`, { timeout: 60000 });
      if (stderr) {
        this.logger.debug(`FFmpeg stderr: ${stderr.slice(0, 200)}`);
      }

      this.logger.log(`Composite complete: ${outputPath}`);
      return outputPath;
    } catch (err: any) {
      this.logger.error(`FFmpeg composite failed: ${err.message}`);
      throw new Error(`视频合成失败: ${err.message}`);
    }
  }

  /**
   * Composite an existing video with an audio track (no image processing needed)
   * This is used when we already have a video file and just need to add audio.
   */
  async compositeVideoWithAudio(
    videoPath: string,
    audioPath: string,
    duration?: number,
    outputPath?: string,
    subtitlePath?: string,
  ): Promise<string> {
    if (!videoPath || !fs.existsSync(videoPath)) {
      throw new Error('视频合成失败: 视频文件不存在');
    }
    if (!audioPath || !fs.existsSync(audioPath)) {
      this.logger.warn('No audio file, returning video as-is');
      return videoPath;
    }

    const outPath = outputPath || path.join(
      this.outputDir,
      `composite_audio_${Date.now()}.mp4`,
    );

    try {
      const args: string[] = [
        '-y',
        '-i', videoPath,
        '-i', audioPath,
      ];

      if (duration) {
        args.push('-t', String(duration));
      }

      const hasSubtitles = subtitlePath && fs.existsSync(subtitlePath);
      this.logger.log(`compositeVideoWithAudio: subtitlePath="${subtitlePath}", exists=${!!subtitlePath && fs.existsSync(subtitlePath)}`);

      if (hasSubtitles) {
        const subForward = subtitlePath.replace(/\\/g, '/');
        const subEscaped = subForward.replace(/:/g, '\\:');
        const subFilter = `subtitles=${subEscaped}`;
        this.logger.log(`Subtitle filter: ${subFilter}`);
        args.push('-vf', subFilter);
        args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23');
      } else {
        args.push('-c:v', 'copy');
      }

      args.push(
        '-c:a', 'aac',
        '-b:a', '128k',
        '-shortest',
        outPath,
      );

      const displayCmd = args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ');
      this.logger.log(`FFmpeg audio-merge command: ffmpeg ${displayCmd}`);

      const { stderr } = await execAsync(`ffmpeg ${displayCmd}`, { timeout: 60000 });
      if (stderr) {
        this.logger.debug(`FFmpeg stderr: ${stderr.slice(0, 200)}`);
      }

      this.logger.log(`Video+audio composite complete: ${outPath}`);
      return outPath;
    } catch (err: any) {
      this.logger.error(`Video+audio composite failed: ${err.message}`);
      throw new Error(`视频音频合成失败: ${err.message}`);
    }
  }

  /**
   * Create a subtitle file (SRT format) from text and timestamps
   */
  createSubtitleFile(
    subtitles: Array<{ start: number; end: number; text: string }>,
    outputPath?: string,
  ): string {
    const filePath = outputPath || path.join(this.outputDir, `subs_${Date.now()}.srt`);

    const content = subtitles
      .map((sub, i) => {
        const start = this.formatTime(sub.start);
        const end = this.formatTime(sub.end);
        return `${i + 1}\n${start} --> ${end}\n${sub.text}\n`;
      })
      .join('\n');

    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * Generate a video from a single image + audio (simple slideshow)
   */
  async imageWithAudioToVideo(
    imagePath: string,
    audioPath: string,
    resolution?: string,
    outputPath?: string,
  ): Promise<string> {
    return this.composite({
      imagePaths: [imagePath],
      audioPath,
      outputPath,
      fps: 24,
      resolution: resolution || '1080x1920',
    });
  }

  /**
   * Extract audio duration (in seconds)
   */
  async getAudioDuration(audioPath: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`,
        { timeout: 10000 },
      );
      return parseFloat(stdout.trim()) || 5;
    } catch {
      return 5;
    }
  }

  /**
   * Get video metadata (width, height, duration) using ffprobe
   */
  async getVideoInfo(videoPath: string): Promise<{ width: number; height: number; duration: number }> {
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

  /**
   * Adjust video to match target resolution and duration.
   * - Scales if resolution differs
   * - Loops or trims if duration differs by more than 0.5s
   */
  async adjustVideo(
    inputPath: string,
    targetResolution: string, // e.g. '480x854', '720x1280', '1080x1920'
    targetDuration: number,
    outputPath?: string,
  ): Promise<string> {
    const outPath = outputPath || path.join(this.outputDir, `adjusted_${Date.now()}.mp4`);
    const info = await this.getVideoInfo(inputPath);

    const [tw, th] = targetResolution.split('x').map(Number);
    const needResize = info.width > 0 && info.height > 0 &&
      (Math.abs(info.width - tw) > 10 || Math.abs(info.height - th) > 10);
    const needDuration = Math.abs(info.duration - targetDuration) > 0.5;

    if (!needResize && !needDuration) {
      this.logger.log(`Video already at target: ${tw}x${th}, ${targetDuration}s — no adjustment needed`);
      return inputPath;
    }

    this.logger.log(
      `Adjusting video: ${info.width}x${info.height} ${info.duration.toFixed(1)}s → ${tw}x${th} ${targetDuration}s`,
    );

    try {
      const args: string[] = ['-y'];

      // -stream_loop must come BEFORE the input file it applies to
      if (needDuration) {
        const loopsNeeded = Math.ceil(targetDuration / Math.max(info.duration, 0.1));
        if (loopsNeeded > 1) {
          args.push('-stream_loop', String(loopsNeeded - 1));
        }
      }

      args.push('-i', inputPath);

      // Build video filter for resize
      const filters: string[] = [];
      if (needResize) {
        filters.push(`scale=${tw}:${th}:force_original_aspect_ratio=increase,crop=${tw}:${th}`);
      }

      if (filters.length > 0) {
        args.push('-vf', filters.join(','));
      }

      if (needDuration) {
        args.push('-t', String(targetDuration));
      }

      args.push('-r', '24', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23');
      args.push('-an'); // Strip audio (we'll add back later if needed)
      args.push(outPath);

      const displayCmd = args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ');
      this.logger.log(`Adjust video command: ffmpeg ${displayCmd}`);

      await execAsync(`ffmpeg ${displayCmd}`, { timeout: 120000 });
      this.logger.log(`Video adjusted: ${outPath}`);
      return outPath;
    } catch (err: any) {
      this.logger.error(`Video adjustment failed: ${err.message}`);
      return inputPath; // Return original on failure
    }
  }

  private formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }
}
