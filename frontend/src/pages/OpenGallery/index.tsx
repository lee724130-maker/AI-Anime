import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Card, Tabs, Select, Input, Space, Typography, Tag, Alert,
  Row, Col, Image, Pagination, message, Spin, Empty, Tooltip,
} from 'antd';
import { ArrowLeftOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;

const API_BASE = import.meta.env.VITE_API_BASE || '';
const getUrl = (p: string | null | undefined) => (p ? (p.startsWith('http') ? p : API_BASE + p) : '');

interface GalleryItem {
  kind: 'face' | 'styling' | 'costume';
  id: string;
  title: string;
  hair?: string;
  catName?: string;
  color?: string;
  main?: string;
  tags?: string[];
  thumb: string;
  full: string;
}

const PAGE_SIZE = 48;

export default function OpenGalleryPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [faces, setFaces] = useState<GalleryItem[]>([]);
  const [costumes, setCostumes] = useState<GalleryItem[]>([]);
  const [tab, setTab] = useState<'face' | 'styling' | 'costume'>('face');
  const [hair, setHair] = useState<string | undefined>();
  const [cat, setCat] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [imported, setImported] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.get('/api/comic-studio/open-gallery')
      .then(({ data }) => {
        setFaces(data.faces || []);
        setCostumes(data.costumes || []);
      })
      .catch((e) => message.error(e?.response?.data?.message || '图鉴目录加载失败'))
      .finally(() => setLoading(false));
  }, []);

  const hairOptions = useMemo(
    () => [...new Set(faces.map((x) => x.hair).filter(Boolean))].map((h) => ({ value: h, label: h })),
    [faces],
  );
  const catOptions = useMemo(
    () => [...new Map(costumes.map((x) => [x.catName, true])).keys()].map((c) => ({ value: c, label: c })),
    [costumes],
  );

  const pool = useMemo(() => {
    if (tab === 'costume') return costumes;
    return faces.filter((x) => (tab === 'face' ? x.kind === 'face' : x.kind === 'styling'));
  }, [tab, faces, costumes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool.filter((x) => {
      if (tab !== 'costume' && hair && x.hair !== hair) return false;
      if (tab === 'costume' && cat && x.catName !== cat) return false;
      if (!q) return true;
      const hay = [x.id, x.title, x.hair, x.catName, x.color, x.main, ...(x.tags || [])].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [pool, hair, cat, query, tab]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /** 导入原图到本地 /static/gallery/，并复制路径到剪贴板 */
  const importImage = async (item: GalleryItem) => {
    setBusyId(item.id);
    try {
      const { data } = await api.post('/api/comic-studio/open-gallery/import', { url: item.full, id: item.id });
      const localPath = data.url;
      setImported((s) => ({ ...s, [item.id]: localPath }));
      try {
        await navigator.clipboard.writeText(localPath);
        message.success(`已导入并复制路径：${localPath}`);
      } catch {
        message.success(`已导入：${localPath}（请手动复制下方路径）`);
      }
    } catch (e: any) {
      message.error(e?.response?.data?.message || '导入失败');
    } finally { setBusyId(null); }
  };

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 24px 60px' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')} />
          <Title level={3} style={{ margin: 0 }}>开源图片</Title>
          <Tag color="purple">RuiC-PoseAtlas · CC0 · 共 {faces.length + costumes.length} 张</Tag>
        </Space>
        <Button onClick={() => navigate('/comic-studio')}>去角色设定本</Button>
      </Space>

      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message="选图 → 导入 → 粘贴到设定本"
        description="点「导入并复制路径」会把原图下载到本项目的 /static/gallery/ 并自动复制路径；然后到 漫画工作室 → 角色设定本，把路径粘进对应图像块的「素材图」输入框点「应用」（0 积分）。图片来源 RuiC-PoseAtlas（人脸/造型）与 AI Model Face Database（CC0 1.0），可自由使用。" />

      <Card>
        <Tabs
          activeKey={tab}
          onChange={(k) => { setTab(k as any); setPage(1); }}
          items={[
            { key: 'face', label: `人脸（${faces.filter((x) => x.kind === 'face').length}）` },
            { key: 'styling', label: `造型（${faces.filter((x) => x.kind === 'styling').length}）` },
            { key: 'costume', label: `服装（${costumes.length}）` },
          ]}
          tabBarExtraContent={
            <Space>
              {tab !== 'costume' && (
                <Select allowClear placeholder="发型" style={{ width: 130 }} options={hairOptions}
                  value={hair ?? undefined} onChange={(v) => { setHair(v); setPage(1); }} />
              )}
              {tab === 'costume' && (
                <Select allowClear placeholder="季节/类目" style={{ width: 130 }} options={catOptions}
                  value={cat ?? undefined} onChange={(v) => { setCat(v); setPage(1); }} />
              )}
              <Input.Search allowClear placeholder="搜索编号 / 颜色 / 关键词" style={{ width: 220 }}
                onSearch={(v) => { setQuery(v); setPage(1); }} />
            </Space>
          }
        >
          {loading ? <Spin style={{ display: 'block', margin: '60px auto' }} />
            : pageItems.length === 0 ? <Empty description="没有匹配的图片" />
              : (
                <>
                  <Row gutter={[12, 12]}>
                    {pageItems.map((item) => (
                      <Col key={`${item.kind}-${item.id}`} xs={12} sm={8} md={6} lg={4}>
                        <Card size="small" hoverable
                          cover={
                            <Image
                              alt={item.title}
                              src={getUrl(item.thumb)}
                              preview={{ src: getUrl(item.full) }}
                              style={{ aspectRatio: '2/3', objectFit: 'cover', width: '100%' }}
                            />
                          }>
                          <Space direction="vertical" size={2} style={{ width: '100%' }}>
                            <Tooltip title={item.title}>
                              <Text ellipsis style={{ fontSize: 12 }}>{item.title}</Text>
                            </Tooltip>
                            <Text type="secondary" style={{ fontSize: 11 }} ellipsis>{item.id}</Text>
                            {imported[item.id] && (
                              <Tag color="success" style={{ fontSize: 11, maxWidth: '100%' }} ellipsis>
                                {imported[item.id]}
                              </Tag>
                            )}
                            <Button size="small" block icon={<DownloadOutlined />}
                              loading={busyId === item.id}
                              onClick={() => importImage(item)}>
                              导入并复制路径
                            </Button>
                          </Space>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                  <div style={{ marginTop: 16, textAlign: 'center' }}>
                    <Pagination current={page} pageSize={PAGE_SIZE} total={filtered.length}
                      onChange={(p) => { setPage(p); window.scrollTo({ top: 0 }); }}
                      showSizeChanger={false} showTotal={(t) => `共 ${t} 张`} />
                  </div>
                </>
              )}
        </Tabs>
      </Card>
    </div>
  );
}
