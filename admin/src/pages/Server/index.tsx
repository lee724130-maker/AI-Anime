import { useState } from 'react';
import {
  Card,
  Space,
  Button,
  InputNumber,
  Descriptions,
  Tag,
  Typography,
  Modal,
  message,
} from 'antd';
import {
  CloudServerOutlined,
  ReloadOutlined,
  FileTextOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;

// mxe — server management page (super admin only)
export default function ServerPage() {
  const [status, setStatus] = useState<any>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [logs, setLogs] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [lines, setLines] = useState(100);
  const [restarting, setRestarting] = useState(false);

  const fetchStatus = async () => {
    setStatusLoading(true);
    try {
      const res = await api.get('/api/admin/server/status');
      setStatus(res.data);
    } catch (e: any) {
      message.error(e.response?.data?.message || '获取状态失败');
    }
    setStatusLoading(false);
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await api.get(`/api/admin/server/logs?lines=${lines}`);
      setLogs(res.data.logs);
    } catch (e: any) {
      message.error(e.response?.data?.message || '获取日志失败');
    }
    setLogsLoading(false);
  };

  const restartBackend = () => {
    Modal.confirm({
      title: '确认重启后端服务？',
      icon: <ExclamationCircleOutlined />,
      content: '重启期间服务将短暂不可用（约 5-10 秒）。',
      okText: '确认重启',
      cancelText: '取消',
      onOk: async () => {
        setRestarting(true);
        try {
          await api.post('/api/admin/server/restart');
          message.success('后端服务已重启');
          setTimeout(fetchStatus, 3000);
        } catch (e: any) {
          message.error(e.response?.data?.message || '重启失败');
        }
        setRestarting(false);
      },
    });
  };

  const cleanup = async (type: string) => {
    const labels: Record<string, string> = {
      output: '过期产物（7天以上）',
      tmp: '临时文件',
      logs: 'PM2 日志',
      all: '全部清理',
    };
    Modal.confirm({
      title: `确认清理${labels[type]}？`,
      icon: <ExclamationCircleOutlined />,
      content: '此操作不可恢复。',
      okText: '确认清理',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await api.post('/api/admin/server/cleanup', { type });
          message.success(`清理完成，删除 ${res.data.cleaned} 个文件`);
        } catch (e: any) {
          message.error(e.response?.data?.message || '清理失败');
        }
      },
    });
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3}>
          <CloudServerOutlined className="page-header-icon" style={{ color: 'var(--primary)' }} /> 服务器管理
        </Title>
        <Text type="secondary">查看服务器状态、管理日志和清理文件（仅超级管理员）</Text>
      </div>
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <Card
          title="服务状态"
          extra={
            <Space>
              <Button icon={<ReloadOutlined />} onClick={fetchStatus} loading={statusLoading}>
                刷新状态
              </Button>
              <Button type="primary" icon={<ReloadOutlined />} onClick={restartBackend} loading={restarting} danger>
                重启后端
              </Button>
            </Space>
          }
        >
          {status ? (
            <Descriptions column={{ xs: 1, sm: 2, md: 3 }} bordered size="small">
              <Descriptions.Item label="平台">{status.platform}</Descriptions.Item>
              <Descriptions.Item label="Node 版本">{status.nodeVersion}</Descriptions.Item>
              <Descriptions.Item label="进程内存">{status.memoryUsage} MB</Descriptions.Item>
              {status.backend ? (
                <>
                  <Descriptions.Item label="PID">{status.backend.pid}</Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Tag
                      color={status.backend.status === 'online' ? 'success' : 'error'}
                      icon={
                        status.backend.status === 'online' ? <CheckCircleOutlined /> : <CloseCircleOutlined />
                      }
                    >
                      {status.backend.status}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="重启次数">{status.backend.restarts}</Descriptions.Item>
                  <Descriptions.Item label="内存占用">{status.backend.memory} MB</Descriptions.Item>
                  <Descriptions.Item label="CPU">{status.backend.cpu}%</Descriptions.Item>
                  <Descriptions.Item label="运行时间">
                    {status.backend.uptime
                      ? Math.round((Date.now() / 1000 - status.backend.uptime) / 3600) + ' 小时'
                      : '-'}
                  </Descriptions.Item>
                </>
              ) : (
                <Descriptions.Item label="后端进程" span={3}>
                  <Tag color="warning">未在 PM2 管理下运行（本地开发模式）</Tag>
                </Descriptions.Item>
              )}
            </Descriptions>
          ) : (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <Button onClick={fetchStatus} loading={statusLoading}>
                点击获取服务器状态
              </Button>
            </div>
          )}
        </Card>

        <Card
          title="服务日志"
          extra={
            <Space>
              <InputNumber
                min={10}
                max={1000}
                value={lines}
                onChange={(v) => setLines(v || 100)}
                style={{ width: 120 }}
                addonBefore={
                  <span style={{ fontSize: 12 }}>行数</span>
                }
              />
              <Button icon={<FileTextOutlined />} onClick={fetchLogs} loading={logsLoading}>
                查看日志
              </Button>
            </Space>
          }
        >
          {logs ? (
            <pre
              style={{
                background: 'var(--bg-secondary, #1a1a2e)',
                color: 'var(--text)',
                padding: 16,
                borderRadius: 8,
                maxHeight: 400,
                overflow: 'auto',
                fontSize: 12,
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {logs}
            </pre>
          ) : (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <Button icon={<FileTextOutlined />} onClick={fetchLogs} loading={logsLoading}>
                加载日志
              </Button>
            </div>
          )}
        </Card>

        <Card title="文件清理">
          <Space wrap>
            <Button icon={<DeleteOutlined />} onClick={() => cleanup('output')}>
              清理过期产物
            </Button>
            <Button icon={<DeleteOutlined />} onClick={() => cleanup('tmp')}>
              清理临时文件
            </Button>
            <Button icon={<DeleteOutlined />} onClick={() => cleanup('logs')}>
              清理 PM2 日志
            </Button>
            <Button icon={<DeleteOutlined />} danger onClick={() => cleanup('all')}>
              全部清理
            </Button>
          </Space>
          <div style={{ marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              过期产物：删除 output/ 目录下 7 天前的文件（static/ 目录除外）；临时文件：删除 tmp/ 下 1 天前的文件
            </Text>
          </div>
        </Card>
      </Space>
    </div>
  );
}
