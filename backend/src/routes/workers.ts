import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../db/client';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/workers
router.get('/', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const workers = await prisma.worker.findMany({
      orderBy: { lastSeenAt: 'desc' },
      include: {
        _count: { select: { jobs: true } },
        heartbeats: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // Mark workers as offline if last heartbeat > 30s ago
    const now = Date.now();
    const enriched = workers.map((w) => ({
      ...w,
      isStale: now - w.lastSeenAt.getTime() > 30_000,
    }));

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// GET /api/workers/:workerId
router.get('/:workerId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const worker = await prisma.worker.findUnique({
      where: { id: req.params.workerId },
      include: {
        heartbeats: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        jobs: {
          where: { status: { in: ['CLAIMED', 'RUNNING'] } },
          take: 50,
        },
      },
    });

    if (!worker) {
      res.status(404).json({ error: 'Worker not found' });
      return;
    }

    res.json(worker);
  } catch (err) {
    next(err);
  }
});

export default router;
