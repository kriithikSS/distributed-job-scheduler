import React from 'react';
import type { JobStatus, WorkerStatus, QueueStatus } from '../types';

interface BadgeProps { value: string; }

const jobStatusMap: Record<JobStatus, string> = {
  QUEUED:    'badge badge-queued',
  SCHEDULED: 'badge badge-scheduled',
  CLAIMED:   'badge badge-claimed',
  RUNNING:   'badge badge-running',
  COMPLETED: 'badge badge-completed',
  FAILED:    'badge badge-failed',
  DEAD:      'badge badge-dead',
  CANCELLED: 'badge badge-cancelled',
};

export const JobStatusBadge: React.FC<BadgeProps> = ({ value }) => (
  <span className={jobStatusMap[value as JobStatus] ?? 'badge'}>
    {value === 'RUNNING' && <span className="spinner" style={{ width: 8, height: 8, borderWidth: 1.5 }} />}
    {value.toLowerCase()}
  </span>
);

const workerStatusMap: Record<WorkerStatus, string> = {
  ACTIVE:   'badge badge-active',
  DRAINING: 'badge badge-draining',
  OFFLINE:  'badge badge-offline',
};

export const WorkerStatusBadge: React.FC<BadgeProps> = ({ value }) => (
  <span className={workerStatusMap[value as WorkerStatus] ?? 'badge'}>
    {value.toLowerCase()}
  </span>
);

const queueStatusMap: Record<QueueStatus, string> = {
  ACTIVE: 'badge badge-active',
  PAUSED: 'badge badge-paused',
};

export const QueueStatusBadge: React.FC<BadgeProps> = ({ value }) => (
  <span className={queueStatusMap[value as QueueStatus] ?? 'badge'}>
    {value.toLowerCase()}
  </span>
);

export const LogLevelBadge: React.FC<BadgeProps> = ({ value }) => {
  const map: Record<string, string> = {
    DEBUG: 'badge',
    INFO:  'badge badge-active',
    WARN:  'badge badge-claimed',
    ERROR: 'badge badge-failed',
  };
  return <span className={map[value] ?? 'badge'}>{value}</span>;
};
