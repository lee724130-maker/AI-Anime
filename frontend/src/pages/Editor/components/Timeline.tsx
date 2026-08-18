import { useEffect, useRef, useState } from 'react';
import { Typography, Slider } from 'antd';
import {
  VideoCameraOutlined, AudioOutlined, FontSizeOutlined, PlayCircleOutlined, PauseCircleOutlined,
} from '@ant-design/icons';
import type { TimelineDoc, TrackKey, Selection } from '../types';
import { MAX_SECONDS } from '../types';

const { Text } = Typography;

const TRACK_META: { key: TrackKey; label: string; color: string; icon: any }[] = [
  { key: 'video', label: '视频轨', color: '#7c3aed', icon: <VideoCameraOutlined /> },
  { key: 'audio', label: '音频轨', color: '#0ea5e9', icon: <AudioOutlined /> },
  { key: 'text', label: '文字轨', color: '#10b981', icon: <FontSizeOutlined /> },
];

const TRACK_HEIGHT = 52;
const HEADER_W = 72;

interface DragState {
  mode: 'move' | 'resize' | 'seek';
  track: TrackKey;
  id: string | null;
  startX: number;
  origStart: number;
  origDur: number;
}

interface Props {
  timeline: TimelineDoc;
  currentTime: number;
  selected: Selection | null;
  pxPerSec: number;
  playing: boolean;
  onTogglePlay: (t: number) => void;
  onPxPerSec: (v: number) => void;
  onTimelineChange: (t: TimelineDoc) => void;
  onSelect: (sel: Selection | null) => void;
  onSeek: (t: number) => void;
  onSplit: () => void;
  onDeleteSelected: () => void;
}

const PAN_STEP = 240;

function fmtTime(t: number): string {
  const s = Math.max(0, t);
  const mm = Math.floor(s / 60);
  const ss = (s % 60).toFixed(1);
  return `${String(mm).padStart(2, '0')}:${ss.padStart(4, '0')}`;
}

const labelOf = (url: string): string => {
  const clean = url.split('?')[0];
  const m = clean.match(/[^/\\]+$/);
  return m ? m[0] : url;
};

export default function Timeline({
  timeline, currentTime, selected, pxPerSec, playing, onTogglePlay, onPxPerSec,
  onTimelineChange, onSelect, onSeek, onSplit, onDeleteSelected,
}: Props) {
  const totalDur = Math.max(timeline.duration, currentTime, 5);
  const [drag, setDrag] = useState<DragState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const panRef = useRef<{ x0: number; sl0: number; moved: boolean } | null>(null);

  // Follow the playhead horizontally while playing (keep the playhead visible)
  useEffect(() => {
    if (!playing) return;
    const sc = scrollerRef.current;
    if (!sc) return;
    const x = currentTime * pxPerSec + HEADER_W;
    if (x < sc.scrollLeft + 40 || x > sc.scrollLeft + sc.clientWidth - 40) {
      sc.scrollTo({ left: Math.max(0, x - sc.clientWidth / 2), behavior: 'smooth' });
    }
  }, [currentTime, playing, pxPerSec]);

  // Global pointer listeners (always registered; handlers no-op unless a
  // drag/pan is active, since pan is tracked via ref and must work without a
  // state update to re-subscribe)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      // blank-lane pan (drag anywhere on a lane background scrolls horizontally)
      if (panRef.current) {
        const p = panRef.current;
        if (Math.abs(e.clientX - p.x0) > 5) p.moved = true;
        if (p.moved && scrollerRef.current) {
          scrollerRef.current.scrollLeft = p.sl0 - (e.clientX - p.x0);
        }
        return;
      }
      const d = dragRef.current;
      if (!d || !containerRef.current || !scrollerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dxSec = (e.clientX - d.startX) / pxPerSec;
      if (d.mode === 'move' && d.track && d.id) {
        onTimelineChange(updateItem(d.track, d.id, (it: any) => ({
          ...it,
          start: round1(Math.max(0, Math.min(MAX_SECONDS - it.duration, d.origStart + dxSec))),
        })));
      } else if (d.mode === 'resize' && d.track && d.id) {
        onTimelineChange(updateItem(d.track, d.id, (it: any) => {
          const nd = round1(Math.max(0.5, Math.min(MAX_SECONDS, d.origDur + dxSec)));
          const ns = round1(Math.min(d.origStart, MAX_SECONDS - nd));
          return { ...it, duration: nd, start: ns };
        }));
      } else if (d.mode === 'seek') {
        onSeek(round1(Math.max(0, Math.min(totalDur, (e.clientX - rect.left + scrollerRef.current.scrollLeft) / pxPerSec))));
      }
    };
    const onUp = () => {
      if (panRef.current) {
        const wasClick = !panRef.current.moved;
        panRef.current = null;
        if (wasClick) onSelect(null);
      }
      setDrag(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [pxPerSec, totalDur, onTimelineChange, onSeek, onSelect]);

  const updateItem = (track: TrackKey, id: string, fn: (it: any) => any): TimelineDoc => {
    const items = (timeline as any)[track] as any[];
    return {
      ...timeline,
      [track]: items.map((it) => (it.id === id ? fn(it) : it)),
    } as TimelineDoc;
  };

  const startDrag = (mode: DragState['mode'], track: TrackKey, id: string | null, e: React.MouseEvent, item?: any) => {
    e.stopPropagation();
    if (mode === 'seek') {
      const rect = containerRef.current!.getBoundingClientRect();
      const sl = scrollerRef.current ? scrollerRef.current.scrollLeft : 0;
      onSeek(round1(Math.max(0, (e.clientX - rect.left + sl) / pxPerSec)));
    }
    setDrag({
      mode, track, id,
      startX: e.clientX,
      origStart: item ? item.start : 0,
      origDur: item ? item.duration : 0,
    });
  };

  const round1 = (n: number) => Math.round(n * 10) / 10;

  const renderItem = (track: TrackKey, item: any, idx: number) => {
    const isSel = selected?.track === track && selected?.id === item.id;
    const left = item.start * pxPerSec;
    const w = Math.max(item.duration * pxPerSec, 30);
    let body: React.ReactNode;
    if (track === 'video') {
      body = (
        <>
          <Text style={{ fontSize: 11, color: '#fff', fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            分段 {idx + 1}
          </Text>
          <Text style={{ fontSize: 10, color: 'rgba(255,255,255,.75)', display: 'block' }}>
            {item.duration.toFixed(1)}s{Number(item.trimIn) > 0 ? ` · 头裁${Number(item.trimIn).toFixed(1)}s` : ''}
            {item.filter && item.filter !== 'none' ? ` · ${item.filter}` : ''}
          </Text>
        </>
      );
    } else if (track === 'audio') {
      body = (
        <>
          <Text style={{ fontSize: 11, color: '#fff', fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            ♪ {labelOf(item.url)}
          </Text>
          <Text style={{ fontSize: 10, color: 'rgba(255,255,255,.75)', display: 'block' }}>
            {item.duration.toFixed(1)}s · 音量 {Math.round((item.volume ?? 0.8) * 100)}%
          </Text>
        </>
      );
    } else {
      body = (
        <>
          <Text style={{ fontSize: 11, color: '#fff', fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            T {String(item.text).substring(0, 12)}
          </Text>
          <Text style={{ fontSize: 10, color: 'rgba(255,255,255,.75)', display: 'block' }}>
            {item.duration.toFixed(1)}s
          </Text>
        </>
      );
    }
    return (
      <div
        key={item.id}
        onClick={(e) => { e.stopPropagation(); onSelect({ track, id: item.id }); }}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const nearRight = rect.right - e.clientX < 10;
          startDrag(nearRight ? 'resize' : 'move', track, item.id, e, item);
        }}
        style={{
          position: 'absolute', left, top: 3, width: w, height: TRACK_HEIGHT - 8,
          background: isSel ? TRACK_META.find((m) => m.key === track)!.color : `${TRACK_META.find((m) => m.key === track)!.color}cc`,
          borderRadius: 8, color: '#fff', padding: '5px 8px', cursor: 'grab',
          boxShadow: isSel ? '0 0 0 2px #fff, 0 0 0 4px #7c3aed' : '0 1px 2px rgba(0,0,0,.2)',
          overflow: 'hidden', userSelect: 'none', touchAction: 'none',
        }}
      >
        {body}
        <div
          onMouseDown={(e) => {
            e.stopPropagation();
            onSelect({ track, id: item.id });
            startDrag('resize', track, item.id, e, item);
          }}
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 10, cursor: 'ew-resize' }}
        />
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', border: '1px solid #eceef1', borderRadius: 12, overflow: 'hidden' }}>
      {/* Horizontally scrollable area: ruler + tracks share the same scrollLeft */}
      <div ref={scrollerRef} className="tl-scroller" style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', minHeight: 186 }}>
        <div style={{ width: Math.max(HEADER_W + totalDur * pxPerSec, HEADER_W + 400), minWidth: '100%', position: 'relative' }}>
          {/* Ruler */}
          <div style={{ display: 'flex', height: 30, flexShrink: 0, borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, background: '#fff', zIndex: 30 }}>
            <div style={{ width: HEADER_W, flexShrink: 0, borderRight: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Text type="secondary" style={{ fontSize: 11 }}>{fmtTime(currentTime)}</Text>
            </div>
            <div
              ref={containerRef}
              style={{ position: 'relative', flex: 1, cursor: 'crosshair' }}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                const rect = containerRef.current!.getBoundingClientRect();
                const sl = scrollerRef.current ? scrollerRef.current.scrollLeft : 0;
                onSeek(round1(Math.max(0, (e.clientX - rect.left + sl) / pxPerSec)));
                startDrag('seek', 'video', null, e);
              }}
            >
              {/* second ticks */}
              {Array.from({ length: Math.ceil(totalDur) + 1 }).map((_, i) => (
                <div key={i} style={{ position: 'absolute', left: i * pxPerSec, top: 0, bottom: 0, width: 1, background: '#f0f0f0' }} />
              ))}
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: currentTime * pxPerSec, width: 2, background: '#f5222d', zIndex: 20, pointerEvents: 'none' }} />
            </div>
          </div>

          {/* Tracks */}
          {TRACK_META.map((meta) => {
            const items = (timeline as any)[meta.key] as any[];
            return (
              <div key={meta.key} style={{ display: 'flex', height: TRACK_HEIGHT, borderBottom: '1px solid #f6f6f6' }}>
                <div style={{ width: HEADER_W, flexShrink: 0, borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, background: '#fafafa' }}>
                  <span style={{ fontSize: 13, color: meta.color }}>{meta.icon}</span>
                  <Text type="secondary" style={{ fontSize: 10 }}>{meta.label} ({items.length})</Text>
                </div>
                <div
                  className="tl-lane"
                  style={{ position: 'relative', flex: 1, background: '#fcfcfd', overflow: 'hidden', cursor: 'grab' }}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    panRef.current = { x0: e.clientX, sl0: scrollerRef.current ? scrollerRef.current.scrollLeft : 0, moved: false };
                  }}
                >
                  {[...items].sort((a, b) => (Number(a.start) || 0) - (Number(b.start) || 0)).map((it, i) => renderItem(meta.key, it, i))}
                  {items.length === 0 && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {meta.key === 'video' ? '从左侧素材面板点击素材添加到时间线' : meta.key === 'audio' ? '上传或添加音频（BGM / 配音）' : '添加文字字幕'}
                      </Text>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom bar: split / delete / zoom */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderTop: '1px solid #f0f0f0', flexShrink: 0, background: '#fff' }}>
        <ButtonMini
          icon={playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
          label={playing ? '暂停' : '播放'}
          onClick={() => onTogglePlay(currentTime)}
          active={playing}
        />
        <Text type="secondary" style={{ fontSize: 12, color: '#7c3aed', fontVariantNumeric: 'tabular-nums' }}>
          ▶ {fmtTime(currentTime)} 起
        </Text>
        <ButtonMini icon="✂" label="分割" onClick={onSplit} disabled={!selected} />
        <ButtonMini icon="🗑" label="删除选中" onClick={onDeleteSelected} disabled={!selected} danger />
        <div style={{ width: 1, height: 18, background: '#f0f0f0' }} />
        <ButtonMini icon="◀" label="左移" onClick={() => scrollerRef.current?.scrollBy({ left: -PAN_STEP, behavior: 'smooth' })} />
        <ButtonMini icon="▶" label="右移" onClick={() => scrollerRef.current?.scrollBy({ left: PAN_STEP, behavior: 'smooth' })} />
        <div style={{ flex: 1 }} />
        <Text type="secondary" style={{ fontSize: 11 }}>缩放</Text>
        <Slider
          min={10} max={100} value={pxPerSec} onChange={onPxPerSec}
          style={{ width: 140, margin: '6px 0' }} tooltip={{ formatter: (v) => `${v}px/秒` }}
        />
        <Text type="secondary" style={{ fontSize: 11, width: 46 }}>{totalDur.toFixed(1)}s</Text>
      </div>
    </div>
  );
}

function ButtonMini({ icon, label, onClick, disabled, danger, active }: {
  icon: React.ReactNode; label: string; onClick?: () => void; disabled?: boolean; danger?: boolean; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #e5e7eb', borderRadius: 8,
        padding: '4px 10px', fontSize: 12, background: active ? '#7c3aed' : '#fff', cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? '#bbb' : active ? '#fff' : danger ? '#f5222d' : '#333', opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{ fontSize: 12 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}