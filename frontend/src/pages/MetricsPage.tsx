import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart2, TrendingUp, Clock, AlertTriangle } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';
import { format } from 'date-fns';
import api from '../api/client';
import type { Organization, Project, Metrics } from '../types';

const PIE_COLORS: Record<string, string> = {
  QUEUED: '#6366f1',
  SCHEDULED: '#8b5cf6',
  RUNNING: '#06b6d4',
  COMPLETED: '#10b981',
  FAILED: '#f43f5e',
  DEAD: '#64748b',
  CANCELLED: '#94a3b8',
  CLAIMED: '#f59e0b',
};

const MetricsPage: React.FC = () => {
  const { data: orgs } = useQuery({ queryKey: ['orgs'], queryFn: () => api.get<Organization[]>('/organizations').then((r) => r.data) });
  const orgId = orgs?.[0]?.id;
  const { data: projects } = useQuery({
    queryKey: ['projects', orgId],
    queryFn: () => api.get<Project[]>(`/organizations/${orgId}/projects`).then((r) => r.data),
    enabled: !!orgId,
  });
  const projectId = projects?.[0]?.id;

  const { data: metrics } = useQuery({
    queryKey: ['metrics', projectId],
    queryFn: () => api.get<Metrics>(`/projects/${projectId}/metrics`).then((r) => r.data),
    enabled: !!projectId,
    refetchInterval: 15000,
  });

  const throughputData = (metrics?.throughputByHour ?? []).map((d) => ({
    hour: format(new Date(d.hour), 'HH:mm'),
    completed: d.count,
  }));

  const pieData = Object.entries(metrics?.totalJobs ?? {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: k, value: v }));

  const kpis = [
    {
      label: 'Total Executions (24h)',
      value: metrics?.executionsLast24h?.toLocaleString() ?? '—',
      icon: BarChart2, color: 'var(--violet)',
    },
    {
      label: 'Avg Duration',
      value: metrics?.avgDurationMs ? `${Math.round(metrics.avgDurationMs)}ms` : '—',
      icon: Clock, color: 'var(--cyan)',
    },
    {
      label: 'Error Rate (24h)',
      value: metrics?.errorRate24h != null ? `${metrics.errorRate24h.toFixed(1)}%` : '—',
      icon: AlertTriangle,
      color: (metrics?.errorRate24h ?? 0) > 5 ? 'var(--rose)' : 'var(--emerald)',
    },
    {
      label: 'p100 Duration',
      value: metrics?.maxDurationMs ? `${Math.round(metrics.maxDurationMs)}ms` : '—',
      icon: TrendingUp, color: 'var(--amber)',
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Metrics</h1>
          <p className="page-subtitle">System performance & health analytics</p>
        </div>
      </div>

      <div className="page-body">
        {/* KPIs */}
        <div className="stat-grid mb-6">
          {kpis.map((k) => (
            <div key={k.label} className="stat-card" style={{ '--accent-gradient': `linear-gradient(90deg, ${k.color}, transparent)` } as React.CSSProperties}>
              <div className="stat-label">{k.label}</div>
              <div className="stat-value" style={{ fontSize: 22 }}>{k.value}</div>
              <k.icon size={40} color={k.color} style={{ opacity: 0.12, position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)' }} />
            </div>
          ))}
        </div>

        {/* Charts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, marginBottom: 20 }}>
          {/* Throughput */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Throughput — Last 24h</span>
            </div>
            <div className="card-body" style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={throughputData}>
                  <defs>
                    <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#4a5470' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#4a5470' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#12141a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="completed" stroke="#8b5cf6" fill="url(#grad1)" strokeWidth={2} name="Completed" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Job distribution pie */}
          <div className="card">
            <div className="card-header"><span className="card-title">Job Distribution</span></div>
            <div className="card-body" style={{ height: 260, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={PIE_COLORS[entry.name] ?? '#8b5cf6'} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#12141a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', justifyContent: 'center', marginTop: 4 }}>
                {pieData.map((d) => (
                  <span key={d.name} style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[d.name] ?? '#8b5cf6', display: 'inline-block' }} />
                    {d.name.toLowerCase()} ({d.value})
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetricsPage;
