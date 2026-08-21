import { Typography, Input, InputNumber, Select, Slider, Button, Divider, Empty, Checkbox } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { TimelineDoc, Selection } from '../types';
import { TRANSITION_TYPES, FILTER_TYPES, ANIMATION_TYPES, MAX_SECONDS } from '../types';

const { Text } = Typography;

interface Props {
  selected: Selection | null;
  timeline: TimelineDoc;
  onTimelineChange: (t: TimelineDoc) => void;
}

export default function PropsPanel({ selected, timeline, onTimelineChange }: Props) {
  if (!selected) {
    return (
      <div style={{ padding: 16 }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="在时间线上点击片段以编辑属性" />
        <Text type="secondary" style={{ fontSize: 12, display: 'block', textAlign: 'center', marginTop: 8, lineHeight: 1.7 }}>
          支持：片段时长 / 裁剪头 / 滤镜 / 转场 / 音量 / 淡入淡出 / 文字内容 / 位置 / 动画
        </Text>
      </div>
    );
  }

  const items = (timeline as any)[selected.track] as any[];
  const item = items.find((x) => x.id === selected.id);
  if (!item) return null;

  const patch = (fn: (it: any) => any) => {
    onTimelineChange({
      ...timeline,
      [selected.track]: items.map((x) => (x.id === selected.id ? fn(x) : x)),
    });
  };

  const remove = () => {
    onTimelineChange({
      ...timeline,
      [selected.track]: items.filter((x) => x.id !== selected.id),
    });
  };

  const label = (s: string) => <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>{s}</Text>;

  const title = selected.track === 'video' ? '视频片段' : selected.track === 'audio' ? '音频片段' : '文字片段';

  return (
    <div style={{ padding: 14, overflowY: 'auto', height: '100%' }}>
      <Text strong style={{ fontSize: 14, color: '#7c3aed', display: 'block', marginBottom: 12 }}>{title}</Text>

      {selected.track === 'video' && (
        <>
          <div style={{ marginBottom: 12 }}>
            {label('时长（秒）')}
            <InputNumber
              min={0.5} max={MAX_SECONDS} step={0.5} value={Number(item.duration)}
              onChange={(v) => patch((it) => ({ ...it, duration: Math.max(0.5, Math.min(MAX_SECONDS, Number(v) || 0.5)) }))}
              style={{ width: '100%' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            {label('裁剪片头（秒）')}
            <InputNumber
              min={0} max={Math.max(0, Number(item.duration) - 0.5)} step={0.5} value={Number(item.trimIn) || 0}
              onChange={(v) => patch((it) => ({ ...it, trimIn: Math.max(0, Number(v) || 0) }))}
              style={{ width: '100%' }} />
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              从原视频开头跳过 N 秒再开始（分割片段时自动设置）
            </Text>
          </div>
          <div style={{ marginBottom: 12 }}>
            {label('滤镜')}
            <Select value={item.filter || 'none'} onChange={(v) => patch((it) => ({ ...it, filter: v }))}
              options={FILTER_TYPES} style={{ width: '100%' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            {label('与下一段的转场')}
            <Select
              value={item.nextTransition?.type || 'none'}
              onChange={(v) => patch((it) => ({ ...it, nextTransition: v === 'none' ? null : { type: v, duration: it.nextTransition?.duration || 0.5 } }))}
              options={[{ value: 'none', label: '无转场（直接切换）' }, ...TRANSITION_TYPES]} style={{ width: '100%' }} />
          </div>
          {item.nextTransition && item.nextTransition.type !== 'none' && (
            <div style={{ marginBottom: 12 }}>
              {label('转场时长（秒）')}
              <Slider min={0.2} max={1.5} step={0.1} value={Number(item.nextTransition.duration) || 0.5}
                onChange={(v) => patch((it) => ({ ...it, nextTransition: { ...it.nextTransition, duration: Number(v) } }))} />
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <Checkbox
              checked={!!item.muted}
              onChange={(e) => patch((it) => ({ ...it, muted: e.target.checked }))}
              style={{ fontSize: 13 }}>
              静音（隐藏片段自带音频）
            </Checkbox>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              勾选后预览与成片中该片段不再发出自带声音，适合背景音效素材
            </Text>
          </div>
        </>
      )}

      {selected.track === 'audio' && (
        <>
          <div style={{ marginBottom: 12 }}>
            {label('音量')}
            <Slider min={0} max={1} step={0.05} value={Number(item.volume) ?? 0.8}
              onChange={(v) => patch((it) => ({ ...it, volume: Number(v) }))} />
          </div>
          <div style={{ marginBottom: 12 }}>
            {label('源文件时长')}
            <Text type="secondary" style={{ fontSize: 13, display: 'block' }}>
              {Number(item.sourceDuration) > 0 ? `${Number(item.sourceDuration).toFixed(1)} 秒` : '未检测到（加载后自动识别）'}
            </Text>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
              可从源文件中选取一段播放：设置「开始位置」后，时间线上该片段播放的是从源文件该秒数起的区间
            </Text>
          </div>
          <div style={{ marginBottom: 12 }}>
            {label('开始位置（秒，相对源文件）')}
            <InputNumber
              min={0} step={0.5}
              max={Number(item.sourceDuration) > 0 ? Math.max(0, Number(item.sourceDuration) - 0.5) : undefined}
              value={Number(item.trimIn) || 0}
              onChange={(v) => patch((it) => {
                const trim = Math.max(0, Number(v) || 0);
                const src = Number(it.sourceDuration);
                const maxDur = (src > 0 ? Math.max(0.5, src - trim) : Number(it.duration));
                const dur = Math.min(Number(it.duration) || 0.5, maxDur);
                return { ...it, trimIn: trim, duration: Math.max(0.5, dur) };
              })}
              style={{ width: '100%' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            {label('时长（秒，从开始位置起）')}
            <InputNumber
              min={0.5}
              max={Number(item.sourceDuration) > 0 ? Math.max(0.5, Number(item.sourceDuration) - (Number(item.trimIn) || 0)) : MAX_SECONDS + 10}
              step={0.5} value={Number(item.duration)}
              onChange={(v) => patch((it) => ({ ...it, duration: Math.max(0.5, Math.min(Number(v) || 0.5, Number(it.sourceDuration) > 0 ? Math.max(0.5, Number(it.sourceDuration) - (Number(it.trimIn) || 0)) : MAX_SECONDS + 10)) }))}
              style={{ width: '100%' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            {label('淡入（秒）')}
            <InputNumber min={0} max={10} step={0.5} value={Number(item.fadeIn) || 0}
              onChange={(v) => patch((it) => ({ ...it, fadeIn: Math.max(0, Number(v) || 0) }))}
              style={{ width: '100%' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            {label('淡出（秒）')}
            <InputNumber min={0} max={10} step={0.5} value={Number(item.fadeOut) || 0}
              onChange={(v) => patch((it) => ({ ...it, fadeOut: Math.max(0, Number(v) || 0) }))}
              style={{ width: '100%' }} />
          </div>
        </>
      )}

      {selected.track === 'text' && (
        <>
          <div style={{ marginBottom: 12 }}>
            {label('文字内容')}
            <Input.TextArea
              rows={2} value={String(item.text)} maxLength={50}
              onChange={(e) => patch((it) => ({ ...it, text: e.target.value }))}
              placeholder="输入字幕内容" style={{ borderRadius: 8, fontSize: 13 }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            {label('开始时间（秒）')}
            <InputNumber min={0} max={MAX_SECONDS} step={0.5} value={Number(item.start)}
              onChange={(v) => patch((it) => ({ ...it, start: Math.max(0, Number(v) || 0) }))}
              style={{ width: '100%' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            {label('时长（秒）')}
            <InputNumber min={0.5} max={MAX_SECONDS} step={0.5} value={Number(item.duration)}
              onChange={(v) => patch((it) => ({ ...it, duration: Math.max(0.5, Math.min(MAX_SECONDS, Number(v) || 0.5)) }))}
              style={{ width: '100%' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            {label('字号')}
            <InputNumber min={12} max={160} step={4} value={Number(item.fontSize) || 48}
              onChange={(v) => patch((it) => ({ ...it, fontSize: Number(v) || 48 }))}
              style={{ width: '100%' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            {label('颜色')}
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(item.color) ? item.color : '#ffffff'}
              onChange={(e) => patch((it) => ({ ...it, color: e.target.value }))}
              style={{ width: '100%', height: 34, borderRadius: 8, border: '1px solid #e5e7eb', padding: 3, cursor: 'pointer' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            {label('横向位置')}
            <Slider min={0} max={1} step={0.01} value={Number(item.x) ?? 0.5}
              onChange={(v) => patch((it) => ({ ...it, x: Number(v) }))} />
          </div>
          <div style={{ marginBottom: 12 }}>
            {label('纵向位置')}
            <Slider min={0} max={1} step={0.01} value={Number(item.y) ?? 0.5}
              onChange={(v) => patch((it) => ({ ...it, y: Number(v) }))} />
          </div>
          <div style={{ marginBottom: 12 }}>
            {label('透明度')}
            <Slider min={0.1} max={1} step={0.05} value={Number(item.opacity) ?? 1}
              onChange={(v) => patch((it) => ({ ...it, opacity: Number(v) }))} />
          </div>
          <div style={{ marginBottom: 12 }}>
            {label('动画')}
            <Select value={item.animation || 'fade'} onChange={(v) => patch((it) => ({ ...it, animation: v }))}
              options={ANIMATION_TYPES} style={{ width: '100%' }} />
          </div>
        </>
      )}

      <Divider style={{ margin: '14px 0' }} />
      <Button danger block icon={<DeleteOutlined />} onClick={remove}>删除该片段</Button>
      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 10, lineHeight: 1.6 }}>
        提示：删除后自动保存；按 Ctrl+S 可手动保存。
      </Text>
    </div>
  );
}