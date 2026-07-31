import { Typography, Progress, Tag, Space, Tooltip } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, ClockCircleOutlined, FileTextOutlined, PictureOutlined, VideoCameraOutlined } from '@ant-design/icons';

const { Text } = Typography;

const TYPE_ICONS: Record<string, any> = {
  text: <FileTextOutlined />,
  image: <PictureOutlined />,
  video: <VideoCameraOutlined />,
};

interface SceneStatus {
  name: string; status: string; type: string; error?: string; duration?: number;
}

interface Props {
  progress: number;
  status: string;
  scenes?: SceneStatus[];
}

export default function ProgressPanel({ progress, scenes }: Props) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>整体进度</Text>
        <Progress percent={progress} strokeColor="#7c3aed" style={{ maxWidth: 400 }} />
      </div>

      {scenes && scenes.length > 0 && (
        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>场景状态</Text>
          <Space direction="vertical" style={{ width: '100%' }}>
            {scenes.map((s, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', background: '#f9f9fb', borderRadius: 8,
              }}>
                <span style={{
                  background: '#7c3aed20', color: '#7c3aed', borderRadius: '50%',
                  width: 24, height: 24, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontWeight: 600, fontSize: 11, flexShrink: 0,
                }}>{i + 1}</span>
                <Tag style={{ borderRadius: 6, margin: 0, fontSize: 10 }}>
                  {TYPE_ICONS[s.type] || null} {s.type}
                </Tag>
                <Text style={{ fontSize: 12, flex: 1 }} ellipsis>{s.name}</Text>
                {s.status === 'completed' && <CheckCircleOutlined style={{ color: '#52c41a' }} />}
                {s.status === 'processing' && <SyncOutlined spin style={{ color: '#7c3aed' }} />}
                {s.status === 'failed' && (
                  <Tooltip title={s.error}>
                    <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                  </Tooltip>
                )}
                {!s.status && <ClockCircleOutlined style={{ color: '#bbb' }} />}
              </div>
            ))}
          </Space>
        </div>
      )}
    </div>
  );
}
