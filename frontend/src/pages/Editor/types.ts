export interface TimelineVideoItem {
  id: string;
  url: string;
  start: number;
  duration: number;
  trimIn: number;
  filter: string;
  nextTransition: { type: string; duration: number } | null;
}

export interface TimelineAudioItem {
  id: string;
  url: string;
  start: number;
  duration: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export interface TimelineTextItem {
  id: string;
  text: string;
  start: number;
  duration: number;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  opacity: number;
  animation: string;
}

export interface TimelineDoc {
  duration: number;
  video: TimelineVideoItem[];
  audio: TimelineAudioItem[];
  text: TimelineTextItem[];
}

export type TrackKey = 'video' | 'audio' | 'text';

export interface Selection {
  track: TrackKey;
  id: string;
}

export const MAX_SECONDS = 60;
export const MAX_ITEMS = 20;

export const TRANSITION_TYPES = [
  { value: 'fade', label: '淡入淡出' },
  { value: 'fade_black', label: '黑场' },
  { value: 'fade_white', label: '白场' },
  { value: 'dissolve', label: '溶解' },
  { value: 'wipe_left', label: '左擦' },
  { value: 'wipe_right', label: '右擦' },
  { value: 'slide_left', label: '左滑' },
  { value: 'slide_right', label: '右滑' },
  { value: 'circle', label: '圆形' },
];

export const FILTER_TYPES = [
  { value: 'none', label: '无滤镜' },
  { value: 'grayscale', label: '黑白' },
  { value: 'sepia', label: '复古棕褐' },
  { value: 'warm', label: '暖调' },
  { value: 'cool', label: '冷调' },
  { value: 'vintage', label: '怀旧' },
  { value: 'bright', label: '提亮' },
  { value: 'dark', label: '压暗' },
  { value: 'contrast', label: '增强对比' },
  { value: 'soft', label: '柔化' },
  { value: 'vivid', label: '鲜艳' },
];

export const ANIMATION_TYPES = [
  { value: 'none', label: '无动画' },
  { value: 'fade', label: '淡入' },
  { value: 'slide_up', label: '上滑' },
  { value: 'zoom_in', label: '放大' },
];

export const RATIOS = ['9:16', '16:9', '1:1', '3:4', '4:3', '2:3'];
export const RESOLUTIONS = ['480p', '720p', '1080p'];

let uid = 0;
export const genId = (prefix: string) => `${prefix}_${Date.now()}_${uid++}`;

export const toStaticUrl = (u?: string | null): string | undefined => {
  if (!u) return undefined;
  if (/^\/static\//.test(u) || /^https?:/.test(u) || /^data:/.test(u)) return u;
  const m = u.replace(/\\/g, '/').match(/([^/]+\.(mp4|webm|mov|mp3|wav|m4a|jpg|jpeg|png|webp|gif))$/i);
  return m ? `/static/${m[1]}` : u;
};

export const isAudioUrl = (u: string) => /\.(mp3|wav|m4a|flac|aac|ogg)(\?|$)/i.test(u);
export const isVideoUrl = (u: string) => /\.(mp4|webm|mov|mkv|avi|m4v)(\?|$)/i.test(u);
export const isImageUrl = (u: string) => /\.(jpe?g|png|webp|gif|bmp|svg)(\?|$)/i.test(u);

export const emptyTimeline = (): TimelineDoc => ({ duration: 0, video: [], audio: [], text: [] });

export const timelineDuration = (t: TimelineDoc): number => {
  let d = 0;
  for (const v of t.video) d = Math.max(d, (v.start || 0) + (v.duration || 0));
  for (const a of t.audio) d = Math.max(d, (a.start || 0) + (a.duration || 0));
  for (const tx of t.text) d = Math.max(d, (tx.start || 0) + (tx.duration || 0));
  return d;
};