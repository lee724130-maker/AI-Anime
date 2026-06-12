import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Typography, Tag, Space, Popconfirm, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, FileTextOutlined, HomeOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title } = Typography;

export default function ScriptListPage() {
  const [scripts, setScripts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const fetchScripts = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/script/list');
      setScripts(data);
    } catch {
      message.error('获取剧本列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchScripts(); }, []);

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api/script/${id}`);
      message.success('删除成功');
      fetchScripts();
    } catch {
      message.error('删除失败');
    }
  };

  const statusTag: Record<string, string> = { draft: '草稿', processing: '处理中', completed: '已完成' };

  return (
    <div>
      <div style={{
        background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
        padding: '32px 24px', textAlign: 'center', borderRadius: '0 0 24px 24px', marginBottom: 24,
        position: 'relative',
      }}>
        <Button icon={<HomeOutlined />} onClick={() => navigate('/')}
          style={{ position: 'absolute', left: 24, top: 32, borderRadius: 20 }}>
          返回主页
        </Button>
        <FileTextOutlined style={{ fontSize: 36, color: '#fff', marginBottom: 8 }} />
        <Title level={2} style={{ color: '#fff', margin: 0 }}>我的剧本</Title>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <Button icon={<HomeOutlined />} onClick={() => navigate('/')}>返回主页</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/script/create')} size="large">新建剧本</Button>
        </div>
        {loading ? <div style={{ textAlign: 'center', padding: 48, color: '#bbb' }}>加载中...</div> : (
          scripts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#bbb' }}>暂无剧本，点击上方按钮创建</div>
          ) : (
            scripts.map((item: any) => (
              <Card key={item.id} style={{ marginBottom: 12, borderRadius: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Link to={`/script/${item.id}`} style={{ fontSize: 16, fontWeight: 500 }}>{item.title || '未命名剧本'}</Link>
                    <Tag style={{ marginLeft: 12 }}>{statusTag[item.status] || item.status}</Tag>
                  </div>
                  <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/script/${item.id}`)}>编辑</Button>
                    <Popconfirm title="确定删除？" onConfirm={() => handleDelete(item.id)}>
                      <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                  </Space>
                </div>
              </Card>
            ))
          )
        )}
      </div>
    </div>
  );
}
