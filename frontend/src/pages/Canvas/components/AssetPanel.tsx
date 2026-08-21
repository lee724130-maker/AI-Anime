import { useState } from 'react';
import { Typography } from 'antd';

const { Text } = Typography;

export interface AssetItem {
  kind: string;         // upload | ai_history | global_asset | viral | drama
  type: 'video' | 'image' | 'audio';
  url: string;
  title: string;
  thumbnail?: string;
  duration?: number;
  ref_id?: number;
}

const isVideoUrl = (src: string) => /\.(mp4|webm|mov)(\?|$)/i.test(src);
const isAudioUrl = (src: string) => /\.(mp3|wav|m4a|flac|ogg)(\?|$)/i.test(src);

export default function AssetCard({
  item,
  onClick,
}: {
  item: AssetItem;
  onClick: (item: AssetItem) => void;
}) {
  const [failed, setFailed] = useState(false);
  const src = item.thumbnail || item.url;
  const isVideo = isVideoUrl(src) && !failed;
  const isAudio = isAudioUrl(src) && !failed;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/json', JSON.stringify(item));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => onClick(item)}
      style={{ cursor: 'pointer', border: '1px solid #f0f0f0', borderRadius: 10, padding: 6, background: '#fff', transition: 'all .2s' }}
    >
      {isVideo ? (
        <div style={{ borderRadius: 8, overflow: 'hidden', background: '#111', height: 60 }}>
          <video src={src} muted playsInline preload="metadata"
            onLoadedData={e => { (e.target as HTMLVideoElement).currentTime = 0.1; }}
            onError={() => setFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      ) : isAudio ? (
        <div style={{ borderRadius: 8, overflow: 'hidden', background: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 20 }}>🔊</span>
            <Text strong style={{ fontSize: 12 }}>音频</Text>
          </div>
        </div>
      ) : (
        <div style={{ borderRadius: 8, overflow: 'hidden', background: '#f0f0f0', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={src} alt="" onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{
          fontSize: 9, padding: '1px 5px', borderRadius: 4,
          background: item.type === 'video' ? '#e6f4ff' : item.type === 'audio' ? '#e0f7fa' : '#f6ffed',
          color: item.type === 'video' ? '#1677ff' : item.type === 'audio' ? '#006064' : '#52c41a', flexShrink: 0,
        }}>
          {item.type === 'video' ? '视频' : item.type === 'audio' ? '音频' : '图片'}
        </span>
        <Text style={{ fontSize: 11, color: '#888', flex: 1 }} ellipsis={{ tooltip: item.title }}>
          {item.title}
        </Text>
      </div>
    </div>
  );
}