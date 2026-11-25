import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Typography, Button, Spin, Tag, Space, Descriptions, Empty, message, Modal, Divider, Select } from 'antd';
import { ArrowLeftOutlined, SyncOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, ReloadOutlined, ThunderboltOutlined, FileTextOutlined } from '@ant-design/icons';
import api from '../../services/api';
import ProgressPanel from './components/ProgressPanel';
import VideoPreview from './components/VideoPreview';
import CreditRulesAlert from '../../components/CreditRulesAlert';
import './project-detail.css';   // 本页 + ProgressPanel/VideoPreview 样式（作用域 .vpd-/.vpp-/.vpv-）

const { Title, Text } = Typography;

const STATUS_MAP: Record<string, { color: string; label: string; icon: any }> = {
  pending: { color: 'default', label: '待生成', icon: <ClockCircleOutlined /> },
  processing: { color: 'processing', label: '生成中', icon: <SyncOutlined spin /> },
  completed: { color: 'success', label: '已完成', icon: <CheckCircleOutlined /> },
  failed: { color: 'error', label: '失败', icon: <CloseCircleOutlined /> },
};

const LANG_MAP: Record<string, string> = { zh: '中文', en: '英文', ja: '日文' };

export default function ViralProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const pollRef = useRef<any>(null);

  const fetchProject = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/viral/projects/${id}`);
      setProject(data);
      if (data.status === 'completed' || data.status === 'failed') {
        setGenerating(false);
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    } catch { /* ignore */ }
  }, [id]);

  useEffect(() => {
    (async () => {
      await fetchProject();
      setLoading(false);
    })();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchProject]);

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(fetchProject, 3000);
  };

  const startGeneration = async () => {
    setGenerating(true);
    try {
      await api.post(`/api/viral/projects/${id}/generate`);
      message.success('开始生成');
      // Start polling
      startPolling();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '启动生成失败');
      setGenerating(false);
    }
  };

  const regenerateScene = async (sceneIndex: number) => {
    Modal.confirm({
      title: '确认重新生成',
      content: `将重新生成场景 #${sceneIndex + 1}，确定要继续吗？`,
      onOk: async () => {
        try {
          await api.post(`/api/viral/projects/${id}/regenerate-scene`, { sceneIndex });
          message.success('场景重新生成中');
          startPolling();
        } catch (err: any) {
          message.error(err?.response?.data?.message || '重新生成失败');
        }
      },
    });
  };

  const [refreshingSource, setRefreshingSource] = useState(false);
  const refreshSource = async () => {
    setRefreshingSource(true);
    try {
      const { data } = await api.post(`/api/viral/templates/${project.template_id}/refresh-source`);
      if (data?.updated) {
        message.success('原视频已获取成功');
        fetchProject();
      } else {
        message.info(data?.message || '模板已使用本地视频');
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || '获取原视频失败');
    }
    setRefreshingSource(false);
  };

  const changeRatio = async (ratio: string) => {
    try {
      await api.put(`/api/viral/projects/${id}`, { ratio });
      message.success('比例已更新，重新生成后生效');
      fetchProject();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '比例更新失败');
    }
  };

  const changeDuration = async (duration?: number) => {
    try {
      await api.put(`/api/viral/projects/${id}`, { target_duration: duration || undefined });
      message.success('目标时长已更新，重新生成后生效');
      fetchProject();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '目标时长更新失败');
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '100px 0' }}><Spin size="large" /></div>;
  }
  if (!project) {
    return (
<div style={{ padding: 'clamp(16px, 3vw, 32px)' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/viral/projects')}>返回</Button>
        <Empty description="项目不存在" style={{ padding: '60px 0' }} />
      </div>
    );
  }

  const sm = STATUS_MAP[project.status] || { color: 'default', label: project.status, icon: null };
  const scenes: any[] = typeof project.scenes === 'string' ? JSON.parse(project.scenes) : (project.scenes || []);

  return (
    <div className="vpd-root">
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/viral/projects')}
        className="vpd-back">返回我的创作</Button>
      <CreditRulesAlert apiPath="/api/viral/credit-rules" />

      <div className="vpd-panel">
        <div className="vpd-panel__bd">
          <div className="vpd-hd">
            <div className="vpd-hd__titles">
              <Title level={4} className="vpd-title">{project.name}</Title>
              <Tag color={sm.color} style={{ borderRadius: 6, alignSelf: 'flex-start', marginTop: 4 }}>{sm.label}</Tag>
            </div>
            <div className="vpd-hd__acts">
              {project.status === 'pending' && (
                <Button type="primary" icon={<ThunderboltOutlined />} onClick={startGeneration}
                  loading={generating} className="vpd-btn-brand">
                  开始生成
                </Button>
              )}
              {project.status === 'processing' && (
                <Button icon={<SyncOutlined spin />} disabled>生成中...</Button>
              )}
              {project.status === 'failed' && (
                <Button type="primary" icon={<ReloadOutlined />} onClick={startGeneration}
                  className="vpd-btn-brand">
                  重新生成
                </Button>
              )}
              <Select
                value={project.ratio || '9:16'}
                onChange={changeRatio}
                options={[
                  { label: '9:16 竖屏', value: '9:16' },
                  { label: '16:9 横屏', value: '16:9' },
                  { label: '1:1 方形', value: '1:1' },
                  { label: '3:4 竖版', value: '3:4' },
                  { label: '2:3 竖版', value: '2:3' },
                  { label: '4:3 横版', value: '4:3' },
                ]}
                style={{ width: 130 }}
              />
              <Select
                value={project.target_duration || undefined}
                onChange={changeDuration}
                allowClear
                placeholder="目标时长"
                options={[15, 30, 45, 60].map((d) => ({ label: `${d}s`, value: d }))}
                style={{ width: 110 }}
              />
            </div>
          </div>

        {(project.status === 'processing') && (
          <ProgressPanel
            progress={project.progress}
            status={project.status}
            scenes={typeof project.scenes === 'string' ? JSON.parse(project.scenes).filter((s: any) => s.status) : []}
          />
        )}

        {project.status === 'completed' && project.result_url && (
          <div>
            <div className="vpd-sect-hd">
              <span className="vpd-badge vpd-badge--ai">AI 生成视频</span>
              <Text className="vpd-sect-note">根据模板生成的视频</Text>
            </div>
            <VideoPreview url={project.result_url} />
            <Divider />
            <div className="vpd-sect-hd">
              <span className="vpd-badge vpd-badge--src">原视频</span>
              <Text className="vpd-sect-note">
                {project.template_name ? `${project.template_name} 的参考视频` : '模板参考视频'}
              </Text>
              {project.reference_url && !project.reference_url.startsWith('/static/') && (
                <Button size="small" type="primary" loading={refreshingSource} onClick={refreshSource}
                  className="vpd-btn-info">
                  获取原视频
                </Button>
              )}
            </div>
            {project.reference_url && project.reference_url.startsWith('/static/') ? (
              <VideoPreview url={project.reference_url} />
            ) : (
              <div className="vpd-missing">
                原视频暂未保存到本地，点击右上角「获取原视频」下载保存后可播放
              </div>
            )}
          </div>
        )}

        {project.error_msg && (
          <div className="vpd-error">{project.error_msg}</div>
        )}

        <Descriptions column={{ xs: 1, sm: 2 }} size="small" style={{ marginTop: 16 }}>
          <Descriptions.Item label="模板 ID">{project.template_id}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{new Date(project.created_at).toLocaleString('zh-CN')}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={sm.color} style={{ borderRadius: 6 }}>{sm.label}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="进度">{project.progress}%</Descriptions.Item>
          <Descriptions.Item label="视频比例">
            <Tag style={{ borderRadius: 6 }}>{project.ratio || '9:16'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="目标时长">
            <Tag style={{ borderRadius: 6 }}>{project.target_duration ? `${project.target_duration}s` : '模板默认'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="分辨率">
            <Tag style={{ borderRadius: 6 }}>{project.resolution || '720p'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="风格">
            <Tag style={{ borderRadius: 6 }}>{project.style === 'realistic' ? '写实' : '动漫'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="语言">
            <Tag style={{ borderRadius: 6 }}>{LANG_MAP[project.language || 'zh']}</Tag>
          </Descriptions.Item>
        </Descriptions>
        </div>
      </div>

      {/* Scene list with regenerate buttons */}
      {scenes.length > 0 && (
        <div className="vpd-panel">
          <div className="vpd-panel__hd"><FileTextOutlined /> 场景列表</div>
          <div className="vpd-panel__bd">
            <div className="vpd-scenes">
              {scenes.map((scene, i) => (
                <div key={i} className="vpd-scene">
                  <div className="vpd-scene__lead">
                    <span className="vpd-num">{i + 1}</span>
                    <Text className="vpd-scene__name">{scene.name || `场景 ${i + 1}`}</Text>
                  </div>
                  <Space>
                    {scene.status === 'completed' && <Tag color="success" style={{ borderRadius: 6 }}>已完成</Tag>}
                    {scene.status === 'failed' && (
                      <Tag color="error" style={{ borderRadius: 6 }}>失败</Tag>
                    )}
                    {scene.status === 'processing' && <Spin size="small" />}
                    <Button size="small" icon={<ReloadOutlined />} onClick={() => regenerateScene(i)}
                      disabled={project.status === 'processing'}>
                      重新生成
                    </Button>
                  </Space>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
