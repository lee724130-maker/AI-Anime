import { Injectable, Logger } from '@nestjs/common';
import { execSync, exec, execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

function findFfmpeg(): string {
  // Prefer the modern binary in backend/tools/ffmpeg (ffmpeg 6.x, supports
  // xfade / apad pad_dur etc. that the 2018 @ffmpeg-installer build lacks)
  const toolCandidates = [
    path.resolve(process.cwd(), 'tools/ffmpeg/ffmpeg.exe'),
    path.resolve(__dirname, '../../../tools/ffmpeg/ffmpeg.exe'), // dist/src/utils
    path.resolve(__dirname, '../../tools/ffmpeg/ffmpeg.exe'),   // src/utils
    // Linux: unversioned static build dropped into tools/ffmpeg/
    path.resolve(process.cwd(), 'tools/ffmpeg/ffmpeg'),
    path.resolve(__dirname, '../../../tools/ffmpeg/ffmpeg'),
    path.resolve(__dirname, '../../tools/ffmpeg/ffmpeg'),
  ];
  for (const c of toolCandidates) {
    if (fs.existsSync(c)) return c;
  }
  try {
    const p = require('@ffmpeg-installer/ffmpeg').path;
    if (fs.existsSync(p)) return p;
  } catch { /* fall through */ }
  try { execSync('ffmpeg -version', { stdio: 'pipe' }); return 'ffmpeg'; } catch { /* fall through */ }
  return 'ffmpeg';
}

/**
 * Cross-platform CJK font detection for drawtext. drawtext without a fontfile
 * falls back to a default font that often has NO Chinese glyphs (tofu boxes)
 * on headless Linux. Windows gyan builds ship a CJK-capable default, but
 * explicit fontfile keeps behavior identical everywhere.
 * Returns the fontfile=... filter fragment (':' escaped for filter syntax),
 * or '' when no known CJK font exists (drawtext then uses its default).
 */
function detectFontFile(): string {
  const candidates = process.platform === 'win32'
    ? [
        'C:/Windows/Fonts/msyh.ttc',   // Microsoft YaHei (Win7+)
        'C:/Windows/Fonts/msyh.ttf',
        'C:/Windows/Fonts/simhei.ttf', // SimHei (older Windows)
        'C:/Windows/Fonts/msyhl.ttc',
      ]
    : [
        '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',        // 文泉驿正黑 (Ubuntu/Debian)
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', // Noto CJK
        '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
        '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
        '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
      ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      // filter 语法：路径内的 ':' 需转义（Windows 盘符），与 escapeText 同款
      return `fontfile=${c.replace(/:/g, '\\\\:')}`;
    }
  }
  return '';
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

/**
 * Global ffmpeg concurrency gate: heavy encode processes are CPU-bound, so we
 * cap how many may run at once (deployment guard against OOM / CPU saturation
 * on small servers). Every ffmpeg invocation goes through the semaphore.
 */
const FFMPEG_MAX_CONCURRENCY = Math.max(1, Number(process.env.FFMPEG_CONCURRENCY || 2));

class Semaphore {
  private queue: Array<() => void> = [];
  private count = 0;
  constructor(private readonly max: number) {}
  acquire(): Promise<void> {
    if (this.count < this.max) {
      this.count++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }
  release(): void {
    const next = this.queue.shift();
    if (next) next();
    else this.count--;
  }
}

const ffmpegSemaphore = new Semaphore(FFMPEG_MAX_CONCURRENCY);

export async function runFfmpegQueued(
  command: string,
  opts?: { timeout?: number; maxBuffer?: number },
): Promise<{ stderr: string; stdout: string }> {
  await ffmpegSemaphore.acquire();
  try {
    return await execAsync(command, {
      timeout: opts?.timeout || 120000,
      maxBuffer: opts?.maxBuffer ?? 1024 * 1024 * 20,
    });
  } finally {
    ffmpegSemaphore.release();
  }
}

/**
 * Like runFfmpegQueued but executes via execFile (array args, NO shell).
 * Critical on Linux: an exec()-built shell command strips single quotes inside
 * ffmpeg filtergraphs (e.g. zoompan=z='min(zoom+0.001,1.05)' → z=min(zoom+0.001,1.05)
 * which ffmpeg then fails to parse). execFile passes args verbatim, so filtergraph
 * quotes survive. Windows shells didn't strip quotes, so this bug only surfaced in prod.
 */
export async function runFfmpegQueuedArr(
  bin: string,
  args: string[],
  opts?: { timeout?: number },
): Promise<{ stderr: string; stdout: string }> {
  await ffmpegSemaphore.acquire();
  try {
    return await execFileAsync(bin, args, {
      timeout: opts?.timeout || 120000,
      maxBuffer: 1024 * 1024 * 20,
    });
  } finally {
    ffmpegSemaphore.release();
  }
}

export { ffmpegSemaphore };

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
    return this.ffArr(this.splitArgs(args), opts);
  }

  /** Split an ffmpeg argument string into tokens, honoring " and ' quoting (no shell). */
  private splitArgs(s: string): string[] {
    const parts: string[] = [];
    let cur = '';
    let inQuote = false;
    let qChar = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inQuote) {
        if (ch === qChar) {
          inQuote = false;
          continue;
        }
        cur += ch;
      } else if (ch === '"' || ch === "'") {
        inQuote = true;
        qChar = ch;
      } else if (ch === ' ' || ch === '\t') {
        if (cur) {
          parts.push(cur);
          cur = '';
        }
      } else {
        cur += ch;
      }
    }
    if (cur) parts.push(cur);
    return parts;
  }

  // execFile-based (no shell): preserves filtergraph quotes on Linux
  private ffArr(args: string[], opts?: { timeout?: number }): Promise<{ stderr: string; stdout: string }> {
    return runFfmpegQueuedArr(this.ffmpegPath, args, opts);
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

    // concatFile: 多图合成时的临时拼接清单（方法级声明，finally 清理）
    let concatFile = '';

    try {
      // Build FFmpeg command using array-based arguments (safer than string building)
      const args: string[] = ['-y'];

      // Input images
      if (validImagePaths.length === 1) {
        // Single image → treat as static video with duration
        args.push('-loop', '1', '-i', validImagePaths[0], '-t', String(duration || 5));
      } else {
        // Multiple images → create image sequence via concat file (unique name
        // per call to avoid concurrent overwrites between parallel tasks)
        try {
          concatFile = path.join(this.outputDir, `concat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.txt`);
          const concatContent = validImagePaths
            .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
            .join('\n');
          fs.writeFileSync(concatFile, concatContent);
          args.push('-f', 'concat', '-safe', '0', '-i', concatFile);
        } catch {
          if (concatFile && fs.existsSync(concatFile)) {
            try { fs.unlinkSync(concatFile); } catch { /* ignore */ }
          }
          throw new Error('视频合成失败: 无法创建 concat 文件');
        }
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

      // execute via execFile (array) to preserve filtergraph quotes (Linux shell
      // strips single quotes otherwise, breaking zoompan=z='min(...)' filters)
      const { stderr } = await this.ffArr(args, { timeout: 60000 });
      if (stderr) {
        this.logger.debug(`FFmpeg stderr: ${stderr.slice(0, 200)}`);
      }

      this.logger.log(`Composite complete: ${outputPath}`);
      return outputPath;
    } catch (err: any) {
      this.logger.error(`FFmpeg composite failed: ${err.message}`);
      throw new Error(`视频合成失败: ${err.message}`);
    } finally {
      // 删除临时 concat 文件（多图合成使用）
      if (concatFile && fs.existsSync(concatFile)) {
        try { fs.unlinkSync(concatFile); } catch { /* ignore */ }
      }
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
      // If no duration given, use the video's own duration so that a shorter
      // BGM never truncates the video (shortest would cut to BGM length)
      if (!duration) {
        const info = await this.getVideoInfo(videoPath);
        duration = info.duration || 5;
        this.logger.log(`compositeVideoWithAudio: no duration, using video length ${duration}s`);
      }

      const args: string[] = [
        '-y',
        '-i', videoPath,
        '-i', audioPath,
        '-t', String(duration),
      ];

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
   * Composite a video with narration + background music (three-track mixing).
   * BGM rules: longer than video → trimmed + fade out; shorter → looped + fade out.
   * Volume balance: narration 1.0 / BGM 0.15~0.25.
   */
  async compositeWithMusic(
    videoPath: string,
    narrationPath: string,
    musicPath: string,
    options?: {
      musicVolume?: number;
      narrationVolume?: number;
      fadeOutSeconds?: number;
      duration?: number;
      outputPath?: string;
      subtitlePath?: string;
    },
  ): Promise<string> {
    if (!videoPath || !fs.existsSync(videoPath)) {
      throw new Error('视频合成失败: 视频文件不存在');
    }
    const hasNarration = narrationPath && fs.existsSync(narrationPath);
    const hasMusic = musicPath && fs.existsSync(musicPath);
    if (!hasMusic) {
      this.logger.warn('No music file, falling back to narration-only merge');
      return this.compositeVideoWithAudio(videoPath, narrationPath, options?.duration, options?.outputPath, options?.subtitlePath);
    }
    if (!hasNarration) {
      this.logger.warn('No narration file, falling back to video+music merge');
      return this.compositeVideoWithAudio(videoPath, musicPath, options?.duration, options?.outputPath, options?.subtitlePath);
    }
    if (!(await this.hasAudioTrack(musicPath))) {
      this.logger.warn(`Music file has no audio track (${musicPath}), falling back to narration-only merge`);
      return this.compositeVideoWithAudio(videoPath, narrationPath, options?.duration, options?.outputPath, options?.subtitlePath);
    }

    const outPath = options?.outputPath || path.join(
      this.outputDir,
      `composite_music_${Date.now()}.mp4`,
    );

    try {
      let duration = options?.duration;
      if (!duration) {
        const info = await this.getVideoInfo(videoPath);
        duration = info.duration || 5;
      }

      const musicVol = options?.musicVolume ?? 0.2;
      const narrationVol = options?.narrationVolume ?? 1.0;
      const fadeOut = Math.max(0, Math.min(options?.fadeOutSeconds ?? 2, duration - 0.5));
      const hasFade = fadeOut > 0.1 && duration > 1;
      const fadeStart = Math.max(0, duration - fadeOut);

      const filterParts: string[] = [];
      filterParts.push(`[1:a]volume=${narrationVol}[nar]`);
      // BGM: 音量 → 循环（短于视频时）→ 裁剪到视频时长 → 末尾淡出
      const fadePart = hasFade ? `,afade=t=out:st=${fadeStart}:d=${fadeOut}` : '';
      filterParts.push(
        `[2:a]volume=${musicVol},aloop=loop=-1:size=2000000000,atrim=0:${duration}${fadePart}[mus]`,
      );
      filterParts.push(
        `[nar][mus]amix=inputs=2:duration=longest:dropout_transition=0,alimiter=limit=0.95[aout]`,
      );
      const filterGraph = filterParts.join(';');

      const args: string[] = [
        '-y',
        '-i', videoPath,
        '-i', narrationPath,
        '-i', musicPath,
        '-t', String(duration),
        '-filter_complex', filterGraph,
        '-map', '0:v',
        '-map', '[aout]',
      ];

      const hasSubtitles = options?.subtitlePath && fs.existsSync(options.subtitlePath!);
      if (hasSubtitles) {
        const subForward = options!.subtitlePath!.replace(/\\/g, '/');
        const subEscaped = subForward.replace(/:/g, '\\:');
        args.push('-vf', `subtitles=${subEscaped}`);
        args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23');
      } else {
        args.push('-c:v', 'copy');
      }

      args.push('-c:a', 'aac', '-b:a', '128k', outPath);

      const displayCmd = args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ');
      this.logger.log(`FFmpeg music-merge command: ffmpeg ${displayCmd}`);

      const { stderr } = await this.ff(`${displayCmd}`, { timeout: 120000 });
      if (stderr) {
        this.logger.debug(`FFmpeg stderr: ${stderr.slice(0, 200)}`);
      }

      this.logger.log(`Video+music composite complete: ${outPath}`);
      return outPath;
    } catch (err: any) {
      this.logger.error(`Video+music composite failed: ${err.message}`);
      throw new Error(`视频+BGM合成失败: ${err.message}`);
    }
  }

  /**
   * Mix a BGM track into a video that ALREADY has its own audio (e.g. TTS voiceover).
   * The existing track is kept at full volume, BGM is ducked to `musicVolume`.
   * Falls back to compositeVideoWithAudio when the video has no audio track.
   */
  async mixBgmPreserveAudio(
    videoPath: string,
    musicPath: string,
    options?: {
      musicVolume?: number;
      duration?: number;
      outputPath?: string;
    },
  ): Promise<string> {
    if (!videoPath || !fs.existsSync(videoPath)) {
      throw new Error('视频合成失败: 视频文件不存在');
    }
    if (!musicPath || !fs.existsSync(musicPath)) {
      this.logger.warn('No BGM file, returning video as-is');
      return videoPath;
    }
    if (!(await this.hasAudioTrack(videoPath))) {
      this.logger.warn('Video has no audio track, falling back to plain audio replacement');
      return this.compositeVideoWithAudio(videoPath, musicPath, options?.duration, options?.outputPath);
    }

    const outPath = options?.outputPath || path.join(
      this.outputDir,
      `mix_bgm_${Date.now()}.mp4`,
    );

    try {
      let duration = options?.duration;
      if (!duration) {
        const info = await this.getVideoInfo(videoPath);
        duration = info.duration || 5;
      }

      const musicVol = options?.musicVolume ?? 0.2;
      const fadeOut = Math.max(0, Math.min(2, duration - 0.5));
      const fadeStart = Math.max(0, duration - fadeOut);

      const filterGraph =
        `[1:a]volume=${musicVol},aloop=loop=-1:size=2000000000,atrim=0:${duration}` +
        (fadeOut > 0.1 && duration > 1 ? `,afade=t=out:st=${fadeStart}:d=${fadeOut}` : '') +
        `[mus];` +
        `[0:a][mus]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.95[aout]`;

      const args: string[] = [
        '-y',
        '-i', videoPath,
        '-i', musicPath,
        '-t', String(duration),
        '-filter_complex', filterGraph,
        '-map', '0:v',
        '-map', '[aout]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '128k',
        outPath,
      ];

      const displayCmd = args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ');
      this.logger.log(`FFmpeg BGM-preserve command: ffmpeg ${displayCmd}`);

      const { stderr } = await this.ff(`${displayCmd}`, { timeout: 120000 });
      if (stderr) {
        this.logger.debug(`FFmpeg stderr: ${stderr.slice(0, 200)}`);
      }

      this.logger.log(`BGM-preserve composite complete: ${outPath}`);
      return outPath;
    } catch (err: any) {
      this.logger.error(`BGM-preserve composite failed: ${err.message}`);
      throw new Error(`视频+BGM混音失败: ${err.message}`);
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

    // Sanitize each cue's text before writing: SRT text is interpreted by
    // subtitle renderers (libass etc.), so raw content can break parsing or
    // inject styling/override tags. Empty cues after cleaning are dropped.
    const cues = (subtitles || [])
      .map((sub) => ({ start: sub.start, end: sub.end, text: this.sanitizeSubtitleText(sub.text) }))
      .filter((c) => c.text.length > 0);

    const content = cues
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
   * Strip anything that could break or hijack SRT rendering:
   * - ASS override blocks `{...}` (position/speed/style injection)
   * - HTML-ish tags `<...>` (mispelled styling / XSS-ish markup)
   * - `-->` sequences inside the text (would fake a cue boundary)
   * - control characters (keeps \n so multi-line captions still work)
   * - repeated whitespace/tabs (normalized per line)
   */
  private sanitizeSubtitleText(text: string): string {
    let s = String(text ?? '');
    s = s.replace(/\{[^}]*\}/g, '');
    s = s.replace(/<\/?[a-zA-Z][^>]*>/g, '');
    s = s.replace(/-->/g, '→');
    s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    s = s
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .filter((line) => line.length > 0)
      .join('\n');
    return s.trim();
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
   * Merge multiple video files into one via filter_complex concat.
   * Re-encodes all inputs to a unified 24fps CFR stream at the resolution of
   * the FIRST input (fixes black screen at start from mismatched fps/timebase,
   * and concat failures from mismatched resolutions between clips).
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

    // Detect target resolution from the first video so all clips are
    // normalized to the same size (concat requires identical dimensions)
    const firstInfo = await this.getVideoInfo(validPaths[0]);
    const targetW = firstInfo.width && firstInfo.width % 2 === 0 ? firstInfo.width : 1080;
    const targetH = firstInfo.height && firstInfo.height % 2 === 0 ? firstInfo.height : 1920;
    const normFilter = `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},setsar=1,fps=24,setpts=PTS-STARTPTS`;

    // Detect which inputs carry an audio track (concat a=1 needs all inputs to have audio)
    const hasAudioList = await Promise.all(
      validPaths.map(async (p) => {
        try {
          const { stdout } = await execAsync(
            `"${this.ffprobePath}" -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${p}"`,
            { timeout: 10000 },
          );
          return stdout.trim().length > 0;
        } catch {
          return false;
        }
      }),
    );
    const videoInfos = await Promise.all(validPaths.map((p) => this.getVideoInfo(p)));

    if (validPaths.length === 1) {
      // Single input — just normalize it to a clean 24fps stream, keep audio
      const outPath = path.join(this.outputDir, `merged_${Date.now()}.mp4`);
      await this.ff(
        `-y -i "${validPaths[0]}" -vf "${normFilter}" -c:v libx264 -preset veryfast -crf 20 -r 24 -g 48 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "${outPath}"`,
        { timeout: 300000 },
      );
      return outPath;
    }

    const outPath = path.join(this.outputDir, `merged_${Date.now()}.mp4`);

    // Build filter_complex: normalize each input to 24fps + target resolution,
    // normalize/pad audio, then concat both video and audio streams
    const inputs = validPaths.map((p) => `-i "${p}"`).join(' ');
    const normalized = validPaths.map((_, i) =>
      `[${i}:v]${normFilter}[v${i}]`,
    );
    const audioParts = validPaths.map((_, i) => {
      if (hasAudioList[i]) {
        return `[${i}:a]aresample=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${i}]`;
      }
      const dur = (videoInfos[i]?.duration || 5).toFixed(2);
      return `anullsrc=r=44100:cl=stereo,atrim=duration=${dur},asetpts=PTS-STARTPTS[a${i}]`;
    });
    const concatIn = validPaths.map((_, i) => `[v${i}][a${i}]`).join('');
    const filterComplex =
      `${[...normalized, ...audioParts].join(';')};${concatIn}concat=n=${validPaths.length}:v=1:a=1[vout][aout]`;

    await this.ff(
      `-y ${inputs} -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]" ` +
      `-c:v libx264 -preset veryfast -crf 20 -r 24 -g 48 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "${outPath}"`,
      { timeout: 600000 },
    );
    this.logger.log(`Merged ${validPaths.length} videos into ${outPath}`);
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
   * Extract multiple frames at given timestamps (returns image path array).
   * Used for quality checking — 3~5 frames per video.
   */
  async extractFramesAt(videoPath: string, times: number[]): Promise<string[]> {
    const outPaths: string[] = [];
    for (const t of times) {
      const safeT = Math.max(0, Number(t) || 0);
      // 随机后缀防同毫秒多候选/多片段抽帧文件名碰撞互相覆盖
      const outPath = path.join(this.outputDir, `frame_${Date.now()}_${Math.round(safeT * 10)}_${Math.floor(Math.random() * 10000)}.jpg`);
      try {
        await this.ff(`-y -i "${videoPath}" -ss ${safeT} -vframes 1 -q:v 3 "${outPath}"`, { timeout: 30000 });
        if (fs.existsSync(outPath)) outPaths.push(outPath);
      } catch (err: any) {
        this.logger.warn(`extractFramesAt frame @${safeT}s failed: ${err.message}`);
      }
    }
    return outPaths;
  }

  /**
   * Check whether a media file carries an audio stream
   */
  async hasAudioTrack(mediaPath: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(
        `"${this.ffprobePath}" -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${mediaPath}"`,
        { timeout: 10000 },
      );
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
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
        `"${this.ffprobePath}" -v error -select_streams v:0 -show_entries stream=width,height,duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
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
          `"${this.ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
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
   * Align a video to an exact target duration.
   * - Already close (< 0.15s) → copy as-is
   * - Too long → trim to target
   * - Too short but within 25% → gentle slow-down (video setpts + audio atempo)
   * - Too short beyond that → freeze last frame (tpad clone) + pad silent audio
   * Returns the (newly written) output path.
   */
  async fitToExactDuration(
    inputPath: string,
    outputPath: string,
    targetSec: number,
  ): Promise<string> {
    const info = await this.getVideoInfo(inputPath);
    const dur = info.duration || targetSec;
    const t = targetSec.toFixed(3);

    if (Math.abs(dur - targetSec) <= 0.15) {
      fs.copyFileSync(inputPath, outputPath);
      return outputPath;
    }

    const { stdout } = await execAsync(
      `"${this.ffprobePath}" -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${inputPath}"`,
      { timeout: 10000 },
    ).catch(() => ({ stdout: '' }));
    const hasAudio = stdout.trim().length > 0;
    const scale = 'scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1';
    const vEnc = '-c:v libx264 -preset veryfast -crf 20 -r 24 -g 48 -pix_fmt yuv420p';
    const aEnc = '-c:a aac -b:a 128k';
    const timeout = { timeout: 300000 };

    // Too long → trim the tail to hit the exact target
    if (dur > targetSec) {
      await this.ff(
        `-y -i "${inputPath}" -t ${t} -vf "${scale}" ${vEnc} ${hasAudio ? aEnc : '-an'} -movflags +faststart "${outputPath}"`,
        timeout,
      );
      return outputPath;
    }

    // Too short but within ±25% → gentle slow-down (speed bias, prefer speed)
    const ratio = targetSec / dur;
    if (ratio <= 1.25) {
      if (hasAudio) {
        const atempo = Math.max(0.5, Math.min(2, 1 / ratio)).toFixed(4);
        await this.ff(
          `-y -i "${inputPath}" -filter_complex "[0:v]${scale},setpts=${ratio.toFixed(4)}*PTS[v];[0:a]atempo=${atempo}[a]" ` +
          `-map "[v]" -map "[a]" -t ${t} ${vEnc} ${aEnc} -movflags +faststart "${outputPath}"`,
          timeout,
        );
      } else {
        await this.ff(
          `-y -i "${inputPath}" -vf "${scale},setpts=${ratio.toFixed(4)}*PTS" -t ${t} ${vEnc} -an -movflags +faststart "${outputPath}"`,
          timeout,
        );
      }
      return outputPath;
    }

    // Beyond ±25% → freeze the last frame to cover the shortfall
    const stopDur = (targetSec - dur).toFixed(3);
    if (hasAudio) {
      await this.ff(
        `-y -i "${inputPath}" -vf "${scale},tpad=stop_mode=clone:stop_duration=${stopDur}" ` +
        `-af "apad" -t ${t} ${vEnc} ${aEnc} -movflags +faststart "${outputPath}"`,
        timeout,
      );
    } else {
      await this.ff(
        `-y -i "${inputPath}" -vf "${scale},tpad=stop_mode=clone:stop_duration=${stopDur}" -t ${t} ${vEnc} -an -movflags +faststart "${outputPath}"`,
        timeout,
      );
    }
    return outputPath;
  }

  /**
   * Compress a video for persistent storage: keeps the FULL duration, scales
   * to `maxWidth` keeping aspect ratio, keeps audio, re-encodes with high
   * compression (crf 28). Throws on failure.
   */
  async compressForStorage(
    inputPath: string,
    outputPath: string,
    options: { maxWidth?: number } = {},
  ): Promise<void> {
    const { maxWidth = 720 } = options;
    const info = await this.getVideoInfo(inputPath);

    const targetW = Math.min((info.width || 1280), maxWidth);
    const targetH = info.width && info.height
      ? Math.round((info.height / info.width) * targetW)
      : Math.round(16 / 9 * targetW);
    const w = targetW % 2 === 0 ? targetW : targetW - 1;
    const h = targetH % 2 === 0 ? targetH : targetH - 1;

    this.logger.log(
      `Compress for storage: ${info.width}x${info.height} ${info.duration.toFixed(1)}s → ` +
      `${w}x${h} full duration (crf 28)`,
    );

    await this.ff(
      `-y -i "${inputPath}" ` +
      `-vf "scale=-2:${h}" -c:v libx264 -preset veryfast -crf 28 ` +
      `-c:a aac -b:a 96k -ac 2 -movflags +faststart "${outputPath}"`,
      { timeout: 600000 },
    );
    this.logger.log(`Compressed video saved: ${outputPath}`);
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
      args.push('-c:a', 'aac', '-b:a', '128k'); // Keep audio (voiceover/BGM survives resizing)
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

    // 文字经 textfile 写入临时文件：内容零 filter 转义、特殊字符（`, $(), 引号,
    // 反斜杠, 分号等）天然免疫，绝无 filter/命令注入面。路径仅需转义盘符冒号。
    const isHexColor = (c?: string) => !!c && /^#[0-9a-fA-F]{3,8}$/.test(c);
    const bgHex = (isHexColor(bgColor) ? bgColor : '#7C3AED').replace('#', '');
    const fg = isHexColor(textColor) ? textColor : '#FFFFFF';
    const txtPath = path.join(this.outputDir, `textfile_${Date.now()}.txt`);
    fs.writeFileSync(txtPath, text, 'utf8');
    const txtArg = `textfile='${txtPath.split(path.sep).join('/').replace(/:/g, '\\:')}'`;
    const fontArg = detectFontFile();
    const fontPart = fontArg ? fontArg + ':' : '';

    const maxCharsPerLine = Math.floor(w / (fontSize * 0.55));
    const lines = this.wrapText(text, maxCharsPerLine);
    const lineHeight = fontSize * 1.4;
    const startY = Math.round((h - lines.length * lineHeight) / 2);

    const fadeIn = 0.5;
    const fadeOut = Math.min(0.6, duration / 3);
    const filter =
      `drawtext=${txtArg}:fontcolor=${fg}:${fontPart}fontsize=${fontSize}:x=(w-text_w)/2:y=${startY}:enable='between(t,0,${duration})'` +
      `,fade=t=in:st=0:d=${fadeIn}` +
      `,fade=t=out:st=${Math.max(duration - fadeOut, 0)}:d=${fadeOut}`;

    try {
      await this.ffArr(
        [
          '-y', '-f', 'lavfi', '-i', `color=c=0x${bgHex}:s=${resolution}:d=${duration}:r=${fps}`,
          '-vf', filter, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', outPath,
        ],
        { timeout: 30000 },
      );
      this.logger.log(`Text video generated: ${outPath}`);
      try { fs.unlinkSync(txtPath); } catch { /* ignore */ }
      return outPath;
    } catch (err: any) {
      this.logger.error(`Text video generation failed: ${err.message}`);
      // Fallback: create a simple video without text
      await this.ffArr(
        [
          '-y', '-f', 'lavfi', '-i', `color=c=0x${bgHex}:s=${resolution}:d=${duration}:r=${fps}`,
          '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', outPath,
        ],
        { timeout: 30000 },
      );
      try { fs.unlinkSync(txtPath); } catch { /* ignore */ }
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

  /**
   * Generate a TRANSPARENT background text overlay video (RGBA, PNG codec in
   * MOV container so alpha survives into the `overlay` filter).
   * Used for text nodes layered over the main video track.
   */
  async generateOverlayTextVideo(
    text: string,
    options?: {
      textColor?: string;
      fontSize?: number;
      resolution?: string;
      duration?: number;
      fps?: number;
      x?: number; // 0..1 horizontal position (0.5 = center)
      y?: number; // 0..1 vertical position (0.5 = center)
      opacity?: number; // 0..1
      animation?: string; // none | fade | slide_up | slide_down | zoom_in
      start?: number; // start time on the base video timeline (animations/fade are relative to it)
      outputPath?: string;
    },
  ): Promise<string> {
    const {
      textColor = '#FFFFFF',
      fontSize = 48,
      resolution = '1080x1920',
      duration = 3,
      fps = 24,
      opacity = 1,
      animation = 'fade',
      start = 0,
    } = options || {};

    const outPath = options?.outputPath || path.join(this.outputDir, `overlay_text_${Date.now()}.mov`);
    const [w, h] = resolution.split('x').map(Number);

    // x/y semantics: 0..1 (0.5 = center). Legacy/API callers may pass 0..100
    // percent-style values (e.g. y=20) which would push text off-screen, so
    // normalize anything in 1..100 as percent and clamp to [0,1].
    const norm01 = (v: number | undefined): number => {
      const n = Number(v);
      if (Number.isFinite(n)) {
        if (n >= 0 && n <= 1) return n;
        if (n > 1 && n <= 100) return n / 100;
      }
      return 0.5;
    };
    const x = norm01(options?.x);
    const y = norm01(options?.y);

    const maxCharsPerLine = Math.max(4, Math.floor(w / (fontSize * 0.55)));
    const lines = this.wrapText(text, maxCharsPerLine);
    const lineHeight = fontSize * 1.4;
    const totalTextHeight = lines.length * lineHeight;
    const startY = Math.round(y * h - totalTextHeight / 2);

    // 同 generateTextVideo：文字走 textfile 临时文件，内容零 filter 转义，注入天然免疫。
    const txtPath = path.join(this.outputDir, `textfile_${Date.now()}.txt`);
    fs.writeFileSync(txtPath, text, 'utf8');
    const txtArg = `textfile='${txtPath.split(path.sep).join('/').replace(/:/g, '\\:')}'`;
    const isHexColor = (c?: string) => !!c && /^#[0-9a-fA-F]{3,8}$/.test(c);
    const fg = isHexColor(textColor) ? textColor : '#FFFFFF';
    const fontArg = detectFontFile();
    const fontPart = fontArg ? fontArg + ':' : '';
    const cleanupTxt = () => { try { fs.unlinkSync(txtPath); } catch { /* ignore */ } };

    const anim = `max(0,(${0.6} - t)/0.6)`;
    const xxBase = `${(x * w).toFixed(2)}-text_w/2`;
    const yBase = Math.max(startY, 0);

    const base = `drawtext=${txtArg}:fontcolor=${fg}:alpha=${opacity}:${fontPart}x='${xxBase}'`;
    let textFilter: string;
    if (animation === 'slide_up') {
      textFilter = `${base}:fontsize=${fontSize}:y='${yBase}+${h * 0.15}*${anim}'`;
    } else if (animation === 'slide_down') {
      textFilter = `${base}:fontsize=${fontSize}:y='${yBase}-${h * 0.15}*${anim}'`;
    } else if (animation === 'zoom_in') {
      textFilter = `${base}:fontsize='${fontSize}*(1+${anim}*0.2)':y='${yBase}'`;
    } else {
      textFilter = `${base}:fontsize=${fontSize}:y='${yBase}'`;
    }

    // Fade in/out on the overlay's own clock: fade-in starts at 0 (right when
    // the overlay becomes visible), fade-out ends exactly at the clip end.
    // A shorter fade-in keeps the entrance animation perceivable.
    const fadeIn = animation === 'none' ? 0.4 : 0.25;
    const fadeOut = Math.min(0.5, duration / 3);
    const alphaFilter =
      animation === 'none'
        ? ''
        : `,fade=t=in:st=0:d=${fadeIn}:alpha=1,fade=t=out:st=${Math.max(duration - fadeOut, 0).toFixed(3)}:d=${fadeOut}:alpha=1`;

    try {
      await this.ffArr(
        [
          '-y', '-f', 'lavfi', '-i', `color=black@0:s=${resolution}:d=${duration}:r=${fps},format=rgba`,
          '-vf', `${textFilter}${alphaFilter}`,
          '-c:v', 'png', '-pix_fmt', 'rgba', outPath,
        ],
        { timeout: 60000 },
      );
      this.logger.log(`Overlay text video generated: ${outPath}`);
      cleanupTxt();
      return outPath;
    } catch (err: any) {
      cleanupTxt();
      this.logger.error(`Overlay text video failed: ${err.message}`);
      throw new Error(`文字叠加渲染失败: ${err.message}`);
    }
  }

  /**
   * Overlay an image (PNG/JPG) on top of a base video at a position with
   * scale/opacity, active only during [start, end).
   */
  async overlayImageOnVideo(
    baseVideo: string,
    imagePath: string,
    options?: {
      x?: number; // 0..1
      y?: number; // 0..1
      width?: number; // target overlay width in px (relative to base width)
      opacity?: number; // 0..1
      start?: number;
      end?: number;
      outputPath?: string;
    },
  ): Promise<string> {
    const {
      width = 300,
      opacity = 1,
      start = 0,
      end = 5,
    } = options || {};

    const outPath = options?.outputPath || path.join(this.outputDir, `overlay_img_${Date.now()}.mp4`);
    const info = await this.getVideoInfo(baseVideo);
    const W = info.width || 1080;
    const H = info.height || 1920;
    const norm01 = (v: number | undefined): number => {
      const n = Number(v);
      if (Number.isFinite(n)) {
        if (n >= 0 && n <= 1) return n;
        if (n > 1 && n <= 100) return n / 100;
      }
      return 0.5;
    };
    const x = norm01(options?.x);
    const y = norm01(options?.y);
    const ovX = Math.round((x * W) - width / 2);
    const ovY = Math.round((y * H) - (width / (W / H)) / 2);
    const ovH = Math.round(width * (H / W));

    const enable = `enable='between(t,${Math.max(start, 0).toFixed(3)},${Math.max(end, 0).toFixed(3)})'`;
    try {
      await this.ff(
        `-y -i "${baseVideo}" -loop 1 -i "${imagePath}" -t ${end.toFixed(3)} ` +
        `-filter_complex "[1:v]scale=${width}:${ovH}:force_original_aspect_ratio=decrease,format=rgba,colorchannelmixer=aa=${opacity}[ov];` +
        `[0:v][ov]overlay=x=${ovX}:y=${ovY}:${enable}[vout]" ` +
        `-map "[vout]" -map 0:a? -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 128k "${outPath}"`,
        { timeout: 180000 },
      );
      this.logger.log(`Image overlay done: ${outPath}`);
      return outPath;
    } catch (err: any) {
      this.logger.error(`Image overlay failed: ${err.message}`);
      throw new Error(`图片叠加失败: ${err.message}`);
    }
  }

  /**
   * Mix multiple audio tracks (e.g. per-node audio + BGM) onto a video with
   * per-track volume, start offset (adelay) and fade in/out.
   */
  async mixAudioTracks(
    videoPath: string,
    tracks: Array<{
      audioPath: string;
      volume?: number;
      start?: number; // seconds offset
      fadeIn?: number;
      fadeOut?: number;
      trimIn?: number; // seconds to skip from the source's beginning (portion start)
      duration?: number; // portion length in seconds
    }>,
    outputPath?: string,
  ): Promise<string> {
    const valid = (tracks || []).filter((t) => t.audioPath && fs.existsSync(t.audioPath));
    if (valid.length === 0) return videoPath;

    const outPath = outputPath || path.join(this.outputDir, `audio_mix_${Date.now()}.mp4`);
    const info = await this.getVideoInfo(videoPath);
    const totalDur = info.duration || 5;

    // A video with no audio track (e.g. text-only canvas base) cannot feed
    // [0:a] into amix → synthesize a silent track when missing
    const hasVideoAudio = await this.hasAudioTrack(videoPath);
    const silentIdx = valid.length + 1;

    // Build per-track filters: volume → adelay → fade in/out → apad to total length
    // (trimIn/duration are applied as input seek options `-ss`/`-t` so the
    // track only reads the selected portion of the source file)
    const inputArgs = valid.map((t) => {
      const seek = t.trimIn && t.trimIn > 0 ? `-ss ${t.trimIn.toFixed(3)} ` : '';
      const len = t.duration && t.duration > 0 ? `-t ${t.duration.toFixed(3)} ` : '';
      return `${seek}${len}-i "${t.audioPath}"`;
    }).join(' ')
      + (hasVideoAudio ? '' : ` -f lavfi -i "anullsrc=r=44100:cl=stereo"`);
    const parts: string[] = [];
    const base = hasVideoAudio
      ? `[0:a]aresample=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=1.0[am0]`
      : `[${silentIdx}:a]atrim=duration=${totalDur.toFixed(3)},asetpts=PTS-STARTPTS,aresample=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=1.0[am0]`;
    parts.push(base);
    valid.forEach((t, i) => {
      const vol = t.volume ?? 1;
      const startSec = t.start ?? 0;
      const startMs = Math.round(startSec * 1000);
      const fadeIn = t.fadeIn ?? 0;
      const fadeOut = t.fadeOut ?? 0;
      const fIn = fadeIn > 0 ? `,afade=t=in:st=${startSec.toFixed(3)}:d=${fadeIn.toFixed(3)}` : '';
      const fOut = fadeOut > 0
        ? `,afade=t=out:st=${Math.max(startSec, totalDur - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`
        : '';
      parts.push(
        `[${i + 1}:a]aresample=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,` +
        `volume=${vol.toFixed(3)},adelay=${startMs}|${startMs}${fIn}${fOut},apad=whole_dur=${totalDur.toFixed(3)}[am${i + 1}]`,
      );
    });
    const mixInputs = valid.map((_, i) => `[am${i + 1}]`).join('');
    parts.push(`[am0]${mixInputs}amix=inputs=${valid.length + 1}:duration=first:dropout_transition=0,alimiter=limit=0.95[amout]`);

    try {
      await this.ff(
        `-y -i "${videoPath}" ${inputArgs} -filter_complex "${parts.join(';')}" ` +
        `-map 0:v -map "[amout]" -c:v copy -c:a aac -b:a 192k "${outPath}"`,
        { timeout: 180000 },
      );
      this.logger.log(`Audio mix done: ${outPath}`);
      return outPath;
    } catch (err: any) {
      this.logger.error(`Audio mix failed: ${err.message}`);
      throw new Error(`音频混音失败: ${err.message}`);
    }
  }
}
