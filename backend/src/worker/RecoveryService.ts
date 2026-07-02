import prisma from '../db/client';
import logger from '../utils/logger';

/**
 * RecoveryService detects stale jobs (claimed/running with no recent heartbeat)
 * and re-queues them so another worker can pick them up.
 *
 * This handles worker crashes mid-execution.
 */
export class RecoveryService {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly intervalMs: number,
    private readonly stalledThresholdMs: number
  ) {}

  start(): void {
    // Run immediately on start, then on interval
    this.recover();
    this.timer = setInterval(() => this.recover(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async recover(): Promise<void> {
    try {
      const staleThreshold = new Date(Date.now() - this.stalledThresholdMs);

      // Find workers with stale heartbeats
      const staleWorkers = await prisma.worker.findMany({
        where: {
          status: 'ACTIVE',
          lastSeenAt: { lt: staleThreshold },
        },
        select: { id: true },
      });

      if (staleWorkers.length > 0) {
        const staleWorkerIds = staleWorkers.map((w) => w.id);

        // Mark stale workers as offline
        await prisma.worker.updateMany({
          where: { id: { in: staleWorkerIds } },
          data: { status: 'OFFLINE' },
        });

        logger.warn('Marked workers as offline', { workerIds: staleWorkerIds });

        // Re-queue all CLAIMED or RUNNING jobs from stale workers
        const requeued = await prisma.job.updateMany({
          where: {
            workerId: { in: staleWorkerIds },
            status: { in: ['CLAIMED', 'RUNNING'] },
          },
          data: {
            status: 'QUEUED',
            workerId: null,
            claimedAt: null,
            startedAt: null,
            runAt: new Date(),
          },
        });

        if (requeued.count > 0) {
          logger.warn('Re-queued stale jobs', { count: requeued.count });
        }
      }

      // Also re-queue SCHEDULED jobs whose run_at has passed
      await prisma.job.updateMany({
        where: {
          status: 'SCHEDULED',
          runAt: { lte: new Date() },
        },
        data: { status: 'QUEUED' },
      });
    } catch (err) {
      logger.error('Recovery scan failed', { error: String(err) });
    }
  }
}
