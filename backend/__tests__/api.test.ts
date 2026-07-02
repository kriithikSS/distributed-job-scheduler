/**
 * API Integration Tests
 *
 * Tests the full HTTP request → handler → database round-trip.
 * Uses a test database (same connection string) and cleans up after each test.
 */

import request from 'supertest';
import app from '../src/index';
import prisma from '../src/db/client';

// ── Helpers ─────────────────────────────────────────────────────────────────

async function registerAndLogin(email = 'test@example.com', password = 'password123') {
  await request(app)
    .post('/api/auth/register')
    .send({ email, password, name: 'Test User' });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });

  return res.body.token as string;
}

// ── Auth Tests ────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: 'new@example.com' } });
  });

  it('creates a new user and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: 'password123', name: 'New User' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('new@example.com');
  });

  it('rejects duplicate email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: 'password123', name: 'New User' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: 'password123', name: 'New User' });

    expect(res.status).toBe(409);
  });

  it('rejects short passwords', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: '123', name: 'New User' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeAll(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'login@example.com', password: 'password123', name: 'Login User' });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: 'login@example.com' } });
  });

  it('returns token for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
  });

  it('rejects unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  let token: string;

  beforeAll(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'me@example.com', password: 'password123', name: 'Me User' });
    token = await registerAndLogin('me@example.com');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: 'me@example.com' } });
  });

  it('returns the current user', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('me@example.com');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

// ── Queue Tests ───────────────────────────────────────────────────────────────

describe('Queue API', () => {
  let token: string;
  let projectId: string;
  let queueId: string;

  beforeAll(async () => {
    // Register user
    const email = `queue-test-${Date.now()}@example.com`;
    token = await registerAndLogin(email);

    // Create org + project
    const orgRes = await request(app)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Org', slug: `test-org-${Date.now()}` });

    const projRes = await request(app)
      .post(`/api/organizations/${orgRes.body.id}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Project', slug: `test-proj-${Date.now()}` });

    projectId = projRes.body.id;
  });

  afterAll(async () => {
    if (queueId) await prisma.queue.delete({ where: { id: queueId } }).catch(() => {});
  });

  it('creates a queue', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/queues`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'test-queue', priority: 5, concurrencyLimit: 3 });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('test-queue');
    expect(res.body.status).toBe('ACTIVE');
    queueId = res.body.id;
  });

  it('lists queues for a project', async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/queues`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((q: { id: string }) => q.id === queueId)).toBe(true);
  });

  it('pauses a queue', async () => {
    const res = await request(app)
      .post(`/api/queues/${queueId}/pause`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAUSED');
  });

  it('resumes a queue', async () => {
    const res = await request(app)
      .post(`/api/queues/${queueId}/resume`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACTIVE');
  });
});

// ── Job Tests ─────────────────────────────────────────────────────────────────

describe('Job API', () => {
  let token: string;
  let queueId: string;
  let jobId: string;

  beforeAll(async () => {
    const email = `job-test-${Date.now()}@example.com`;
    token = await registerAndLogin(email);

    const orgRes = await request(app)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Job Org', slug: `job-org-${Date.now()}` });

    const projRes = await request(app)
      .post(`/api/organizations/${orgRes.body.id}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Job Project', slug: `job-proj-${Date.now()}` });

    const qRes = await request(app)
      .post(`/api/projects/${projRes.body.id}/queues`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'jobs-queue', priority: 1, concurrencyLimit: 5 });

    queueId = qRes.body.id;
  });

  it('creates an immediate job', async () => {
    const res = await request(app)
      .post(`/api/queues/${queueId}/jobs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'IMMEDIATE',
        name: 'test-job',
        payload: { key: 'value' },
        maxRetries: 2,
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('QUEUED');
    expect(res.body.type).toBe('IMMEDIATE');
    jobId = res.body.id;
  });

  it('creates a delayed job', async () => {
    const res = await request(app)
      .post(`/api/queues/${queueId}/jobs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'DELAYED', name: 'delayed-job', delaySeconds: 60 });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('SCHEDULED');
  });

  it('creates a recurring job with cron', async () => {
    const res = await request(app)
      .post(`/api/queues/${queueId}/jobs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'RECURRING', name: 'cron-job', cronExpression: '0 9 * * 1-5' });

    expect(res.status).toBe(201);
    expect(res.body.cronExpression).toBe('0 9 * * 1-5');
  });

  it('rejects recurring job without cronExpression', async () => {
    const res = await request(app)
      .post(`/api/queues/${queueId}/jobs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'RECURRING', name: 'bad-cron' });

    expect(res.status).toBe(400);
  });

  it('honours idempotency key — returns existing job on duplicate', async () => {
    const key = `idem-${Date.now()}`;

    const first = await request(app)
      .post(`/api/queues/${queueId}/jobs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'IMMEDIATE', name: 'idem-job', idempotencyKey: key });

    const second = await request(app)
      .post(`/api/queues/${queueId}/jobs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'IMMEDIATE', name: 'idem-job', idempotencyKey: key });

    expect(first.body.id).toBe(second.body.id);
    expect(second.status).toBe(200); // existing returned, not 201
  });

  it('lists jobs with pagination', async () => {
    const res = await request(app)
      .get(`/api/queues/${queueId}/jobs?page=1&limit=10`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(10);
  });

  it('cancels a queued job', async () => {
    const res = await request(app)
      .post(`/api/jobs/${jobId}/cancel`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
  });

  it('retries a cancelled job', async () => {
    const res = await request(app)
      .post(`/api/jobs/${jobId}/retry`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('QUEUED');
  });
});
