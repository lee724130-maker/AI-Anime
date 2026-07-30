import { Card, Tag, Space, Typography, Button } from 'antd';
import { FireOutlined, ExperimentOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

const CATEGORY_LABELS: Record<string, string> = {
  product: '产品展示', holiday: '节日营销', brand: '品牌广告', character: '角色宣传', general: '通用',
};

interface TemplateCardProps {
  id: number; name: string; description: string; category: string;
  tags: string[]; thumbnail: string; usage_count: number;
}

export default function TemplateCard({ id, name, description, category, tags, thumbnail, usage_count }: TemplateCardProps) {
  const navigate = useNavigate();

  return (
    <Card hoverable style={{ borderRadius: 14, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', height: '100%' }}
      onClick={() => navigate(`/viral/templates/${id}`)}>
      <div style={{
        height: 140, borderRadius: 10, marginBottom: 12,
        background: thumbnail ? `url(${thumbnail}) center/cover` : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!thumbnail && <ExperimentOutlined style={{ fontSize: 40, color: 'rgba(255,255,255,0.4)' }} />}
      </div>
      <Title level={5} style={{ margin: '0 0 4px', fontSize: 15 }}>{name}</Title>
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8, lineHeight: 1.4 }}>
        {description || '暂无描述'}
      </Text>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space size={4}>
          <Tag style={{ borderRadius: 6, fontSize: 10 }}>{CATEGORY_LABELS[category] || category}</Tag>
          <Text type="secondary" style={{ fontSize: 11 }}>
            <FireOutlined /> {usage_count}
          </Text>
        </Space>
        <Button type="primary" size="small" style={{ borderRadius: 8, background: '#7c3aed', borderColor: '#7c3aed', fontSize: 11 }}
          onClick={e => { e.stopPropagation(); navigate(`/viral/templates/${id}`); }}>
          使用此模板
        </Button>
      </div>
    </Card>
  );
}
