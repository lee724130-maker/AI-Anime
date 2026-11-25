import { useState } from 'react';
import { ExperimentOutlined } from '@ant-design/icons';
import './cover-thumb.css';   // 共用组件样式（作用域 .cth-，详见文件头注释）

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
  /* width / height / radius 是调用方传入的动态尺寸，只有这三项保留内联；颜色一律走 CSS 类 */
  const sizeStyle: React.CSSProperties = { width, height, borderRadius: radius };

  if (!src || failed) {
    return (
      <div className="cth-box" style={sizeStyle}>
        <ExperimentOutlined className="cth-icon" />
      </div>
    );
  }

  if (isVideoUrl(src)) {
    return (
      <div className="cth-box cth-box--video" style={sizeStyle}>
        <video
          className="cth-media"
          src={src} muted playsInline preload="metadata"
          onLoadedData={e => { (e.target as HTMLVideoElement).currentTime = 0.1; }}
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className="cth-box cth-box--image" style={sizeStyle}>
      <img className="cth-media" src={src} alt="" onError={() => setFailed(true)} />
    </div>
  );
}
