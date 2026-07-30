import { useEffect, useState, useCallback } from 'react';
import { Modal, Tabs, Spin, Empty, Image, Button, Space, Typography, Row, Col, Input, message } from 'antd';
import { PictureOutlined, CheckCircleFilled, SearchOutlined } from '@ant-design/icons';
import api from '../../../services/api';

const { Text } = Typography;
const API_BASE = 'http://localhost:3000';

interface GlobalAsset {
  id: number; type: string; name: string; image_url: string; description: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  selected: string[];
  onSelect: (imageUrls: string[]) => void;
}

const TYPE_TABS = [
  { key: 'character', label: '角色' },
  { key: 'scene', label: '场景' },
  { key: 'prop', label: '道具' },
];

export default function GlobalAssetPicker({ open, onClose, selected, onSelect }: Props) {
  const [tab, setTab] = useState('character');
  const [assets, setAssets] = useState<GlobalAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('type', tab);
      params.set('limit', '100');
      if (search) params.set('keyword', search);
      const { data } = await api.get(`/api/global-assets?${params}`);
      setAssets(data.items || []);
    } catch { message.error('加载大资产库失败'); }
    setLoading(false);
  }, [tab, search]);

  useEffect(() => { if (open) fetchAssets(); }, [open, fetchAssets]);

  const localSelected = [...selected];

  const toggleAsset = (url: string) => {
    const idx = localSelected.indexOf(url);
    if (idx >= 0) localSelected.splice(idx, 1);
    else localSelected.push(url);
    onSelect(localSelected);
  };

  return (
    <Modal open={open} onCancel={onClose} title="从大资产库选择素材" width={700} footer={
      <Space>
        <Text type="secondary">已选 {selected.length} 张</Text>
        <Button type="primary" onClick={onClose}
          style={{ background: '#7c3aed', borderColor: '#7c3aed', borderRadius: 8 }}>
          确定
        </Button>
      </Space>
    }>
      <Input
        placeholder="搜索素材..."
        prefix={<SearchOutlined />}
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ borderRadius: 8, marginBottom: 12 }}
      />
      <Tabs activeKey={tab} onChange={setTab}
        items={TYPE_TABS.map(t => ({
          key: t.key, label: t.label,
          children: loading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> :
            assets.length === 0 ? <Empty description={`暂无${t.label}素材`} /> :
            <Row gutter={[12, 12]}>
              {assets.map(a => {
                const url = API_BASE + a.image_url;
                const isSelected = localSelected.includes(url);
                return (
                  <Col key={a.id} xs={12} sm={8} md={6}>
                    <div onClick={() => toggleAsset(url)}
                      style={{
                        borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                        border: isSelected ? '2px solid #7c3aed' : '2px solid transparent',
                        position: 'relative', background: '#f5f5f5',
                      }}>
                      {a.image_url ? (
                        <Image src={url} preview={false}
                          style={{ width: '100%', height: 100, objectFit: 'cover' }}
                          placeholder={<div style={{ height: 100, background: '#f0f0f0' }} />} />
                      ) : (
                        <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
                          <PictureOutlined style={{ fontSize: 28, color: '#ccc' }} />
                        </div>
                      )}
                      {isSelected && (
                        <CheckCircleFilled style={{
                          position: 'absolute', top: 4, right: 4, fontSize: 18, color: '#7c3aed',
                        }} />
                      )}
                      <div style={{ padding: '4px 6px' }}>
                        <Text style={{ fontSize: 11 }} ellipsis>{a.name}</Text>
                      </div>
                    </div>
                  </Col>
                );
              })}
            </Row>,
        }))}
      />
    </Modal>
  );
}
