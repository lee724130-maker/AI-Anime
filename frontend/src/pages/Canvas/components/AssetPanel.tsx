import { useState } from 'react';
import { Typography } from 'antd';
import './asset-card.css';   // 跨页共用组件样式，作用域 .asset-card*（详见文件头）

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
      className="asset-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/json', JSON.stringify(item));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => onClick(item)}
    >
      {isVideo ? (
        <div className="asset-card__media asset-card__media--video">
          <video src={src} muted playsInline preload="metadata"
            onLoadedData={e => { (e.target as HTMLVideoElement).currentTime = 0.1; }}
            onError={() => setFailed(true)} />
        </div>
      ) : isAudio ? (
        <div className="asset-card__media asset-card__media--audio">
          <div className="asset-card__audio-in">
            <span className="asset-card__audio-icon">🎵</span>
            <Text strong className="asset-card__audio-label">音频</Text>
          </div>
        </div>
      ) : (
        <div className="asset-card__media asset-card__media--image">
          {/* 加载失败时把自己藏掉：failed 只会让 isVideo/isAudio 变 false，
              仍落回这个 img 分支，不藏就会露浏览器裂图图标（批次D 同源缺陷） */}
          <img src={src} alt="" onError={(e) => { setFailed(true); (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
        </div>
      )}
      <div className="asset-card__foot">
        <span className="asset-card__badge" data-type={item.type}>
          {item.type === 'video' ? '视频' : item.type === 'audio' ? '音频' : '图片'}
        </span>
        <Text className="asset-card__title" ellipsis={{ tooltip: item.title }}>
          {item.title}
        </Text>
      </div>
    </div>
  );
}