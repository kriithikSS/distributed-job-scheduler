# Distributed Job Scheduler

A **production-grade** distributed job scheduling platform built for reliability, concurrency, and observability. Capable of executing millions of asynchronous background jobs across horizontally-scaled workers.

---

## Table of Contents
- [Architecture](#architecture)
- [Features](#features)
- [Database Design](#database-design)
- [Quick Start](#quick-start)
- [API Overview](#api-overview)
- [Project Structure](#project-structure)
- [Design Decisions](#design-decisions)
- [Testing](#testing)

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         Client Browser                         │
└──────────────────────────┬─────────────────────────────────────┘
                           │ HTTP
┌──────────────────────────▼─────────────────────────────────────┐
│              Frontend  (React + Vite, served by nginx)          │
│     Dashboard │ Queues │ Jobs │ Workers │ DLQ │ Metrics         │
└──────────────────────────┬─────────────────────────────────────┘
                           │ /api/* (reverse proxy)
┌──────────────────────────▼─────────────────────────────────────┐
│                   API Server  (Express + TypeScript)            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │   Auth   │ │  Queues  │ │   Jobs   │ │     Metrics      │  │
│  │  (JWT)   │ │  CRUD +  │ │ CRUD +   │ │ Throughput +     │  │
│  │          │ │ Pause /  │ │ Retry /  │ │ Error Rate +     │  │
│  │          │ │ Resume   │ │ Cancel   │ │ DLQ              │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘  │
└──────────────────────────┬─────────────────────────────────────┘
                           │ Prisma ORM
┌──────────────────────────▼─────────────────────────────────────┐
│                      PostgreSQL 16                              │
│   12 tables: users │ orgs │ projects │ queues │ jobs │          │
│              job_executions │ job_logs │ retry_policies │        │
│              workers │ worker_heartbeats │ dlq_entries          │
└──────────────────────────┬─────────────────────────────────────┘
                           │ Prisma ORM (shared schema)
┌──────────────────────────▼─────────────────────────────────────┐
│                   Worker Service  (Node.js)                     │
│  ┌─────────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  WorkerManager  │  │  JobClaimer  │  │  HeartbeatService │  │
│  │  Poll + concur- │  │  SELECT FOR  │  │  Writes lastSeen  │  │
│  │  rency control  │  │  UPDATE SKIP │  │  every 5s         │  │
│  │                 │  │  LOCKED      │  │                   │  │
│  └─────────────────┘  └──────────────┘  └───────────────────┘  │
│  ┌─────────────────┐  ┌──────────────┐                          │
│  │  JobExecutor    │  │  RecoverySvc │                          │
│  │  Simulate +     │  │  Detects     │                          │
│  │  write logs     │  │  stale workers                          │
│  └─────────────────┘  └──────────────┘                          │
└────────────────────────────────────────────────────────────────┘
```

### Data Flow — Job Lifecycle

```
API creates job ──► QUEUED ──► Worker polls & claims ──► CLAIMED
                                                           │
                                                    RUNNING (executing)
                                                      /         \
                                               COMPLETED       FAILED
                                                             (retry?)
                                                            /        \
                                                      SCHEDULED      DEAD ──► DLQ
                                                    (next attempt)
```

---

## Features

### Core
- **5 job types**: Immediate, Delayed, Scheduled (datetime), Recurring (cron), Batch (parent/child)
- **Atomic claiming** using `SELECT FOR UPDATE SKIP LOCKED` — zero duplicate executions
- **3 retry strategies**: Fixed delay, Linear backoff, Exponential backoff (with jitter)
- **Dead Letter Queue** with replay support
- **Queue management**: Priority ordering, concurrency limits, pause/resume
- **Worker lifecycle**: Registration, heartbeats, graceful shutdown, crash recovery
- **Idempotency keys** — safe to submit the same job multiple times
- **Full execution history**: logs, timestamps, duration, worker assignment, error stack

### Observability
- Per-project and per-queue metrics
- Hourly throughput charts (last 24h)
- Error rate calculation
- Average / min / max execution duration
- Live worker status with last-seen timestamps

### Bonus
- **Rate limiting** on all API endpoints (express-rate-limit)
- **Role-based access** (OWNER / ADMIN / MEMBER) via OrgRole enum

---

## Database Design

### Entity-Relationship Diagram

```
┌───────────┐       ┌──────────────┐       ┌───────────────┐
│   users   │──────<│  org_members  │>──────│ organizations │
│           │       │  (role enum) │       │               │
│  id (PK)  │       │  orgId (FK)  │       │  id (PK)      │
│  email    │       │  userId (FK) │       │  slug (UQ)    │
│  passHash │       └──────────────┘       │  ownerId (FK) │
└───────────┘                              └───────┬───────┘
                                                   │
                                           ┌───────▼───────┐
                                           │   projects    │
                                           │  id (PK)      │
                                           │  orgId (FK)   │
                                           │  slug (UQ)    │
                                           └───────┬───────┘
                                                   │
              ┌────────────────┐          ┌────────▼──────┐
              │ retry_policies │──────────│    queues     │
              │  id (PK)       │          │  id (PK)      │
              │  strategy      │          │  projectId FK │
              │  maxAttempts   │          │  name         │
              │  baseDelay     │          │  priority     │
              │  maxDelay      │          │  concurrency  │
              └────────────────┘          │  status       │
                       │                 │  retryPolicyId│
                       │                 └───────┬───────┘
                       │                         │
              ┌────────▼────────────────────────▼────────┐
              │                  jobs                     │
              │  id (PK)         type enum                │
              │  queueId (FK)    status enum              │
              │  payload (JSON)  priority                 │
              │  cronExpression  runAt                    │
              │  maxRetries      retryCount               │
              │  retryPolicyId   idempotencyKey (UQ+queueId) │
              │  parentJobId (self-ref FK for BATCH)      │
              │  workerId (FK)   timestamps               │
              └───────┬──────────────────────────────────┘
                      │
        ┌─────────────┴──────────────┐
        │                            │
┌───────▼────────┐          ┌────────▼──────┐
│ job_executions │          │  dlq_entries  │
│  id (PK)       │          │  id (PK)      │
│  jobId (FK)    │          │  jobId (FK UQ)│
│  workerId (FK) │          │  queueId (FK) │
│  status        │          │  reason       │
│  durationMs    │          │  failureCount │
│  errorMessage  │          │  movedAt      │
└───────┬────────┘          └───────────────┘
        │
┌───────▼────────┐
│   job_logs     │
│  id (PK)       │
│  execId (FK)   │
│  level enum    │
│  message       │
│  metadata JSON │
└────────────────┘

┌─────────────┐     ┌───────────────────┐
│   workers   │─────│ worker_heartbeats │
│  id (PK)    │     │  id (PK)          │
│  hostname   │     │  workerId (FK)    │
│  pid        │     │  activeJobs       │
│  status     │     │  recordedAt       │
│  concurrency│     └───────────────────┘
│  lastSeenAt │
└─────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Primary keys | UUID | Avoids sequential enumeration; safe for distributed workers |
| Job claiming | `SELECT FOR UPDATE SKIP LOCKED` | Atomic; no advisory locks or application-level locking needed |
| Payload storage | `JSONB` | Flexible schema per job type; efficient indexing |
| Retry computation | App-layer (not DB triggers) | Testable, strategy-swappable, jitter-aware |
| Multi-tenancy | Orgs → Projects → Queues → Jobs | Full isolation; each layer scoped by auth |
| Worker tracking | Self-registration + heartbeat | Decentralized; crash detection via `lastSeenAt` TTL |

### Indexes
- `jobs(queue_id, status, run_at)` — primary worker poll query
- `jobs(queue_id, idempotency_key)` — idempotency check
- `queues(project_id, status)` — dashboard queries
- `job_executions(job_id)` — execution history
- `worker_heartbeats(worker_id, recorded_at)` — monitoring

---

## Quick Start

### Prerequisites
- Docker Desktop

### Run
```bash
docker-compose up --build
```

| Service | URL |
|---|---|
| Dashboard | http://localhost:5173 |
| API | http://localhost:3001 |
| DB (host) | localhost:5433 |

**Demo credentials**: `demo@example.com` / `password123`

### Local Development
```bash
# Backend
cd backend
npm install
cp .env.example .env
npx prisma migrate dev
npx prisma db seed
npm run dev          # API on :3001
npm run dev:worker   # Worker process

# Frontend
cd frontend
npm install
npm run dev          # Vite on :5173
```

### Run Tests
```bash
cd backend
npm test
npm run test:coverage
```

---

## API Overview

### Authentication
```
POST /api/auth/register    Create account
POST /api/auth/login       Get JWT token
GET  /api/auth/me          Current user
```

### Organizations & Projects
```
GET  /api/organizations
POST /api/organizations
GET  /api/organizations/:id/projects
POST /api/organizations/:id/projects
```

### Queues
```
GET    /api/projects/:id/queues
POST   /api/projects/:id/queues
GET    /api/queues/:id
PATCH  /api/queues/:id
DELETE /api/queues/:id
POST   /api/queues/:id/pause
POST   /api/queues/:id/resume
GET    /api/queues/:id/stats
GET    /api/queues/:id/metrics
```

### Jobs
```
POST /api/queues/:id/jobs      Create job (all 5 types)
GET  /api/queues/:id/jobs      List with pagination + filters
GET  /api/jobs/:id
GET  /api/jobs/:id/executions
GET  /api/jobs/:id/logs
POST /api/jobs/:id/retry
POST /api/jobs/:id/cancel
```

### Metrics & DLQ
```
GET  /api/projects/:id/metrics
GET  /api/projects/:id/dlq
POST /api/dlq/:id/replay
```

Full API documentation → [`docs/api.md`](docs/api.md)

---

## Project Structure

```
.
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # 12-table schema
│   │   ├── migrations/            # Versioned migrations
│   │   └── seed.ts                # Demo data
│   ├── src/
│   │   ├── config/                # Env config
│   │   ├── db/                    # Prisma client singleton
│   │   ├── middleware/
│   │   │   ├── auth.ts            # JWT verification
│   │   │   ├── errorHandler.ts    # Structured error responses
│   │   │   └── rateLimiter.ts     # Per-IP rate limiting
│   │   ├── routes/
│   │   │   ├── auth.ts            # Auth endpoints
│   │   │   ├── organizations.ts   # Org management
│   │   │   ├── projects.ts        # Project management
│   │   │   ├── queues.ts          # Queue CRUD + pause/resume
│   │   │   ├── jobs.ts            # All 5 job types
│   │   │   ├── workers.ts         # Worker status
│   │   │   └── metrics.ts         # Throughput, DLQ, replay
│   │   ├── worker/
│   │   │   ├── WorkerManager.ts   # Lifecycle orchestration
│   │   │   ├── JobClaimer.ts      # SELECT FOR UPDATE SKIP LOCKED
│   │   │   ├── JobExecutor.ts     # Execution + log writing
│   │   │   ├── HeartbeatService.ts
│   │   │   └── RecoveryService.ts # Crash recovery
│   │   └── utils/
│   │       ├── retry.ts           # Fixed / Linear / Exponential
│   │       └── cron.ts            # Cron expression parsing
│   └── __tests__/
│       ├── retry.test.ts
│       ├── cron.test.ts
│       └── api.test.ts            # Integration tests
├── frontend/
│   └── src/
│       ├── pages/                 # Dashboard, Queues, Jobs, Workers, DLQ, Metrics
│       ├── components/            # Reusable UI components
│       ├── api/                   # API client layer
│       └── hooks/                 # Custom React hooks
├── docs/
│   ├── design-decisions.md        # Architecture trade-offs
│   └── api.md                     # Full API reference
└── docker-compose.yml
```

---

## Design Decisions

See [`docs/design-decisions.md`](docs/design-decisions.md) for detailed rationale on:
- Why `SELECT FOR UPDATE SKIP LOCKED` over Redis/advisory locks
- Retry strategy implementation choices
- Multi-tenant data isolation approach
- Worker registration and crash detection design
- Why PostgreSQL over dedicated queue brokers (Redis, RabbitMQ)

---

## Testing

```bash
cd backend
npm test              # All tests
npm run test:coverage # With coverage report
```

| Test Suite | Coverage |
|---|---|
| `retry.test.ts` | Fixed, Linear, Exponential strategies + maxDelay cap |
| `cron.test.ts` | Cron expression parsing + next-run calculation |
| `api.test.ts` | Auth, Queue, Job API integration tests |
