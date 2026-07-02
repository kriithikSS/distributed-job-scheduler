export type JobStatus = 'QUEUED' | 'SCHEDULED' | 'CLAIMED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'DEAD' | 'CANCELLED';
export type JobType = 'IMMEDIATE' | 'DELAYED' | 'SCHEDULED' | 'RECURRING' | 'BATCH';
export type QueueStatus = 'ACTIVE' | 'PAUSED';
export type WorkerStatus = 'ACTIVE' | 'DRAINING' | 'OFFLINE';
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type RetryStrategy = 'FIXED' | 'LINEAR' | 'EXPONENTIAL';

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  role?: string;
  _count?: { projects: number; members: number };
}

export interface Project {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  createdAt: string;
  _count?: { queues: number };
}

export interface RetryPolicy {
  id: string;
  name: string;
  strategy: RetryStrategy;
  maxAttempts: number;
  baseDelaySeconds: number;
  maxDelaySeconds: number;
}

export interface Queue {
  id: string;
  projectId: string;
  name: string;
  priority: number;
  concurrencyLimit: number;
  status: QueueStatus;
  retryPolicy?: RetryPolicy | null;
  statusCounts?: Record<JobStatus, number>;
  _count?: { jobs: number };
  createdAt: string;
  updatedAt: string;
}

export interface Job {
  id: string;
  queueId: string;
  type: JobType;
  status: JobStatus;
  name?: string | null;
  payload: Record<string, unknown>;
  priority: number;
  runAt: string;
  cronExpression?: string | null;
  parentJobId?: string | null;
  retryCount: number;
  maxRetries: number;
  workerId?: string | null;
  claimedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  worker?: { id: string; hostname: string } | null;
}

export interface JobExecution {
  id: string;
  jobId: string;
  workerId: string;
  attemptNumber: number;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  worker?: { id: string; hostname: string };
}

export interface JobLog {
  id: string;
  jobExecutionId: string;
  level: LogLevel;
  message: string;
  metadata?: unknown;
  createdAt: string;
}

export interface Worker {
  id: string;
  hostname: string;
  pid: number;
  status: WorkerStatus;
  concurrency: number;
  startedAt: string;
  lastSeenAt: string;
  isStale?: boolean;
  heartbeats?: Array<{ id: string; jobsActive: number; memoryMb: number; createdAt: string }>;
  _count?: { jobs: number };
}

export interface DlqEntry {
  id: string;
  jobId: string;
  queueId: string;
  reason: string;
  failureCount: number;
  lastError?: string | null;
  movedAt: string;
  job?: { id: string; name?: string | null; type: JobType; retryCount: number };
  queue?: { id: string; name: string };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface Metrics {
  totalJobs: Record<JobStatus, number>;
  executionsLast24h: number;
  avgDurationMs?: number | null;
  minDurationMs?: number | null;
  maxDurationMs?: number | null;
  errorRate24h: number;
  throughputByHour: Array<{ hour: string; count: number }>;
}
