import { useEffect, useState, useCallback } from 'react';
import { Modal, Tabs, Spin, Empty, Image, Button, Typography, Input, message } from 'antd';
import { PictureOutlined, CheckCircleFilled, SearchOutlined } from '@ant-design/icons';
import api from '../../../services/api';
import '../template-detail.css';   // 与 TemplateDetail 共用同一份样式（Vite 去重，只注入一次）

const { Text } = Typography;
const API_BASE = import.meta.env.VITE_API_BASE || '';

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
      <div className="vgp-foot">
        <Text className="vgp-foot__count">已选 {selected.length} 张</Text>
        <Button type="primary" onClick={onClose} className="vgp-ok">
          确定
        </Button>
      </div>
    }>
      <Input
        className="vgp-search"
        placeholder="搜索素材..."
        prefix={<SearchOutlined />}
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <Tabs activeKey={tab} onChange={setTab}
        items={TYPE_TABS.map(t => ({
          key: t.key, label: t.label,
          children: loading ? <div className="vgp-loading"><Spin /></div> :
            assets.length === 0 ? <Empty description={`暂无${t.label}素材`} /> :
            <div className="vgp-grid">
              {assets.map(a => {
                const url = a.image_url?.startsWith('http') ? a.image_url : API_BASE + a.image_url;
                const isSelected = localSelected.includes(url);
                return (
                  <div key={a.id} className="vgp-cell" data-on={isSelected ? '1' : '0'}
                    onClick={() => toggleAsset(url)}>
                    {a.image_url ? (
                      <Image className="vgp-cell__img" src={url} preview={false}
                        placeholder={<div className="vgp-cell__ph" />}
                        onError={(e) => {
                          /* 同 TemplateDetail 的参考帧：库里登记的文件可能已不在磁盘上，
                             藏掉裂图，露出下面的令牌占位底 */
                          (e.target as HTMLImageElement).style.visibility = 'hidden';
                        }} />
                    ) : (
                      <div className="vgp-cell__empty"><PictureOutlined /></div>
                    )}
                    {isSelected && <CheckCircleFilled className="vgp-cell__tick" />}
                    <Text className="vgp-cell__name" ellipsis>{a.name}</Text>
                  </div>
                );
              })}
            </div>,
        }))}
      />
    </Modal>
  );
}
