import { Typography } from 'antd';
import HistoryTable from './HistoryTable';

const { Title, Text } = Typography;

export default function GenerateHistoryPage() {
  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>生成历史</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>全部生成任务记录，可按类型与状态筛选查找</Text>
      <HistoryTable pageSize={10} showFilters showPagination />
    </div>
  );
}
