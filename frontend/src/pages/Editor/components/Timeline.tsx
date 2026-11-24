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
  canUndo: boolean;
  canRedo: boolean;
  onTogglePlay: (t: number) => void;
  onPxPerSec: (v: number) => void;
  onTimelineChange: (t: TimelineDoc) => void;
  onSelect: (sel: Selection | null) => void;
  onSeek: (t: number) => void;
  onSplit: () => void;
  onMerge: () => void;
  onDeleteSelected: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

function fmtTime(t: number): string {  const s = Math.max(0, t);
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
  timeline, currentTime, selected, pxPerSec, playing, canUndo, canRedo, onTogglePlay, onPxPerSec,
  onTimelineChange, onSelect, onSeek, onSplit, onMerge, onDeleteSelected, onUndo, onRedo,
}: Props) {
  const totalDur = Math.max(timeline.duration, currentTime, 5);
  const [drag, setDrag] = useState<DragState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const panRef = useRef<{ x0: number; sl0: number; moved: boolean } | null>(null);

  // Wheel over the tracks scrolls the timeline horizontally only (page must
  // NOT scroll). React's synthetic onWheel is passive, so a native non-passive
  // listener with preventDefault is required.
  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      sc.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    };
    sc.addEventListener('wheel', onWheel, { passive: false });
    return () => sc.removeEventListener('wheel', onWheel);
  }, []);

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
    const trackColor = TRACK_META.find((m) => m.key === track)!.color;
    let body: React.ReactNode;
    if (track === 'video') {
      body = (
        <>
          <Text className="ed-tl__block-title">分段 {idx + 1}</Text>
          <Text className="ed-tl__block-sub">
            {item.duration.toFixed(1)}s{Number(item.trimIn) > 0 ? ` · 头裁${Number(item.trimIn).toFixed(1)}s` : ''}
            {item.filter && item.filter !== 'none' ? ` · ${item.filter}` : ''}
          </Text>
        </>
      );
    } else if (track === 'audio') {
      body = (
        <>
          <Text className="ed-tl__block-title">♪ {labelOf(item.url)}</Text>
          <Text className="ed-tl__block-sub">
            {item.duration.toFixed(1)}s · 音量 {Math.round((item.volume ?? 0.8) * 100)}%
          </Text>
        </>
      );
    } else {
      body = (
        <>
          <Text className="ed-tl__block-title">T {String(item.text).substring(0, 12)}</Text>
          <Text className="ed-tl__block-sub">{item.duration.toFixed(1)}s</Text>
        </>
      );
    }
    return (
      <div
        key={item.id}
        className="ed-tl__block"
        data-sel={isSel ? '1' : '0'}
        onClick={(e) => { e.stopPropagation(); onSelect({ track, id: item.id }); }}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const nearRight = rect.right - e.clientX < 10;
          startDrag(nearRight ? 'resize' : 'move', track, item.id, e, item);
        }}
        style={{
          left, top: 3, width: w,
          // 轨道强调色是数据（TRACK_META.color），注入成局部变量给 CSS 用；
          // 未选中态由 CSS 的 color-mix 降透明，不再手写 `${color}cc` 拼后缀
          ['--track-color' as any]: trackColor,
        }}
      >
        {body}
        <div
          className="ed-tl__handle"
          onMouseDown={(e) => {
            e.stopPropagation();
            onSelect({ track, id: item.id });
            startDrag('resize', track, item.id, e, item);
          }}
        />
      </div>
    );
  };

  return (
    <div className="ed-tl">
      {/* Horizontally scrollable area: ruler + tracks share the same scrollLeft */}
      <div ref={scrollerRef} className="tl-scroller ed-tl__scroller">
        <div style={{ width: Math.max(HEADER_W + totalDur * pxPerSec, HEADER_W + 400), minWidth: '100%', position: 'relative' }}>
          {/* Ruler */}
          <div className="ed-tl__ruler">
            <div className="ed-tl__head">
              <Text type="secondary" className="ed-tl__time">{fmtTime(currentTime)}</Text>
            </div>
            <div
              ref={containerRef}
              className="ed-tl__track"
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
                <div key={i} className="ed-tl__tick" style={{ left: i * pxPerSec }} />
              ))}
              <div className="ed-tl__playhead" style={{ left: currentTime * pxPerSec }} />
            </div>
          </div>

          {/* Tracks */}
          {TRACK_META.map((meta) => {
            const items = (timeline as any)[meta.key] as any[];
            return (
              <div key={meta.key} className="ed-tl__row">
                <div className="ed-tl__head ed-tl__head--track" style={{ ['--track-color' as any]: meta.color }}>
                  <span className="ed-tl__icon">{meta.icon}</span>
                  <Text type="secondary" className="ed-tl__label">{meta.label} ({items.length})</Text>
                </div>
                <div
                  className="tl-lane ed-tl__lane"
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    panRef.current = { x0: e.clientX, sl0: scrollerRef.current ? scrollerRef.current.scrollLeft : 0, moved: false };
                  }}
                >
                  {[...items].sort((a, b) => (Number(a.start) || 0) - (Number(b.start) || 0)).map((it, i) => renderItem(meta.key, it, i))}
                  {items.length === 0 && (
                    <div className="ed-tl__lane-empty">
                      <Text type="secondary" className="ed-tl__label">
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

      {/* Bottom bar: split / delete / zoom / pan */}
      <div className="ed-tl__bar">
        <ButtonMini
          icon={playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
          label={playing ? '暂停' : '播放'}
          onClick={() => onTogglePlay(currentTime)}
          active={playing}
        />
        <Text type="secondary" className="ed-tl__now">▶ {fmtTime(currentTime)} 起</Text>
        <div className="ed-tl__sep" />
        <ButtonMini icon="✂" label="分割" onClick={onSplit} disabled={!selected} />
        <ButtonMini icon="🔗" label="合成" onClick={onMerge} disabled={!selected} />
        <ButtonMini icon="🗑" label="删除选中" onClick={onDeleteSelected} disabled={!selected} danger />
        <div className="ed-tl__sep" />
        <ButtonMini icon="↩" label="撤回" onClick={onUndo} disabled={!canUndo} />
        <ButtonMini icon="↪" label="还原" onClick={onRedo} disabled={!canRedo} />
        <div className="ed-tl__spacer" />
        <Text type="secondary" className="ed-tl__zoom">缩放</Text>
        <Slider
          min={10} max={100} value={pxPerSec} onChange={onPxPerSec}
          className="ed-tl__slider" tooltip={{ formatter: (v) => `${v}px/秒` }}
        />
        <Text type="secondary" className="ed-tl__dur">{totalDur.toFixed(1)}s</Text>
      </div>
    </div>
  );
}

function ButtonMini({ icon, label, onClick, disabled, danger, active }: {
  icon: React.ReactNode; label: string; onClick?: () => void; disabled?: boolean; danger?: boolean; active?: boolean;
}) {
  const cls = ['ed-mini', active ? 'ed-mini--active' : '', danger ? 'ed-mini--danger' : '']
    .filter(Boolean).join(' ');
  return (
    <button onClick={onClick} disabled={disabled} className={cls}>
      <span className="ed-mini__icon">{icon}</span>
      <span>{label}</span>
    </button>
  );
}