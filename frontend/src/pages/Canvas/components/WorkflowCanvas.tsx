import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Typography } from 'antd';
import {
  VideoCameraOutlined, PictureOutlined, FontSizeOutlined, AudioOutlined,
  ThunderboltOutlined, ExportOutlined, DeleteOutlined,
} from '@ant-design/icons';
import {
  NODE_WIDTH, NODE_HEADER_H, NODE_BODY_H, NODE_META,
  type WFNode, type WFEdge, type Workflow, type WFNodeType,
} from './WorkflowTypes';

const { Text } = Typography;

export interface AssetPayload {
  kind: string;
  type: 'video' | 'image';
  url: string;
  title: string;
  thumbnail?: string;
  ref_id?: number;
}

interface Props {
  workflow: Workflow;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onChange: Dispatch<SetStateAction<Workflow>>;
  onAddAsset: (asset: AssetPayload, pos: { x: number; y: number }) => void;
}

const NODE_ICONS: Record<WFNodeType, any> = {
  video: <VideoCameraOutlined />,
  image: <PictureOutlined />,
  text: <FontSizeOutlined />,
  audio: <AudioOutlined />,
  effect: <ThunderboltOutlined />,
  output: <ExportOutlined />,
};

const nodePosition = (n: WFNode) => ({ left: n.position.x, top: n.position.y });

function toStaticUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  if (/^\/static\//.test(u) || /^https?:/.test(u) || /^data:/.test(u)) return u;
  const m = u.replace(/\\/g, '/').match(/([^/]+\.(mp4|webm|mov|jpg|jpeg|png|webp|gif))$/i);
  return m ? `/static/${m[1]}` : u;
}

const FILTER_LABEL: Record<string, string> = {
  grayscale: '黑白', sepia: '复古棕褐', warm: '暖色', cool: '冷色', vintage: '胶片怀旧',
  bright: '提亮', dark: '压暗', contrast: '高对比', soft: '柔化', vivid: '鲜艳',
};

const TRANSITION_LABEL: Record<string, string> = {
  fade: '淡入溶解', fade_black: '黑场过渡', fade_white: '白场过渡',
  wipe_left: '擦除(左)', wipe_right: '擦除(右)', slide_left: '滑动(左)', slide_right: '滑动(右)', circle: '圆形扩展',
};

type DragState =
  | { mode: 'pan'; startX: number; startY: number; base: { x: number; y: number; zoom: number } }
  | { mode: 'node'; startX: number; startY: number; base: { x: number; y: number; zoom: number }; nodeId: string; nodeBase: { x: number; y: number } }
  | { mode: 'multi'; startX: number; startY: number; base: { x: number; y: number; zoom: number }; nodes: Array<{ id: string; x: number; y: number }> }
  | null;

interface Rect { x: number; y: number; w: number; h: number; }

export default function WorkflowCanvas({ workflow, selectedIds, onSelect, onChange, onAddAsset }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ x: 120, y: 80, zoom: 0.9 });
  const [dragging, setDragging] = useState<DragState>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [connecting, setConnecting] = useState<null | { fromId: string; x: number; y: number }>(null);
  const [hoverPort, setHoverPort] = useState<null | { nodeId: string; dir: 'in' | 'out' }>(null);
  const [draggingAsset, setDraggingAsset] = useState<AssetPayload | null>(null);
  const workflowRef = useRef(workflow);
  workflowRef.current = workflow;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const selectedRef = useRef<string[]>(selectedIds);
  selectedRef.current = selectedIds;

  // ── coordinate transforms ──
  const screenToWorld = useCallback((sx: number, sy: number) => {
    const vp = viewportRef.current;
    return { x: (sx - vp.x) / vp.zoom, y: (sy - vp.y) / vp.zoom };
  }, []);

  const nodeScreenRect = useCallback((n: WFNode, vp: { x: number; y: number; zoom: number }): Rect => ({
    x: vp.x + n.position.x * vp.zoom,
    y: vp.y + n.position.y * vp.zoom,
    w: NODE_WIDTH * vp.zoom,
    h: (NODE_HEADER_H + NODE_BODY_H) * vp.zoom,
  }), []);

  const overlap = (a: Rect, b: Rect) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  const marqueeHitIds = useCallback((m: Rect, vp: { x: number; y: number; zoom: number }, nodes: WFNode[]): string[] => {
    const rect: Rect = { x: m.w >= 0 ? m.x : m.x + m.w, y: m.h >= 0 ? m.y : m.y + m.h, w: Math.abs(m.w), h: Math.abs(m.h) };
    return nodes.filter((n) => overlap(rect, nodeScreenRect(n, vp))).map((n) => n.id);
  }, [nodeScreenRect]);

  const edgesByNode = useMemo(() => {
    const out = new Map<string, WFEdge[]>();
    const inn = new Map<string, WFEdge[]>();
    for (const e of workflow.edges) {
      if (!out.has(e.from)) out.set(e.from, []);
      out.get(e.from)!.push(e);
      if (!inn.has(e.to)) inn.set(e.to, []);
      inn.get(e.to)!.push(e);
    }
    return { out, inn };
  }, [workflow.edges]);

  const nodeById = useMemo(() => {
    const m = new Map<string, WFNode>();
    for (const n of workflow.nodes) m.set(n.id, n);
    return m;
  }, [workflow.nodes]);

  // ── wheel zoom (prevent page scroll) ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      setViewport((vp) => {
        const factor = e.ctrlKey ? 1.15 : 1.1;
        const zoom = Math.min(2, Math.max(0.3, vp.zoom * (e.deltaY < 0 ? factor : 1 / factor)));
        // keep world point under cursor fixed
        const wx = (sx - vp.x) / vp.zoom;
        const wy = (sy - vp.y) / vp.zoom;
        return { zoom, x: sx - wx * zoom, y: sy - wy * zoom };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── keyboard shortcuts: Delete / Backspace / Esc / Ctrl+A ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const ids = selectedRef.current;
        if (ids.length === 0) return;
        e.preventDefault();
        const wf = workflowRef.current;
        const idSet = new Set(ids);
        onChange({
          nodes: wf.nodes.filter((n) => !idSet.has(n.id)),
          edges: wf.edges.filter((ed) => !idSet.has(ed.from) && !idSet.has(ed.to)),
        });
        onSelect([]);
      } else if (e.key === 'Escape') {
        onSelect([]);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        onSelect(workflowRef.current.nodes.map((n) => n.id));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onChange, onSelect]);

  // ── global pointer move/up while dragging, connecting or marquee ──
  useEffect(() => {
    if (!dragging && !connecting && !marquee) return;
    const onMove = (e: PointerEvent) => {
      const rect = containerRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      if (dragging) {
        const dx = sx - dragging.startX;
        const dy = sy - dragging.startY;
        if (dragging.mode === 'pan') {
          setViewport((vp) => ({ ...vp, x: dragging.base.x + dx, y: dragging.base.y + dy }));
        } else if (dragging.mode === 'node') {
          const node = workflowRef.current.nodes.find((n) => n.id === dragging.nodeId);
          if (!node) return;
          const base = dragging.nodeBase!;
          const newPos = { x: base.x + dx / dragging.base.zoom, y: base.y + dy / dragging.base.zoom };
          onChange((prev) => ({
            ...prev,
            nodes: prev.nodes.map((n) => n.id === node.id ? { ...n, position: newPos } : n),
          }));
        } else {
          // multi-node drag: move every selected node by the same world delta
          const delta = { x: dx / dragging.base.zoom, y: dy / dragging.base.zoom };
          onChange((prev) => ({
            ...prev,
            nodes: prev.nodes.map((n) => {
              const b = dragging.nodes.find((x) => x.id === n.id);
              return b ? { ...n, position: { x: b.x + delta.x, y: b.y + delta.y } } : n;
            }),
          }));
        }
        return;
      }
      if (marquee) {
        setMarquee((m) => m ? { ...m, w: sx - m.x, h: sy - m.y } : m);
        return;
      }
      if (connecting) {
        setConnecting({ ...connecting, x: sx, y: sy });
        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const portEl = el?.closest('[data-port]') as HTMLElement | null;
        if (portEl && portEl.dataset.dir === 'in' && portEl.dataset.node !== connecting.fromId) {
          setHoverPort({ nodeId: portEl.dataset.node!, dir: 'in' });
        } else {
          setHoverPort(null);
        }
      }
    };
    const onUp = (e: PointerEvent) => {
      if (marquee) {
        const hit = marqueeHitIds(marquee, viewportRef.current, workflowRef.current.nodes);
        // tiny drag (<6px) counts as a plain click on empty space → keep cleared
        onSelect(Math.abs(marquee.w) >= 6 || Math.abs(marquee.h) >= 6 ? hit : []);
        setMarquee(null);
      }
      if (connecting) {
        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const portEl = el?.closest('[data-port]') as HTMLElement | null;
        const toId = portEl?.dataset.node;
        const toDir = portEl?.dataset.dir;
        const wf = workflowRef.current;
        if (toId && toId !== connecting.fromId && toDir === 'in') {
          const dup = wf.edges.some((ed) => ed.from === connecting.fromId && ed.to === toId);
          if (!dup) {
            onChange({
              ...wf,
              edges: [...wf.edges, { id: `edge_${Date.now()}`, from: connecting.fromId, to: toId }],
            });
          }
        }
        setConnecting(null);
        setHoverPort(null);
      }
      setDragging(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, connecting, marquee, onChange, onSelect, marqueeHitIds]);

  // ── drop asset from left panel onto canvas ──
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const rect = containerRef.current!.getBoundingClientRect();
      const pos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      if (parsed.__palette) {
        // palette node dragged → create node of the dragged palette type at drop position
        onAddAsset(
          { kind: 'palette', type: parsed.__palette, url: '', title: '' },
          { x: Math.max(0, pos.x - NODE_WIDTH / 2), y: Math.max(0, pos.y - 40) }
        );
        return;
      }
      const asset = parsed as AssetPayload;
      onAddAsset(asset, { x: Math.max(0, pos.x - NODE_WIDTH / 2), y: Math.max(0, pos.y - 40) });
    } catch { /* ignore */ }
  };

  // ── delete node(s) + their edges ──
  const removeNodes = (ids: string[]) => {
    const wf = workflowRef.current;
    const idSet = new Set(ids);
    onChange({
      nodes: wf.nodes.filter((n) => !idSet.has(n.id)),
      edges: wf.edges.filter((e) => !idSet.has(e.from) && !idSet.has(e.to)),
    });
    onSelect(selectedRef.current.filter((id) => !idSet.has(id)));
  };

  // ── edge path ──
  const edgePath = (e: WFEdge) => {
    const from = nodeById.get(e.from);
    const to = nodeById.get(e.to);
    if (!from || !to) return null;
    const x1 = from.position.x + NODE_WIDTH;
    const y1 = from.position.y + NODE_HEADER_H + NODE_BODY_H / 2;
    const x2 = to.position.x;
    const y2 = to.position.y + NODE_HEADER_H + NODE_BODY_H / 2;
    const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
    return { d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`, x1, y1, x2, y2 };
  };

  const effectLabel = (n: WFNode) => {
    if (n.params?.kind === 'filter') {
      const f = FILTER_LABEL[n.params.filter];
      return f ? `滤镜: ${f}` : '滤镜';
    }
    const t = TRANSITION_LABEL[n.params.transition];
    return t ? `转场: ${t}` : '转场';
  };

  const nodeTitle = (n: WFNode) => {
    const meta = NODE_META[n.type];
    if (n.type === 'effect') return effectLabel(n);
    if (n.type === 'output') return '输出成片';
    if (n.source?.url) {
      const m = toStaticUrl(n.source.url)?.match(/([^/]+)$/);
      return m ? m[1] : meta.label;
    }
    if (n.type === 'text') return n.params?.text ? `「${String(n.params.text).slice(0, 10)}」` : '文字';
    return meta.label;
  };

  // marquee rect normalized for rendering / hit-testing
  const marqueeRect = marquee ? {
    x: marquee.w >= 0 ? marquee.x : marquee.x + marquee.w,
    y: marquee.h >= 0 ? marquee.y : marquee.y + marquee.h,
    w: Math.abs(marquee.w),
    h: Math.abs(marquee.h),
  } : null;
  const marqueeIds = marqueeRect ? marqueeHitIds(marqueeRect, viewport, workflow.nodes) : [];

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#f5f6f8', borderRadius: 12, minWidth: 0, cursor: dragging?.mode === 'pan' ? 'grabbing' : 'grab', touchAction: 'none' }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (draggingAsset) { setDraggingAsset(null); return; }
        const target = e.target as HTMLElement;
        const nodeEl = target.closest('[data-node]') as HTMLElement | null;
        const portEl = target.closest('[data-port]') as HTMLElement | null;
        const rect = containerRef.current!.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        if (e.button === 2) {
          // right-drag pans the canvas
          setDragging({ mode: 'pan', startX: sx, startY: sy, base: viewport });
          return;
        }
        if (portEl && portEl.dataset.dir === 'out') {
          setConnecting({ fromId: portEl.dataset.node!, x: sx, y: sy });
          return;
        }
        if (nodeEl) {
          const id = nodeEl.dataset.node!;
          const node = nodeById.get(id);
          if (!node) return;
          if (selectedIds.includes(id) && selectedIds.length > 1) {
            // drag the whole selection
            setDragging({
              mode: 'multi',
              startX: sx, startY: sy, base: viewport,
              nodes: selectedIds.map((nid) => {
                const n = nodeById.get(nid);
                return { id: nid, x: n?.position.x ?? 0, y: n?.position.y ?? 0 };
              }),
            });
          } else {
            onSelect([id]);
            setDragging({
              mode: 'node',
              startX: sx, startY: sy, base: viewport,
              nodeId: id,
              nodeBase: { x: node.position.x, y: node.position.y },
            });
          }
          return;
        }
        // left-drag on empty space → marquee select (and clear current selection)
        onSelect([]);
        setMarquee({ x: sx, y: sy, w: 0, h: 0 });
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {/* dotted grid */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(#d5d9e0 1px, transparent 1px)',
        backgroundSize: `${20 * viewport.zoom}px ${20 * viewport.zoom}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
      }} />

      <div style={{ position: 'absolute', left: viewport.x, top: viewport.y, transform: `scale(${viewport.zoom})`, transformOrigin: '0 0' }}>
        {/* edges */}
        <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }} width={6000} height={4000}>
          {workflow.edges.map((e) => {
            const p = edgePath(e);
            if (!p) return null;
            return (
              <g key={e.id}>
                <path d={p.d} fill="none" stroke={hoverPort && hoverPort.nodeId === e.to ? '#8b5cf6' : '#9aa4b2'} strokeWidth={2.5} strokeDasharray="7 5" />
                <circle cx={p.x2} cy={p.y2} r={5} fill="#9aa4b2" />
              </g>
            );
          })}
          {/* temporary connection line */}
          {connecting && (() => {
            const from = nodeById.get(connecting.fromId);
            if (!from) return null;
            const x1 = from.position.x + NODE_WIDTH;
            const y1 = from.position.y + NODE_HEADER_H + NODE_BODY_H / 2;
            const sx = (connecting.x - viewport.x) / viewport.zoom;
            const sy = (connecting.y - viewport.y) / viewport.zoom;
            const dx = Math.max(40, Math.abs(sx - x1) * 0.5);
            return <path d={`M${x1},${y1} C${x1 + dx},${y1} ${sx - dx},${sy} ${sx},${sy}`} fill="none" stroke="#8b5cf6" strokeWidth={2.5} strokeDasharray="7 5" />;
          })()}
        </svg>

        {/* nodes */}
        {workflow.nodes.map((n) => {
          const meta = NODE_META[n.type];
          const selected = selectedIds.includes(n.id);
          const inMarquee = marqueeIds.includes(n.id);
          const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(toStaticUrl(n.source?.url) || '');
          return (
            <div
              key={n.id}
              data-node={n.id}
              style={{
                position: 'absolute', ...nodePosition(n),
                width: NODE_WIDTH,
                background: '#fff', borderRadius: 12,
                border: selected ? `2px solid ${meta.color}` : inMarquee ? '2px dashed #8b5cf6' : '2px solid #e3e6ea',
                boxShadow: selected ? `0 6px 20px ${meta.color}33` : inMarquee ? '0 0 0 3px rgba(139,92,246,0.15)' : '0 3px 10px rgba(0,0,0,0.07)',
                cursor: 'move', userSelect: 'none',
              }}
            >
              {/* header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: NODE_HEADER_H, background: meta.color, color: '#fff', fontSize: 13, fontWeight: 600, borderTopLeftRadius: 10, borderTopRightRadius: 10 }}>
                <span style={{ fontSize: 15 }}>{NODE_ICONS[n.type]}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nodeTitle(n)}</span>
                <span
                  role="button"
                  aria-label="删除节点"
                  style={{ cursor: 'pointer', fontSize: 13, padding: 2 }}
                  onClick={(e) => { e.stopPropagation(); removeNodes([n.id]); }}
                ><DeleteOutlined /></span>
              </div>
              {/* body preview */}
              <div style={{ position: 'relative', height: NODE_BODY_H, background: n.type === 'text' ? '#f3f0ff' : '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6 }}>
                {n.type === 'text' ? (
                  <div style={{ color: n.params?.text_color || '#7c3aed', fontSize: 13, fontWeight: 600, textAlign: 'center', maxHeight: '100%', overflow: 'hidden', wordBreak: 'break-all', lineHeight: 1.3, padding: 4 }}>
                    {n.params?.text || '点击右侧面板输入文字'}
                  </div>
                ) : n.source?.url ? (
                  isVideo ? (
                    <video src={toStaticUrl(n.source.url)} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                  ) : (
                    <img src={toStaticUrl(n.source.url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                  )
                ) : (
                  <span style={{ color: '#8a94a6', fontSize: 12 }}>{n.type === 'effect' ? '拖动连线到视频之间应用' : '未选择素材'}</span>
                )}
                {/* duration badge */}
                {(n.type === 'video' || n.type === 'image') && (
                  <span style={{ position: 'absolute', right: 6, bottom: 6, background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 10, borderRadius: 5, padding: '1px 6px' }}>{n.duration}s</span>
                )}
              </div>
              {/* input port */}
              <div
                data-port="in" data-node={n.id} data-dir="in"
                style={{
                  position: 'absolute', left: -8, top: NODE_HEADER_H + NODE_BODY_H / 2 - 8,
                  width: 16, height: 16, borderRadius: '50%', cursor: 'crosshair',
                  background: hoverPort?.nodeId === n.id && hoverPort.dir === 'in' ? '#8b5cf6' : '#fff',
                  border: `2px solid ${meta.color}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)', zIndex: 5,
                }}
              />
              {/* output port */}
              <div
                data-port="out" data-node={n.id} data-dir="out"
                style={{
                  position: 'absolute', right: -8, top: NODE_HEADER_H + NODE_BODY_H / 2 - 8,
                  width: 16, height: 16, borderRadius: '50%', cursor: 'crosshair',
                  background: connecting?.fromId === n.id ? '#8b5cf6' : '#fff',
                  border: `2px solid ${meta.color}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)', zIndex: 5,
                }}
              />
              {/* in-edge count badge */}
              {n.type === 'output' && (edgesByNode.inn.get(n.id)?.length || 0) > 0 && (
                <span style={{ position: 'absolute', top: 40, right: 8, background: '#22c55e', color: '#fff', fontSize: 10, borderRadius: 10, padding: '1px 7px' }}>
                  {edgesByNode.inn.get(n.id)!.length} 条输入
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* marquee selection box */}
      {marqueeRect && (
        <div style={{
          position: 'absolute', left: marqueeRect.x, top: marqueeRect.y,
          width: marqueeRect.w, height: marqueeRect.h,
          border: '1.5px dashed #8b5cf6', background: 'rgba(139,92,246,0.08)',
          borderRadius: 4, pointerEvents: 'none', zIndex: 6,
        }} />
      )}

      {/* selection action bar */}
      {selectedIds.length > 1 && (
        <div style={{ position: 'absolute', bottom: 42, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 20, padding: '6px 16px', boxShadow: '0 4px 14px rgba(0,0,0,0.15)', zIndex: 7, fontSize: 12 }}>
          <Text style={{ color: '#333' }}>已选 <span style={{ color: '#7c3aed', fontWeight: 700 }}>{selectedIds.length}</span> 个节点</Text>
          <a role="button" style={{ color: '#f5222d', cursor: 'pointer' }} onClick={() => removeNodes(selectedIds)}>全部删除</a>
          <a role="button" style={{ color: '#666', cursor: 'pointer' }} onClick={() => onSelect([])}>取消选择</a>
        </div>
      )}

      {/* connecting hint */}
      {connecting && (
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(139,92,246,0.95)', color: '#fff', fontSize: 12, borderRadius: 20, padding: '5px 16px', pointerEvents: 'none', boxShadow: '0 3px 10px rgba(0,0,0,0.2)' }}>
          松开鼠标连接到目标节点左侧输入口
        </div>
      )}

      {/* hint bar */}
      <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', color: '#8a94a6', fontSize: 11, background: '#fff', borderRadius: 20, padding: '4px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', pointerEvents: 'none' }}>
        左键点选/拖动节点 · 左键空白拉框多选 · 右键拖空白平移 · 滚轮缩放 · 右侧圆点拖到左侧圆点连线 · Delete 删除
      </div>
    </div>
  );
}
