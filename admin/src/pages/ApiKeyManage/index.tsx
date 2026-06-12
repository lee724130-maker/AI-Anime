import { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Typography, Space, message, Spin, Tag } from 'antd';
import {
  KeyOutlined,
  SaveOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

const { Title, Text, Paragraph } = Typography;

interface ApiKeyItem {
  key: string;
  label: string;
  description: string;
  isSet: boolean;
  maskedValue: string;
  updatedAt: string | null;
}

export default function ApiKeyManagePage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/admin/api-keys');
      setKeys(data);
      form.resetFields();
    } catch (err: any) {
      if (err.response?.status === 403) {
        message.error('无权限访问，仅管理员可操作');
        navigate('/');
        return;
      }
      message.error('获取 API 密钥列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (values: Record<string, string>) => {
    setSaving(true);
    try {
      // Only send non-empty values (don't overwrite with empty)
      const payload: Record<string, string> = {};
      Object.entries(values).forEach(([k, v]) => {
        if (v !== undefined) payload[k] = v || '';
      });
      await api.put('/api/admin/api-keys', payload);
      message.success('API 密钥已保存');
      fetchKeys();
    } catch (err: any) {
      message.error(err.response?.data?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const toggleShow = (key: string) => {
    setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          <KeyOutlined style={{ marginRight: 8, color: '#722ed1' }} />
          API 密钥配置
        </Title>
        <Text type="secondary">
          配置第三方 AI 服务的 API 密钥，密钥将加密存储在服务器端，不会暴露到前端
        </Text>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Form form={form} onFinish={handleSave} layout="vertical">
          <Card
            title="AI 服务密钥"
            extra={
              <Button
                type="primary"
                htmlType="submit"
                loading={saving}
                icon={<SaveOutlined />}
                style={{ background: '#001529', borderColor: '#001529' }}
              >
                保存全部
              </Button>
            }
          >
            {keys.map((item) => (
              <Card
                key={item.key}
                type="inner"
                size="small"
                style={{ marginBottom: 16 }}
                title={
                  <Space>
                    <span>{item.label}</span>
                    {item.isSet ? (
                      <Tag color="success" icon={<CheckCircleOutlined />}>
                        已配置
                      </Tag>
                    ) : (
                      <Tag color="default">未配置</Tag>
                    )}
                  </Space>
                }
                extra={
                  item.isSet && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      更新于: {item.updatedAt ? new Date(item.updatedAt).toLocaleString('zh-CN') : '-'}
                    </Text>
                  )
                }
              >
                <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 12 }}>
                  {item.description}
                </Paragraph>

                {item.isSet && (
                  <div
                    style={{
                      background: '#f5f5f5',
                      padding: '8px 16px',
                      borderRadius: 6,
                      marginBottom: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text code style={{ fontSize: 13 }}>
                      {showKeys[item.key] ? '••••••••（已隐藏）' : item.maskedValue}
                    </Text>
                    <Button
                      type="link"
                      size="small"
                      icon={showKeys[item.key] ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                      onClick={() => toggleShow(item.key)}
                    >
                      {showKeys[item.key] ? '隐藏' : '查看'}
                    </Button>
                  </div>
                )}

                <Form.Item
                  name={item.key}
                  style={{ marginBottom: 0 }}
                  extra="输入新密钥以替换旧密钥，留空不修改"
                >
                  <Input.Password
                    placeholder={item.isSet ? '输入新密钥（留空则不修改）' : `请输入 ${item.label}`}
                    style={{ fontFamily: 'monospace' }}
                  />
                </Form.Item>
              </Card>
            ))}
          </Card>

          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Space>
              <Button onClick={fetchKeys} disabled={saving}>
                重置
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={saving}
                icon={<SaveOutlined />}
                size="large"
                style={{ background: '#001529', borderColor: '#001529' }}
              >
                保存全部密钥
              </Button>
            </Space>
          </div>
        </Form>
      )}

      {/* Info card */}
      <Card title="🔐 安全提示" style={{ marginTop: 24 }} type="inner">
        <ul style={{ margin: 0, paddingLeft: 20, color: '#666' }}>
          <li>所有 API 密钥仅存储在服务器端，通过管理员后台可随时修改</li>
          <li>密钥永远不会出现在前端代码、Git 仓库或日志中</li>
          <li>建议定期更换密钥，保障账户安全</li>
          <li>系统会在调用 AI 服务失败时自动尝试备用模型</li>
        </ul>
      </Card>
    </div>
  );
}
