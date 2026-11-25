import { Typography, Button, Input, Select, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import '../create-template.css';   // 与 CreateTemplate 共用同一份样式（Vite 去重，只注入一次）

const { Text } = Typography;

let kidSeq = 0;
// 为场景注入稳定 key（_kid），防止增删后受控输入错位（焦点/IME 漂移到别的场景）
const ensureSceneKeys = (arr: SceneItem[]): SceneItem[] =>
  arr.map((s) => (s as any)._kid ? s : { ...s, _kid: `sc_${Date.now()}_${kidSeq++}` });

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
    onChange(ensureSceneKeys([...scenes, { name: '', duration: 3, description: '', type: 'image' }]));
  };
  const update = (i: number, field: string, value: any) => {
    const copy = scenes.map(s => ({ ...s }));
    (copy[i] as any)[field] = value;
    onChange(ensureSceneKeys(copy));
  };
  const remove = (i: number) => {
    onChange(ensureSceneKeys(scenes.filter((_, idx) => idx !== i)));
  };

  return (
    <div className="vse-root">
      <div className="vse-hd">
        <div className="vse-title"><span className="vse-bar" />场景分镜</div>
        <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addScene}>添加场景</Button>
      </div>
      {scenes.length === 0 ? (
        <div className="vse-blank">暂无场景，点击“添加场景”开始创建</div>
      ) : (
        <div className="vse-rows">
          {scenes.map((s, i) => (
            <div key={(s as any)._kid} className="vse-row">
              <div className="vse-row__hd">
                <Text className="vse-row__name">场景 {i + 1}</Text>
                <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(i)} />
              </div>
              <div className="vse-row__grid">
                <Input size="small" placeholder="场景名" value={s.name}
                  onChange={e => update(i, 'name', e.target.value)} />
                <Input size="small" type="number" placeholder="秒" value={s.duration}
                  onChange={e => update(i, 'duration', Number(e.target.value))}
                  suffix={<Tag className="vse-unit">s</Tag>} />
                <Select size="small" value={s.type} onChange={v => update(i, 'type', v)}
                  style={{ width: '100%' }} options={SCENE_TYPES} />
                <Input size="small" placeholder="场景描述（支持 {{变量名}} 替换）" value={s.description}
                  onChange={e => update(i, 'description', e.target.value)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
