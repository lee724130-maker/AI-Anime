import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Form, Input, Typography, message, Spin, Avatar, Image, Tag } from 'antd';
import { SaveOutlined, ArrowLeftOutlined, UserOutlined, PictureOutlined, LoadingOutlined } from '@ant-design/icons';
import api from '../../services/api';
import './character.css';   // 与列表/创建共用本页样式（作用域 .chr-root）

const { Text } = Typography;
const { TextArea } = Input;

const API_BASE = import.meta.env.VITE_API_BASE || '';

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

  if (loading) return <div className="chr-root"><div className="chr-loading"><Spin size="large" /></div></div>;

  const refBlock = (
    style: 'anime' | 'realistic',
    label: string,
    url: string | undefined,
    generating: boolean,
  ) => (
    <div className="chr-ref">
      <Tag className="chr-ref__tag" color={style === 'anime' ? 'purple' : 'blue'}>{label}</Tag>
      {url ? (
        <>
          <Image className="chr-ref__img" src={getImgSrc(url)} alt={style === 'anime' ? '动漫参考图' : '真人参考图'} />
          {/* 路径展示：签名后 query 很长，这里只截显示用，不参与任何逻辑 */}
          <Text className="chr-ref__path">{url.split('?')[0].slice(0, 50)}…</Text>
        </>
      ) : (
        <span className="chr-ref__none">未生成</span>
      )}
      <Button
        className="chr-ref__act"
        icon={generating ? <LoadingOutlined /> : <PictureOutlined />}
        loading={generating}
        onClick={() => generateReference(style)}
      >
        {url ? '重新生成' : (style === 'anime' ? '生成动漫参考图' : '生成真人参考图')}
      </Button>
    </div>
  );

  return (
    <div className="chr-root chr-root--narrow">
      <div className="chr-topbar">
        <div className="chr-topbar__lead">
          <Button shape="circle" icon={<ArrowLeftOutlined />} onClick={() => navigate('/character')} />
          <div className="chr-topbar__titles">
            <span className="chr-topbar__title">角色详情</span>
            <span className="chr-topbar__sub">改名称/描述，或生成两种风格的参考图</span>
          </div>
        </div>
      </div>

      <div className="chr-panel">
        {/* 身份头：原来只有一个居中 Avatar（下面还重复一遍名称表单）→ 头像 + 当前名称摘要 */}
        <div className="chr-hero">
          <Avatar className="chr-hero__avatar" size={64} icon={<UserOutlined />} src={character?.avatar_url} />
          <div className="chr-hero__titles">
            <span className="chr-hero__name">{character?.name || '未命名角色'}</span>
            <span className="chr-hero__sub">ID {character?.id ?? '-'}</span>
          </div>
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
          <div className="chr-form__foot">
            <Button type="primary" className="chr-btn-new" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存修改</Button>
          </div>
        </Form>
      </div>

      <div className="chr-panel">
        <div className="chr-panel__head"><PictureOutlined /><span>角色参考图</span></div>
        <p className="chr-panel__hint">
          生成后，视频生成时将根据所选风格自动使用对应的参考图作为外貌基准，保持角色一致性。
        </p>
        <div className="chr-refs">
          {refBlock('anime', '🎨 动漫风格', character?.reference_image_anime, genAnime)}
          {refBlock('realistic', '📷 真人风格', character?.reference_image_realistic, genRealistic)}
        </div>
      </div>
    </div>
  );
}
