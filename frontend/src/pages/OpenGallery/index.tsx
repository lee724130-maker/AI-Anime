import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Card, Tabs, Select, Input, Space, Typography, Tag, Alert,
  Row, Col, Image, Pagination, message, Spin, Empty, Tooltip,
} from 'antd';
import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;

const API_BASE = import.meta.env.VITE_API_BASE || '';
const getUrl = (p: string | null | undefined) => (p ? (p.startsWith('http') ? p : API_BASE + p) : '');

interface GalleryItem {
  kind: 'face' | 'styling' | 'costume' | 'pose';
  id: string;
  title: string;
  hair?: string;
  catName?: string;
  color?: string;
  main?: string;
  tags?: string[];
  series?: string;
  seriesName?: string;
  category?: string;
  angle?: string;
  angleName?: string;
  no?: string;
  thumb: string;
  full: string;
}

const PAGE_SIZE = 48;

export default function OpenGalleryPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [faces, setFaces] = useState<GalleryItem[]>([]);
  const [costumes, setCostumes] = useState<GalleryItem[]>([]);
  const [poses, setPoses] = useState<GalleryItem[]>([]);
  const [tab, setTab] = useState<'face' | 'styling' | 'costume' | 'pose'>('face');
  const [hair, setHair] = useState<string | undefined>();
  const [cat, setCat] = useState<string | undefined>();
  const [poseSeries, setPoseSeries] = useState<string | undefined>();
  const [poseCat, setPoseCat] = useState<string | undefined>();
  const [poseAngle, setPoseAngle] = useState<string | undefined>();
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
        setPoses(data.poses || []);
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
  const poseSeriesOptions = useMemo(
    () => [...new Map(poses.map((x) => [x.series, x.seriesName])).entries()].map(([value, label]) => ({ value, label: label || value })),
    [poses],
  );
  const poseCatOptions = useMemo(
    () => [...new Set(poses.map((x) => x.category).filter(Boolean))].map((c) => ({ value: c, label: c })),
    [poses],
  );
  const poseAngleOptions = useMemo(
    () => [...new Map(poses.map((x) => [x.angle, x.angleName])).entries()].map(([value, label]) => ({ value, label: label || value })),
    [poses],
  );

  const pool = useMemo(() => {
    if (tab === 'costume') return costumes;
    if (tab === 'pose') return poses;
    return faces.filter((x) => (tab === 'face' ? x.kind === 'face' : x.kind === 'styling'));
  }, [tab, faces, costumes, poses]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool.filter((x) => {
      if (tab === 'pose') {
        if (poseSeries && x.series !== poseSeries) return false;
        if (poseCat && x.category !== poseCat) return false;
        if (poseAngle && x.angle !== poseAngle) return false;
      } else if (tab === 'costume') {
        if (cat && x.catName !== cat) return false;
      } else if (hair && x.hair !== hair) return false;
      if (!q) return true;
      const hay = [x.id, x.title, x.hair, x.catName, x.color, x.main, x.category, x.angleName, x.no, ...(x.tags || [])].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [pool, hair, cat, query, tab, poseSeries, poseCat, poseAngle]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // antd v5/v6 的 Tabs 传入 items 后，JSX children 会被忽略；内容必须放在 items[].children。
  const galleryContent = loading ? <Spin style={{ display: 'block', margin: '60px auto' }} />
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
                      <Tag color="success" style={{ fontSize: 11, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
      );

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
          <Tag color="purple">共 {faces.length + costumes.length + poses.length} 张素材</Tag>
        </Space>
        <Button onClick={() => navigate('/comic-studio')}>去角色设定本</Button>
      </Space>

      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message="选图 → 导入 → 粘贴到设定本"
        description="点「导入并复制路径」会把原图下载到本项目的 /static/gallery/ 并自动复制路径；然后到 漫画工作室 → 角色设定本，把路径粘进对应图像块的「素材图」输入框点「应用」（0 积分）。素材可自由使用。" />

      <Card>
        <Tabs
          activeKey={tab}
          onChange={(k) => { setTab(k as any); setPage(1); setPoseSeries(undefined); setPoseCat(undefined); setPoseAngle(undefined); }}
          items={[
            { key: 'face', label: `人脸（${faces.filter((x) => x.kind === 'face').length}）`, children: galleryContent },
            { key: 'styling', label: `造型（${faces.filter((x) => x.kind === 'styling').length}）`, children: galleryContent },
            { key: 'costume', label: `服装（${costumes.length}）`, children: galleryContent },
            { key: 'pose', label: `姿势（${poses.length}）`, children: galleryContent },
          ]}
          tabBarExtraContent={
            <Space wrap>
              {tab === 'pose' && (
                <>
                  <Select allowClear placeholder="系列" style={{ width: 120 }} options={poseSeriesOptions}
                    value={poseSeries} onChange={(v) => { setPoseSeries(v); setPage(1); }} />
                  <Select allowClear placeholder="动作类目" style={{ width: 130 }} options={poseCatOptions}
                    value={poseCat} onChange={(v) => { setPoseCat(v); setPage(1); }} />
                  <Select allowClear placeholder="角度" style={{ width: 100 }} options={poseAngleOptions}
                    value={poseAngle} onChange={(v) => { setPoseAngle(v); setPage(1); }} />
                </>
              )}
              {tab !== 'costume' && tab !== 'pose' && (
                <Select allowClear placeholder="发型" style={{ width: 130 }} options={hairOptions}
                  value={hair ?? undefined} onChange={(v) => { setHair(v); setPage(1); }} />
              )}
              {tab === 'costume' && (
                <Select allowClear placeholder="季节/类目" style={{ width: 130 }} options={catOptions}
                  value={cat ?? undefined} onChange={(v) => { setCat(v); setPage(1); }} />
              )}
              <Input.Search allowClear placeholder="搜索编号 / 类目 / 关键词" style={{ width: 220 }}
                onSearch={(v) => { setQuery(v); setPage(1); }} />
            </Space>
          }
        />
      </Card>
    </div>
  );
}
