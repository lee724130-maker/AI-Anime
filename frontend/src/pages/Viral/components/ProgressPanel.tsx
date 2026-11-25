import { Typography, Progress, Tag, Tooltip } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, ClockCircleOutlined, FileTextOutlined, PictureOutlined, VideoCameraOutlined } from '@ant-design/icons';
import '../project-detail.css';   // 与 ProjectDetail 共用同一份样式（Vite 去重，只注入一次）

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
    <div className="vpp-root">
      <div>
        <Text className="vpp-label">整体进度</Text>
        <Progress percent={progress} strokeColor="var(--primary)" className="vpp-bar" />
      </div>

      {scenes && scenes.length > 0 && (
        <div>
          <Text className="vpp-label">场景状态</Text>
          <div className="vpp-list">
            {scenes.map((s, i) => (
              <div key={i} className="vpp-item">
                <span className="vpp-num">{i + 1}</span>
                <Tag style={{ borderRadius: 6, margin: 0, fontSize: 10 }}>
                  {TYPE_ICONS[s.type] || null} {s.type}
                </Tag>
                <Text className="vpp-name" ellipsis>{s.name}</Text>
                {s.status === 'completed' && <CheckCircleOutlined className="vpp-ico--done" />}
                {s.status === 'processing' && <SyncOutlined spin className="vpp-ico--run" />}
                {s.status === 'failed' && (
                  <Tooltip title={s.error}>
                    <CloseCircleOutlined className="vpp-ico--fail" />
                  </Tooltip>
                )}
                {!s.status && <ClockCircleOutlined className="vpp-ico--wait" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
