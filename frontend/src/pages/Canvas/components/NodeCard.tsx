import { InputNumber, Select, Tooltip, Button, Input, message } from 'antd';
import { HolderOutlined, DeleteOutlined, FontSizeOutlined, PictureOutlined, VideoCameraOutlined } from '@ant-design/icons';

export interface CanvasNodeData {
  id: string;
  type: 'video' | 'image' | 'text';
  source?: { kind: string; ref_id?: number; url?: string } | null;
  duration: number;
  order: number;
  params?: { text?: string; bg_color?: string; text_color?: string; font_size?: number; kenburns?: string };
  transition?: { type: string; duration: number } | null;
  mute?: boolean;
}

export const NODE_ICON: Record<string, any> = {
  video: <VideoCameraOutlined style={{ color: '#1677ff' }} />,
  image: <PictureOutlined style={{ color: '#52c41a' }} />,
  text: <FontSizeOutlined style={{ color: '#7c3aed' }} />,
};

export const TRANSITION_OPTIONS = [
  { value: 'none', label: '无转场' },
  { value: 'fade_black', label: '黑场过渡' },
  { value: 'fade_white', label: '白场过渡' },
  { value: 'fade', label: '淡入溶解' },
  { value: 'wipe_left', label: '擦除(左)' },
  { value: 'wipe_right', label: '擦除(右)' },
  { value: 'slide_left', label: '滑动(左)' },
  { value: 'slide_right', label: '滑动(右)' },
  { value: 'circle', label: '圆形扩展' },
];

export default function NodeCard({
  node,
  index,
  onUpdate,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onPreview,
  lastNode,
}: {
  node: CanvasNodeData;
  index: number;
  lastNode: boolean;
  onUpdate: (updated: CanvasNodeData) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onPreview: () => void;
}) {
  const isText = node.type === 'text';
  const tr = node.transition || { type: 'none', duration: 0.5 };

  const cover = node.source?.url || null;
  const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(cover || '');

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onPreview}
      style={{ position: 'relative', display: 'flex', flexDirection: 'column', width: 130, flexShrink: 0, cursor: 'grab', marginRight: 14 }}
    >
      <div style={{
        border: '1.5px solid #e8e8e8', borderRadius: 12, overflow: 'hidden',
        background: isText ? '#7c3aed' : '#fff', width: 130, minHeight: 170,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column',
      }}>
        {/* Preview area */}
        <div style={{ height: 90, background: isText ? '#7c3aed' : '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}>
          {!isText && cover ? (
            isVideo ? (
              <video src={cover} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )
          ) : isText ? (
            <div style={{ color: '#fff', fontSize: 11, fontWeight: 600, textAlign: 'center', padding: 8, wordBreak: 'break-all', lineHeight: 1.3 }}>
              {node.params?.text || '文字块'}
            </div>
          ) : (
            <div style={{ color: '#bbb', fontSize: 11 }}>{node.type === 'video' ? '视频' : '图片'}</div>
          )}
          <div style={{ position: 'absolute', top: 5, left: 5 }}>
            <HolderOutlined style={{ color: '#fff', fontSize: 14, background: 'rgba(0,0,0,0.35)', borderRadius: 6, padding: 2 }} />
          </div>
          <div style={{ position: 'absolute', bottom: 5, left: 5, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, borderRadius: 4, padding: '1px 6px' }}>
            {node.duration}s
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 8, flex: 1, background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: '#666', display: 'flex', alignItems: 'center', gap: 4 }}>
              {NODE_ICON[node.type]}
              {index + 1}. {node.type === 'text' ? '文字' : node.type === 'video' ? '视频' : '图片'}
            </span>
            <Tooltip title="删除">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ fontSize: 12, padding: '2px 4px' }}
                onClick={(e) => { e.stopPropagation(); onRemove(); }} />
            </Tooltip>
          </div>

          {/* Duration */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: '#999', flexShrink: 0 }}>时长</span>
            <InputNumber
              size="small" min={1} max={15} value={node.duration}
              onChange={(v) => onUpdate({ ...node, duration: Number(v || 3) })}
              style={{ width: 62 }} onClick={(e) => e.stopPropagation()}
            />
            <span style={{ fontSize: 10, color: '#999' }}>秒</span>
          </div>

          {/* Text editor for text blocks */}
          {isText && (
            <div style={{ marginBottom: 6 }} onClick={(e) => e.stopPropagation()}>
              <Input
                size="small" value={node.params?.text || ''}
                placeholder="输入文字内容"
                onChange={(e) => onUpdate({ ...node, params: { ...node.params, text: e.target.value } })}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <span style={{ fontSize: 10, color: '#999' }}>配色</span>
                <input
                  type="color" value={node.params?.bg_color || '#7C3AED'}
                  onChange={(e) => {
                    const bg = e.target.value;
                    onUpdate({ ...node, params: { ...node.params, bg_color: bg } });
                    message.success('已更新文字底色');
                  }}
                  style={{ width: 36, height: 22, border: 'none', background: 'none', cursor: 'pointer' }}
                />
                <input
                  type="color" value={node.params?.text_color || '#FFFFFF'}
                  onChange={(e) => onUpdate({ ...node, params: { ...node.params, text_color: e.target.value } })}
                  style={{ width: 36, height: 22, border: 'none', background: 'none', cursor: 'pointer' }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transition selector between this node and the next */}
      {!lastNode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
          <Tooltip title="与下一块之间的转场">
            <span style={{ fontSize: 10, color: '#999', flexShrink: 0 }}>转场</span>
          </Tooltip>
          <Select
            size="small" value={tr.type} style={{ flex: 1 }}
            options={TRANSITION_OPTIONS}
            onChange={(v) => onUpdate({ ...node, transition: { type: v, duration: tr.duration || 0.5 } })}
          />
        </div>
      )}
    </div>
  );
}