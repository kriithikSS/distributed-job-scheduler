import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, RefreshCw, XCircle, ChevronLeft, ChevronRight, Briefcase } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import api from '../api/client';
import type { Organization, Project, Queue, Job, PaginatedResponse } from '../types';
import { JobStatusBadge } from '../components/StatusBadge';

const JOB_STATUSES = ['', 'QUEUED', 'SCHEDULED', 'CLAIMED', 'RUNNING', 'COMPLETED', 'FAILED', 'DEAD', 'CANCELLED'];
const JOB_TYPES = ['', 'IMMEDIATE', 'DELAYED', 'SCHEDULED', 'RECURRING', 'BATCH'];

const JobsPage: React.FC = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const [jobForm, setJobForm] = useState({
    type: 'IMMEDIATE', name: '', payload: '{}', priority: 0,
    maxRetries: 3, delaySeconds: '', cronExpression: '', runAt: '',
  });

  const page = parseInt(params.get('page') ?? '1');
  const status = params.get('status') ?? '';
  const type = params.get('type') ?? '';

  const { data: orgs } = useQuery({ queryKey: ['orgs'], queryFn: () => api.get<Organization[]>('/organizations').then((r) => r.data) });
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
  });

  const queueId = params.get('queueId') ?? queues?.[0]?.id ?? '';

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['jobs', queueId, page, status, type],
    queryFn: () => api.get<PaginatedResponse<Job>>(`/queues/${queueId}/jobs`, {
      params: { page, limit: 20, ...(status && { status }), ...(type && { type }) }
    }).then((r) => r.data),
    enabled: !!queueId,
    refetchInterval: 3000,
  });

  const retryMutation = useMutation({
    mutationFn: (jobId: string) => api.post(`/jobs/${jobId}/retry`).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs'] }); toast.success('Job re-queued'); },
    onError: () => toast.error('Failed to retry job'),
  });

  const cancelMutation = useMutation({
    mutationFn: (jobId: string) => api.post(`/jobs/${jobId}/cancel`).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs'] }); toast.success('Job cancelled'); },
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post(`/queues/${queueId}/jobs`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      setShowCreate(false);
      toast.success('Job created');
    },
    onError: (err: unknown) => toast.error('Failed to create job'),
  });

  const handleCreateJob = () => {
    let payload: unknown;
    try { payload = JSON.parse(jobForm.payload); } catch { toast.error('Invalid JSON payload'); return; }

    const data: Record<string, unknown> = {
      type: jobForm.type,
      name: jobForm.name || undefined,
      payload,
      priority: jobForm.priority,
      maxRetries: jobForm.maxRetries,
    };
    if (jobForm.type === 'DELAYED' && jobForm.delaySeconds) data.delaySeconds = parseInt(jobForm.delaySeconds);
    if (jobForm.type === 'SCHEDULED' && jobForm.runAt) data.runAt = jobForm.runAt;
    if (jobForm.type === 'RECURRING') data.cronExpression = jobForm.cronExpression;

    createMutation.mutate(data);
  };

  const meta = jobs?.meta;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Jobs</h1>
          <p className="page-subtitle">Browse and manage all jobs</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Create Job
        </button>
      </div>

      <div className="page-body">
        {/* Filters */}
        <div className="flex gap-3 mb-6" style={{ flexWrap: 'wrap' }}>
          <select className="form-select" style={{ width: 'auto' }} value={queueId}
            onChange={(e) => { params.set('queueId', e.target.value); params.delete('page'); setParams(params); }}>
            {(queues ?? []).map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
          </select>
          <select className="form-select" style={{ width: 'auto' }} value={status}
            onChange={(e) => { if (e.target.value) params.set('status', e.target.value); else params.delete('status'); params.delete('page'); setParams(params); }}>
            {JOB_STATUSES.map((s) => <option key={s} value={s}>{s || 'All Statuses'}</option>)}
          </select>
          <select className="form-select" style={{ width: 'auto' }} value={type}
            onChange={(e) => { if (e.target.value) params.set('type', e.target.value); else params.delete('type'); params.delete('page'); setParams(params); }}>
            {JOB_TYPES.map((t) => <option key={t} value={t}>{t || 'All Types'}</option>)}
          </select>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name / ID</th>
                <th>Type</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Retries</th>
                <th>Run At</th>
                <th>Worker</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8}><div className="empty-state"><div className="spinner" /><span>Loading...</span></div></td></tr>
              )}
              {(jobs?.data ?? []).map((job) => (
                <tr key={job.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/jobs/${job.id}`)}>
                  <td>
                    <div className="td-primary truncate" style={{ maxWidth: 200 }}>{job.name ?? '—'}</div>
                    <div className="td-mono" style={{ fontSize: 11 }}>{job.id.slice(0, 8)}…</div>
                  </td>
                  <td><span className="badge" style={{ background: 'rgba(139,92,246,0.1)', color: 'var(--violet-light)' }}>{job.type}</span></td>
                  <td><JobStatusBadge value={job.status} /></td>
                  <td style={{ color: job.priority > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>{job.priority}</td>
                  <td style={{ color: job.retryCount > 0 ? 'var(--rose)' : 'var(--text-muted)' }}>
                    {job.retryCount}/{job.maxRetries}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {format(new Date(job.runAt), 'MMM d, HH:mm:ss')}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {job.worker?.hostname ?? '—'}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      {['FAILED', 'DEAD', 'CANCELLED'].includes(job.status) && (
                        <button className="btn btn-sm btn-success" onClick={() => retryMutation.mutate(job.id)}>
                          <RefreshCw size={12} /> Retry
                        </button>
                      )}
                      {!['COMPLETED', 'CANCELLED', 'DEAD'].includes(job.status) && (
                        <button className="btn btn-sm btn-danger" onClick={() => cancelMutation.mutate(job.id)}>
                          <XCircle size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && !jobs?.data?.length && (
                <tr><td colSpan={8}><div className="empty-state"><Briefcase size={32} style={{ opacity: 0.3 }} /><span>No jobs found</span></div></td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {((page - 1) * 20) + 1}–{Math.min(page * 20, meta.total)} of {meta.total} jobs
            </span>
            <div className="flex gap-2">
              <button className="btn btn-secondary btn-sm" disabled={page <= 1}
                onClick={() => { params.set('page', String(page - 1)); setParams(params); }}>
                <ChevronLeft size={14} /> Prev
              </button>
              <button className="btn btn-secondary btn-sm" disabled={page >= meta.totalPages}
                onClick={() => { params.set('page', String(page + 1)); setParams(params); }}>
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Job Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Create Job</span>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Job Type</label>
                  <select className="form-select" value={jobForm.type}
                    onChange={(e) => setJobForm({ ...jobForm, type: e.target.value })}>
                    {['IMMEDIATE', 'DELAYED', 'SCHEDULED', 'RECURRING', 'BATCH'].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Name (optional)</label>
                  <input className="form-input" placeholder="my-job" value={jobForm.name}
                    onChange={(e) => setJobForm({ ...jobForm, name: e.target.value })} />
                </div>
              </div>

              {jobForm.type === 'DELAYED' && (
                <div className="form-group">
                  <label className="form-label">Delay (seconds)</label>
                  <input type="number" className="form-input" value={jobForm.delaySeconds}
                    onChange={(e) => setJobForm({ ...jobForm, delaySeconds: e.target.value })} />
                </div>
              )}
              {jobForm.type === 'SCHEDULED' && (
                <div className="form-group">
                  <label className="form-label">Run At (ISO datetime)</label>
                  <input type="datetime-local" className="form-input" value={jobForm.runAt}
                    onChange={(e) => setJobForm({ ...jobForm, runAt: e.target.value })} />
                </div>
              )}
              {jobForm.type === 'RECURRING' && (
                <div className="form-group">
                  <label className="form-label">Cron Expression</label>
                  <input className="form-input" placeholder="0 2 * * *" value={jobForm.cronExpression}
                    onChange={(e) => setJobForm({ ...jobForm, cronExpression: e.target.value })} />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Payload (JSON)</label>
                <textarea className="form-textarea" rows={4} value={jobForm.payload}
                  onChange={(e) => setJobForm({ ...jobForm, payload: e.target.value })}
                  style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }} />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Priority (0–100)</label>
                  <input type="number" className="form-input" min={0} max={100} value={jobForm.priority}
                    onChange={(e) => setJobForm({ ...jobForm, priority: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Max Retries</label>
                  <input type="number" className="form-input" min={0} max={50} value={jobForm.maxRetries}
                    onChange={(e) => setJobForm({ ...jobForm, maxRetries: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={createMutation.isPending} onClick={handleCreateJob}>
                {createMutation.isPending ? <><div className="spinner" />Creating...</> : 'Create Job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobsPage;
