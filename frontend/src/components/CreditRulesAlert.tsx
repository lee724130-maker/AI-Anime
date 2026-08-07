import { useEffect, useState } from 'react';
import { Alert, Space, Typography } from 'antd';
import api from '../services/api';

const { Text } = Typography;

/** 积分扣费规则提示条（热门创作 / 短剧工作室共用） */
export default function CreditRulesAlert({ apiPath, title = '积分扣费规则' }: { apiPath: string; title?: string }) {
  const [rules, setRules] = useState<any>(null);

  useEffect(() => {
    api.get(apiPath).then(({ data }) => setRules(data)).catch(() => setRules(null));
  }, [apiPath]);

  if (!rules) return null;

  const isViral = !!rules.generate;

  return (
    <Alert
      type="info"
      showIcon
      style={{ marginBottom: 16 }}
      message={title}
      description={
        <Space direction="vertical" size={2}>
          {isViral ? (
            <>
              <Text>🎬 模板分析（链接/上传）：{rules.analyze_cost} 积分 / 次</Text>
              <Text>
                🎥 项目生成（按参考图数量）：{Object.entries(rules.generate.examples || {}).map(([k, v]) => `${k} = ${v} 积分`).join('、')}
                {rules.generate.first_image_extra ? '' : ''}
                ；参考图越多扣分越多（R2V 模型额度有限）
              </Text>
              <Text>🔄 单场景重新生成：{rules.regenerate || '与生成同价'}</Text>
              <Text>💸 失败自动全额退还积分；提交时预扣，成功后不再重复扣费</Text>
            </>
          ) : (
            <>
              <Text>📝 剧情分析：{rules.analyze_cost} 积分 / 次</Text>
              <Text>🖼 资产图生成：{rules.asset_image_cost} 积分 / 张</Text>
              <Text>🎬 片段生成：480p = {rules.segment?.['480p']} 积分、720p = {rules.segment?.['720p']} 积分、1080p = {rules.segment?.['1080p']} 积分 / {rules.segment?.unit || '每片段'}（按分集分辨率，固定每片段）</Text>
              <Text>🎞 合成成片：免费（本地处理）</Text>
              <Text>💸 失败自动全额退还积分；提交时预扣，成功后不再重复扣费</Text>
            </>
          )}
        </Space>
      }
    />
  );
}
