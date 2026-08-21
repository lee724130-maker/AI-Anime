import { useEffect, useMemo, useState } from 'react';
import { Button, Input, InputNumber, Select, Slider, Empty, Divider, Typography } from 'antd';
import {
  DeleteOutlined, VideoCameraOutlined, PictureOutlined, FontSizeOutlined,
  AudioOutlined, ThunderboltOutlined, ExportOutlined,
} from '@ant-design/icons';
import {
  NODE_META, TRANSITION_OPTIONS, FILTER_OPTIONS, ANIMATION_OPTIONS,
  type WFNode, type WFNodeType,
} from './WorkflowTypes';
import type { AssetPayload } from './WorkflowCanvas';

const { Text } = Typography;

export const NODE_TYPE_ICON: Record<WFNodeType, any> = {
  video: <VideoCameraOutlined />,
  image: <PictureOutlined />,
  text: <FontSizeOutlined />,
  audio: <AudioOutlined />,
  effect: <ThunderboltOutlined />,
  output: <ExportOutlined />,
};

interface Props {
  node: WFNode | null;
  assetOptions: Record<'video' | 'image' | 'audio', AssetPayload[]>;
  onChange: (node: WFNode) => void;
  onRemove: (id: string) => void;
}

export default function PropertiesPanel({ node, assetOptions, onChange, onRemove }: Props) {
  const normalizeColor = (v: unknown): string => {
    if (!v) return '#7C3AED';
    if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) return v;
    if (typeof v === 'string' && /^#[0-9a-fA-F]{3}$/.test(v)) {
      return v.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3');
    }
    return '#7C3AED';
  };
  const [color, setColor] = useState(() => normalizeColor(node?.params?.text_color || node?.params?.bg_color));
  useEffect(() => { setColor(normalizeColor(node?.params?.text_color || node?.params?.bg_color)); }, [node?.id]);

  const patch = (p: Partial<WFNode>) => node && onChange({ ...node, ...p });
  const patchParams = (p: Record<string, any>) => node && onChange({ ...node, params: { ...node.params, ...p } });

  const optList = useMemo(() => {
    if (!node) return [];
    const kind = node.type;
    if (kind === 'video') return assetOptions.video;
    if (kind === 'image') return assetOptions.image;
    if (kind === 'audio') return assetOptions.video;
    return [];
  }, [node, assetOptions]);

  if (!node) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Empty description="点击画布上的节点，在这里编辑属性" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  const meta = NODE_META[node.type];

  return (
    <div style={{ padding: '0 16px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ color: meta.color, fontSize: 18 }}>{NODE_TYPE_ICON[node.type]}</span>
        <Text strong style={{ fontSize: 14, flex: 1 }}>{meta.label}节点属性</Text>
        <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => onRemove(node.id)}>删除</Button>
      </div>
      <Text type="secondary" style={{ fontSize: 11 }}>{node.id}</Text>

      {/* duration */}
      {node.type !== 'effect' && node.type !== 'output' && (
        <>
          <Divider plain style={{ margin: '12px 0' }} />
          <div style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              {node.type === 'audio' ? '轨道时长（秒）' : node.type === 'text' ? '显示时长（秒）' : '素材时长（秒）'}
            </Text>
            <InputNumber size="small" min={0.5} max={60} step={0.5} value={node.duration}
              onChange={(v) => patch({ duration: Number(v ?? 3) })} style={{ width: '100%' }} />
          </div>
        </>
      )}

      {/* source selector for video/image/audio */}
      {(node.type === 'video' || node.type === 'image' || node.type === 'audio') && (
        <>
          <Divider plain style={{ margin: '12px 0' }} />
          <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>选择素材</Text>
          <Select
            data-testid="source-select"
            size="small" style={{ width: '100%' }} value={node.source?.url || undefined}
            placeholder={optList.length === 0 ? '暂无可用素材，请先在左侧素材面板添加' : '选择素材...'}
            onChange={(url) => {
              const found = optList.find((a) => a.url === url);
              patch({ source: { kind: found?.kind || 'viral', ref_id: found?.ref_id, url } });
            }}
            options={optList.map((a) => ({ value: a.url, label: a.title }))}
            showSearch optionFilterProp="label"
          />
          {node.source?.url && (
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4, wordBreak: 'break-all' }}>
              {node.source.url}
            </Text>
          )}
        </>
      )}

      {/* text node */}
      {node.type === 'text' && (
        <>
          <Divider plain style={{ margin: '12px 0' }} />
          <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>文字内容</Text>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} value={node.params?.text || ''}
            placeholder="输入要叠加在画面上的文字"
            onChange={(e) => patchParams({ text: e.target.value })} style={{ fontSize: 13 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, display: 'block', marginBottom: 3 }}>字号</Text>
              <InputNumber size="small" min={18} max={200} value={node.params?.font_size || 48}
                onChange={(v) => patchParams({ font_size: Number(v || 48) })} style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, display: 'block', marginBottom: 3 }}>动画</Text>
              <Select size="small" style={{ width: '100%' }} value={node.params?.animation || 'none'}
                options={ANIMATION_OPTIONS} onChange={(v) => patchParams({ animation: v })} />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 3 }}>文字颜色</Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="color" value={color} onChange={(e) => { setColor(e.target.value); patchParams({ text_color: e.target.value }); }}
                style={{ width: 46, height: 28, border: '1px solid #d9d9d9', borderRadius: 6, cursor: 'pointer' }} />
              <Text type="secondary" style={{ fontSize: 11 }}>{''}</Text>
            </div>
          </div>
        </>
      )}

      {/* text/audio position & timing */}
      {(node.type === 'text' || node.type === 'audio') && (
        <>
          <Divider plain style={{ margin: '12px 0' }} />
          <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>开始时间（秒）</Text>
          <InputNumber size="small" min={0} max={60} step={0.5} value={node.params?.start ?? 0}
            onChange={(v) => patchParams({ start: Number(v || 0) })} style={{ width: '100%' }} />
          {node.type === 'text' && (
            <>
              <Text style={{ fontSize: 12, display: 'block', marginTop: 12, marginBottom: 3 }}>水平位置 X（0-1）</Text>
              <Slider min={0} max={1} step={0.01} value={node.params?.x ?? 0.5}
                onChange={(v) => patchParams({ x: v })} tooltip={{ formatter: (v: any) => `${(Number(v) * 100).toFixed(0)}%` }} />
              <Text style={{ fontSize: 12, display: 'block', marginTop: 6, marginBottom: 3 }}>垂直位置 Y（0-1）</Text>
              <Slider min={0} max={1} step={0.01} value={node.params?.y ?? 0.5}
                onChange={(v) => patchParams({ y: v })} tooltip={{ formatter: (v: any) => `${(Number(v) * 100).toFixed(0)}%` }} />
            </>
          )}
          {node.type === 'audio' && (
            <div style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 12, display: 'block', marginBottom: 3 }}>音量 {node.params?.volume ?? 0.8}</Text>
              <Slider min={0} max={1} step={0.05} value={node.params?.volume ?? 0.8}
                onChange={(v) => patchParams({ volume: v })} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, display: 'block', marginBottom: 3 }}>淡入</Text>
                  <InputNumber size="small" min={0} max={10} step={0.5} value={node.params?.fade_in || 0}
                    onChange={(v) => patchParams({ fade_in: Number(v || 0) })} style={{ width: '100%' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, display: 'block', marginBottom: 3 }}>淡出</Text>
                  <InputNumber size="small" min={0} max={10} step={0.5} value={node.params?.fade_out || 0}
                    onChange={(v) => patchParams({ fade_out: Number(v || 0) })} style={{ width: '100%' }} />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* effect node */}
      {node.type === 'effect' && (
        <>
          <Divider plain style={{ margin: '12px 0' }} />
          <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>效果类型</Text>
          <Select size="small" style={{ width: '100%' }}
            value={node.params?.kind || 'transition'}
            options={[{ value: 'transition', label: '转场（两个视频之间）' }, { value: 'filter', label: '滤镜（作用到单个视频）' }]}
            onChange={(v) => patchParams({ kind: v })} />
          {node.params?.kind === 'transition' ? (
            <>
              <Text style={{ fontSize: 12, display: 'block', marginTop: 12, marginBottom: 4 }}>转场样式</Text>
              <Select size="small" style={{ width: '100%' }} value={node.params?.transition || 'fade'}
                options={TRANSITION_OPTIONS} onChange={(v) => patchParams({ transition: v })} />
              <Text style={{ fontSize: 12, display: 'block', marginTop: 12, marginBottom: 4 }}>转场时长（秒）</Text>
              <InputNumber size="small" min={0.2} max={2} step={0.1} value={node.params?.transition_duration || 0.5}
                onChange={(v) => patchParams({ transition_duration: Number(v || 0.5) })} style={{ width: '100%' }} />
            </>
          ) : (
            <>
              <Text style={{ fontSize: 12, display: 'block', marginTop: 12, marginBottom: 4 }}>滤镜效果</Text>
              <Select size="small" style={{ width: '100%' }} value={node.params?.filter || 'grayscale'}
                options={FILTER_OPTIONS} onChange={(v) => patchParams({ filter: v })} />
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
                把滤镜效果节点连到一个视频节点的输入口即可应用滤镜；连两段视频之间则变成转场。
              </Text>
            </>
          )}
        </>
      )}

      {/* output node */}
      {node.type === 'output' && (
        <>
          <Divider plain style={{ margin: '12px 0' }} />
          <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
            把主链最后一个视频/图片节点，以及文字、音频节点都连到这里作为成片输出。
          </Text>
        </>
      )}
    </div>
  );
}