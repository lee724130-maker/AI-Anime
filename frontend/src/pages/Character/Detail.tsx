import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Form, Input, Typography, message, Spin, Avatar, Image, Space, Divider, Tag } from 'antd';
import { SaveOutlined, ArrowLeftOutlined, UserOutlined, PictureOutlined, LoadingOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;
const { TextArea } = Input;

const API_BASE = 'http://localhost:3000';

export default function CharacterDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [character, setCharacter] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [genAnime, setGenAnime] = useState(false);
  const [genRealistic, setGenRealistic] = useState(false);
  const [form] = Form.useForm();

  const fetchCharacter = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/character/${id}`);
      setCharacter(data);
      form.setFieldsValue(data);
    } catch {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCharacter(); }, [id, form]);

  const onFinish = async (values: any) => {
    setSaving(true);
    try {
      await api.put(`/api/character/${id}`, values);
      message.success('保存成功');
      fetchCharacter();
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const generateReference = async (style: 'anime' | 'realistic') => {
    const setLoader = style === 'anime' ? setGenAnime : setGenRealistic;
    setLoader(true);
    try {
      const { data } = await api.post(`/api/character/${id}/generate-reference?style=${style}`);
      setCharacter(data);
      message.success(`${style === 'anime' ? '动漫' : '真人'}风格参考图生成成功！`);
    } catch (err: any) {
      message.error(err.response?.data?.message || '生成失败');
    } finally {
      setLoader(false);
    }
  };

  const getImgSrc = (url: string) => url.startsWith('http') ? url : API_BASE + url;

  if (loading) return <Spin style={{ display: 'block', marginTop: 100 }} />;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/character')}>返回</Button>
        <Title level={2} style={{ margin: 0 }}>角色详情</Title>
      </div>
      <Card>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Avatar size={80} icon={<UserOutlined />} src={character?.avatar_url} />
        </div>
        <Form form={form} onFinish={onFinish} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={6} />
          </Form.Item>
          <Form.Item name="avatar_url" label="头像URL">
            <Input placeholder="角色头像地址" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存修改</Button>
          </Form.Item>
        </Form>

        <Divider />

        <Title level={4}>角色参考图</Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          生成后，视频生成时将根据所选风格自动使用对应的参考图作为外貌基准，保持角色一致性。
        </Text>

        <Space size="large" style={{ width: '100%' }} align="start">
          {/* Anime */}
          <div style={{ flex: 1, textAlign: 'center' }}>
            <Tag color="purple" style={{ marginBottom: 12 }}>🎨 动漫风格</Tag>
            {character?.reference_image_anime ? (
              <div>
                <Image src={getImgSrc(character.reference_image_anime)} width={180} alt="动漫参考图"
                  style={{ borderRadius: 8, border: '2px solid #d9d9d9' }} />
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 11, wordBreak: 'break-all' }}>
                    {character.reference_image_anime.slice(0, 50)}...
                  </Text>
                </div>
              </div>
            ) : (
              <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>未生成</Text>
            )}
            <Button
              icon={genAnime ? <LoadingOutlined /> : <PictureOutlined />}
              loading={genAnime}
              onClick={() => generateReference('anime')}
              style={{ marginTop: 8 }}
            >
              {character?.reference_image_anime ? '重新生成' : '生成动漫参考图'}
            </Button>
          </div>

          {/* Realistic */}
          <div style={{ flex: 1, textAlign: 'center' }}>
            <Tag color="blue" style={{ marginBottom: 12 }}>📷 真人风格</Tag>
            {character?.reference_image_realistic ? (
              <div>
                <Image src={getImgSrc(character.reference_image_realistic)} width={180} alt="真人参考图"
                  style={{ borderRadius: 8, border: '2px solid #d9d9d9' }} />
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 11, wordBreak: 'break-all' }}>
                    {character.reference_image_realistic.slice(0, 50)}...
                  </Text>
                </div>
              </div>
            ) : (
              <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>未生成</Text>
            )}
            <Button
              icon={genRealistic ? <LoadingOutlined /> : <PictureOutlined />}
              loading={genRealistic}
              onClick={() => generateReference('realistic')}
              style={{ marginTop: 8 }}
            >
              {character?.reference_image_realistic ? '重新生成' : '生成真人参考图'}
            </Button>
          </div>
        </Space>
      </Card>
    </div>
  );
}
