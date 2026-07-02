import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../db/client';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// GET /api/projects/:projectId/metrics
router.get('/projects/:projectId/metrics', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Verify user has access to this project
    const project = await prisma.project.findFirst({
      where: {
        id: req.params.projectId,
        org: { members: { some: { userId: req.user!.userId } } },
      },
    });
    if (!project) throw new AppError(404, 'Not Found', 'Project not found');

    const queueIds = (
      await prisma.queue.findMany({
        where: { projectId: req.params.projectId },
        select: { id: true },
      })
    ).map((q) => q.id);

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalJobsByStatus,
      executionsLast24h,
      avgDuration,
      errorRate24h,
      throughputByHour,
    ] = await Promise.all([
      // Total jobs grouped by status
      prisma.job.groupBy({
        by: ['status'],
        where: { queueId: { in: queueIds } },
        _count: { _all: true },
      }),

      // Executions in last 24h
      prisma.jobExecution.count({
        where: {
          job: { queueId: { in: queueIds } },
          startedAt: { gte: last24h },
        },
      }),

      // Average duration for completed jobs
      prisma.jobExecution.aggregate({
        where: {
          job: { queueId: { in: queueIds } },
          status: 'COMPLETED',
          startedAt: { gte: last7d },
        },
        _avg: { durationMs: true },
        _min: { durationMs: true },
        _max: { durationMs: true },
      }),

      // Error rate: failed / total in last 24h
      prisma.jobExecution.groupBy({
        by: ['status'],
        where: {
          job: { queueId: { in: queueIds } },
          startedAt: { gte: last24h },
        },
        _count: { _all: true },
      }),

      // Throughput by hour in last 24h
      prisma.$queryRaw<{ hour: Date; count: bigint }[]>`
        SELECT 
          date_trunc('hour', je.started_at) AS hour,
          COUNT(*) AS count
        FROM job_executions je
        JOIN jobs j ON j.id = je.job_id
        WHERE j.queue_id::text = ANY(${queueIds})
          AND je.started_at >= ${last24h}
          AND je.status = 'COMPLETED'
        GROUP BY hour
        ORDER BY hour ASC
      `,
    ]);

    const statusMap = Object.fromEntries(
      totalJobsByStatus.map((g) => [g.status, g._count._all])
    );

    const errorMap = Object.fromEntries(
      errorRate24h.map((g) => [g.status, g._count._all])
    );
    const totalExec = Object.values(errorMap).reduce((a, b) => a + b, 0);
    const failedExec = errorMap['FAILED'] || 0;

    res.json({
      totalJobs: statusMap,
      executionsLast24h,
      avgDurationMs: avgDuration._avg.durationMs,
      minDurationMs: avgDuration._min.durationMs,
      maxDurationMs: avgDuration._max.durationMs,
      errorRate24h: totalExec > 0 ? (failedExec / totalExec) * 100 : 0,
      throughputByHour: throughputByHour.map((r) => ({
        hour: r.hour,
        count: Number(r.count),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/queues/:queueId/metrics
router.get('/queues/:queueId/metrics', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const queue = await prisma.queue.findFirst({
      where: {
        id: req.params.queueId,
        project: { org: { members: { some: { userId: req.user!.userId } } } },
      },
    });
    if (!queue) throw new AppError(404, 'Not Found', 'Queue not found');

    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [statusCounts, recentThroughput, activeWorkers] = await Promise.all([
      prisma.job.groupBy({
        by: ['status'],
        where: { queueId: req.params.queueId },
        _count: { _all: true },
      }),
      prisma.$queryRaw<{ hour: Date; completed: bigint; failed: bigint }[]>`
        SELECT 
          date_trunc('hour', je.started_at) AS hour,
          COUNT(*) FILTER (WHERE je.status = 'COMPLETED') AS completed,
          COUNT(*) FILTER (WHERE je.status = 'FAILED') AS failed
        FROM job_executions je
        JOIN jobs j ON j.id = je.job_id
        WHERE j.queue_id::text = ${req.params.queueId}
          AND je.started_at >= ${last24h}
        GROUP BY hour
        ORDER BY hour ASC
      `,
      prisma.job.count({
        where: {
          queueId: req.params.queueId,
          status: { in: ['CLAIMED', 'RUNNING'] },
        },
      }),
    ]);

    res.json({
      statusCounts: Object.fromEntries(statusCounts.map((g) => [g.status, g._count._all])),
      throughput: recentThroughput.map((r) => ({
        hour: r.hour,
        completed: Number(r.completed),
        failed: Number(r.failed),
      })),
      activeJobs: activeWorkers,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:projectId/dlq
router.get('/projects/:projectId/dlq', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await prisma.project.findFirst({
      where: {
        id: req.params.projectId,
        org: { members: { some: { userId: req.user!.userId } } },
      },
    });
    if (!project) throw new AppError(404, 'Not Found', 'Project not found');

    const page = parseInt(req.query.page as string || '1');
    const limit = parseInt(req.query.limit as string || '20');

    const [total, entries] = await Promise.all([
      prisma.dlqEntry.count({
        where: { queue: { projectId: req.params.projectId } },
      }),
      prisma.dlqEntry.findMany({
        where: { queue: { projectId: req.params.projectId } },
        include: {
          job: { select: { id: true, name: true, type: true, retryCount: true } },
          queue: { select: { id: true, name: true } },
        },
        orderBy: { movedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({
      data: entries,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/dlq/:dlqEntryId/replay
router.post('/dlq/:dlqEntryId/replay', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entry = await prisma.dlqEntry.findFirst({
      where: {
        id: req.params.dlqEntryId,
        queue: { project: { org: { members: { some: { userId: req.user!.userId } } } } },
      },
      include: { job: true },
    });
    if (!entry) throw new AppError(404, 'Not Found', 'DLQ entry not found');

    const replayed = await prisma.$transaction(async (tx) => {
      await tx.dlqEntry.delete({ where: { id: entry.id } });
      return tx.job.update({
        where: { id: entry.jobId },
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

    res.json(replayed);
  } catch (err) {
    next(err);
  }
});

export default router;
