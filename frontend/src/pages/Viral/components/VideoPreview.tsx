import { useState } from 'react';
import { Modal, Button, Space } from 'antd';
import { FullscreenOutlined, DownloadOutlined } from '@ant-design/icons';

const BASE_URL = 'http://localhost:3000';

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
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <video src={fullUrl} controls
          style={{ width, maxWidth, borderRadius: 10, display: 'block' }} />
        <Button type="text" size="small" icon={<FullscreenOutlined />}
          onClick={() => setFullscreen(true)}
          style={{ position: 'absolute', top: 8, right: 8, color: '#fff', background: 'rgba(0,0,0,0.3)', borderRadius: 8 }} />
      </div>
      <Space>
        <Button type="primary" size="small" icon={<DownloadOutlined />} href={fullUrl} target="_blank"
          style={{ borderRadius: 8, background: '#7c3aed', borderColor: '#7c3aed' }}>
          下载视频
        </Button>
      </Space>
      <Modal open={fullscreen} onCancel={() => setFullscreen(false)} footer={null} width="90vw"
        centered style={{ maxWidth: 800 }}>
        <video src={fullUrl} controls autoPlay
          style={{ width: '100%', borderRadius: 8 }} />
      </Modal>
    </>
  );
}
