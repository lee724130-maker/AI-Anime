import { useState } from 'react';
import {
  Card,
  Space,
  Button,
  Input,
  Tag,
  Table,
  Alert,
  Typography,
  Modal,
  message,
} from 'antd';
import { DatabaseOutlined, PlayCircleOutlined, TableOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;

// _xe — database operations page (super admin only).
// Faithful prod quirk: no useEffect — d() (fetch tables) is only reachable via
// the refresh button inside the `数据表` card, whose display stays `none` until
// tables exist. Tables therefore never auto-load; the card is permanently hidden.
export default function DatabasePage() {
  const [sql, setSql] = useState('SELECT id, username, role, is_super_admin, credits FROM users LIMIT 10');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [tables, setTables] = useState<string[]>([]);

  // c — readonly whitelist test
  const isReadonly = (s: string) => /^\s*(SELECT|SHOW|DESCRIBE|EXPLAIN)\b/i.test(s);

  // l — run query
  const runQuery = async () => {
    if (!sql.trim()) return;
    setLoading(true);
    try {
      const res = await api.post('/api/admin/db/query', { sql: sql.trim() });
      setResult(res.data);
      message.success(`查询成功，返回 ${res.data.count} 行`);
    } catch (e: any) {
      message.error(e.response?.data?.message || '查询失败');
      setResult(null);
    }
    setLoading(false);
  };

  // u — confirm + execute
  const execute = () => {
    const s = sql.trim();
    if (!s) return;
    if (!isReadonly(s)) {
      message.error('仅允许 SELECT / SHOW / DESCRIBE / EXPLAIN 查询');
      return;
    }
    Modal.confirm({
      title: '确认执行 SQL',
      content: '请确认要执行此查询？仅只读查询被允许。',
      okText: '执行',
      cancelText: '取消',
      onOk: () => runQuery(),
    });
  };

  // d — fetch tables (never auto-called in prod)
  const fetchTables = async () => {
    try {
      const res = await api.get('/api/admin/db/tables');
      setTables(res.data.tables);
    } catch (e: any) {
      message.error(e.response?.data?.message || '获取表列表失败');
    }
  };

  // f — columns derived from rows[0]
  const columns =
    result?.rows?.[0]
      ? Object.keys(result.rows[0]).map((key) => ({
          title: key,
          dataIndex: key,
          key,
          ellipsis: true,
          render: (val: any) =>
            val === null ? (
              <Tag>-</Tag>
            ) : typeof val === 'boolean' ? (
              <Tag color={val ? 'success' : 'default'}>{val ? '是' : '否'}</Tag>
            ) : typeof val === 'object' ? (
              JSON.stringify(val)
            ) : (
              String(val)
            ),
        }))
      : [];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3}>
          <DatabaseOutlined className="page-header-icon" style={{ color: 'var(--primary)' }} /> 数据库操作
        </Title>
        <Text type="secondary">执行 SQL 查询和查看数据库结构（仅超级管理员）</Text>
      </div>
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="warning"
          showIcon
          message="安全提示"
          description="仅允许 SELECT / SHOW / DESCRIBE / EXPLAIN 查询，不允许执行 INSERT / UPDATE / DELETE / DROP 等写操作。"
        />
        <Card
          title="SQL 查询"
          extra={
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={execute}
              loading={loading}
              disabled={!sql.trim() || !isReadonly(sql.trim())}
            >
              执行查询
            </Button>
          }
        >
          <Input.TextArea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            placeholder="输入 SQL 查询语句..."
            autoSize={{ minRows: 3, maxRows: 8 }}
            style={{ fontFamily: 'monospace', fontSize: 13 }}
            onPressEnter={(e) => {
              if (e.ctrlKey) execute();
            }}
          />
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Ctrl + Enter 执行查询
            </Text>
          </div>
        </Card>
        <Card
          title="数据表"
          extra={
            <Button icon={<TableOutlined />} onClick={fetchTables}>
              刷新表列表
            </Button>
          }
          style={{ display: tables.length > 0 ? 'block' : 'none' }}
        >
          <Space wrap>
            {tables.map((tname) => (
              <Tag
                key={tname}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setSql(`SELECT * FROM ${tname} LIMIT 20`);
                  setTimeout(() => execute(), 0);
                }}
              >
                {tname}
              </Tag>
            ))}
          </Space>
        </Card>
        {result && (
          <Card title={`查询结果（${result.count} 行）`}>
            {result.rows.length > 0 ? (
              <Table
                dataSource={result.rows.map((row: any, idx: number) => ({ ...row, _key: idx }))}
                columns={columns}
                rowKey="_key"
                size="small"
                scroll={{ x: 'max-content' }}
                pagination={{ pageSize: 50, showTotal: (t) => `共 ${t} 条` }}
              />
            ) : (
              <Text type="secondary">查询返回 0 行结果</Text>
            )}
          </Card>
        )}
      </Space>
    </div>
  );
}
