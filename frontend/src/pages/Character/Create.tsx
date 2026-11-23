import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Form, Input, Typography, message } from 'antd';
import { SaveOutlined, ArrowLeftOutlined, UserAddOutlined } from '@ant-design/icons';
import api from '../../services/api';
import './character.css';   // 与列表/详情共用本页样式（作用域 .chr-root）

const { Title } = Typography;
const { TextArea } = Input;

export default function CharacterCreatePage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values: { name: string; description?: string; avatar_url?: string }) => {
    setLoading(true);
    try {
      const { data } = await api.post('/api/character', values);
      message.success('角色创建成功');
      navigate(`/character/${data.id}`);
    } catch {
      message.error('创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chr-root chr-root--narrow">
      <div className="chr-topbar">
        <div className="chr-topbar__lead">
          <Button shape="circle" icon={<ArrowLeftOutlined />} onClick={() => navigate('/character')} />
          <div className="chr-topbar__titles">
            <Title level={4} className="chr-topbar__title">创建角色</Title>
            <span className="chr-topbar__sub">先定名称与描述，参考图可在详情页再生成</span>
          </div>
        </div>
      </div>

      {/* Card → 令牌面板；Form/校验/提交逻辑零改动 */}
      <div className="chr-panel">
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item name="name" label="角色名称" rules={[{ required: true, message: '请输入角色名称' }]}>
            <Input placeholder="例如：18岁黑长直古风少女" />
          </Form.Item>
          <Form.Item name="description" label="角色描述">
            <TextArea rows={4} placeholder="描述角色的外貌、性格特点等..." />
          </Form.Item>
          <Form.Item name="avatar_url" label="头像URL">
            <Input placeholder="可选，输入角色头像图片地址" />
          </Form.Item>
          <div className="chr-form__foot">
            <Button type="primary" className="chr-btn-new" htmlType="submit" icon={<SaveOutlined />} loading={loading}>保存</Button>
            <Button icon={<UserAddOutlined />} onClick={() => navigate('/character')}>返回列表</Button>
          </div>
        </Form>
      </div>
    </div>
  );
}
