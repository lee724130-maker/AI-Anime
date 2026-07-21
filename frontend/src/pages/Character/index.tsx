import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, List, Typography, Avatar, Space, Popconfirm, message, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import api from '../../services/api';
import AppHeader from '../../components/AppHeader';

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
      <AppHeader />
      <div style={{ maxWidth: 850, margin: '0 auto', padding: '24px 24px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <Title level={2} style={{ margin: 0 }}>我的角色</Title>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button className="back-btn" icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')}>返回</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/character/create')}>创建角色</Button>
        </div>
      </div>
      <div style={{ maxWidth: 850, margin: '0 auto', padding: '0 24px 24px' }}>
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
                    {item.reference_image_anime && <Tag color="purple" style={{ marginLeft: 4 }}>动漫参考图</Tag>}
                    {item.reference_image_realistic && <Tag color="blue" style={{ marginLeft: 4 }}>真人参考图</Tag>}
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
