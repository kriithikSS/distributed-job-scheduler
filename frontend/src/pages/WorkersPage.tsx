import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Cpu, Activity } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import api from '../api/client';
import type { Worker } from '../types';
import { WorkerStatusBadge } from '../components/StatusBadge';

const WorkersPage: React.FC = () => {
  const navigate = useNavigate();

  const { data: workers, isLoading } = useQuery({
    queryKey: ['workers'],
    queryFn: () => api.get<Worker[]>('/workers').then((r) => r.data),
    refetchInterval: 5000,
  });

  const active = workers?.filter((w) => w.status === 'ACTIVE' && !w.isStale).length ?? 0;
  const total = workers?.length ?? 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Workers</h1>
          <p className="page-subtitle">Monitor distributed worker instances</p>
        </div>
        <span style={{ fontSize: 13, color: 'var(--emerald)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--emerald)', display: 'inline-block' }} />
          {active}/{total} active
        </span>
      </div>

      <div className="page-body">
        {isLoading && <div className="empty-state"><div className="spinner" /></div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(workers ?? []).map((w) => {
            const effectiveStatus = w.isStale ? 'OFFLINE' : w.status;
            const lastHb = w.heartbeats?.[0];
            const memMb = lastHb?.memoryMb ? Math.round(lastHb.memoryMb) : null;

            return (
              <div
                key={w.id}
                className="card"
                style={{ padding: '20px', cursor: 'pointer' }}
                onClick={() => navigate(`/workers/${w.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div style={{
                      width: 40, height: 40,
                      background: effectiveStatus === 'ACTIVE'
                        ? 'rgba(6,182,212,0.15)'
                        : effectiveStatus === 'DRAINING'
                        ? 'rgba(249,115,22,0.15)'
                        : 'rgba(100,116,139,0.15)',
                      borderRadius: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Cpu size={20} color={
                        effectiveStatus === 'ACTIVE' ? 'var(--cyan)' :
                        effectiveStatus === 'DRAINING' ? '#fb923c' : 'var(--text-muted)'
                      } />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{w.hostname}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        PID {w.pid} · Started {formatDistanceToNow(new Date(w.startedAt), { addSuffix: true })}
                      </div>
                    </div>
                    <WorkerStatusBadge value={effectiveStatus} />
                  </div>

                  <div className="flex gap-6">
                    {[
                      { label: 'Active Jobs', value: lastHb?.jobsActive ?? 0 },
                      { label: 'Concurrency', value: w.concurrency },
                      { label: 'Memory', value: memMb ? `${memMb}MB` : '—' },
                      { label: 'Last Seen', value: format(new Date(w.lastSeenAt), 'HH:mm:ss') },
                    ].map((s) => (
                      <div key={s.label} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 17, fontWeight: 700 }}>{s.value}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Utilization bar */}
                {lastHb && w.concurrency > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                      Utilization: {Math.round((lastHb.jobsActive / w.concurrency) * 100)}%
                    </div>
                    <div style={{ height: 3, background: 'var(--bg-elevated)', borderRadius: 2 }}>
                      <div style={{
                        width: `${Math.min(100, (lastHb.jobsActive / w.concurrency) * 100)}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, var(--violet), var(--cyan))',
                        borderRadius: 2,
                        transition: 'width 0.5s',
                      }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!isLoading && !workers?.length && (
            <div className="empty-state">
              <Cpu size={40} style={{ opacity: 0.3 }} />
              <span>No workers registered. Start the worker service to see it here.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkersPage;
