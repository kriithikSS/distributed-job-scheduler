import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle, Clock, Zap, AlertTriangle, XCircle, Layers,
  Cpu, TrendingUp, Activity
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import api from '../api/client';
import type { Organization, Project, Queue, Worker, Metrics } from '../types';
import { QueueStatusBadge, WorkerStatusBadge, JobStatusBadge } from '../components/StatusBadge';
import { format } from 'date-fns';

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  // Load orgs → pick first org → pick first project
  const { data: orgs } = useQuery({
    queryKey: ['orgs'],
    queryFn: () => api.get<Organization[]>('/organizations').then((r) => r.data),
    refetchInterval: 30000,
  });

  const orgId = orgs?.[0]?.id;

  const { data: projects } = useQuery({
    queryKey: ['projects', orgId],
    queryFn: () => api.get<Project[]>(`/organizations/${orgId}/projects`).then((r) => r.data),
    enabled: !!orgId,
  });

  const projectId = projects?.[0]?.id;

  const { data: queues } = useQuery({
    queryKey: ['queues', projectId],
    queryFn: () => api.get<Queue[]>(`/projects/${projectId}/queues`).then((r) => r.data),
    enabled: !!projectId,
    refetchInterval: 5000,
  });

  const { data: workers } = useQuery({
    queryKey: ['workers'],
    queryFn: () => api.get<Worker[]>('/workers').then((r) => r.data),
    refetchInterval: 5000,
  });

  const { data: metrics } = useQuery({
    queryKey: ['metrics', projectId],
    queryFn: () => api.get<Metrics>(`/projects/${projectId}/metrics`).then((r) => r.data),
    enabled: !!projectId,
    refetchInterval: 10000,
  });

  const totalJobs = metrics?.totalJobs ?? {};
  const activeWorkers = workers?.filter((w) => w.status === 'ACTIVE' && !w.isStale).length ?? 0;
  const totalQueues = queues?.length ?? 0;
  const completedJobs = totalJobs['COMPLETED'] ?? 0;
  const failedJobs = totalJobs['FAILED'] ?? 0;

  const stats = [
    { label: 'Active Workers', value: activeWorkers, icon: Cpu, color: 'var(--cyan)' },
    { label: 'Total Queues', value: totalQueues, icon: Layers, color: 'var(--violet)' },
    { label: 'Completed (total)', value: completedJobs.toLocaleString(), icon: CheckCircle, color: 'var(--emerald)' },
    { label: 'Failed (total)', value: failedJobs.toLocaleString(), icon: XCircle, color: 'var(--rose)' },
    { label: 'Executions 24h', value: metrics?.executionsLast24h?.toLocaleString() ?? '—', icon: Activity, color: 'var(--amber)' },
    { label: 'Avg Duration', value: metrics?.avgDurationMs ? `${Math.round(metrics.avgDurationMs)}ms` : '—', icon: TrendingUp, color: 'var(--cyan)' },
  ];

  const chartData = (metrics?.throughputByHour ?? []).map((d) => ({
    hour: format(new Date(d.hour), 'HH:mm'),
    completed: d.count,
  }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">System overview & health at a glance</p>
        </div>
        <div className="flex gap-2">
          <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--emerald)', display: 'inline-block' }} />
            Live — auto refresh
          </span>
        </div>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div className="stat-grid mb-6">
          {stats.map((s) => (
            <div key={s.label} className="stat-card" style={{ '--accent-gradient': `linear-gradient(90deg, ${s.color}, transparent)` } as React.CSSProperties}>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value">{s.value}</div>
              <s.icon size={40} className="stat-icon" color={s.color} style={{ opacity: 0.15, position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)' }} />
            </div>
          ))}
        </div>

        {/* Charts + Queues */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          {/* Throughput chart */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Throughput — Last 24h</span>
              <TrendingUp size={16} color="var(--violet-light)" />
            </div>
            <div className="card-body" style={{ height: 220 }}>
              {chartData.length === 0 ? (
                <div className="empty-state" style={{ height: '100%' }}>
                  <Activity size={32} style={{ opacity: 0.3 }} />
                  <span>No execution data yet</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="throughputGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#4a5470' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#4a5470' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#12141a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: '#8b95b0' }}
                    />
                    <Area type="monotone" dataKey="completed" stroke="#8b5cf6" fill="url(#throughputGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Queue health */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Queue Health</span>
              <Layers size={16} color="var(--violet-light)" />
            </div>
            <div style={{ overflow: 'hidden' }}>
              {(queues ?? []).slice(0, 6).map((q) => {
                const running = q.statusCounts?.['RUNNING'] ?? 0;
                const queued = q.statusCounts?.['QUEUED'] ?? 0;
                const pct = Math.min(100, (running / q.concurrencyLimit) * 100);
                return (
                  <div
                    key={q.id}
                    style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => navigate(`/queues/${q.id}`)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{q.name}</span>
                      <QueueStatusBadge value={q.status} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                      {running}/{q.concurrencyLimit} running · {queued} queued
                    </div>
                    <div style={{ height: 3, background: 'var(--bg-elevated)', borderRadius: 2 }}>
                      <div style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: pct > 80 ? 'var(--rose)' : 'var(--violet)',
                        borderRadius: 2,
                        transition: 'width 0.5s ease'
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Workers */}
        <div className="card mt-4">
          <div className="card-header">
            <span className="card-title">Workers</span>
            <Cpu size={16} color="var(--violet-light)" />
          </div>
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Hostname</th>
                  <th>PID</th>
                  <th>Status</th>
                  <th>Concurrency</th>
                  <th>Active Jobs</th>
                  <th>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {(workers ?? []).map((w) => (
                  <tr key={w.id} onClick={() => navigate(`/workers/${w.id}`)} style={{ cursor: 'pointer' }}>
                    <td className="td-primary">{w.hostname}</td>
                    <td className="td-mono">{w.pid}</td>
                    <td><WorkerStatusBadge value={w.isStale ? 'OFFLINE' : w.status} /></td>
                    <td>{w.concurrency}</td>
                    <td>{w.heartbeats?.[0]?.jobsActive ?? 0}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {format(new Date(w.lastSeenAt), 'HH:mm:ss')}
                    </td>
                  </tr>
                ))}
                {!workers?.length && (
                  <tr><td colSpan={6}><div className="empty-state"><Cpu size={24} style={{ opacity: 0.3 }} /><span>No workers registered</span></div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
