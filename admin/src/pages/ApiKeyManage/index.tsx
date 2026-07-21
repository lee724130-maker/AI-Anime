import { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Typography, Space, message, Spin, Tag, Collapse, Alert, Row, Col, Tooltip } from 'antd';
import {
  KeyOutlined, SaveOutlined, CheckCircleOutlined, CloseCircleOutlined,
  VideoCameraOutlined, PictureOutlined, AudioOutlined, RobotOutlined,
} from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text, Paragraph } = Typography;

const CAP_ICONS: Record<string, { icon: string; label: string; color: string }> = {
  video: { icon: '🎬', label: '视频生成', color: '#52c41a' },
  image: { icon: '🖼', label: '图片生成', color: '#1890ff' },
  text:  { icon: '💬', label: '文本对话', color: '#722ed1' },
  audio: { icon: '🔊', label: '语音配音', color: '#fa8c16' },
  avatar:{ icon: '🗣', label: '数字人',    color: '#eb2f96' },
};

interface ApiKeyModel {
  id: string;
  name: string;
  priority: number;
}

interface ApiKeyItem {
  key: string;
  label: string;
  description: string;
  capabilities: string[];
  models: Record<string, ApiKeyModel[]>;
  isSet: boolean;
  maskedValue: string;
  updatedAt: string | null;
}

export default function ApiKeyManagePage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);

  useEffect(() => { fetchKeys(); }, []);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/admin/api-keys');
      setKeys(data);
      form.resetFields();
    } catch {
      message.error('获取 API 密钥列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (values: Record<string, string>) => {
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      Object.entries(values).forEach(([k, v]) => { if (v !== undefined) payload[k] = v || ''; });
      await api.put('/api/admin/api-keys', payload);
      message.success('API 密钥已保存');
      fetchKeys();
    } catch (err: any) {
      message.error(err.response?.data?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          <KeyOutlined style={{ color: '#722ed1', marginRight: 8 }} />
          API 密钥配置
        </Title>
        <Text type="secondary">每个密钥对应一个 AI 服务供应商，填写后即可在系统配置中启用对应能力</Text>
      </div>

      <Alert
        type="info" showIcon
        message="所有密钥仅存储在服务器端数据库，通过此页面可随时修改。填写新密钥后点击保存即可覆盖旧密钥。"
        style={{ marginBottom: 20 }}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
      ) : (
        <Form form={form} onFinish={handleSave} layout="vertical">
          <Row gutter={[16, 16]}>
            {keys.map((item) => (
              <Col xs={24} key={item.key}>
                <Card
                  style={{ borderRadius: 8 }}
                  styles={{ body: { padding: 20 } }}
                >
                  <Row justify="space-between" align="middle" style={{ marginBottom: 14 }}>
                    <Col>
                      <Space size={12}>
                        <Text strong style={{ fontSize: 15 }}>{item.label}</Text>
                        {item.isSet
                          ? <Tag color="success" icon={<CheckCircleOutlined />}>已配置</Tag>
                          : <Tag color="default" icon={<CloseCircleOutlined />}>未配置</Tag>
                        }
                      </Space>
                    </Col>
                    {item.isSet && item.updatedAt && (
                      <Col>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          更新于: {new Date(item.updatedAt).toLocaleString('zh-CN')}
                        </Text>
                      </Col>
                    )}
                  </Row>

                  {/* 能力标签 */}
                  <Space wrap style={{ marginBottom: 14 }}>
                    {item.capabilities.map((cap) => {
                      const c = CAP_ICONS[cap] || { icon: '🔧', label: cap, color: '#999' };
                      return (
                        <Tag key={cap} style={{
                          padding: '2px 10px', fontSize: 13, borderRadius: 4,
                          border: `1px solid ${c.color}20`,
                        }}>
                          <span style={{ marginRight: 4 }}>{c.icon}</span>
                          {c.label}
                        </Tag>
                      );
                    })}
                  </Space>

                  {/* 模型列表 */}
                  {Object.keys(item.models).length > 0 && (
                    <div style={{
                      background: '#fafafa', borderRadius: 6, padding: '10px 14px',
                      marginBottom: 14, fontSize: 13,
                    }}>
                      {Object.entries(item.models).map(([cap, models]) => (
                        <div key={cap} style={{ marginBottom: models === Object.values(item.models).flat() ? 0 : 4 }}>
                          <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
                            {CAP_ICONS[cap]?.icon || '🔧'} {CAP_ICONS[cap]?.label || cap}：
                          </Text>
                          {models.map((m, i) => (
                            <Text key={m.id} style={{
                              color: m.priority === 1 ? '#262626' : '#8c8c8c',
                              fontWeight: m.priority === 1 ? 500 : 400,
                            }}>
                              {i > 0 && <span style={{ color: '#d9d9d9', margin: '0 6px' }}>→</span>}
                              {m.name}
                              {m.priority > 1 && <Text style={{ fontSize: 11, color: '#8c8c8c', marginLeft: 4 }}>(备用)</Text>}
                            </Text>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 10 }}>
                    {item.description}
                  </Paragraph>

                  {/* 当前密钥（已配置时显示） */}
                  {item.isSet && (
                    <div style={{
                      background: '#f9f9f9', padding: '6px 14px', borderRadius: 6,
                      marginBottom: 10, fontFamily: 'monospace', fontSize: 13, color: '#595959',
                    }}>
                      {item.maskedValue}
                    </div>
                  )}

                  {/* 输入框 */}
                  <Form.Item name={item.key} style={{ marginBottom: 0 }}
                    extra="输入新密钥以替换旧密钥，留空不修改">
                    <Input.Password
                      placeholder={item.isSet ? '输入新密钥（留空则不修改）' : `请输入 ${item.label} API Key`}
                      style={{ fontFamily: 'monospace' }}
                    />
                  </Form.Item>
                </Card>
              </Col>
            ))}
          </Row>

          <div style={{ marginTop: 20, textAlign: 'right' }}>
            <Space>
              <Button onClick={fetchKeys} disabled={saving}>重置</Button>
              <Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />} size="large"
                style={{ background: '#001529', borderColor: '#001529' }}>
                保存全部密钥
              </Button>
            </Space>
          </div>
        </Form>
      )}
    </div>
  );
}
