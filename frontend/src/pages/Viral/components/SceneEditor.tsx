import { Typography, Card, Button, Space, Input, Row, Col, Select, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';

const { Text } = Typography;

export interface SceneItem {
  name: string; duration: number; description: string; type: string;
}

interface Props {
  scenes: SceneItem[];
  onChange: (scenes: SceneItem[]) => void;
}

const SCENE_TYPES = [
  { value: 'image', label: '图片生成' },
  { value: 'video', label: '视频生成' },
  { value: 'text', label: '文字动画' },
];

export default function SceneEditor({ scenes, onChange }: Props) {
  const addScene = () => {
    onChange([...scenes, { name: '', duration: 3, description: '', type: 'image' }]);
  };
  const update = (i: number, field: string, value: any) => {
    const copy = scenes.map(s => ({ ...s }));
    (copy[i] as any)[field] = value;
    onChange(copy);
  };
  const remove = (i: number) => {
    onChange(scenes.filter((_, idx) => idx !== i));
  };

  return (
    <Card style={{ borderRadius: 14, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
      title={<Space><div style={{ width: 3, height: 16, background: '#7c3aed', borderRadius: 2 }} />场景分镜</Space>}
      extra={<Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addScene}>添加场景</Button>}>
      {scenes.map((s, i) => (
        <div key={i} style={{
          padding: 12, marginBottom: 8, borderRadius: 10,
          background: '#fafafa', border: '1px solid #f0f0f0',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text strong style={{ fontSize: 13 }}>场景 {i + 1}</Text>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(i)} />
          </div>
          <Row gutter={8}>
            <Col span={6}>
              <Input size="small" placeholder="场景名" value={s.name}
                onChange={e => update(i, 'name', e.target.value)} style={{ borderRadius: 6 }} />
            </Col>
            <Col span={3}>
              <Input size="small" type="number" placeholder="秒" value={s.duration}
                onChange={e => update(i, 'duration', Number(e.target.value))} style={{ borderRadius: 6 }} suffix={<Tag style={{ marginRight: -4, border: 'none', fontSize: 10 }}>s</Tag>} />
            </Col>
            <Col span={6}>
              <Select size="small" value={s.type} onChange={v => update(i, 'type', v)}
                style={{ width: '100%' }} options={SCENE_TYPES} />
            </Col>
            <Col span={9}>
              <Input size="small" placeholder="场景描述（支持 {{变量名}} 替换）" value={s.description}
                onChange={e => update(i, 'description', e.target.value)} style={{ borderRadius: 6 }} />
            </Col>
          </Row>
        </div>
      ))}
      {scenes.length === 0 && (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <Text type="secondary">暂无场景，点击"添加场景"开始创建</Text>
        </div>
      )}
    </Card>
  );
}
