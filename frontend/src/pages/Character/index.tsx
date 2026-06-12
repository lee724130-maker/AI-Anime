import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, List, Typography, Avatar, Space, Popconfirm, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, TeamOutlined, HomeOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title, Paragraph } = Typography;

export default function CharacterListPage() {
  const [characters, setCharacters] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const fetchCharacters = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/character/list');
      setCharacters(data);
    } catch {
      message.error('获取角色列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCharacters(); }, []);

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api/character/${id}`);
      message.success('删除成功');
      fetchCharacters();
    } catch {
      message.error('删除失败');
    }
  };

  return (
    <div>
      <div style={{
        background: 'linear-gradient(135deg, #ec4899, #f59e0b)',
        padding: '32px 24px', textAlign: 'center', borderRadius: '0 0 24px 24px', marginBottom: 24,
        position: 'relative',
      }}>
        <Button icon={<HomeOutlined />} onClick={() => navigate('/')}
          style={{ position: 'absolute', left: 24, top: 32, borderRadius: 20 }}>
          返回主页
        </Button>
        <TeamOutlined style={{ fontSize: 36, color: '#fff', marginBottom: 8 }} />
        <Title level={2} style={{ color: '#fff', margin: 0 }}>我的角色</Title>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <Button icon={<HomeOutlined />} onClick={() => navigate('/')}>返回主页</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/character/create')} size="large">创建角色</Button>
        </div>
        <List
          loading={loading}
          dataSource={characters}
          renderItem={(item: any) => (
            <Card style={{ marginBottom: 12, borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <Avatar size={40} icon={<UserOutlined />} src={item.avatar_url} />
                  <div>
                    <Link to={`/character/${item.id}`} style={{ fontSize: 16, fontWeight: 500 }}>{item.name}</Link>
                    {item.description && <Paragraph type="secondary" style={{ margin: 0 }}>{item.description.slice(0, 60)}{item.description.length > 60 ? '...' : ''}</Paragraph>}
                  </div>
                </Space>
                <Space>
                  <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/character/${item.id}`)}>编辑</Button>
                  <Popconfirm title="确定删除？" onConfirm={() => handleDelete(item.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                  </Popconfirm>
                </Space>
              </div>
            </Card>
          )}
          locale={{ emptyText: '暂无角色，点击上方按钮创建' }}
        />
      </div>
    </div>
  );
}
