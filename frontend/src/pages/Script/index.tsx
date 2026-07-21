import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Typography, Tag, Space, Popconfirm, message, Upload } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ArrowLeftOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import api from '../../services/api';
import AppHeader from '../../components/AppHeader';

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

  const handleExport = async (id: number) => {
    try {
      const { data } = await api.get(`/api/script/${id}/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `script_${id}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      message.error('导出失败');
    }
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!json.content) { message.error('无效的剧本文件'); return false; }
      await api.post('/api/script/import', {
        title: json.title || file.name.replace('.json', ''),
        content: json.content,
        scenes: json.scenes || undefined,
      });
      message.success('导入成功');
      fetchScripts();
    } catch {
      message.error('导入失败');
    }
    return false;
  };

  const statusTag: Record<string, string> = { draft: '草稿', processing: '处理中', completed: '已完成' };

  return (
    <div>
      <AppHeader />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px 15px' }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <Title level={2} style={{ margin: 0 }}>我的剧本</Title>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button className="back-btn" icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')}>返回</Button>
          <Space>
            <Upload accept=".json" showUploadList={false} beforeUpload={handleImport}>
              <Button icon={<UploadOutlined />}>导入剧本</Button>
            </Upload>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/script/create')}>新建剧本</Button>
          </Space>
        </div>
      </div>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 24px' }}>
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
                    <Button size="small" icon={<DownloadOutlined />} onClick={() => handleExport(item.id)}>导出</Button>
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
