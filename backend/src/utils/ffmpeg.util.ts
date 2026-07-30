import { Injectable, Logger } from '@nestjs/common';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

function findFfmpeg(): string {
  try {
    const p = require('@ffmpeg-installer/ffmpeg').path;
    if (fs.existsSync(p)) return p;
  } catch { /* fall through */ }
  try { execSync('ffmpeg -version', { stdio: 'pipe' }); return 'ffmpeg'; } catch { /* fall through */ }
  return 'ffmpeg';
}

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
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;

  constructor() {
    this.outputDir = path.resolve(process.cwd(), 'output');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    this.ffmpegPath = findFfmpeg();
    this.ffprobePath = this.resolveFfprobe();
    this.logger.log(`FFmpeg binary: ${this.ffmpegPath}`);
    this.logger.log(`FFprobe binary: ${this.ffprobePath}`);
    this.logger.log(`FFmpeg output directory: ${this.outputDir}`);
  }

  private resolveFfprobe(): string {
    const bundled = this.ffmpegPath.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1');
    if (fs.existsSync(bundled)) return bundled;
    try {
      const p = require('@ffprobe-installer/ffprobe').path;
      if (fs.existsSync(p)) return p;
    } catch { /* fall through */ }
    try { execSync('ffprobe -version', { stdio: 'pipe' }); return 'ffprobe'; } catch { /* fall through */ }
    return this.ffmpegPath;
  }

  private ff(args: string, opts?: { timeout?: number }): Promise<{ stderr: string; stdout: string }> {
    return execAsync(`"${this.ffmpegPath}" ${args}`, { timeout: opts?.timeout || 120000 });
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

      const { stderr } = await this.ff(`${displayCmd}`, { timeout: 60000 });
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

      const { stderr } = await this.ff(`${displayCmd}`, { timeout: 60000 });
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
   * Merge multiple video files into one via concat demuxer
   */
  async mergeVideos(videoPaths: string[] | { path: string }[]): Promise<string> {
    if (!videoPaths || videoPaths.length === 0) {
      throw new Error('No video files to merge');
    }
    const extract = (p: string | { path: string }) => (typeof p === 'string' ? p : p.path);
    const validPaths = videoPaths.map(extract).filter((p) => p && fs.existsSync(p));
    if (validPaths.length === 0) {
      throw new Error('No valid video files to merge');
    }

    const outPath = path.join(this.outputDir, `merged_${Date.now()}.mp4`);
    const concatFile = path.join(this.outputDir, `concat_${Date.now()}.txt`);
    const concatContent = validPaths
      .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
      .join('\n');
    fs.writeFileSync(concatFile, concatContent);

    // Normalize each file to TS (handles mismatched streams like missing audio), then concat
    const tsFiles = validPaths.map((p, i) => {
      const ts = path.join(this.outputDir, `concat_ts_${i}_${Date.now()}.ts`);
      return { mp4: p, ts };
    });
    for (const f of tsFiles) {
      await this.ff(`-y -i "${f.mp4}" -c copy -bsf:v h264_mp4toannexb -f mpegts "${f.ts}"`);
    }
    const tsConcatInput = tsFiles.map(f => f.ts).join('|');
    await this.ff(`-y -i "concat:${tsConcatInput}" -c copy -bsf:a aac_adtstoasc -movflags +faststart "${outPath}"`);
    // Cleanup temp TS files
    for (const f of tsFiles) {
      try { fs.unlinkSync(f.ts); } catch { /* ignore */ }
    }
    return outPath;
  }

  /**
   * Extract a single frame from a video (returns image path)
   */
  async extractFrame(videoPath: string, atSeconds = 1): Promise<string> {
    const outPath = path.join(this.outputDir, `frame_${Date.now()}.jpg`);
    await this.ff(`-y -i "${videoPath}" -ss ${atSeconds} -vframes 1 "${outPath}"`);
    return outPath;
  }

  /**
   * Extract audio duration (in seconds)
   */
  async getAudioDuration(audioPath: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `"${this.ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`,
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
      const { stdout: probeOut } = await execAsync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
        { timeout: 10000 },
      );
      const parts = probeOut.trim().split('\n').map(s => s.trim()).filter(Boolean);
      let width = 0, height = 0, duration = 5;
      if (parts.length >= 3) {
        width = Number(parts[0]) || 0;
        height = Number(parts[1]) || 0;
        const dur = parseFloat(parts[2]);
        if (!isNaN(dur) && dur > 0) duration = dur;
      }
      // Sanity check: if duration > 5min, stream metadata is likely wrong
      if (duration >= 300 || duration <= 0) {
        const { stdout: fmtOut } = await execAsync(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
          { timeout: 10000 },
        ).catch(() => ({ stdout: '' }));
        const fmtDur = parseFloat(fmtOut.trim());
        if (!isNaN(fmtDur) && fmtDur > 0 && fmtDur < 86400) duration = fmtDur;
      }
      return { width, height, duration };
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

      await this.ff(`${displayCmd}`, { timeout: 120000 });
      this.logger.log(`Video adjusted: ${outPath}`);
      return outPath;
    } catch (err: any) {
      this.logger.error(`Video adjustment failed: ${err.message}`);
      return inputPath; // Return original on failure
    }
  }

  /**
   * Fit video to target aspect ratio by adding black bars (letterbox/pillarbox).
   * Preserves the entire frame — no cropping, no stretching.
   * 
   * @param inputPath - Source video path
   * @param targetRatio - Target aspect ratio, e.g. '9:16', '16:9', '1:1'
   * @param outputPath - Optional output path, auto-generated if omitted
   * @returns Output video path (or original if ratio already matches)
   */
  async fitVideoToRatio(
    inputPath: string,
    targetRatio: string,
    outputPath?: string,
  ): Promise<string> {
    const info = await this.getVideoInfo(inputPath);
    if (!info.width || !info.height) {
      this.logger.warn('fitVideoToRatio: cannot read video dimensions, skipping');
      return inputPath;
    }

    // Parse target ratio
    const [rw, rh] = targetRatio.split(':').map(Number);
    if (!rw || !rh) {
      this.logger.warn(`fitVideoToRatio: invalid target ratio "${targetRatio}", skipping`);
      return inputPath;
    }

    const targetAspect = rw / rh;
    const currentAspect = info.width / info.height;

    // Check if already close enough (within 1%)
    if (Math.abs(currentAspect - targetAspect) / targetAspect < 0.01) {
      this.logger.log(`fitVideoToRatio: video already at ${targetRatio} — no adjustment needed`);
      return inputPath;
    }

    const outPath = outputPath ||
      path.join(this.outputDir, `ratio_${path.basename(inputPath, path.extname(inputPath))}_${Date.now()}.mp4`);

    this.logger.log(
      `Fitting video to ratio ${targetRatio}: ${info.width}x${info.height} (${currentAspect.toFixed(3)}) → target ${targetAspect.toFixed(3)}`,
    );

    try {
      // Use crop filter to actually change the aspect ratio instead of adding black bars
      let filter: string;
      if (currentAspect > targetAspect) {
        // Video is wider than target → crop sides to match target aspect
        const newWidth = Math.round(info.height * targetAspect);
        const cropX = Math.round((info.width - newWidth) / 2);
        filter = `crop=${newWidth}:${info.height}:${cropX}:0,scale=${newWidth % 2 === 0 ? newWidth : newWidth + 1}:${info.height % 2 === 0 ? info.height : info.height + 1}`;
      } else {
        // Video is taller than target → crop top/bottom to match target aspect
        const newHeight = Math.round(info.width / targetAspect);
        const cropY = Math.round((info.height - newHeight) / 2);
        filter = `crop=${info.width}:${newHeight}:0:${cropY},scale=${info.width % 2 === 0 ? info.width : info.width + 1}:${newHeight % 2 === 0 ? newHeight : newHeight + 1}`;
      }

      const args = [
        '-y',
        '-i', inputPath,
        '-vf', filter,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'copy',
        outPath,
      ];

      const displayCmd = args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ');
      this.logger.log(`fitVideoToRatio command: ffmpeg ${displayCmd}`);

      await this.ff(displayCmd, { timeout: 120000 });
      this.logger.log(`fitVideoToRatio completed: ${outPath}`);
      return outPath;
    } catch (err: any) {
      this.logger.error(`fitVideoToRatio failed: ${err.message}`);
      return inputPath; // Return original on failure
    }
  }

  /**
   * Generate a text animation video using FFmpeg drawtext filter.
   * Creates a video with centered text that fades in/out.
   */
  async generateTextVideo(
    text: string,
    options?: {
      bgColor?: string;
      textColor?: string;
      fontSize?: number;
      resolution?: string;
      duration?: number;
      fps?: number;
      outputPath?: string;
    },
  ): Promise<string> {
    const {
      bgColor = '#7C3AED',
      textColor = '#FFFFFF',
      fontSize = 48,
      resolution = '1080x1920',
      duration = 3,
      fps = 24,
    } = options || {};

    const outPath = options?.outputPath || path.join(this.outputDir, `text_${Date.now()}.mp4`);
    const [w, h] = resolution.split('x').map(Number);

    // Escape text for FFmpeg filter: wrap long lines, escape special chars
    const maxCharsPerLine = Math.floor(w / (fontSize * 0.55));
    const lines = this.wrapText(text, maxCharsPerLine);
    const escapeText = (t: string) =>
      t.replace(/'/g, "'\\\\\\''").replace(/:/g, '\\\\:').replace(/,/g, '\\\\,');

    // Build drawtext filter for each line
    const lineHeight = fontSize * 1.4;
    const totalTextHeight = lines.length * lineHeight;
    const startY = (h - totalTextHeight) / 2;

    const drawTextFilters = lines.map((line, i) => {
      const y = startY + i * lineHeight;
      return `drawtext=text='${escapeText(line)}':fontcolor=${textColor}:fontsize=${fontSize}:x=(w-text_w)/2:y=${y}:enable='between(t,0,${duration})'`;
    });

    const filter = drawTextFilters.join(',');

    try {
      await this.ff(
        `-y -f lavfi -i "color=c=0x${bgColor.replace('#', '')}:s=${resolution}:d=${duration}:r=${fps}" ` +
        `-vf "${filter}" -c:v libx264 -preset fast -crf 23 "${outPath}"`,
        { timeout: 30000 },
      );
      this.logger.log(`Text video generated: ${outPath}`);
      return outPath;
    } catch (err: any) {
      this.logger.error(`Text video generation failed: ${err.message}`);
      // Fallback: create a simple video without text
      await this.ff(
        `-y -f lavfi -i "color=c=0x${bgColor.replace('#', '')}:s=${resolution}:d=${duration}:r=${fps}" ` +
        `-c:v libx264 -preset fast -crf 23 "${outPath}"`,
        { timeout: 30000 },
      );
      return outPath;
    }
  }

  private wrapText(text: string, maxCharsPerLine: number): string[] {
    const lines: string[] = [];
    const words = text.split(/\s+/);
    let currentLine = '';
    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
        currentLine = (currentLine + ' ' + word).trim();
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    // If no spaces, just split by character count
    if (lines.length === 0 && text.length > 0) {
      for (let i = 0; i < text.length; i += maxCharsPerLine) {
        lines.push(text.substring(i, i + maxCharsPerLine));
      }
    }
    return lines.length > 0 ? lines : [text];
  }

  private formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }
}
