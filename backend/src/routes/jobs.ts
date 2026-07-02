import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../db/client';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { computeNextRunAt } from '../utils/retry';
import { isValidCron, getNextCronDate } from '../utils/cron';

const router = Router();

// ---- Schemas ----

const baseJobSchema = z.object({
  name: z.string().max(200).optional(),
  payload: z.record(z.unknown()).default({}),
  priority: z.number().int().min(0).max(100).default(0),
  maxRetries: z.number().int().min(0).max(50).default(3),
  retryPolicyId: z.string().uuid().optional(),
  idempotencyKey: z.string().max(255).optional(),
});

const createJobSchema = baseJobSchema.extend({
  type: z.enum(['IMMEDIATE', 'DELAYED', 'SCHEDULED', 'RECURRING', 'BATCH']).default('IMMEDIATE'),
  delaySeconds: z.number().int().min(0).optional(),
  runAt: z.string().datetime().optional(),
  cronExpression: z.string().optional(),
  batchItems: z.array(z.record(z.unknown())).optional(),
});

const listJobsSchema = z.object({
  status: z.enum(['QUEUED', 'SCHEDULED', 'CLAIMED', 'RUNNING', 'COMPLETED', 'FAILED', 'DEAD', 'CANCELLED']).optional(),
  type: z.enum(['IMMEDIATE', 'DELAYED', 'SCHEDULED', 'RECURRING', 'BATCH']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

// Helper: verify queue access
const verifyQueueAccess = async (userId: string, queueId: string) => {
  const queue = await prisma.queue.findFirst({
    where: {
      id: queueId,
      project: { org: { members: { some: { userId } } } },
    },
    include: { retryPolicy: true },
  });
  if (!queue) throw new AppError(404, 'Not Found', 'Queue not found');
  return queue;
};

const verifyJobAccess = async (userId: string, jobId: string) => {
  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      queue: { project: { org: { members: { some: { userId } } } } },
    },
    include: {
      queue: { include: { retryPolicy: true } },
      retryPolicy: true,
      worker: true,
    },
  });
  if (!job) throw new AppError(404, 'Not Found', 'Job not found');
  return job;
};

// POST /api/queues/:queueId/jobs
router.post('/queues/:queueId/jobs', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const queue = await verifyQueueAccess(req.user!.userId, req.params.queueId);
    const body = createJobSchema.parse(req.body);

    // Idempotency check
    if (body.idempotencyKey) {
      const existing = await prisma.job.findUnique({
        where: { queueId_idempotencyKey: { queueId: queue.id, idempotencyKey: body.idempotencyKey } },
      });
      if (existing) {
        res.status(200).json(existing);
        return;
      }
    }

    // Validate cron expression for RECURRING jobs
    if (body.type === 'RECURRING') {
      if (!body.cronExpression) throw new AppError(400, 'Bad Request', 'cronExpression is required for RECURRING jobs');
      if (!isValidCron(body.cronExpression)) throw new AppError(400, 'Bad Request', 'Invalid cron expression');
    }

    // Determine run_at
    let runAt: Date = new Date();
    let status: 'QUEUED' | 'SCHEDULED' = 'QUEUED';

    if (body.type === 'DELAYED' && body.delaySeconds) {
      runAt = new Date(Date.now() + body.delaySeconds * 1000);
      status = 'SCHEDULED';
    } else if (body.type === 'SCHEDULED' && body.runAt) {
      runAt = new Date(body.runAt);
      status = runAt > new Date() ? 'SCHEDULED' : 'QUEUED';
    } else if (body.type === 'RECURRING' && body.cronExpression) {
      const next = getNextCronDate(body.cronExpression);
      runAt = next ?? new Date();
      status = runAt > new Date() ? 'SCHEDULED' : 'QUEUED';
    }

    // Handle BATCH type — create parent + child jobs
    if (body.type === 'BATCH' && body.batchItems?.length) {
      const result = await prisma.$transaction(async (tx) => {
        const parent = await tx.job.create({
          data: {
            queueId: queue.id,
            type: 'BATCH',
            status: 'QUEUED',
            name: body.name,
            payload: { batchSize: body.batchItems!.length },
            priority: body.priority,
            maxRetries: 0,
          },
        });

        const children = await Promise.all(
          body.batchItems!.map((item, i) =>
            tx.job.create({
              data: {
                queueId: queue.id,
                type: 'IMMEDIATE',
                status: 'QUEUED',
                name: `${body.name || 'batch'}-item-${i + 1}`,
                payload: item as Prisma.InputJsonValue,
                priority: body.priority,
                maxRetries: body.maxRetries,
                retryPolicyId: body.retryPolicyId,
                parentJobId: parent.id,
                runAt,
              },
            })
          )
        );

        return { parent, children };
      });

      res.status(201).json(result);
      return;
    }

    const job = await prisma.job.create({
      data: {
        queueId: queue.id,
        type: body.type,
        status,
        name: body.name,
        payload: body.payload as Prisma.InputJsonValue,
        priority: body.priority,
        runAt,
        cronExpression: body.cronExpression,
        maxRetries: body.maxRetries,
        retryPolicyId: body.retryPolicyId,
        idempotencyKey: body.idempotencyKey,
      },
    });

    res.status(201).json(job);
  } catch (err) {
    next(err);
  }
});

// GET /api/queues/:queueId/jobs
router.get('/queues/:queueId/jobs', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await verifyQueueAccess(req.user!.userId, req.params.queueId);
    const query = listJobsSchema.parse(req.query);

    const where: Record<string, unknown> = { queueId: req.params.queueId };
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };

    const [total, jobs] = await Promise.all([
      prisma.job.count({ where }),
      prisma.job.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { runAt: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { worker: { select: { id: true, hostname: true } } },
      }),
    ]);

    res.json({
      data: jobs,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:jobId
router.get('/jobs/:jobId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await verifyJobAccess(req.user!.userId, req.params.jobId);
    res.json(job);
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:jobId/executions
router.get('/jobs/:jobId/executions', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await verifyJobAccess(req.user!.userId, req.params.jobId);

    const executions = await prisma.jobExecution.findMany({
      where: { jobId: req.params.jobId },
      orderBy: { startedAt: 'desc' },
      include: { worker: { select: { id: true, hostname: true } } },
    });

    res.json(executions);
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:jobId/logs
router.get('/jobs/:jobId/logs', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await verifyJobAccess(req.user!.userId, req.params.jobId);

    const logs = await prisma.jobLog.findMany({
      where: { execution: { jobId: req.params.jobId } },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    res.json(logs);
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/:jobId/retry
router.post('/jobs/:jobId/retry', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await verifyJobAccess(req.user!.userId, req.params.jobId);

    if (!['FAILED', 'DEAD', 'CANCELLED'].includes(job.status)) {
      throw new AppError(422, 'Unprocessable Entity', 'Only failed, dead, or cancelled jobs can be retried');
    }

    const policy = job.retryPolicy ?? job.queue.retryPolicy;

    const updated = await prisma.$transaction(async (tx) => {
      // Remove from DLQ if present
      await tx.dlqEntry.deleteMany({ where: { jobId: job.id } });

      return tx.job.update({
        where: { id: job.id },
        data: {
          status: 'QUEUED',
          retryCount: 0,
          runAt: new Date(),
          lastError: null,
          failedAt: null,
          workerId: null,
          claimedAt: null,
          startedAt: null,
          completedAt: null,
        },
      });
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/:jobId/cancel
router.post('/jobs/:jobId/cancel', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await verifyJobAccess(req.user!.userId, req.params.jobId);

    if (['COMPLETED', 'CANCELLED'].includes(job.status)) {
      throw new AppError(422, 'Unprocessable Entity', 'Job is already completed or cancelled');
    }

    const updated = await prisma.job.update({
      where: { id: job.id },
      data: { status: 'CANCELLED' },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
