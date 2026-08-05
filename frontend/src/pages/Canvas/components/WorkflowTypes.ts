export type WFNodeType = 'video' | 'image' | 'text' | 'audio' | 'effect' | 'output';

export interface WFNode {
  id: string;
  type: WFNodeType;
  position: { x: number; y: number };
  source?: { kind?: string; ref_id?: number; url?: string } | null;
  duration: number;
  params: Record<string, any>;
}

export interface WFEdge {
  id: string;
  from: string;
  to: string;
}

export interface Workflow {
  nodes: WFNode[];
  edges: WFEdge[];
}

export const NODE_WIDTH = 208;
export const NODE_HEADER_H = 36;
export const NODE_BODY_H = 88;

export const NODE_META: Record<WFNodeType, { label: string; color: string; desc: string }> = {
  video: { label: '视频', color: '#1677ff', desc: '视频素材' },
  image: { label: '图片', color: '#22c55e', desc: '图片素材' },
  text: { label: '文字', color: '#8b5cf6', desc: '文字叠加层' },
  audio: { label: '音频', color: '#f59e0b', desc: '音频轨道' },
  effect: { label: '效果', color: '#06b6d4', desc: '转场 / 滤镜' },
  output: { label: '输出', color: '#ef4444', desc: '成片输出' },
};

export const TRANSITION_OPTIONS = [
  { value: 'fade', label: '淡入溶解' },
  { value: 'fade_black', label: '黑场过渡' },
  { value: 'fade_white', label: '白场过渡' },
  { value: 'wipe_left', label: '擦除(左)' },
  { value: 'wipe_right', label: '擦除(右)' },
  { value: 'slide_left', label: '滑动(左)' },
  { value: 'slide_right', label: '滑动(右)' },
  { value: 'circle', label: '圆形扩展' },
];

export const FILTER_OPTIONS = [
  { value: 'grayscale', label: '黑白' },
  { value: 'sepia', label: '复古棕褐' },
  { value: 'warm', label: '暖色' },
  { value: 'cool', label: '冷色' },
  { value: 'vintage', label: '胶片怀旧' },
  { value: 'bright', label: '提亮' },
  { value: 'dark', label: '压暗' },
  { value: 'contrast', label: '高对比' },
  { value: 'soft', label: '柔化' },
  { value: 'vivid', label: '鲜艳' },
];

export const ANIMATION_OPTIONS = [
  { value: 'none', label: '无动画' },
  { value: 'fade', label: '淡入淡出' },
  { value: 'slide_up', label: '上滑' },
  { value: 'zoom_in', label: '放大' },
];
