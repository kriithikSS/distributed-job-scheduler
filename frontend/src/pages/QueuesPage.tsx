import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Pause, Play, Trash2, Settings, ChevronRight, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import type { Organization, Project, Queue } from '../types';
import { QueueStatusBadge } from '../components/StatusBadge';

const QueuesPage: React.FC = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', priority: 0, concurrencyLimit: 5 });

  const { data: orgs } = useQuery({
    queryKey: ['orgs'],
    queryFn: () => api.get<Organization[]>('/organizations').then((r) => r.data),
  });
  const orgId = orgs?.[0]?.id;

  const { data: projects } = useQuery({
    queryKey: ['projects', orgId],
    queryFn: () => api.get<Project[]>(`/organizations/${orgId}/projects`).then((r) => r.data),
    enabled: !!orgId,
  });
  const projectId = projects?.[0]?.id;

  const { data: queues, isLoading } = useQuery({
    queryKey: ['queues', projectId],
    queryFn: () => api.get<Queue[]>(`/projects/${projectId}/queues`).then((r) => r.data),
    enabled: !!projectId,
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      api.post(`/projects/${projectId}/queues`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queues', projectId] });
      setShowCreate(false);
      setForm({ name: '', priority: 0, concurrencyLimit: 5 });
      toast.success('Queue created');
    },
    onError: () => toast.error('Failed to create queue'),
  });

  const pauseMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'pause' | 'resume' }) =>
      api.post(`/queues/${id}/${action}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queues'] });
      toast.success('Queue updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/queues/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queues'] });
      toast.success('Queue deleted');
    },
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Queues</h1>
          <p className="page-subtitle">Manage job queues, concurrency, and retry policies</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Queue
        </button>
      </div>

      <div className="page-body">
        {isLoading && <div className="empty-state"><div className="spinner" /><span>Loading queues...</span></div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(queues ?? []).map((q) => {
            const running = q.statusCounts?.['RUNNING'] ?? 0;
            const queued = q.statusCounts?.['QUEUED'] ?? 0;
            const failed = q.statusCounts?.['FAILED'] ?? 0;
            const completed = q.statusCounts?.['COMPLETED'] ?? 0;
            const pct = Math.min(100, q.concurrencyLimit > 0 ? (running / q.concurrencyLimit) * 100 : 0);

            return (
              <div key={q.id} className="card" style={{ padding: 0 }}>
                <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div className="flex items-center gap-2 mb-1">
                      <Layers size={16} color="var(--violet-light)" />
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{q.name}</span>
                      <QueueStatusBadge value={q.status} />
                      {q.priority > 0 && (
                        <span className="badge" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--amber)' }}>
                          P{q.priority}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Concurrency: {q.concurrencyLimit} · Retry: {q.retryPolicy?.name ?? 'None'}
                    </div>
                  </div>

                  {/* Status counts */}
                  <div style={{ display: 'flex', gap: 20 }}>
                    {[
                      { label: 'Running', value: running, color: 'var(--cyan)' },
                      { label: 'Queued', value: queued, color: 'var(--violet)' },
                      { label: 'Completed', value: completed, color: 'var(--emerald)' },
                      { label: 'Failed', value: failed, color: 'var(--rose)' },
                    ].map((s) => (
                      <div key={s.label} style={{ textAlign: 'center', minWidth: 56 }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      className={`btn btn-sm ${q.status === 'ACTIVE' ? 'btn-secondary' : 'btn-success'}`}
                      onClick={() => pauseMutation.mutate({ id: q.id, action: q.status === 'ACTIVE' ? 'pause' : 'resume' })}
                    >
                      {q.status === 'ACTIVE' ? <Pause size={14} /> : <Play size={14} />}
                      {q.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                    </button>
                    <button className="btn btn-sm btn-secondary" onClick={() => navigate(`/queues/${q.id}`)}>
                      <Settings size={14} /> View
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => {
                      if (confirm('Delete this queue? All jobs will be deleted.')) deleteMutation.mutate(q.id);
                    }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Concurrency bar */}
                <div style={{ height: 3, background: 'var(--bg-elevated)' }}>
                  <div style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: pct > 80 ? 'var(--rose)' : 'linear-gradient(90deg, var(--violet), var(--cyan))',
                    borderRadius: '0 2px 2px 0',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            );
          })}

          {!isLoading && !queues?.length && (
            <div className="empty-state">
              <Layers size={40} style={{ opacity: 0.3 }} />
              <span>No queues yet. Create one to get started.</span>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">New Queue</span>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Queue Name</label>
                <input className="form-input" placeholder="e.g. email-sending" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Priority (0–100)</label>
                  <input type="number" className="form-input" min={0} max={100} value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Concurrency Limit</label>
                  <input type="number" className="form-input" min={1} max={100} value={form.concurrencyLimit}
                    onChange={(e) => setForm({ ...form, concurrencyLimit: parseInt(e.target.value) || 1 })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!form.name || createMutation.isPending}
                onClick={() => createMutation.mutate(form)}>
                {createMutation.isPending ? <><div className="spinner" /> Creating...</> : 'Create Queue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QueuesPage;
