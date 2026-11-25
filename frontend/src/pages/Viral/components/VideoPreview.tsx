import { useState } from 'react';
import { Modal, Button, Space } from 'antd';
import { FullscreenOutlined, DownloadOutlined } from '@ant-design/icons';
import '../project-detail.css';   // 与 ProjectDetail 共用同一份样式（Vite 去重，只注入一次）

const BASE_URL = import.meta.env.VITE_API_BASE || '';

interface Props {
  url: string;
  width?: number | string;
  maxWidth?: number;
}

export default function VideoPreview({ url, width = '100%', maxWidth = 600 }: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;

  return (
    <>
      <div className="vpv-wrap">
        <video className="vpv-player" src={fullUrl} controls style={{ width, maxWidth }} />
        <Button type="text" size="small" icon={<FullscreenOutlined />}
          onClick={() => setFullscreen(true)}
          className="vpv-fs" aria-label="全屏播放" />
      </div>
      <Space>
        <Button type="primary" size="small" icon={<DownloadOutlined />}
          href={fullUrl} target="_blank" rel="noreferrer"
          className="vpv-btn-dl">
          下载视频
        </Button>
      </Space>
      <Modal open={fullscreen} onCancel={() => setFullscreen(false)} footer={null} width="90vw"
        centered style={{ maxWidth: 800 }}>
        <video className="vpv-full" src={fullUrl} controls autoPlay />
      </Modal>
    </>
  );
}
