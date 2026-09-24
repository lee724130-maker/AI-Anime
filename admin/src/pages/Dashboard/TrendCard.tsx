import { useState, useEffect } from 'react';
import { Card } from 'antd';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import api from '../../services/api';
import { useTheme } from '../../hooks/useTheme';

// Fbe — trend tooltip content
const TrendTooltip = ({ active, payload, label, isDark }: any) =>
  !active || !payload?.length ? null : (
    <div
      style={{
        background: isDark ? '#1E293B' : '#fff',
        border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
        borderRadius: 8,
        padding: '8px 14px',
        boxShadow: '0 4px 12px rgba(0,0,0,.15)',
      }}
    >
      <div style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 12, marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color, fontSize: 13 }}>
          {p.dataKey === 'users' ? '新用户' : '生成任务'}: <b>{p.value}</b>
        </div>
      ))}
    </div>
  );

// Ibe — 生成趋势 card
export default function TrendCard() {
  const { isDark } = useTheme();
  const [points, setPoints] = useState<any[]>([]);
  const [stats, setStats] = useState({ users: 0, tasks: 0, userDelta: 0, taskDelta: 0 });

  useEffect(() => {
    api
      .get('/api/admin/dashboard/trend')
      .then(({ data }) => {
        const list: any[] = Array.isArray(data) ? data : data.points || [];
        setPoints(list);
        const mid = Math.floor(list.length / 2);
        const newer = list.slice(mid);
        const older = list.slice(0, mid);
        const users = newer.reduce((s, p) => s + p.users, 0);
        const oldUsers = older.reduce((s, p) => s + p.users, 0);
        const tasks = newer.reduce((s, p) => s + p.tasks, 0);
        const oldTasks = older.reduce((s, p) => s + p.tasks, 0);
        setStats({
          users,
          tasks,
          userDelta: oldUsers ? Math.round(((users - oldUsers) / oldUsers) * 100) : 0,
          taskDelta: oldTasks ? Math.round(((tasks - oldTasks) / oldTasks) * 100) : 0,
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!points.length) return null;

  const a = isDark ? '#94A3B8' : '#64748B';
  const o = isDark ? '#64748B' : '#94A3B8';

  return (
    <Card title="生成趋势" styles={{ body: { padding: '12px 20px 4px' } }} style={{ height: '100%' }}>
      <div style={{ display: 'flex', gap: 24, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <span style={{ color: a, fontSize: 13 }}>近两周新用户 </span>
          <span style={{ color: '#818CF8', fontSize: 20, fontWeight: 700 }}>{stats.users}</span>
          {stats.userDelta !== 0 && (
            <span
              style={{
                color: stats.userDelta > 0 ? '#34D399' : '#F87171',
                fontSize: 12,
                marginLeft: 6,
              }}
            >
              {stats.userDelta > 0 ? '+' : ''}
              {stats.userDelta}%
            </span>
          )}
        </div>
        <div>
          <span style={{ color: a, fontSize: 13 }}>近两周生成任务 </span>
          <span style={{ color: '#34D399', fontSize: 20, fontWeight: 700 }}>{stats.tasks}</span>
          {stats.taskDelta !== 0 && (
            <span
              style={{
                color: stats.taskDelta > 0 ? '#34D399' : '#F87171',
                fontSize: 12,
                marginLeft: 6,
              }}
            >
              {stats.taskDelta > 0 ? '+' : ''}
              {stats.taskDelta}%
            </span>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={points} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="gUsers" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818CF8" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#818CF8" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gTasks" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34D399" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#34D399" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fill: o, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: o, fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={<TrendTooltip isDark={isDark} /> as any} />
          <Area type="monotone" dataKey="users" stroke="#818CF8" strokeWidth={2} fill="url(#gUsers)" />
          <Area type="monotone" dataKey="tasks" stroke="#34D399" strokeWidth={2} fill="url(#gTasks)" />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}
