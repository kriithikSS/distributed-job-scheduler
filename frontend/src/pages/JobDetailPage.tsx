import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, XCircle, Clock, Cpu, AlertTriangle, CheckCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../api/client';
import type { Job, JobExecution, JobLog } from '../types';
import { JobStatusBadge, LogLevelBadge } from '../components/StatusBadge';

const JobDetailPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: job } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api.get<Job>(`/jobs/${jobId}`).then((r) => r.data),
    refetchInterval: 3000,
  });

  const { data: executions } = useQuery({
    queryKey: ['executions', jobId],
    queryFn: () => api.get<JobExecution[]>(`/jobs/${jobId}/executions`).then((r) => r.data),
    refetchInterval: 3000,
  });

  const { data: logs } = useQuery({
    queryKey: ['logs', jobId],
    queryFn: () => api.get<JobLog[]>(`/jobs/${jobId}/logs`).then((r) => r.data),
    refetchInterval: job?.status === 'RUNNING' ? 2000 : false,
  });

  const retryMutation = useMutation({
    mutationFn: () => api.post(`/jobs/${jobId}/retry`).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['job', jobId] }); toast.success('Job re-queued'); },
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/jobs/${jobId}/cancel`).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['job', jobId] }); toast.success('Job cancelled'); },
  });

  if (!job) return <div className="empty-state"><div className="spinner" /><span>Loading...</span></div>;

  const duration = job.startedAt && job.completedAt
    ? Math.round(new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime())
    : null;

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button className="btn btn-secondary btn-icon" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="page-title">{job.name ?? 'Unnamed Job'}</h1>
            <p className="page-subtitle font-mono" style={{ fontSize: 11 }}>{job.id}</p>
          </div>
          <JobStatusBadge value={job.status} />
        </div>
        <div className="flex gap-2">
          {['FAILED', 'DEAD', 'CANCELLED'].includes(job.status) && (
            <button className="btn btn-success" onClick={() => retryMutation.mutate()}>
              <RefreshCw size={14} /> Retry
            </button>
          )}
          {!['COMPLETED', 'CANCELLED', 'DEAD'].includes(job.status) && (
            <button className="btn btn-danger" onClick={() => cancelMutation.mutate()}>
              <XCircle size={14} /> Cancel
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        {/* Timeline */}
        <div className="stat-grid mb-6">
          {[
            { label: 'Type', value: job.type },
            { label: 'Priority', value: job.priority },
            { label: 'Retries', value: `${job.retryCount}/${job.maxRetries}` },
            { label: 'Duration', value: duration ? `${duration}ms` : '—' },
          ].map((s) => (
            <div key={s.label} className="stat-card">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ fontSize: 20 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Details */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">Payload</span></div>
            <div className="card-body">
              <pre style={{
                fontSize: 12, fontFamily: 'JetBrains Mono, monospace',
                color: 'var(--cyan-light)', overflow: 'auto', maxHeight: 240,
                background: 'var(--bg-elevated)', padding: 12, borderRadius: 6
              }}>
                {JSON.stringify(job.payload, null, 2)}
              </pre>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Timeline</span></div>
            <div className="card-body">
              {[
                { label: 'Created', value: job.createdAt },
                { label: 'Run At', value: job.runAt },
                { label: 'Claimed', value: job.claimedAt },
                { label: 'Started', value: job.startedAt },
                { label: 'Completed', value: job.completedAt },
                { label: 'Failed', value: job.failedAt },
              ].filter((r) => r.value).map((r) => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.label}</span>
                  <span style={{ fontSize: 12 }}>{format(new Date(r.value!), 'MMM d, HH:mm:ss.SSS')}</span>
                </div>
              ))}
              {job.worker && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Worker</span>
                  <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>{job.worker.hostname}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Last error */}
        {job.lastError && (
          <div className="card mb-4" style={{ borderColor: 'rgba(244,63,94,0.3)' }}>
            <div className="card-header">
              <span className="card-title" style={{ color: 'var(--rose)' }}>
                <AlertTriangle size={14} style={{ display: 'inline', marginRight: 6 }} />
                Last Error
              </span>
            </div>
            <div className="card-body">
              <pre style={{ fontSize: 12, color: 'var(--rose)', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'pre-wrap' }}>
                {job.lastError}
              </pre>
            </div>
          </div>
        )}

        {/* Execution history */}
        <div className="card mb-4">
          <div className="card-header"><span className="card-title">Execution History</span></div>
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Attempt</th>
                  <th>Status</th>
                  <th>Worker</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {(executions ?? []).map((ex) => (
                  <tr key={ex.id}>
                    <td className="td-primary">#{ex.attemptNumber}</td>
                    <td><span className={`badge ${ex.status === 'COMPLETED' ? 'badge-completed' : ex.status === 'FAILED' ? 'badge-failed' : 'badge-running'}`}>{ex.status}</span></td>
                    <td style={{ fontSize: 12 }}>{ex.worker?.hostname ?? ex.workerId.slice(0, 8)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{format(new Date(ex.startedAt), 'HH:mm:ss')}</td>
                    <td style={{ fontSize: 12 }}>{ex.durationMs ? `${ex.durationMs}ms` : '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--rose)', maxWidth: 200 }} className="truncate">{ex.errorMessage ?? '—'}</td>
                  </tr>
                ))}
                {!executions?.length && (
                  <tr><td colSpan={6}><div className="empty-state">No executions yet</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Logs */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Execution Logs</span>
            {job.status === 'RUNNING' && (
              <span style={{ fontSize: 11, color: 'var(--cyan)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="spinner" style={{ width: 10, height: 10 }} /> Live
              </span>
            )}
          </div>
          <div style={{ background: 'var(--bg-base)', borderRadius: '0 0 var(--radius-md) var(--radius-md)', padding: 16, maxHeight: 400, overflow: 'auto' }}>
            {(logs ?? []).length === 0 && (
              <div className="empty-state" style={{ padding: 24 }}>No logs yet</div>
            )}
            {(logs ?? []).map((log) => (
              <div key={log.id} style={{ display: 'flex', gap: 12, marginBottom: 4, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                  {format(new Date(log.createdAt), 'HH:mm:ss.SSS')}
                </span>
                <LogLevelBadge value={log.level} />
                <span style={{ color: log.level === 'ERROR' ? 'var(--rose)' : log.level === 'WARN' ? 'var(--amber)' : 'var(--text-secondary)' }}>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobDetailPage;
