import { Typography, Card, Button, Input, Select } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';

const { Text } = Typography;

export interface VariableItem {
  key: string; label: string; type: string; placeholder: string; required: boolean; options?: string[];
}

interface Props {
  variables: VariableItem[];
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  onSubmit: () => void;
  submitting: boolean;
}

export default function VariableForm({ variables, values, onChange, onSubmit, submitting }: Props) {
  return (
    <Card style={{ borderRadius: 14, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 16 }}>替换内容</Text>

      {variables.map(v => (
        <div key={v.key} style={{ marginBottom: 16 }}>
          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
            {v.label} {v.required && <Text type="danger" style={{ fontSize: 12 }}>*</Text>}
          </Text>
          {v.type === 'textarea' ? (
            <Input.TextArea rows={3} placeholder={v.placeholder}
              value={values[v.key] || ''}
              onChange={e => onChange(v.key, e.target.value)}
              style={{ borderRadius: 8 }} />
          ) : v.type === 'select' ? (
            <Select value={values[v.key] || ''} onChange={v => onChange(v.key, v)}
              style={{ width: '100%', borderRadius: 8 }}
              options={(v.options || []).map(o => ({ value: o, label: o }))} />
          ) : (
            <Input placeholder={v.placeholder}
              value={values[v.key] || ''}
              onChange={e => onChange(v.key, e.target.value)}
              style={{ borderRadius: 8 }} />
          )}
        </div>
      ))}

      {variables.length === 0 && (
        <Text type="secondary" style={{ fontSize: 13 }}>此模板无需替换内容</Text>
      )}

      <Button type="primary" block size="large" loading={submitting} onClick={onSubmit}
        icon={<ThunderboltOutlined />}
        style={{ borderRadius: 10, background: '#7c3aed', borderColor: '#7c3aed', height: 44, marginTop: 8 }}>
        创建并生成
      </Button>
    </Card>
  );
}
