# API Reference — Distributed Job Scheduler

All endpoints require `Authorization: Bearer <token>` unless marked public.

Base URL: `http://localhost:3001/api`

---

## Authentication

### POST /auth/register
Create a new user account.

**Request**
```json
{ "email": "user@example.com", "password": "secret123", "name": "Alice" }
```
**Response** `201`
```json
{ "token": "<jwt>", "user": { "id": "...", "email": "...", "name": "..." } }
```

---

### POST /auth/login
**Request**
```json
{ "email": "user@example.com", "password": "secret123" }
```
**Response** `200`
```json
{ "token": "<jwt>", "user": { "id": "...", "email": "...", "name": "..." } }
```

---

### GET /auth/me
Returns the authenticated user.

**Response** `200`
```json
{ "id": "...", "email": "...", "name": "..." }
```

---

## Organizations

### GET /organizations
List all orgs the user belongs to.

**Response** `200` — array of organizations

---

### POST /organizations
**Request**
```json
{ "name": "Acme Corp", "slug": "acme-corp" }
```
**Response** `201` — created organization

---

### GET /organizations/:orgId/projects
List all projects in an org.

---

### POST /organizations/:orgId/projects
**Request**
```json
{ "name": "Main App", "slug": "main-app" }
```

---

## Queues

### GET /projects/:projectId/queues
List queues with job status counts.

**Response** `200`
```json
[
  {
    "id": "uuid",
    "name": "email",
    "priority": 10,
    "concurrencyLimit": 10,
    "status": "ACTIVE",
    "retryPolicy": { ... },
    "statusCounts": { "QUEUED": 2, "COMPLETED": 45, "FAILED": 1 }
  }
]
```

---

### POST /projects/:projectId/queues
**Request**
```json
{
  "name": "email",
  "priority": 10,
  "concurrencyLimit": 10,
  "retryPolicyId": "uuid (optional)"
}
```

---

### GET /queues/:queueId
Get a single queue.

---

### PATCH /queues/:queueId
Update queue configuration. All fields optional.

```json
{ "priority": 5, "concurrencyLimit": 20 }
```

---

### DELETE /queues/:queueId
Delete queue and all associated jobs (cascade).

**Response** `204`

---

### POST /queues/:queueId/pause
Sets queue status to `PAUSED`. Workers skip paused queues.

**Response** `200` — updated queue

---

### POST /queues/:queueId/resume
Sets queue status back to `ACTIVE`.

---

### GET /queues/:queueId/stats
```json
{
  "statusCounts": { "QUEUED": 5, "RUNNING": 2, "COMPLETED": 100 },
  "recentExecutions": [...],
  "avgDurationMs": 342
}
```

---

### GET /queues/:queueId/metrics
```json
{
  "statusCounts": { ... },
  "throughput": [{ "hour": "2026-07-02T10:00:00Z", "completed": 12, "failed": 1 }],
  "activeJobs": 3
}
```

---

## Jobs

### POST /queues/:queueId/jobs
Create a job. `type` determines behavior.

**Common fields**
```json
{
  "name": "send-welcome-email",
  "payload": { "to": "user@example.com" },
  "priority": 5,
  "maxRetries": 3,
  "retryPolicyId": "uuid (optional)",
  "idempotencyKey": "unique-key (optional)"
}
```

**Type-specific fields**

| type | Extra fields | Behavior |
|---|---|---|
| `IMMEDIATE` | — | Run as soon as a worker is free |
| `DELAYED` | `delaySeconds: 300` | Run after N seconds |
| `SCHEDULED` | `runAt: "2026-07-10T09:00:00Z"` | Run at specific datetime |
| `RECURRING` | `cronExpression: "0 9 * * 1-5"` | Run on cron schedule |
| `BATCH` | `batchItems: [{...}, {...}]` | Creates parent + N child jobs |

**Response** `201` — created job (or `200` if idempotency key matches existing)

---

### GET /queues/:queueId/jobs
List jobs with pagination and filtering.

**Query params**
| Param | Type | Example |
|---|---|---|
| `status` | enum | `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `DEAD`, `CANCELLED` |
| `type` | enum | `IMMEDIATE`, `RECURRING`, etc. |
| `search` | string | Job name contains |
| `page` | int | `1` |
| `limit` | int | `20` (max 100) |

**Response** `200`
```json
{
  "data": [...],
  "meta": { "total": 150, "page": 1, "limit": 20, "totalPages": 8 }
}
```

---

### GET /jobs/:jobId
Get full job details including worker assignment.

---

### GET /jobs/:jobId/executions
Execution history for a job (all attempts).

```json
[
  {
    "id": "...",
    "attemptNumber": 1,
    "status": "FAILED",
    "durationMs": 1200,
    "errorMessage": "SMTP timeout",
    "startedAt": "...",
    "completedAt": "..."
  },
  {
    "id": "...",
    "attemptNumber": 2,
    "status": "COMPLETED",
    "durationMs": 340
  }
]
```

---

### GET /jobs/:jobId/logs
Structured log entries written during execution.

```json
[
  { "level": "INFO", "message": "Connecting to SMTP...", "createdAt": "..." },
  { "level": "ERROR", "message": "Connection refused", "metadata": {...} }
]
```

---

### POST /jobs/:jobId/retry
Manually retry a `FAILED`, `DEAD`, or `CANCELLED` job.
- Resets `retryCount` to 0
- Removes from DLQ if present
- Sets status to `QUEUED` with `runAt = now`

**Response** `200` — updated job

---

### POST /jobs/:jobId/cancel
Cancel a job in any non-terminal state.

**Response** `200` — updated job

---

## Workers

### GET /workers
List all registered workers with status.

```json
[
  {
    "id": "...",
    "hostname": "worker-1",
    "pid": 42,
    "status": "ACTIVE",
    "concurrency": 10,
    "lastSeenAt": "2026-07-02T10:55:00Z"
  }
]
```

---

## Metrics

### GET /projects/:projectId/metrics
Project-wide metrics.

```json
{
  "totalJobs": { "QUEUED": 5, "COMPLETED": 120, "FAILED": 3 },
  "executionsLast24h": 87,
  "avgDurationMs": 421,
  "minDurationMs": 12,
  "maxDurationMs": 4300,
  "errorRate24h": 2.4,
  "throughputByHour": [
    { "hour": "2026-07-02T09:00:00Z", "count": 14 }
  ]
}
```

---

## Dead Letter Queue

### GET /projects/:projectId/dlq
List all DLQ entries with pagination.

```json
{
  "data": [
    {
      "id": "...",
      "reason": "SMTP connection refused",
      "failureCount": 5,
      "movedAt": "...",
      "job": { "id": "...", "name": "send-reset-email", "type": "IMMEDIATE" },
      "queue": { "id": "...", "name": "email" }
    }
  ],
  "meta": { "total": 3, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### POST /dlq/:dlqEntryId/replay
Re-queue a dead job for execution.
- Deletes the DLQ entry
- Resets job to `QUEUED` with fresh retry counter

**Response** `200` — updated job

---

## Error Responses

All errors follow RFC 7807 (Problem Details):

```json
{
  "type": "https://httpstatuses.com/422",
  "title": "Unprocessable Entity",
  "status": 422,
  "detail": "Only failed, dead, or cancelled jobs can be retried"
}
```

| Status | Meaning |
|---|---|
| `400` | Validation error (Zod) |
| `401` | Missing or invalid JWT |
| `404` | Resource not found (or not in your org) |
| `422` | Business logic violation |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

---

## Rate Limits

| Scope | Limit |
|---|---|
| Auth endpoints | 10 req / 15 min per IP |
| All other endpoints | 100 req / min per IP |
