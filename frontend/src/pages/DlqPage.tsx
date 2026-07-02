import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Skull, RefreshCw } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../api/client';
import type { Organization, Project, DlqEntry, PaginatedResponse } from '../types';

const DlqPage: React.FC = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: orgs } = useQuery({ queryKey: ['orgs'], queryFn: () => api.get<Organization[]>('/organizations').then((r) => r.data) });
  const orgId = orgs?.[0]?.id;

  const { data: projects } = useQuery({
    queryKey: ['projects', orgId],
    queryFn: () => api.get<Project[]>(`/organizations/${orgId}/projects`).then((r) => r.data),
    enabled: !!orgId,
  });
  const projectId = projects?.[0]?.id;

  const { data: dlq, isLoading } = useQuery({
    queryKey: ['dlq', projectId],
    queryFn: () => api.get<PaginatedResponse<DlqEntry>>(`/projects/${projectId}/dlq`).then((r) => r.data),
    enabled: !!projectId,
    refetchInterval: 10000,
  });

  const replayMutation = useMutation({
    mutationFn: (entryId: string) => api.post(`/dlq/${entryId}/replay`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dlq'] });
      toast.success('Job replayed — moved back to queue');
    },
    onError: () => toast.error('Failed to replay job'),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dead Letter Queue</h1>
          <p className="page-subtitle">Jobs that exhausted all retry attempts</p>
        </div>
        <span style={{ fontSize: 13, color: 'var(--rose)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Skull size={14} />
          {dlq?.meta.total ?? 0} entries
        </span>
      </div>

      <div className="page-body">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Job Name</th>
                <th>Queue</th>
                <th>Failures</th>
                <th>Reason</th>
                <th>Moved At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6}><div className="empty-state"><div className="spinner" /></div></td></tr>
              )}
              {(dlq?.data ?? []).map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <div className="td-primary" style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/jobs/${entry.jobId}`)}>
                      {entry.job?.name ?? 'Unnamed'}
                    </div>
                    <div className="td-mono">{entry.jobId.slice(0, 8)}…</div>
                  </td>
                  <td style={{ color: 'var(--violet-light)' }}>{entry.queue?.name}</td>
                  <td>
                    <span className="badge badge-failed">{entry.failureCount}x</span>
                  </td>
                  <td style={{ maxWidth: 300 }}>
                    <div className="truncate" style={{ fontSize: 12, color: 'var(--rose)' }} title={entry.reason}>
                      {entry.reason}
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {formatDistanceToNow(new Date(entry.movedAt), { addSuffix: true })}
                  </td>
                  <td>
                    <button className="btn btn-sm btn-success"
                      onClick={() => replayMutation.mutate(entry.id)}
                      disabled={replayMutation.isPending}>
                      <RefreshCw size={12} /> Replay
                    </button>
                  </td>
                </tr>
              ))}
              {!isLoading && !dlq?.data?.length && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <Skull size={40} style={{ opacity: 0.3 }} />
                      <span>🎉 Dead letter queue is empty!</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DlqPage;
