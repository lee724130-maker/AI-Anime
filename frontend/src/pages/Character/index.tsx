import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Typography, Avatar, Popconfirm, message, Tag, Empty, Spin } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import api from '../../services/api';
import './character.css';   // 本页质感改造样式（作用域 .chr-root，详见文件头注释）

const { Paragraph } = Typography;

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
    <div className="chr-root">
      {/* 顶栏：返回圆钮 + 标题 | 创建（原「居中大标题 + 下面一行按钮」层级平） */}
      <div className="chr-topbar">
        <div className="chr-topbar__lead">
          <Button shape="circle" icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')} />
          <div className="chr-topbar__titles">
            <span className="chr-topbar__title">我的角色</span>
            <span className="chr-topbar__sub">共 {characters.length} 个角色，参考图用于保持视频里的角色一致性</span>
          </div>
        </div>
        <Button type="primary" className="chr-btn-new" icon={<PlusOutlined />} onClick={() => navigate('/character/create')}>创建角色</Button>
      </div>

      {loading ? (
        <div className="chr-loading"><Spin size="large" /></div>
      ) : characters.length === 0 ? (
        <div className="chr-stage">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无角色" />
          <Button type="primary" className="chr-btn-new" icon={<PlusOutlined />} onClick={() => navigate('/character/create')}>创建第一个角色</Button>
        </div>
      ) : (
        /* List 只为了渲染一个 Card（多一层 DOM 与分隔线）→ 直接条目栅格；数据与事件不变 */
        <div className="chr-list">
          {characters.map((item: any) => (
            <div className="chr-item" key={item.id}>
              <div className="chr-item__lead">
                <Avatar className="chr-item__avatar" size={40} icon={<UserOutlined />} src={item.avatar_url} />
                <div className="chr-item__info">
                  <Link className="chr-item__name" to={`/character/${item.id}`}>{item.name}</Link>
                  {(item.reference_image_anime || item.reference_image_realistic) && (
                    <span className="chr-item__tags">
                      {item.reference_image_anime && <Tag color="purple">动漫参考图</Tag>}
                      {item.reference_image_realistic && <Tag color="blue">真人参考图</Tag>}
                    </span>
                  )}
                  {item.description && (
                    <Paragraph className="chr-item__desc">{item.description.slice(0, 60)}{item.description.length > 60 ? '...' : ''}</Paragraph>
                  )}
                </div>
              </div>
              <div className="chr-item__acts">
                <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/character/${item.id}`)}>编辑</Button>
                <Popconfirm title="确定删除？" onConfirm={() => handleDelete(item.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
