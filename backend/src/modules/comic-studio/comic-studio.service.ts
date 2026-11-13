import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import { ComicProject } from './comic-project.entity';
import { GenerationTask } from '../task/generation-task.entity';
import { Character } from '../character/character.entity';
import { GlobalAsset } from '../global-asset/global-asset.entity';
import { PromptTemplate } from '../admin/prompt-template.entity';
import { GenerateService } from '../generate/generate.service';
import { AIServiceUtil, AGNES_IMAGE_MODELS, AGNES_IMAGE_RATIOS } from '../../utils/ai-service.util';
import { resolveSafeStaticPath, assertSafeRemoteUrl, downloadToFile } from '../../common/utils/safe-download.util';
import axios from 'axios';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

// archiver v8 为纯 ESM：只导出 ZipArchive 类，不再导出 archiver('zip', opts) 工厂函数。
// 兼容写法：v8 用 new ZipArchive(opts)，旧版(v5/v6)回退到工厂函数，避免依赖版本漂移再次导致 500。
const archiverModule = require('archiver');
function newZipArchive(options: any): any {
  const ZipArchive = archiverModule.ZipArchive;
  return typeof ZipArchive === 'function' ? new ZipArchive(options) : archiverModule('zip', options);
}
const execFileAsync = promisify(execFile);

/** 开源图鉴仓库根：目录 JSON、缩略图、以及人脸原图下载失败时的回退源共用 */
const OPEN_GALLERY_BASE = 'https://hruiccc.github.io/RuiC-PoseAtlas';

/** 两种画风的固定文本块，全片逐字复用 */
const STYLE_BLOCKS: Record<string, string> = {
  live_action: 'Photorealistic photograph of one real person, natural skin texture, real fabric and hair detail, soft even studio light, plain clean backdrop, photographic depth of field. Not an illustration, not a painting, not 3D render.',
  anime: 'Anime illustration of one person, clean line art, cel shading, flat colour with soft painted background, expressive eyes, crisp outlines. Not a photograph, not 3D render.',
};

const TPL = {
  outline: '漫画剧情大纲模板',
  characters: '漫画人物解析模板',
  persona: '漫画人设提示词模板',
  script: '漫画分格脚本模板',
};

const DEFAULT_OUTLINE_TEMPLATE = `你是一位资深漫画编剧。请根据用户的一句话灵感，写出一套适合竖版条漫的完整剧情大纲。

【灵感】{{idea}}
【片名】{{title}}

严格输出 JSON（不要解释、不要 markdown 代码块）：
{"logline":"一句话梗概","outline":"完整大纲，含开端/推进/转折/收束，300-500字，中文","scenes":["场景1","场景2","场景3"]}`;

const DEFAULT_CHARACTERS_TEMPLATE = `你是一位漫画人设师。请从下面的剧情大纲里识别出全部出场人物，并为每个人补全可用于 AI 生图的人设信息。

【大纲】{{outline}}

严格输出 JSON（不要解释、不要 markdown 代码块）：
{"characters":[{"name":"姓名","role":"身份/职业","age":"年龄","gender":"性别","appearance":"脸型/五官/发型发色/瞳色/肤色/体型的中文描述","personality":"性格","costume":"服装逐件描述：上衣、下装、鞋、外搭、配饰，含颜色与材质","accessories":"随身物品与配饰","signature":"标志性特征（如发饰、疤痕、胎记）"}]}

要求：只列出大纲中真实出现的人物；服装必须逐件写清（跨格最容易被模型改样）；不要编造大纲里没有的主要角色。`;

const DEFAULT_PERSONA_TEMPLATE = `你是 AI 生图提示词专家。请把下面的人设转成一段**英文**生图提示词，用于生成该角色的 CHARACTER PROFILE 设定本。

【人物】{{characters}}
【画风】{{style}}

严格输出 JSON（不要解释、不要 markdown 代码块）：
{"prompts":[{"id":"人物id","prompt":"英文提示词：逐项写脸型、发型发色、五官、服装逐件（含颜色材质）、配饰、标志性特征；要求干净中性背景、正面均匀光、全身可辨；不要写版式、不要写文字、不要写多格要求"}]}`;

const DEFAULT_SCRIPT_TEMPLATE = `你是一位资深漫画编剧，同时熟悉 AI 生图模型的限制。请为一套竖版条漫生成完整分格脚本。

【大纲】{{outline}}
【出场人物（id 与姓名）】{{characters}}
【目标页数】{{page_count}}
【画面风格】{{style}}

【硬性要求】
1. 一次性输出完整 {{page_count}} 格，剧情要有开端、推进、转折、收束，格与格必须衔接。
2. 严格输出 JSON，形如 {"panels":[...]}，不要输出任何解释文字或 markdown 代码块。
3. 每格必须包含：
   page_no(整数，从1递增), scene_id, continuity(承接上一格的一句话),
   characters(本格出场人物 id 数组，必须来自上面的人物列表),
   action(本格人物动作，几何化描述), expression(表情), camera(景别),
   narration(中文旁白，可空串), dialogue(中文台词，可空串),
   choice(分支选项数组或 null), reuse_group(复用组名)。
4. reuse_group：仅表情/台词变化、姿势与服装不变的连续格归为同一组；动作明确变化的格单独成组。
5. action 写成可观察的几何锚点，不要写"镜头先拍…再展示…"这类分镜语言，不要写画面文字/气泡要求。
6. narration 与 dialogue 只作后期排版文案，不会被送去生图。

现在输出 JSON：`;

/** 角色设定本的图像块（推荐 B：分块生成 + 后端 ffmpeg 拼版，文字归排版层）。
 *  默认 7 块：正面头像/三视图/表情组/局部特写/人物服装/姿势/造型。
 *  每块可独立绑定大资产库参考图（i2i），见 setBlockReference 与 blockPrompt。 */
const SHEET_BLOCKS = [
  {
    key: 'portrait', label: '正面头像',
    prompt: 'A clean character reference sheet: ONE large front-facing head-and-shoulders portrait of {{persona}} Centered, neutral expression, both eyes visible, even front light, plain light grey backdrop. Framed from the shoulders up ONLY, NO full body, NO legs, NO lower body, NO wide shot. {{style}}',
  },
  {
    key: 'three_view', label: '三视图',
    prompt: 'Character turnaround reference sheet with THREE full-body views side by side labelled FRONT, 3/4 SIDE and BACK, head to toe, same character in all three: {{persona}} Identical face, hairstyle and outfit in every view, neutral standing pose, plain light grey backdrop. {{style}}',
  },
  {
    key: 'expressions', label: '表情组',
    prompt: 'Expression reference sheet with FIVE head-and-shoulders portraits (cropped at chest) in one horizontal row of the SAME character: neutral, gentle smile, shy, upset, angry. {{persona}} Identical face, hairstyle and outfit in all five. NO full body, NO legs, NO lower body. {{style}}',
  },
  {
    key: 'details', label: '局部特写',
    prompt: 'Detail reference sheet with FOUR close-up panels of the SAME character: eyes and face detail, hair ornament, collar and upper garment fabric, shoes and lower garment. {{persona}} {{style}}',
  },
  {
    key: 'costume', label: '人物服装',
    prompt: 'Costume reference sheet of the SAME character showing the full outfit: top, bottom, shoes, outerwear and accessories, each clearly visible. {{persona}} Same character, identical face and hairstyle. Neutral standing pose, plain light grey backdrop. {{style}}',
  },
  {
    key: 'pose', label: '姿势',
    prompt: 'Pose reference sheet: full-body dynamic standing pose of the SAME character, front-facing, clearly showing body lines and weight distribution. {{persona}} Same character, identical outfit. Plain light grey backdrop. {{style}}',
  },
  {
    key: 'styling', label: '造型',
    prompt: 'Styling reference sheet of the SAME character focusing on hairstyle and overall look: head-and-shoulders portrait showing hair shape, colour and styling plus signature accessories. {{persona}} Same character. Plain light grey backdrop. {{style}}',
  },
];

/** 11-12 需求：只有这 4 块是必选生成项，齐了即可拼版 / 锁定 / 进入下一步。
 *  其余 3 块（人物服装 / 姿势 / 造型）为可选，不默认生成、不阻塞流程；
 *  用户可在详情弹窗里单独「重生成」或「应用大资产」，生成后动态加入拼版。 */
const REQUIRED_BLOCK_KEYS = ['portrait', 'three_view', 'expressions', 'details'];
const OPTIONAL_BLOCK_KEYS = SHEET_BLOCKS.map((b) => b.key).filter((k) => !REQUIRED_BLOCK_KEYS.includes(k));

export interface ComicCharacter {
  id: string;
  name: string;
  role?: string;
  age?: string;
  gender?: string;
  appearance?: string;
  personality?: string;
  costume?: string;
  accessories?: string;
  signature?: string;
  prompt?: string;
  blocks?: Array<{ key: string; source?: 'generated' | 'library'; task_id?: number; url?: string; status?: string; asset_url?: string; error_msg?: string; reference_image?: string; reference_asset_id?: number }>;
  sheet_url?: string;
  locked?: boolean;
}

export interface ComicPanel {
  page_no: number;
  scene_id?: string;
  continuity?: string;
  characters?: string[];
  reuse_group: string;
  base_image_id?: string;
  output_url?: string;
  action?: string;
  expression?: string;
  camera?: string;
  pose_ref?: string;
  narration?: string;
  dialogue?: string;
  choice?: { guide?: string; options?: string[]; highlight?: number } | null;
  nar?: any;
  bubs?: any[];
  ch?: any;
  task_id?: number;
  status?: string;
  error_msg?: string;
}

export interface PanelSpec { version: number; panels: ComicPanel[] }

@Injectable()
export class ComicStudioService {
  private readonly logger = new Logger(ComicStudioService.name);

  constructor(
    @InjectRepository(ComicProject) private readonly repo: Repository<ComicProject>,
    @InjectRepository(GenerationTask) private readonly taskRepo: Repository<GenerationTask>,
    @InjectRepository(Character) private readonly characterRepo: Repository<Character>,
    @InjectRepository(GlobalAsset) private readonly assetRepo: Repository<GlobalAsset>,
    @InjectRepository(PromptTemplate) private readonly templateRepo: Repository<PromptTemplate>,
    private readonly generateService: GenerateService,
    private readonly aiService: AIServiceUtil,
  ) {}

  // ---------- 通用读写 ----------

  private parseSpec(p: ComicProject): PanelSpec {
    if (!p.panel_spec) return { version: 1, panels: [] };
    try {
      const j = JSON.parse(p.panel_spec);
      return { version: j.version || 1, panels: Array.isArray(j.panels) ? j.panels : [] };
    } catch { return { version: 1, panels: [] }; }
  }

  private parseChars(p: ComicProject): ComicCharacter[] {
    if (!p.characters) return [];
    let chars: ComicCharacter[];
    try {
      const j = JSON.parse(p.characters);
      chars = Array.isArray(j) ? j : (Array.isArray(j.characters) ? j.characters : []);
    } catch { return []; }
    // 11-12 兼容：旧版「应用大资产」只写 reference_image（status=pending、无 url），
    // 新语义是「应用即成品」。读取时无损升级，避免历史项目刷新后仍显示「待生成」且无法拼版。
    // 严格限定：无成品图 + 有参考图 + 无进行中任务 + 状态 pending/空 + 本地文件确实存在。
    for (const c of chars) {
      for (const b of ((c as any).blocks || [])) {
        if (!b.url && b.reference_image && !b.task_id && (!b.status || b.status === 'pending')
            && this.localImage(b.reference_image)) {
          b.url = b.reference_image;
          b.asset_url = b.reference_image;
          b.source = 'library';
          b.status = 'completed';
        }
      }
    }
    return chars;
  }

  private async saveSpec(p: ComicProject, spec: PanelSpec) {
    p.panel_spec = JSON.stringify(spec);
    return this.repo.save(p);
  }

  private async saveChars(p: ComicProject, chars: ComicCharacter[]) {
    p.characters = JSON.stringify(chars);
    return this.repo.save(p);
  }

  /** 补齐 7 个图像块：早期项目只有 4 块，新 UI 会对 costume/pose/styling 操作，
   *  不补齐会让 c.blocks.find(...) 返回 undefined 直接 500。按 SHEET_BLOCKS 顺序重建、保留已有块数据。 */
  private ensureBlocks(c: ComicCharacter): any[] {
    const cur: any[] = Array.isArray(c.blocks) ? c.blocks : [];
    c.blocks = SHEET_BLOCKS.map((b) => cur.find((x) => x.key === b.key) || { key: b.key, status: 'pending' });
    return c.blocks as any[];
  }

  private async owned(userId: number, id: number): Promise<ComicProject> {
    const p = await this.repo.findOne({ where: { id, user_id: userId } });
    if (!p) throw new NotFoundException('漫画项目不存在');
    return p;
  }

  private async template(name: string, fallback: string): Promise<string> {
    try {
      const t = await this.templateRepo.findOne({ where: { name, status: 'active' } });
      if (t?.template) return t.template;
    } catch { /* 模板表不可用则用内置 */ }
    return fallback;
  }

  private async llmJson(prompt: string, temperature = 0.4): Promise<any> {
    const raw = await this.aiService.chatCompletion([{ role: 'user', content: prompt }], { temperature });
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new BadRequestException('模型未返回有效 JSON，请重试');
    try { return JSON.parse(match[0]); } catch { throw new BadRequestException('模型输出 JSON 解析失败，请重试'); }
  }

  // ---------- CRUD ----------

  async list(userId: number) {
    const rows = await this.repo.find({ where: { user_id: userId }, order: { updated_at: 'DESC' }, take: 50 });
    return rows.map((p) => ({ ...p, panel_count: this.parseSpec(p).panels.length, panel_spec: undefined, characters: undefined }));
  }

  async getById(userId: number, id: number) {
    const p = await this.owned(userId, id);
    return { ...p, spec: this.parseSpec(p), character_list: this.parseChars(p) };
  }

  async create(userId: number, dto: any) {
    if (!dto?.title?.trim()) throw new BadRequestException('请填写项目名称');
    const styleMode = dto.style_mode === 'anime' ? 'anime' : 'live_action';
    const p = this.repo.create({
      user_id: userId,
      title: String(dto.title).trim(),
      outline: dto.outline || '',
      style_mode: styleMode,
      character_id: dto.character_id || null,
      character_ref: dto.character_ref || null,
      character_card: dto.character_card || '',
      costume_ref: dto.costume_ref || null,
      costume_card: dto.costume_card || '',
      style_block: dto.style_block || STYLE_BLOCKS[styleMode],
      scene_anchor: dto.scene_anchor || 'plain pale studio backdrop, soft even light',
      model: AGNES_IMAGE_MODELS.includes(dto.model) ? dto.model : AGNES_IMAGE_MODELS[0],
      image_size: ['1K', '2K', '3K', '4K'].includes(String(dto.image_size || '').toUpperCase())
        ? String(dto.image_size).toUpperCase() : '1K',
      ratio: AGNES_IMAGE_RATIOS.includes(dto.ratio) ? dto.ratio : '2:3',
      page_count: Math.max(4, Math.min(24, Number(dto.page_count) || 16)),
      characters: '[]',
      outline_status: dto.outline ? 'review' : 'draft',
      characters_status: 'draft',
      sheet_status: 'draft',
      sheet_mode: dto.sheet_mode === 'single' ? 'single' : 'blocks',
      status: 'draft',
    });
    const saved = await this.repo.save(p);
    return this.getById(userId, saved.id);
  }

  async update(userId: number, id: number, dto: any) {
    const p = await this.owned(userId, id);
    if (p.status === 'generating') throw new BadRequestException('生成中不能修改项目，请等待完成');
    const allowed = ['title', 'outline', 'style_mode', 'character_id', 'character_ref', 'character_card',
      'costume_ref', 'costume_card', 'style_block', 'scene_anchor', 'model', 'image_size', 'ratio', 'page_count', 'sheet_mode'];
    for (const k of allowed) if (dto[k] !== undefined) (p as any)[k] = dto[k];
    if (dto.style_mode && !dto.style_block) p.style_block = STYLE_BLOCKS[dto.style_mode] || p.style_block;
    await this.repo.save(p);
    return this.getById(userId, id);
  }

  async remove(userId: number, id: number) {
    const p = await this.owned(userId, id);
    await this.repo.remove(p);
    return { ok: true };
  }

  /** 可选素材角色（V2 只作补充参考，主链路是模型识别人物） */
  async listCharacters(userId: number) {
    const [chars, assets] = await Promise.all([
      this.characterRepo.find({ where: { user_id: userId }, take: 100 }),
      this.assetRepo.find({ where: { user_id: userId, type: 'character', source_type: Not('open_gallery') }, take: 100 }),
    ]);
    return [
      ...chars.map((c) => ({ key: `character:${c.id}`, source: 'character', id: c.id, name: c.name,
        description: c.description || '', image_url: c.avatar_url || '',
        ref_anime: c.reference_image_anime || '', ref_realistic: c.reference_image_realistic || '' })),
      ...assets.map((a) => ({ key: `asset:${a.id}`, source: 'asset', id: a.id, name: a.name,
        description: a.description || '', image_url: a.image_url || '', ref_anime: '', ref_realistic: '' })),
    ];
  }

  // ---------- 开源图鉴（RuiC-PoseAtlas，CC0，2026-11-09 用户需求） ----------

  private openCatalogCache: { at: number; data: any } | null = null;
  /** 拼版 in-flight 锁（P0-1）：key = projectId:characterId，同一设定本同时只跑一个 ffmpeg */
  private sheetJobs = new Map<string, Promise<void>>();
  /** 拼版失败退避：key 同上，失败后 90s 内不再自动重试 */
  private sheetFailAt = new Map<string, number>();

  /**
   * 姿势库安全口径（2026-11-10 用户拍板「153 安全子集」后再收紧）：
   * 只取 full_std(全身标准系) / upper(上半身) 两个系列，并排除成人向类目，
   * 实际保留 98 个姿势 × 5 角度 = 490 张图。
   * poses.json 全库 288 姿势含 full_sexy / duo 及「正常位/后入位/骑乘位」等类目，禁止整库接入。
   */
  private static readonly POSE_SAFE_SERIES = ['full_std', 'upper'];
  private static readonly POSE_BLOCK_CATEGORIES = [
    '性感・大胆系', '挤胸・强调事业线系', '贴脸系',
    '正常位（传教士）', '后入位', '坐位', '背向坐位', '骑乘位', '侧卧位',
    '面对面坐位', '立位贴身', '坐位贴身', '贴身',
  ];

  /**
   * 开源图鉴目录：人脸 1499（face 893 / styling 606）+ 服装 1407 + 姿势安全子集 490，CC0。
   * 数据契约（实测）：faces.images[].{id,sec,hair,style,thumb_remote,full_remote}、
   * costumes.costumes[].{id,cat,group,color,main,tags,thumb,image}、
   * poses.poses[].{id,series,category,no,names,variants[].{angle,thumb,full}}。
   * URL 策略（实测 200/404）：face 原图必须走 full_remote（pages.dev），仓库路径 404；
   * costume 原图与全部缩略图、pose 缩略图(thumbs/*.jpg)与原图(img/*.png)均走 github.io 仓库根路径。
   */
  async getOpenCatalog() {
    if (this.openCatalogCache && Date.now() - this.openCatalogCache.at < 3600_000) {
      return this.openCatalogCache.data;
    }
    const base = OPEN_GALLERY_BASE;
    const cacheFile = path.resolve(process.cwd(), 'output', 'gallery-cache', 'catalog.json');
    let raw: any = null;
    if (fs.existsSync(cacheFile)) {
      try {
        const j = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        // 旧缓存没有 poses 字段 → 视为过期，强制重拉（否则姿势 tab 为空）
        if (j.poses && Date.now() - j.at < 3600_000) raw = j;
      } catch { /* 坏缓存重新拉 */ }
    }
    if (!raw) {
      const fetchCatalog = (cfg: any = {}) => Promise.all([
        axios.get(`${base}/data/faces.json`, { timeout: 30000, ...cfg }),
        axios.get(`${base}/data/costumes.json`, { timeout: 30000, ...cfg }),
        axios.get(`${base}/data/poses.json`, { timeout: 30000, ...cfg }),
      ]);
      let parts: Awaited<ReturnType<typeof fetchCatalog>>;
      try {
        parts = await fetchCatalog();
      } catch (err: any) {
        // 进程级代理失效时（本机 IDE 注入的 HTTP_PROXY 端口会随会话变化），退回直连再试一次
        this.logger.warn(`开源目录走代理拉取失败，改直连重试: ${err?.message || err}`);
        parts = await fetchCatalog({ proxy: false });
      }
      const [f, cst, pose] = parts;
      raw = { at: Date.now(), faces: f.data, costumes: cst.data, poses: pose.data };
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(raw));
    }
    const faces = (raw.faces.images || []).map((img: any) => ({
      kind: img.sec === 'face' ? 'face' : 'styling',
      id: img.id, hair: img.hair || '', title: img.style || img.hair || '',
      w: img.w, h: img.h,
      thumb: `${base}/portrait/thumbs/${img.id}.webp`,
      full: img.full_remote || `${base}/portrait/img/${img.id}.png`,
    }));
    const catName = new Map((raw.costumes.categories || []).map((x: any) => [x.key, x.names?.zh || x.key]));
    const costumes = (raw.costumes.costumes || []).map((cst: any) => ({
      kind: 'costume', id: cst.id, cat: cst.cat,
      catName: catName.get(cst.cat) || cst.cat,
      color: cst.color || '', main: cst.main || '', tags: cst.tags || [],
      title: `${catName.get(cst.cat) || cst.cat} · ${cst.color || ''} · ${cst.main || ''}（${cst.id}）`,
      thumb: `${base}/costume/thumbs/${cst.id}.webp`,
      full: `${base}/costume/img/${cst.id}.webp`,
    }));
    // 姿势：按安全系列 + 类目白名单过滤，展开每个角度为一张可选素材
    const poseRaw = raw.poses || {};
    const seriesName = new Map((poseRaw.series || []).map((s: any) => [s.key, s.short?.zh || s.names?.zh || s.key]));
    const angleName = new Map((poseRaw.angles || []).map((a: any) => [a.key, a.names?.zh || a.key]));
    const poses: any[] = [];
    for (const p of (poseRaw.poses || [])) {
      if (!ComicStudioService.POSE_SAFE_SERIES.includes(p.series)) continue;
      if (ComicStudioService.POSE_BLOCK_CATEGORIES.includes(p.category)) continue;
      for (const v of (p.variants || [])) {
        poses.push({
          kind: 'pose',
          id: `${p.id}_${v.angle}`,
          poseId: p.id, no: p.no || '',
          series: p.series, seriesName: seriesName.get(p.series) || p.series,
          category: p.category || '',
          angle: v.angle, angleName: angleName.get(v.angle) || v.angle,
          title: `${p.names?.zh || p.id} · ${angleName.get(v.angle) || v.angle}（${p.no || p.id}）`,
          thumb: `${base}/${v.thumb}`,
          full: `${base}/${v.full}`,
        });
      }
    }
    const data = { base, faces, costumes, poses };
    this.openCatalogCache = { at: Date.now(), data };
    return data;
  }

  /** 导入开源图鉴原图 → 压成参考图规格 → backend/output/gallery/ → 返回 /static/gallery/<id>.jpg
   *  存储三重保障（11-09 用户要求着重检查，face 全库原图合计 4.53GB 不能照搬）：
   *  ① 导入即压缩到 ≤1024px JPEG（参考图链路本来就会压到该规格，原图分辨率无用），单张 2.1MB → ~150KB
   *  ② 同图重复导入秒回（按 id 落盘覆盖，零下载）
   *  ③ gallery 目录 500MB 总量上限，超限拒绝并提示清理 */
  async importOpenImage(userId: number, dto: { url: string; id?: string; kind?: string; title?: string }) {
    const raw = String(dto?.url || '').trim();
    let u: URL;
    try { u = new URL(raw); } catch { throw new BadRequestException('无效的图片 URL'); }
    const allowed = ['hruiccc.github.io', 'ai-portrait-gallery.pages.dev'];
    if (!/^https?:$/.test(u.protocol) || !allowed.includes(u.hostname)) {
      throw new BadRequestException('仅允许导入开源图鉴域名下的图片');
    }
    const extMatch = u.pathname.match(/\.(png|jpe?g|webp)$/i);
    if (!extMatch) throw new BadRequestException('仅支持 png / jpg / webp');
    const id = (String(dto?.id || path.basename(u.pathname, extMatch[0])).replace(/[^\w.-]/g, '').slice(0, 60)) || `img_${Date.now()}`;
    const destDir = path.resolve(process.cwd(), 'output', 'gallery');
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, `${id}.jpg`);
    const url = `/static/gallery/${id}.jpg`;

    // ② 去重：已导入过直接返回，零下载
    let cached = false;
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      cached = true;
    } else {
      // ③ 配额：gallery 目录总量上限
      const existing = fs.existsSync(destDir) ? fs.readdirSync(destDir) : [];
      const totalBytes = existing.reduce((s, f) => {
        try { return s + fs.statSync(path.join(destDir, f)).size; } catch { return s; }
      }, 0);
      if (totalBytes > 500 * 1024 * 1024) {
        throw new BadRequestException(
          `开源图库本地缓存已达 ${(totalBytes / 1024 / 1024).toFixed(0)}MB（上限 500MB），请先清理 backend/output/gallery/ 下的旧图再导入`);
      }

      // ① 下载原图到临时文件 → ffmpeg 压成 ≤1024px JPEG → 删临时原图
      //    11-12 修复：绕开进程级代理、加整体截止时间、失败清半成品（原来下载抛错时 finally 根本进不去，
      //    会在 gallery/ 下残留截断的 .raw）。face/styling 原图在 pages.dev 本机限速约 1KB/s 且无
      //    Content-Length，超时后自动回退仓库内 400×500 webp 缩略图，保证可导入。
      const tmp = path.join(destDir, `.${id}_${Date.now()}.raw`);
      const dlOpts = { maxBytes: 25 * 1024 * 1024, timeoutMs: 60000, bypassProxy: true, totalTimeoutMs: 15000 };
      try {
        try {
          await assertSafeRemoteUrl(raw);
          await downloadToFile(raw, tmp, dlOpts);
        } catch (primaryErr: any) {
          const kind = String(dto?.kind || '').trim();
          const fallback = ['face', 'styling'].includes(kind)
            ? `${OPEN_GALLERY_BASE}/portrait/thumbs/${id}.webp`
            : '';
          if (!fallback) {
            throw new BadRequestException(`开源图鉴图片下载失败：${primaryErr?.message || primaryErr}`);
          }
          this.logger.warn(`开源图鉴原图下载失败（${id}），回退缩略图: ${primaryErr?.message || primaryErr}`);
          try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* ignore */ }
          await assertSafeRemoteUrl(fallback);
          try {
            await downloadToFile(fallback, tmp, dlOpts);
          } catch (fallbackErr: any) {
            throw new BadRequestException(`开源图鉴图片下载失败（原图与缩略图均失败）：${fallbackErr?.message || fallbackErr}`);
          }
        }
        if (!fs.existsSync(tmp) || fs.statSync(tmp).size === 0) throw new BadRequestException('下载失败，请重试');
        await execFileAsync(this.ffmpegBin(),
          ['-y', '-v', 'quiet', '-i', tmp, '-vf', 'scale=1024:-2', '-q:v', '5', '-frames:v', '1', dest],
          { timeout: 90000 });
      } finally {
        try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* ignore */ }
      }
      if (!fs.existsSync(dest) || fs.statSync(dest).size === 0) throw new BadRequestException('图片处理失败，请重试');
    }

    // 同步到大资产库：每张导入的开源图都建一条 GlobalAsset（tag=类别，source_type=open_gallery），
    // 供 comic-studio 设定本「应用大资产」挑选器按 tag 检索。幂等：同一 image_url 只建一条。
    const assetId = await this.ensureGalleryAsset(userId, {
      id, url, kind: String(dto?.kind || '').trim(), title: String(dto?.title || '').trim(),
    });

    return { url, bytes: fs.statSync(dest).size, id, assetId, cached };
  }

  /** 幂等地把一张开源导入图登记进大资产库（按 image_url 去重），失败仅告警不阻断导入 */
  private async ensureGalleryAsset(userId: number, info: { id: string; url: string; kind: string; title: string }): Promise<number | null> {
    try {
      const existing = await this.assetRepo.findOne({ where: { image_url: info.url, user_id: userId } });
      if (existing) return existing.id;
      const tag = (['face', 'styling', 'costume', 'pose'].includes(info.kind) ? info.kind : 'open');
      const asset = this.assetRepo.create({
        user_id: userId,
        type: 'character',
        name: info.title || info.id,
        description: `开源图鉴导入（${tag}）`,
        image_url: info.url,
        tags: tag,
        status: 'completed',
        source_type: 'open_gallery',
      });
      const saved = await this.assetRepo.save(asset);
      return saved.id;
    } catch (err: any) {
      this.logger.warn(`ensureGalleryAsset failed for ${info.url}: ${err?.message || err}`);
      return null;
    }
  }

  // ---------- 阶段 1：剧情大纲 → 人物识别 ----------

  async generateOutline(userId: number, id: number, dto: { idea?: string }) {
    const p = await this.owned(userId, id);
    const idea = String(dto?.idea || '').trim();
    if (!idea) throw new BadRequestException('请先写一句话灵感/题材');
    const tpl = await this.template(TPL.outline, DEFAULT_OUTLINE_TEMPLATE);
    const prompt = tpl.replace(/\{\{idea\}\}/g, idea).replace(/\{\{title\}\}/g, p.title);
    const j = await this.llmJson(prompt, 0.6);
    if (!j?.outline) throw new BadRequestException('模型未生成大纲，请重试');
    p.outline = String(j.outline);
    p.outline_status = 'review';
    await this.repo.save(p);
    return { outline: p.outline, logline: j.logline || '', scenes: j.scenes || [] };
  }

  async saveOutline(userId: number, id: number, dto: { outline: string; confirm?: boolean }) {
    const p = await this.owned(userId, id);
    const outline = String(dto?.outline || '').trim();
    if (!outline) throw new BadRequestException('大纲不能为空');
    p.outline = outline;
    p.outline_status = dto.confirm ? 'confirmed' : 'review';
    await this.repo.save(p);
    return this.getById(userId, id);
  }

  async extractCharacters(userId: number, id: number) {
    const p = await this.owned(userId, id);
    if (!p.outline?.trim()) throw new BadRequestException('请先生成或填写剧情大纲');
    const tpl = await this.template(TPL.characters, DEFAULT_CHARACTERS_TEMPLATE);
    const j = await this.llmJson(tpl.replace(/\{\{outline\}\}/g, p.outline), 0.3);
    if (!Array.isArray(j?.characters) || !j.characters.length) throw new BadRequestException('未能从大纲识别出人物，请重试');
    const chars: ComicCharacter[] = j.characters.slice(0, 8).map((c: any, i: number) => ({
      id: `c${i + 1}`,
      name: String(c.name || `角色${i + 1}`),
      role: String(c.role || ''), age: String(c.age || ''), gender: String(c.gender || ''),
      appearance: String(c.appearance || ''), personality: String(c.personality || ''),
      costume: String(c.costume || ''), accessories: String(c.accessories || ''),
      signature: String(c.signature || ''),
      locked: false,
    }));
    p.characters_status = 'review';
    await this.saveChars(p, chars);
    return this.getById(userId, id);
  }

  async saveCharacters(userId: number, id: number, dto: { characters: ComicCharacter[]; confirm?: boolean }) {
    const p = await this.owned(userId, id);
    if (!Array.isArray(dto.characters) || !dto.characters.length) throw new BadRequestException('人物列表不能为空');
    const old = this.parseChars(p);
    const chars = dto.characters.map((c, i) => {
      const prev = old.find((x) => x.id === c.id);
      return { ...(prev || {}), ...c, id: c.id || `c${i + 1}`, locked: prev?.locked || false,
        blocks: prev?.blocks, sheet_url: prev?.sheet_url, prompt: c.prompt || prev?.prompt };
    });
    p.characters_status = dto.confirm ? 'confirmed' : 'review';
    await this.saveChars(p, chars);
    return this.getById(userId, id);
  }

  private personaText(c: ComicCharacter): string {
    return `${c.name}, ${c.role || ''}, ${c.age || ''} ${c.gender || ''}. Face and hair: ${c.appearance || ''}. Outfit item by item: ${c.costume || ''}. Accessories: ${c.accessories || 'none'}. Signature: ${c.signature || 'none'}.`;
  }

  // ---------- 阶段 2：人设提示词 → 角色设定本 ----------

  async generateCharacterPrompts(userId: number, id: number) {
    const p = await this.owned(userId, id);
    const chars = this.parseChars(p);
    if (!chars.length) throw new BadRequestException('请先识别人物');
    const tpl = await this.template(TPL.persona, DEFAULT_PERSONA_TEMPLATE);
    const brief = chars.map((c) => ({ id: c.id, name: c.name, appearance: c.appearance, costume: c.costume, accessories: c.accessories, signature: c.signature }));
    const prompt = tpl.replace(/\{\{characters\}\}/g, JSON.stringify(brief))
      .replace(/\{\{style\}\}/g, p.style_mode === 'anime' ? '动漫插画' : '真人写实照片');
    let map = new Map<string, string>();
    try {
      const j = await this.llmJson(prompt, 0.3);
      if (Array.isArray(j?.prompts)) map = new Map(j.prompts.map((x: any) => [String(x.id), String(x.prompt || '')]));
    } catch (e: any) {
      this.logger.warn(`人设提示词 LLM 失败，改用本地拼装: ${e.message}`);
    }
    for (const c of chars) c.prompt = map.get(c.id) || this.personaText(c);
    await this.saveChars(p, chars);
    return this.getById(userId, id);
  }

  private blockPrompt(p: ComicProject, c: ComicCharacter, block: { key: string; prompt: string }, item?: { reference_image?: string }): string {
    const persona = c.prompt || this.personaText(c);
    const style = p.style_block || STYLE_BLOCKS[p.style_mode];
    const base = block.prompt.replace(/\{\{persona\}\}/g, persona).replace(/\{\{style\}\}/g, style);
    const lines = ['Create a clean CHARACTER PROFILE reference sheet panel.', base];
    if (item?.reference_image) {
      // i2i：参考图已携带身份/服装/姿势，避免重复描述造成冲突（尤其禁止重新引入姿势约束，见 R7）
      lines.push('[REFERENCE IMAGE] Use the attached reference image as the basis for this character: adopt its EXACT face, hairstyle, outfit and pose. Reproduce the same identity and styling. Do NOT re-describe or alter the face/outfit/pose.');
      if (block.key === 'pose') {
        // 姿势块：参考图即目标姿势，不写任何额外姿势/动作约束，防止压不住参考姿势
        lines.push('[POSE] Copy the exact pose from the reference image. Add no new pose instructions.');
      }
    } else {
      lines.push('[CONSISTENCY] Same face, same hairstyle, same outfit in every view. No outfit change, no second character.');
    }
    lines.push('[HARD NEGATIVE] NO Chinese text, NO random letters, NO captions, NO watermark, NO mannequin lines, NO joints, NO stone tablets, NO engraved or inscribed text, NO signage with writing, plain neutral backdrop, even lighting.');
    return lines.join('\n');
  }

  /** 为一个人物生成 4 个图像块任务，完成后由 status() 自动拼版 */
  /**
   * 生成 / 重生成设定本块。V2 修订（11-09，方案 §16.1）：
   * - 默认只重建「未完成或失败」的块，已成功块原样保留（url/task_id/status 不动，不重复扣费）
   * - 可用 dto.blocks 显式指定要重建的块
   * - 块 url 变化时清空 sheet_url，由 status() 自动重新拼版
   */
  async generateCharacterSheet(userId: number, id: number, dto: { characterId: string; blocks?: string[] }) {
    const p = await this.owned(userId, id);
    const chars = this.parseChars(p);
    const c = chars.find((x) => x.id === dto.characterId);
    if (!c) throw new NotFoundException('人物不存在');
    // 锁定后身份基准（必选 4 块）不可改；但允许补生成 / 重试失败的可选块，
    // 否则已锁定的角色遇到服装/姿势/造型生成失败（如 429）就永远无法重试。
    const onlyOptionalBlocks = Array.isArray(dto.blocks) && dto.blocks.length > 0
      && dto.blocks.every((k) => OPTIONAL_BLOCK_KEYS.includes(k));
    if (c.locked && !onlyOptionalBlocks) {
      throw new BadRequestException('该设定本已锁定，重生成必选块前请先解锁（失败的可选块可直接重试）');
    }
    if (!c.prompt) throw new BadRequestException('请先生成人设提示词');
    this.ensureBlocks(c);

    const wanted = Array.isArray(dto.blocks) && dto.blocks.length
      ? SHEET_BLOCKS.filter((b) => dto.blocks!.includes(b.key))
      : SHEET_BLOCKS.filter((b) => {
          // 可选块不默认生成，避免为服装/姿势/造型平白花积分；要生成请在弹窗里单独点「重生成」
          if (!REQUIRED_BLOCK_KEYS.includes(b.key)) return false;
          const item = c.blocks!.find((x) => x.key === b.key);
          return !item || item.status !== 'completed' || !item.url;
        });
    if (!wanted.length) {
      return { characterId: c.id, created: 0, kept: c.blocks!.length, message: '4 个必选块均已完成，无需重生成（可选块可在详情弹窗单独生成）' };
    }

    let created = 0;
    for (const b of wanted) {
      const item = c.blocks!.find((x) => x.key === b.key)!;
      item.source = 'generated';
      item.status = 'processing';
      item.url = undefined;
      item.error_msg = undefined;
      const taskId = await this.generateService.createSheetBlockTask(userId, {
        prompt: this.blockPrompt(p, c, b, item),
        images: item.reference_image ? [item.reference_image] : undefined,
        model: p.model,
        image_size: p.image_size,
        ratio: '1:1',
      }, { comicProjectId: p.id, characterId: c.id, block: b.key });
      item.task_id = taskId;
      created++;
    }
    // 块内容变了 → 旧拼版作废，由 status() 重新拼版
    c.sheet_url = undefined;
    p.sheet_status = 'generating';
    await this.saveChars(p, chars);
    return { characterId: c.id, created, kept: c.blocks!.length - created, blocks: c.blocks!.length };
  }

  /** 块级素材来源（方案 §16.2）：用现成图（/static/ 路径）替换某块，0 次生成、0 积分 */
  async setBlockAsset(userId: number, id: number, dto: { characterId: string; block: string; assetUrl: string }) {
    const p = await this.owned(userId, id);
    const chars = this.parseChars(p);
    const c = chars.find((x) => x.id === dto.characterId);
    if (!c) throw new NotFoundException('人物不存在');
    if (c.locked && !OPTIONAL_BLOCK_KEYS.includes(dto.block)) throw new BadRequestException('该设定本已锁定，修改必选块前请先解锁');
    if (!SHEET_BLOCKS.some((b) => b.key === dto.block)) throw new BadRequestException('未知的设定本区块');
    const url = String(dto.assetUrl || '').trim();
    if (!this.localImage(url)) throw new BadRequestException('素材图不可用（需 /static/ 路径且文件已存在）');
    this.ensureBlocks(c);
    const item = c.blocks!.find((x) => x.key === dto.block)!;
    item.source = 'library';
    item.asset_url = url;
    item.url = url;
    item.status = 'completed';
    item.task_id = undefined;
    item.error_msg = undefined;
    c.sheet_url = undefined; // 待重新拼版
    await this.saveChars(p, chars);
    return { characterId: c.id, block: dto.block, url, source: 'library' };
  }

  /** 块级「应用大资产」（11-12 语义调整）：选中的图**直接作为该块成品图**（0 次生成、0 积分），
   *  状态立即为 completed 并可参与拼版/锁定；同时保留为 i2i 参考图，用户点「重生成」时按图重画。
   *  支持直接传 referenceImage(本地 /static/ 路径) 或 assetId(查 GlobalAsset)。 */
  async setBlockReference(userId: number, id: number, dto: { characterId: string; block: string; referenceImage?: string; assetId?: number; clear?: boolean }) {
    const p = await this.owned(userId, id);
    const chars = this.parseChars(p);
    const c = chars.find((x) => x.id === dto.characterId);
    if (!c) throw new NotFoundException('人物不存在');
    if (c.locked && !OPTIONAL_BLOCK_KEYS.includes(dto.block)) throw new BadRequestException('该设定本已锁定，修改必选块前请先解锁');
    if (!SHEET_BLOCKS.some((b) => b.key === dto.block)) throw new BadRequestException('未知的设定本区块');
    this.ensureBlocks(c);
    const item = c.blocks!.find((x) => x.key === dto.block)!;

    // 移除已应用图片：该块恢复「待生成」，旧拼版作废
    if (dto.clear) {
      item.reference_image = undefined;
      item.reference_asset_id = undefined;
      item.source = undefined;
      item.status = 'pending';
      item.url = undefined;
      item.asset_url = undefined;
      item.task_id = undefined;
      item.error_msg = undefined;
      c.sheet_url = undefined;
      await this.saveChars(p, chars);
      return { characterId: c.id, block: dto.block, cleared: true };
    }

    let referenceImage = String(dto.referenceImage || '').trim();
    let assetId = typeof dto.assetId === 'number' ? dto.assetId : undefined;
    if (!referenceImage && assetId) {
      const asset = await this.assetRepo.findOne({ where: { id: assetId, user_id: userId } });
      if (!asset || !asset.image_url) throw new BadRequestException('大资产不存在或没有图片');
      referenceImage = asset.image_url;
    }
    if (!referenceImage) throw new BadRequestException('请提供参考图（referenceImage 或 assetId）');
    if (!this.localImage(referenceImage)) throw new BadRequestException('参考图不可用（需本地 /static/ 路径且文件已存在）');

    // 应用的图即刻成为该块成品图：无需生图、无需花积分，7 块齐了就能拼版锁定。
    // reference_image 仍保留，点「重生成」时 createSheetBlockTask 会带上它走 i2i 按图重画。
    item.reference_image = referenceImage;
    item.reference_asset_id = assetId;
    item.source = 'library';
    item.asset_url = referenceImage;
    item.url = referenceImage;
    item.status = 'completed';
    item.task_id = undefined;
    item.error_msg = undefined;
    c.sheet_url = undefined; // 待重新拼版（由 status() 轮询触发）
    await this.saveChars(p, chars);
    return { characterId: c.id, block: dto.block, url: referenceImage, reference_image: referenceImage, reference_asset_id: assetId, status: 'completed' };
  }

  private localImage(url: string): string | null {
    if (!url) return null;
    const resolved = url.startsWith('/static/') ? resolveSafeStaticPath(url) : null;
    const candidate = resolved || path.resolve(process.cwd(), 'output', path.basename(url));
    return fs.existsSync(candidate) ? candidate : null;
  }

  private ffmpegBin(): string {
    return process.env.FFMPEG_PATH
      || (process.platform === 'win32'
        ? path.resolve(process.cwd(), 'tools', 'ffmpeg', 'ffmpeg.exe')
        : 'ffmpeg');
  }

  /** 设定本图像块拼版：必选 4 块 + 已完成的可选块，动态网格（4 块=2×2、7 块=3×3）。
   *  网格：cols = min(4, ceil(sqrt(n)))，rows = ceil(n/cols)，输出约 1536 宽；
   *  必选块缺任一则不拼版（等补齐），可选块缺位直接跳过、不阻塞流程。
   *  不足整网格的空位用纯色填充，保持拼版稳定。文字不烧进图（归排版层）。 */
  private async assembleSheet(p: ComicProject, c: ComicCharacter): Promise<string | null> {
    const parts = SHEET_BLOCKS.filter((b) => {
      const item = c.blocks?.find((x) => x.key === b.key);
      return REQUIRED_BLOCK_KEYS.includes(b.key) || (OPTIONAL_BLOCK_KEYS.includes(b.key) && !!item?.url);
    });
    const n = parts.length;
    const files = parts.map((b) => {
      const item = c.blocks?.find((x) => x.key === b.key);
      return item?.url ? this.localImage(item.url) : null;
    });
    if (files.some((f) => !f)) return null;
    const cols = Math.min(4, Math.ceil(Math.sqrt(n)));
    const rows = Math.ceil(n / cols);
    const tile = Math.floor(1536 / cols);
    const outDir = path.resolve(process.cwd(), 'output', `comic-${p.id}`);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const out = path.join(outDir, `sheet_${c.id}.png`);

    const inputs: string[] = [];
    const filterParts: string[] = [];
    for (let s = 0; s < rows * cols; s++) {
      if (s < n) {
        inputs.push('-i', files[s] as string);
      } else {
        inputs.push('-f', 'lavfi', '-i', `color=c=0x1a1a1a:s=${tile}x${tile}`);
      }
      filterParts.push(`[${s}:v]scale=${tile}:${tile}:force_original_aspect_ratio=decrease,pad=${tile}:${tile}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${s}]`);
    }
    const layout = Array.from({ length: rows * cols }, (_, s) => {
      const col = s % cols, row = Math.floor(s / cols);
      return `${col * tile}_${row * tile}`;
    }).join('|');
    const vInputs = Array.from({ length: rows * cols }, (_, s) => `[v${s}]`).join('');
    const complex = `${filterParts.join(';')};${vInputs}xstack=inputs=${rows * cols}:layout=${layout}[out]`;
    await execFileAsync(this.ffmpegBin(),
      ['-y', '-v', 'quiet', ...inputs, '-filter_complex', complex, '-map', '[out]', '-frames:v', '1', out],
      { timeout: 90000 });
    return fs.existsSync(out) ? `/static/comic-${p.id}/sheet_${c.id}.png` : null;
  }

  async lockSheet(userId: number, id: number, dto: { characterId: string; locked: boolean }) {
    const p = await this.owned(userId, id);
    const chars = this.parseChars(p);
    const c = chars.find((x) => x.id === dto.characterId);
    if (!c) throw new NotFoundException('人物不存在');
    if (dto.locked && !c.sheet_url) throw new BadRequestException('该人物还没有设定本，无法锁定');
    c.locked = !!dto.locked;
    const allLocked = chars.length > 0 && chars.every((x) => x.locked && x.sheet_url);
    p.sheet_status = allLocked ? 'locked' : 'generating';
    await this.saveChars(p, chars);
    return this.getById(userId, id);
  }

  // ---------- 阶段 3：分格脚本与逐页剧情图 ----------

  async generateScript(userId: number, id: number, dto: { page_count?: number }) {
    const p = await this.owned(userId, id);
    if (p.status === 'generating') throw new BadRequestException('生成中不能重出脚本');
    if (!p.outline?.trim()) throw new BadRequestException('请先生成并确认剧情大纲');
    const chars = this.parseChars(p);
    if (!chars.length) throw new BadRequestException('请先识别并确认人物');
    const pageCount = Math.max(4, Math.min(24, Number(dto.page_count) || p.page_count || 16));
    const tpl = await this.template(TPL.script, DEFAULT_SCRIPT_TEMPLATE);
    const prompt = tpl
      .replace(/\{\{outline\}\}/g, p.outline)
      .replace(/\{\{characters\}\}/g, JSON.stringify(chars.map((c) => ({ id: c.id, name: c.name, role: c.role }))))
      .replace(/\{\{page_count\}\}/g, String(pageCount))
      .replace(/\{\{style\}\}/g, p.style_mode === 'anime' ? '动漫插画' : '真人写实照片');
    const j = await this.llmJson(prompt);
    if (!Array.isArray(j?.panels) || !j.panels.length) throw new BadRequestException('分格脚本为空，请重试');
    const panels: ComicPanel[] = j.panels.slice(0, pageCount).map((s: any, i: number) => {
      const ids = Array.isArray(s.characters) ? s.characters.map(String).filter((x: string) => chars.some((c) => c.id === x)) : [];
      return {
        page_no: i + 1,
        scene_id: String(s.scene_id || `S${i + 1}`),
        continuity: String(s.continuity || (i === 0 ? '故事开场' : '承接上一格')),
        characters: ids.length ? ids : [chars[0].id],
        reuse_group: String(s.reuse_group || '').trim() || `G${i + 1}`,
        action: String(s.action || 'standing naturally, relaxed posture'),
        expression: String(s.expression || 'neutral'),
        camera: String(s.camera || 'medium full-body shot'),
        pose_ref: s.pose_ref ? String(s.pose_ref) : undefined,
        narration: String(s.narration || ''),
        dialogue: String(s.dialogue || ''),
        choice: Array.isArray(s.choice) ? { guide: '你会怎么选？', options: s.choice.map(String) } : (s.choice || null),
        status: 'pending',
      };
    });
    p.page_count = panels.length;
    p.status = 'script_review';
    await this.saveSpec(p, { version: 2, panels });
    return this.getById(userId, id);
  }

  async savePanels(userId: number, id: number, dto: { panels: ComicPanel[] }) {
    const p = await this.owned(userId, id);
    if (p.status === 'generating') throw new BadRequestException('生成中不能改分格');
    if (!Array.isArray(dto.panels) || !dto.panels.length) throw new BadRequestException('分格不能为空');
    const chars = this.parseChars(p);
    const panels = dto.panels.map((s, i) => ({
      ...s, page_no: i + 1,
      characters: Array.isArray(s.characters) && s.characters.length ? s.characters : (chars.length ? [chars[0].id] : []),
      reuse_group: String(s.reuse_group || '').trim() || `G${i + 1}`,
      status: s.status || 'pending',
    }));
    p.page_count = panels.length;
    if (p.status === 'draft') p.status = 'script_review';
    await this.saveSpec(p, { version: 2, panels });
    return this.getById(userId, id);
  }

  private involved(p: ComicProject, panel: ComicPanel, chars: ComicCharacter[]): ComicCharacter[] {
    const ids = Array.isArray(panel.characters) && panel.characters.length ? panel.characters : (chars.length ? [chars[0].id] : []);
    return ids.map((id) => chars.find((c) => c.id === id)).filter((c): c is ComicCharacter => !!c);
  }

  /** V2：每页参考图 = 该页出场人物已锁定的角色设定本 + 可选姿势图/服装图，总 ≤ 9 */
  private buildRefs(p: ComicProject, panel: ComicPanel, chars: ComicCharacter[]): string[] {
    const people = this.involved(p, panel, chars);
    if (!people.length) throw new BadRequestException('请先识别人物');
    for (const c of people) {
      if (!c.locked || !c.sheet_url) throw new BadRequestException(`人物「${c.name}」的角色设定本尚未生成并锁定`);
    }
    const refs = [
      ...people.map((c) => c.sheet_url as string),
      p.costume_ref, panel.pose_ref,
    ].filter((x) => !!x && String(x).trim()) as string[];
    if (refs.length > 9) throw new BadRequestException('参考图超过 9 张上限，请减少出场人物或附加参考图');
    return refs;
  }

  private buildPrompt(p: ComicProject, panel: ComicPanel, chars: ComicCharacter[]): string {
    const people = this.involved(p, panel, chars);
    const identity = people.map((c) => `${c.name}: ${c.appearance || c.prompt || ''}`).join(' | ') || p.character_card;
    const costume = people.map((c) => `${c.name}: ${c.costume || ''} ${c.accessories || ''}`).join(' | ') || p.costume_card;
    return [
      'Using the attached CHARACTER PROFILE reference sheet(s) as the ONLY identity reference, create ONE single finished image of the SAME character(s).',
      `[IDENTITY ONLY] ${identity} Keep the exact same face, hairstyle and hair colour as the character sheet.`,
      `[COSTUME ONLY] ${costume} Do not change or omit any garment.`,
      `[STYLE] ${p.style_block || STYLE_BLOCKS[p.style_mode]}`,
      `[SCENE ANCHOR] ${p.scene_anchor || 'plain pale studio backdrop, soft even light'}. Keep identical across all pages.`,
      `[CONTINUITY] ${panel.continuity || 'continuing from the previous page'}. Do not restate the whole scene.`,
      `[THIS PANEL] Action: ${panel.action || 'standing naturally'}. Expression: ${panel.expression || 'neutral'}. Framing: ${panel.camera || 'medium full-body shot'}.`,
      '[HARD NEGATIVE] ONE single finished image of the depicted character(s). NO Chinese text, NO speech bubbles, NO captions, NO collage, NO triptych, NO split panels, NO multiple scenes, NO extra figures, NO outfit change, NO mannequin lines, NO stone tablets, NO engraved or inscribed text.',
    ].join('\n');
  }

  private groupsOf(spec: PanelSpec): Array<{ key: string; panels: ComicPanel[] }> {
    const map = new Map<string, ComicPanel[]>();
    for (const panel of spec.panels) {
      const key = panel.reuse_group || `G${panel.page_no}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(panel);
    }
    return [...map.entries()].map(([key, panels]) => ({ key, panels }));
  }

  async estimate(userId: number, id: number) {
    const p = await this.owned(userId, id);
    const groups = this.groupsOf(this.parseSpec(p));
    const per = await this.generateService.quoteImageCost(p.image_size);
    return {
      page_count: this.parseSpec(p).panels.length,
      base_count: groups.length,
      per_image_credits: per,
      total_credits: per * groups.length,
      image_size: p.image_size, ratio: p.ratio, model: p.model,
    };
  }

  /** 只读查询用户积分余额（不扣费），供生成前预检用 */
  private async userCredits(userId: number): Promise<number> {
    try {
      const rows: any[] = await this.repo.manager.query('SELECT credits FROM users WHERE id = ?', [userId]);
      return Number(rows?.[0]?.credits ?? 0) || 0;
    } catch { return 0; }
  }

  /** 生成前预检（11-12）：把「审格 · 门控与用量」该检查的东西结构化返回。
   *  startGeneration 会在建任务 / 扣费之前复用同一份结果做硬门控，
   *  避免只靠前端 confirmed（刷新会丢、步骤条能绕过）就直接生图。 */
  async preflight(userId: number, id: number) {
    const p = await this.owned(userId, id);
    const spec = this.parseSpec(p);
    const chars = this.parseChars(p);
    const groups = this.groupsOf(spec);
    const per = await this.generateService.quoteImageCost(p.image_size);
    const totalCredits = per * groups.length;
    const balance = await this.userCredits(userId);
    const checks: Array<{ key: string; label: string; ok: boolean; level: 'error' | 'warn'; detail?: string }> = [];
    const add = (key: string, label: string, ok: boolean, level: 'error' | 'warn', detail?: string) =>
      checks.push({ key, label, ok, level, detail });

    // 前几步的设定确认
    const outlineOk = p.outline_status === 'confirmed' || !!String(p.outline || '').trim();
    add('outline', '剧情大纲已确认', outlineOk, 'error', outlineOk ? undefined : '回到「立项与大纲」生成并确认大纲');
    const charsOk = chars.length > 0 && p.characters_status === 'confirmed';
    add('characters', '人物与人设已确认', charsOk, 'error', charsOk ? undefined : (chars.length ? '回到「人物与人设」点「确认人物，去生成设定本」' : '尚未识别人物'));

    // 设定本：所有出场人物必须锁定、拼版文件真实可读、4 个必选块齐
    const involvedIds = [...new Set(spec.panels.flatMap((x) =>
      (Array.isArray(x.characters) && x.characters.length ? x.characters : (chars.length ? [chars[0].id] : []))))];
    const involved = involvedIds.map((cid) => chars.find((c) => c.id === cid)).filter((c): c is ComicCharacter => !!c);
    const unlocked = involved.filter((c) => !c.locked || !c.sheet_url);
    add('sheet_locked', '所有出场人物的设定本已生成并锁定', involved.length > 0 && unlocked.length === 0, 'error',
      unlocked.length ? `未锁定：${unlocked.map((c) => c.name).join('、')}` : undefined);
    const missingSheet = involved.filter((c) => c.sheet_url && !this.localImage(c.sheet_url));
    add('sheet_files', '设定本拼版文件可读', missingSheet.length === 0, 'error',
      missingSheet.length ? `拼版文件缺失：${missingSheet.map((c) => c.name).join('、')}` : undefined);
    const incompleteRequired = involved.filter((c) => !REQUIRED_BLOCK_KEYS.every((k) => {
      const b = (c.blocks || []).find((x) => x.key === k);
      return !!b?.url;
    }));
    add('sheet_blocks', '设定本 4 个必选块齐全', incompleteRequired.length === 0, 'warn',
      incompleteRequired.length ? `必选块未齐：${incompleteRequired.map((c) => c.name).join('、')}` : undefined);

    // 分格脚本
    const noChars = spec.panels.filter((x) => !Array.isArray(x.characters) || !x.characters.length);
    add('panels', '分格脚本已保存且每格指定出场人物', spec.panels.length > 0 && noChars.length === 0, 'error',
      spec.panels.length ? (noChars.length ? `第 ${noChars.map((x) => x.page_no).join('、')} 格缺出场人物` : undefined) : '尚未保存分格脚本');
    const noFields = spec.panels.filter((x) => !String(x.action || '').trim() || !String(x.reuse_group || '').trim());
    add('panel_fields', '每格动作与复用组完整', noFields.length === 0, 'warn',
      noFields.length ? `第 ${noFields.map((x) => x.page_no).join('、')} 格缺动作或复用组（将使用默认值）` : undefined);

    // 附加参考图：本地文件必须真实存在，外链只做格式判断（下载交给 normalizeI2I）
    const refUrlOk = (u?: string) => {
      const raw = String(u || '').trim();
      if (!raw) return true;
      if (/^https?:\/\//i.test(raw)) return true;
      return !!this.localImage(raw);
    };
    const badRefs = [
      ...spec.panels.filter((x) => !refUrlOk(x.pose_ref)).map((x) => `第${x.page_no}格姿势图`),
      ...(!refUrlOk(p.costume_ref) ? ['项目服装参考图'] : []),
    ];
    add('refs', '附加参考图可读', badRefs.length === 0, 'error', badRefs.length ? `文件不存在：${badRefs.join('、')}` : undefined);

    // 配置与余额
    const modelOk = (AGNES_IMAGE_MODELS as readonly string[]).includes(p.model) && ['1K', '2K', '3K', '4K'].includes(String(p.image_size || '').toUpperCase());
    add('model', '生图模型与尺寸配置有效', modelOk, 'warn', `模型 ${p.model} / 尺寸 ${p.image_size}`);
    add('balance', '积分余额足够本次生成', balance >= totalCredits, 'error',
      `余额 ${balance} / 需 ${totalCredits}${balance < totalCredits ? `，还差 ${totalCredits - balance}` : ''}`);

    const canGenerate = !checks.some((c) => c.level === 'error' && !c.ok);
    return {
      canGenerate, checks,
      estimate: {
        page_count: spec.panels.length, base_count: groups.length,
        per_image_credits: per, total_credits: totalCredits,
        image_size: p.image_size, ratio: p.ratio, model: p.model,
      },
      balance, deficit: Math.max(0, totalCredits - balance), project_status: p.status,
    };
  }

  async startGeneration(userId: number, id: number) {
    const p = await this.owned(userId, id);
    // 仅在「确有进行中任务」时拒绝重入，避免真实生成中重复扣费；
    // 若是卡死的 generating（无进行中任务，例如 0 面板 / 任务已全部 terminal 但状态未翻回），允许恢复重入。
    if (p.status === 'generating') {
      const inflight = this.parseSpec(p).panels.some((x) => x.status === 'processing' && x.task_id);
      if (inflight) throw new BadRequestException('已在生成中');
    }
    // 11-12 硬门控：预检必须在创建任何生图任务（会扣积分）之前通过
    const pf = await this.preflight(userId, id);
    if (!pf.canGenerate) {
      const first = pf.checks.find((c) => c.level === 'error' && !c.ok);
      throw new BadRequestException(`生成前预检未通过：${first?.label}${first?.detail ? `（${first.detail}）` : ''}，请先到「审格 · 门控与用量」处理`);
    }
    const spec = this.parseSpec(p);
    if (!spec.panels.length) throw new BadRequestException('请先生成并确认分格脚本');
    const chars = this.parseChars(p);
    const groups = this.groupsOf(spec);
    // 门控：先校验所有出场人物的设定本已锁定，避免扣了积分才失败
    for (const g of groups) this.buildRefs(p, g.panels[0], chars);
    const created: number[] = [];
    let failed = '';
    for (const g of groups) {
      const panel = g.panels[0];
      try {
        const taskId = await this.generateService.createComicPanelTask(userId, {
          images: this.buildRefs(p, panel, chars),
          prompt: this.buildPrompt(p, panel, chars),
          model: p.model, image_size: p.image_size, ratio: p.ratio,
        }, { comicProjectId: p.id, group: g.key, pageNo: panel.page_no });
        for (const item of g.panels) {
          item.task_id = taskId; item.output_url = undefined;
          item.status = 'processing'; item.error_msg = undefined;
        }
        created.push(taskId);
      } catch (e: any) {
        failed = e.message;
        for (const item of g.panels) { item.status = 'failed'; item.error_msg = e.message; }
        break;
      }
    }
    p.status = 'generating';
    const per = await this.generateService.quoteImageCost(p.image_size);
    p.total_credits = (p.total_credits || 0) + per * created.length;
    await this.saveSpec(p, spec);
    return { started: created.length, total_groups: groups.length, failed: failed || undefined };
  }

  /** 轮询：回填剧情页任务 + 设定本块任务，块齐了自动拼版 */
  async status(userId: number, id: number) {
    const p = await this.owned(userId, id);
    const spec = this.parseSpec(p);
    const chars = this.parseChars(p);
    const panelIds = spec.panels.map((x) => x.task_id).filter((x): x is number => !!x);
    const blockIds = chars.flatMap((c) => (c.blocks || []).map((b) => b.task_id)).filter((x): x is number => !!x);
    const ids = [...new Set([...panelIds, ...blockIds])];
    // 不能因为「没有任何生成任务」就提前 return：纯应用大资产图片的块没有 task_id，
    // 但 7 块都齐时仍需走下面的 assembleSheet 拼版，否则 sheet_url 永远为空、无法锁定。
    const tasks = ids.length ? await this.taskRepo.find({ where: { id: In(ids) } }) : [];
    const byId = new Map(tasks.map((t) => [t.id, t]));
    let dirtySpec = false, dirtyChars = false, dirtyProject = false;
    const per = await this.generateService.quoteImageCost(p.image_size);

    for (const panel of spec.panels) {
      if (!panel.task_id) continue;
      const t = byId.get(panel.task_id);
      if (!t) continue;
      const st = t.status === 'completed' ? 'completed' : t.status === 'failed' ? 'failed' : 'processing';
      const wasFailed = panel.status === 'failed';
      if (panel.status !== st) { panel.status = st; dirtySpec = true; }
      if (st === 'completed' && !panel.output_url && t.output_data) {
        try {
          const arr = JSON.parse(t.output_data);
          if (Array.isArray(arr) && arr[0]?.url) { panel.output_url = arr[0].url; dirtySpec = true; }
        } catch { /* 等下次 */ }
      }
      if (st === 'failed' && t.error_msg) { panel.error_msg = t.error_msg; dirtySpec = true; }
      // P1-2：失败任务已退款，total_credits 按成功数回退，避免展示口径含失败扣费
      if (st === 'failed' && !wasFailed) {
        const cost = (t.credit_cost && t.credit_cost > 0) ? t.credit_cost : per;
        p.total_credits = Math.max(0, (p.total_credits || 0) - cost);
        dirtyProject = true;
      }
    }

    for (const c of chars) {
      if (!c.blocks?.length) continue;
      for (const b of c.blocks) {
        if (!b.task_id) continue;
        const t = byId.get(b.task_id);
        if (!t) continue;
        const st = t.status === 'completed' ? 'completed' : t.status === 'failed' ? 'failed' : 'processing';
        if (b.status !== st) { b.status = st; dirtyChars = true; }
        if (st === 'completed' && !b.url && t.output_data) {
          try {
            const arr = JSON.parse(t.output_data);
            if (Array.isArray(arr) && arr[0]?.url) { b.url = arr[0].url; dirtyChars = true; }
          } catch { /* 等下次 */ }
        }
        // P1-1：设定本块失败也要回填 error_msg（剧情页已有，块此前漏了）
        if (st === 'failed' && t.error_msg) { b.error_msg = t.error_msg; dirtyChars = true; }
      }
      // 拼版防风暴（2026-11-09 风险审查 P0-1）：in-flight 去重 + 失败 90s 退避。
      // 没有这层时，前端 3s 轮询 × 90s ffmpeg 超时会堆出 ~30 个并发 ffmpeg，1.6GB 生产机必 OOM。
      const lockKey = `${p.id}:${c.id}`;
      // 11-12：只需 4 个必选块有成品图即可拼版 / 锁定；可选块缺位不阻塞进入下一步
      const requiredReady = REQUIRED_BLOCK_KEYS.every((k) => {
        const b = (c.blocks || []).find((x) => x.key === k);
        return !!b?.url;
      });
      if (!c.sheet_url && requiredReady
          && !this.sheetJobs.has(lockKey)
          && Date.now() - (this.sheetFailAt.get(lockKey) || 0) > 90_000) {
        const job = this.assembleSheet(p, c)
          .then((url) => {
            if (url) { c.sheet_url = url; dirtyChars = true; }
            this.sheetFailAt.delete(lockKey);
          })
          .catch((e: any) => {
            this.logger.warn(`设定本拼版失败 ${c.id}（90s 内不再自动重试）: ${e.message}`);
            this.sheetFailAt.set(lockKey, Date.now());
          })
          .finally(() => this.sheetJobs.delete(lockKey));
        this.sheetJobs.set(lockKey, job);
        await job;
      }
    }

    if (dirtySpec) await this.saveSpec(p, spec);
    if (dirtyChars) await this.saveChars(p, chars);
    if (dirtyProject) await this.repo.save(p);
    const all = spec.panels.filter((x) => x.task_id);
    const done = all.filter((x) => x.status === 'completed').length;
    const failed = all.filter((x) => x.status === 'failed').length;
    if (p.status === 'generating' && all.length && done + failed === all.length) {
      p.status = 'completed';
      await this.repo.save(p);
    }
    return {
      project: p, panels: spec.panels, characters: chars,
      progress: { total: all.length, completed: done, failed, processing: all.length - done - failed },
    };
  }

  async regeneratePanel(userId: number, id: number, pageNo: number, patch: any) {
    const p = await this.owned(userId, id);
    const spec = this.parseSpec(p);
    const chars = this.parseChars(p);
    const panel = spec.panels.find((x) => x.page_no === pageNo);
    if (!panel) throw new NotFoundException('分格不存在');
    for (const k of ['action', 'expression', 'camera', 'pose_ref', 'narration', 'dialogue']) {
      if (patch?.[k] !== undefined) (panel as any)[k] = patch[k];
    }
    panel.reuse_group = `G${pageNo}_r${Date.now()}`;
    panel.output_url = undefined; panel.status = 'processing'; panel.error_msg = undefined;
    const taskId = await this.generateService.createComicPanelTask(userId, {
      images: this.buildRefs(p, panel, chars),
      prompt: this.buildPrompt(p, panel, chars),
      model: p.model, image_size: p.image_size, ratio: p.ratio,
    }, { comicProjectId: p.id, group: panel.reuse_group, pageNo });
    panel.task_id = taskId;
    p.status = 'generating';
    p.total_credits = (p.total_credits || 0) + await this.generateService.quoteImageCost(p.image_size);
    await this.saveSpec(p, spec);
    return { taskId, pageNo };
  }

  // ---------- 导出漫画包 ----------

  async exportPackage(userId: number, id: number) {
    const p = await this.owned(userId, id);
    const spec = this.parseSpec(p);
    if (!spec.panels.length) throw new BadRequestException('没有可导出的分格');
    const outDir = path.resolve(process.cwd(), 'output', `comic-${p.id}`);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const zipName = `comic-${p.id}.zip`;
    const zipPath = path.join(outDir, zipName);

    const panelSpec = {
      version: 2,
      project: { id: p.id, title: p.title, style_mode: p.style_mode, ratio: p.ratio,
        w: 1024, h: 1536, page_count: spec.panels.length },
      characters: this.parseChars(p).map((c) => ({ id: c.id, name: c.name, sheet: c.sheet_url || null })),
      panels: spec.panels.map((x) => ({
        page_no: x.page_no,
        base_image: `格${String(x.page_no).padStart(2, '0')}.png`,
        reuse_group: x.reuse_group, scene_id: x.scene_id || '', continuity: x.continuity || '',
        characters: x.characters || [],
        w: 1024, h: 1536, view: { fit: 'cover', zoom: 1, offX: 0, offY: 0 },
        nar: x.nar || { on: !!x.narration, text: x.narration || '', pos: 'top', theme: 'light' },
        bubs: x.bubs || (x.dialogue ? [{ text: x.dialogue, shape: 'ellipse', x: 0.55, y: 0.12 }] : []),
        ch: x.ch || (x.choice ? { guide: x.choice.guide || '你会怎么选？', options: x.choice.options || [], highlight: x.choice.highlight ?? 0 } : null),
      })),
    };
    const manifest = {
      generator: 'AI-Anime / 漫画工作室 V2',
      project_id: p.id, title: p.title, style_mode: p.style_mode,
      model: p.model, image_size: p.image_size, ratio: p.ratio,
      page_count: spec.panels.length,
      base_image_count: this.groupsOf(spec).length,
      character_count: this.parseChars(p).length,
      total_credits: p.total_credits,
      exported_at: new Date().toISOString(),
      note: '底图由 AI-Anime 生成，身份基准是锁定的角色设定本；旁白/气泡/A·B·C 分支卡由 D:\\剪辑应用 /comic 排版层添加。底图不含中文文字。',
    };

    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = newZipArchive({ zlib: { level: 6 } });
      output.on('close', () => resolve());
      output.on('error', reject);
      archive.on('error', reject);
      archive.pipe(output);
      let included = 0;
      for (const panel of spec.panels) {
        const file = panel.output_url ? this.localImage(panel.output_url) : null;
        if (file) { archive.file(file, { name: `格${String(panel.page_no).padStart(2, '0')}.png` }); included++; }
      }
      for (const c of this.parseChars(p)) {
        const f = c.sheet_url ? this.localImage(c.sheet_url) : null;
        if (f) archive.file(f, { name: `设定本_${c.id}.png` });
      }
      archive.append(JSON.stringify(panelSpec, null, 2), { name: 'panel-spec.json' });
      archive.append(JSON.stringify({ ...manifest, included_images: included }, null, 2), { name: 'manifest.json' });
      archive.finalize().catch((e: any) => reject(e));
    });

    p.export_url = `/static/comic-${p.id}/${zipName}`;
    await this.repo.save(p);
    return {
      url: p.export_url,
      included_images: spec.panels.filter((x) => x.output_url && this.localImage(x.output_url)).length,
      page_count: spec.panels.length, bytes: fs.statSync(zipPath).size,
    };
  }
}
