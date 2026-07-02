import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../db/client';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

const createQueueSchema = z.object({
  name: z.string().min(1).max(100),
  priority: z.number().int().min(0).max(100).default(0),
  concurrencyLimit: z.number().int().min(1).max(100).default(5),
  retryPolicyId: z.string().uuid().optional(),
});

const updateQueueSchema = createQueueSchema.partial();

// Helper: verify project access
const verifyProjectAccess = async (userId: string, projectId: string) => {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      org: { members: { some: { userId } } },
    },
    include: { org: true },
  });
  if (!project) throw new AppError(404, 'Not Found', 'Project not found');
  return project;
};

// Helper: verify queue access
const verifyQueueAccess = async (userId: string, queueId: string) => {
  const queue = await prisma.queue.findFirst({
    where: {
      id: queueId,
      project: { org: { members: { some: { userId } } } },
    },
    include: { project: true, retryPolicy: true },
  });
  if (!queue) throw new AppError(404, 'Not Found', 'Queue not found');
  return queue;
};

// GET /api/projects/:projectId/queues
router.get('/projects/:projectId/queues', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await verifyProjectAccess(req.user!.userId, req.params.projectId);

    const queues = await prisma.queue.findMany({
      where: { projectId: req.params.projectId },
      include: {
        retryPolicy: true,
        _count: {
          select: {
            jobs: true,
          },
        },
      },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    });

    // Enrich with job status counts
    const enriched = await Promise.all(
      queues.map(async (q) => {
        const counts = await prisma.job.groupBy({
          by: ['status'],
          where: { queueId: q.id },
          _count: { _all: true },
        });
        const statusCounts = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
        return { ...q, statusCounts };
      })
    );

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// POST /api/projects/:projectId/queues
router.post('/projects/:projectId/queues', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await verifyProjectAccess(req.user!.userId, req.params.projectId);
    const body = createQueueSchema.parse(req.body);

    const queue = await prisma.queue.create({
      data: { ...body, projectId: req.params.projectId },
      include: { retryPolicy: true },
    });

    res.status(201).json(queue);
  } catch (err) {
    next(err);
  }
});

// GET /api/queues/:queueId
router.get('/queues/:queueId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const queue = await verifyQueueAccess(req.user!.userId, req.params.queueId);
    res.json(queue);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/queues/:queueId
router.patch('/queues/:queueId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await verifyQueueAccess(req.user!.userId, req.params.queueId);
    const body = updateQueueSchema.parse(req.body);

    const updated = await prisma.queue.update({
      where: { id: req.params.queueId },
      data: body,
      include: { retryPolicy: true },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/queues/:queueId
router.delete('/queues/:queueId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await verifyQueueAccess(req.user!.userId, req.params.queueId);
    await prisma.queue.delete({ where: { id: req.params.queueId } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/queues/:queueId/pause
router.post('/queues/:queueId/pause', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await verifyQueueAccess(req.user!.userId, req.params.queueId);
    const queue = await prisma.queue.update({
      where: { id: req.params.queueId },
      data: { status: 'PAUSED' },
    });
    res.json(queue);
  } catch (err) {
    next(err);
  }
});

// POST /api/queues/:queueId/resume
router.post('/queues/:queueId/resume', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await verifyQueueAccess(req.user!.userId, req.params.queueId);
    const queue = await prisma.queue.update({
      where: { id: req.params.queueId },
      data: { status: 'ACTIVE' },
    });
    res.json(queue);
  } catch (err) {
    next(err);
  }
});

// GET /api/queues/:queueId/stats
router.get('/queues/:queueId/stats', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await verifyQueueAccess(req.user!.userId, req.params.queueId);

    const [statusCounts, recentExecutions, avgDuration] = await Promise.all([
      prisma.job.groupBy({
        by: ['status'],
        where: { queueId: req.params.queueId },
        _count: { _all: true },
      }),
      prisma.jobExecution.findMany({
        where: { job: { queueId: req.params.queueId } },
        orderBy: { startedAt: 'desc' },
        take: 10,
        include: { job: { select: { name: true } } },
      }),
      prisma.jobExecution.aggregate({
        where: { job: { queueId: req.params.queueId }, status: 'COMPLETED' },
        _avg: { durationMs: true },
      }),
    ]);

    res.json({
      statusCounts: Object.fromEntries(statusCounts.map((c) => [c.status, c._count._all])),
      recentExecutions,
      avgDurationMs: avgDuration._avg.durationMs,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
