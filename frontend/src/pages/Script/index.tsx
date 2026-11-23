import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Tag, Popconfirm, message, Upload, Empty, Spin } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ArrowLeftOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import api from '../../services/api';
import './script.css';   // 本页质感改造样式（作用域 .scr-root，详见文件头注释）

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
    <div className="scr-root scr-root--list">
      {/* 顶栏：返回圆钮 + 标题 | 导入 / 新建（原「居中大标题 + 下面一行按钮」） */}
      <div className="scr-topbar">
        <div className="scr-topbar__lead">
          <Button shape="circle" icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')} />
          <div className="scr-topbar__titles">
            <span className="scr-topbar__title">我的剧本</span>
            <span className="scr-topbar__sub">共 {scripts.length} 个剧本，可导出 JSON 到别的设备导入</span>
          </div>
        </div>
        <div className="scr-topbar__acts">
          <Upload accept=".json" showUploadList={false} beforeUpload={handleImport}>
            <Button icon={<UploadOutlined />}>导入剧本</Button>
          </Upload>
          <Button type="primary" className="scr-btn-primary" icon={<PlusOutlined />} onClick={() => navigate('/script/create')}>新建剧本</Button>
        </div>
      </div>

      {loading ? (
        <div className="scr-loading"><Spin size="large" /></div>
      ) : scripts.length === 0 ? (
        <div className="scr-stage">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无剧本" />
          <span>新建一个剧本，或用上方「导入剧本」载入 JSON</span>
        </div>
      ) : (
        <div className="scr-list">
          {scripts.map((item: any) => (
            <div className="scr-item" key={item.id}>
              <div className="scr-item__lead">
                <Link className="scr-item__name" to={`/script/${item.id}`}>{item.title || '未命名剧本'}</Link>
                <Tag className="scr-item__status">{statusTag[item.status] || item.status}</Tag>
              </div>
              <div className="scr-item__acts">
                <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/script/${item.id}`)}>编辑</Button>
                <Button size="small" icon={<DownloadOutlined />} onClick={() => handleExport(item.id)}>导出</Button>
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
