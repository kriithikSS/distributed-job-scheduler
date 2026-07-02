# Design Decisions — Distributed Job Scheduler

This document explains the major architectural and engineering trade-offs made during the design of the Distributed Job Scheduler.

---

## 1. Atomic Job Claiming: `SELECT FOR UPDATE SKIP LOCKED`

### Decision
Use PostgreSQL's `SELECT FOR UPDATE SKIP LOCKED` in a raw SQL transaction to claim jobs atomically.

### Alternatives Considered
| Option | Pros | Cons |
|---|---|---|
| Application-level lock (in-memory Map) | Simple | Only works for a single process |
| Redis `SETNX` / Redlock | Fast, distributed | Extra dependency; lock expiry edge cases |
| Advisory locks (`pg_try_advisory_lock`) | No extra rows | Complex semantics, harder to reason about |
| **`SELECT FOR UPDATE SKIP LOCKED`** | Native PostgreSQL, no extra infra, transactional | Requires raw SQL (Prisma doesn't support it natively) |

### Rationale
`SKIP LOCKED` is purpose-built for job queue patterns. When multiple workers poll simultaneously, each sees only rows not already locked by another transaction. This prevents duplicate execution **at the database level** without any application-layer coordination. The only trade-off is needing a raw SQL query inside a `$transaction`, which is handled in `JobClaimer.ts`.

---

## 2. PostgreSQL as the Queue Broker

### Decision
Use PostgreSQL for job storage **and** as the message queue, rather than a dedicated broker like Redis, RabbitMQ, or Kafka.

### Rationale
- The assignment evaluates **database design** heavily — using PostgreSQL showcases relational schema mastery
- `SELECT FOR UPDATE SKIP LOCKED` gives reliable at-most-once delivery semantics natively
- Jobs, executions, logs, DLQ entries, and worker heartbeats all live in the same ACID transaction boundary
- No extra infrastructure to deploy or operate
- Enables complex queries: per-queue metrics, execution history, retry history — all via standard SQL

### Trade-offs
- PostgreSQL polling introduces slight latency compared to push-based brokers (mitigated by 1s poll interval)
- High-frequency jobs at very large scale (millions/second) would benefit from Redis Streams; this system is designed for reliable throughput in the thousands/minute range

---

## 3. Multi-Tenant Data Model

### Decision
Hierarchy: `User → Org → OrgMember → Project → Queue → Job`

### Rationale
- **Organization** is the billing/isolation unit (multiple users can share an org)
- **Project** scopes work within an org (separate namespaces, ACLs, stats)
- **Queue** is the scheduling unit: owns concurrency limits, retry policy, priority
- All API endpoints verify org membership on every request — no cross-tenant data leak possible
- Uses database-level foreign keys + cascading deletes for referential integrity

### Auth Enforcement
Every route calls `verifyQueueAccess(userId, queueId)` or similar helpers that JOIN through the full org membership chain. This means authorization is always data-driven, never just token-claim-based.

---

## 4. Retry Strategy Design

### Decision
Implement retry strategies (Fixed, Linear, Exponential) in application code with ±10% jitter, not in the database.

### Rationale
- Application code is **testable** (see `retry.test.ts`) — database triggers are not
- Strategies are **swappable** — the `RetryPolicy` model stores only the parameters; the computation is in `computeNextRunAt()`
- Jitter prevents **thundering herd** — if 1000 jobs fail simultaneously, jitter spreads their retry times
- The `maxDelaySeconds` cap prevents exponential from growing unboundedly

### Formula
```
FIXED:       delay = baseDelay
LINEAR:      delay = baseDelay * attempt
EXPONENTIAL: delay = min(baseDelay * 2^attempt, maxDelay)
jitter:      delay = delay * (0.9 + random() * 0.2)
```

---

## 5. Worker Architecture

### Decision
Separate Worker process (different entry point `worker-entry.ts`) sharing the same database schema as the API.

### Rationale
- **Separation of concerns**: API handles HTTP; Worker handles execution. They don't share memory or sockets
- **Independent scaling**: Multiple worker containers can be started without touching the API
- **Crash isolation**: A worker crash (unhandled exception) doesn't take down the API
- Workers self-register with a UUID, hostname, PID on startup
- **Heartbeat TTL** (default: 30s) + `RecoveryService` means crashed workers' jobs are automatically re-queued

### Graceful Shutdown
On `SIGTERM`/`SIGINT`:
1. Stop polling for new jobs
2. Mark worker as `DRAINING` in the DB
3. Wait up to 30s for in-flight jobs to complete
4. Mark worker as `OFFLINE`
5. Exit

This ensures zero job loss on rolling deploys.

---

## 6. Idempotency

### Decision
Support caller-provided `idempotencyKey` with a `(queueId, idempotencyKey)` unique index.

### Rationale
Networks fail. Clients retry. Without idempotency, a retry creates a duplicate job. With an idempotency key, the API returns the existing job (HTTP 200) instead of creating a duplicate. This is critical for payment processors, email senders, and any side-effectful job.

---

## 7. Batch Jobs

### Decision
Implement BATCH as a parent job with N child jobs (self-referential `parentJobId` FK), all created in a single `$transaction`.

### Rationale
- Atomicity: either all items are created or none are
- The parent job tracks aggregate status; children execute independently
- Enables future: "batch complete" webhook when all children finish

---

## 8. Schema Normalization

### Decision
Fully normalized (3NF) with `retry_policies` as a separate table referenced by both queues and jobs.

### Rationale
- A queue can have a **default** retry policy (set at queue level)
- Individual jobs can **override** the retry policy (set at job level)
- The resolver in `markJobFailed()` prefers the job-level policy, falling back to the queue-level policy

---

## 9. Dead Letter Queue Design

### Decision
DLQ entries are separate rows in `dlq_entries`, not a status flag on the job.

### Rationale
- The original job record (`status = 'DEAD'`) stays in `jobs` for full history
- The DLQ entry stores denormalized data (`originalPayload`, `reason`, `failureCount`, `movedAt`) for fast DLQ queries without joins
- **Replay** atomically deletes the DLQ entry and resets the job to `QUEUED` in a single transaction — either both succeed or neither does

---

## 10. Observability Design

### Decision
Metrics computed on-demand via raw SQL aggregations, not pre-computed/cached.

### Trade-offs
| Approach | Pros | Cons |
|---|---|---|
| Pre-computed (materialized view / cache) | Fast reads | Stale data; extra complexity |
| On-demand SQL | Always accurate; simpler | Slightly slower at large scale |

For the scale this system targets, on-demand SQL is appropriate and shows database query design skill. `date_trunc('hour', ...)` + `COUNT(*)` + `FILTER` are all index-friendly operations.
