import { useState } from 'react';
import { ExperimentOutlined } from '@ant-design/icons';

const isVideoUrl = (src: string) => /\.(mp4|webm|mov)(\?|$)/i.test(src);

export default function CoverThumb({
  src,
  height,
  width = '100%',
  radius = 10,
}: {
  src?: string | null;
  height: number;
  width?: number | string;
  radius?: number;
}) {
  const [failed, setFailed] = useState(false);
  const boxStyle: React.CSSProperties = {
    width, height, borderRadius: radius,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', flexShrink: 0,
  };

  if (!src || failed) {
    return (
      <div style={boxStyle}>
        <ExperimentOutlined style={{ fontSize: 32, color: 'rgba(255,255,255,0.4)' }} />
      </div>
    );
  }

  if (isVideoUrl(src)) {
    return (
      <div style={{ ...boxStyle, background: '#000' }}>
        <video
          src={src} muted playsInline preload="auto"
          onLoadedData={e => { (e.target as HTMLVideoElement).currentTime = 0.1; }}
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    );
  }

  return (
    <div style={{ ...boxStyle, background: '#f0f0f0' }}>
      <img src={src} alt="" onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  );
}
