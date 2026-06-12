import { useState } from 'react';
import { Card, Button, Space, Typography, Empty, Spin } from 'antd';
import {
  PlayCircleOutlined,
  DownloadOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

interface VideoPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  width?: string | number;
  onDownload?: () => void;
}

export default function VideoPlayer({
  src,
  poster,
  title,
  width = '100%',
  onDownload,
}: VideoPlayerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  if (!src) {
    return <Empty description="暂无视频" />;
  }

  if (error) {
    return (
      <Card style={{ textAlign: 'center', padding: 40 }}>
        <Empty description="视频加载失败">
          <Button onClick={() => { setError(false); setLoading(true); }}>
            重新加载
          </Button>
        </Empty>
      </Card>
    );
  }

  return (
    <Card
      title={title || '视频预览'}
      extra={
        <Space>
          {onDownload && (
            <Button icon={<DownloadOutlined />} size="small" onClick={onDownload}>
              下载
            </Button>
          )}
        </Space>
      }
      style={{ borderRadius: 12, overflow: 'hidden' }}
      styles={{ body: { padding: 0 } }}
    >
      <div style={{ position: 'relative', background: '#000', borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
        {loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.8)',
              zIndex: 2,
            }}
          >
            <Spin size="large" />
          </div>
        )}

        <video
          src={src}
          poster={poster}
          controls
          style={{ width, maxHeight: 600, display: 'block', margin: '0 auto' }}
          onLoadedData={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true); }}
          controlsList="nodownload"
        />

        {/* Stylish overlay with title */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            padding: '4px 12px',
            borderRadius: 6,
            fontSize: 13,
            pointerEvents: 'none',
          }}
        >
          <PlayCircleOutlined style={{ marginRight: 6 }} />
          {title || 'AI 动漫短剧'}
        </div>
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          由 AI 动漫短剧平台生成
        </Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          竖屏 9:16 · 抖音适配
        </Text>
      </div>
    </Card>
  );
}
