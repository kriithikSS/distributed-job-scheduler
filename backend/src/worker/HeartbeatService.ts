import prisma from '../db/client';
import logger from '../utils/logger';

/**
 * Writes a heartbeat row for the worker and updates its last_seen_at.
 * Called every WORKER_HEARTBEAT_INTERVAL_MS milliseconds.
 */
export class HeartbeatService {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly workerId: string,
    private readonly intervalMs: number
  ) {}

  start(getActiveJobCount: () => number): void {
    this.timer = setInterval(async () => {
      try {
        const jobsActive = getActiveJobCount();
        const memoryMb = process.memoryUsage().heapUsed / (1024 * 1024);

        await prisma.$transaction([
          prisma.workerHeartbeat.create({
            data: {
              workerId: this.workerId,
              jobsActive,
              memoryMb,
            },
          }),
          prisma.worker.update({
            where: { id: this.workerId },
            data: { lastSeenAt: new Date() },
          }),
        ]);

        logger.debug('Heartbeat sent', { workerId: this.workerId, jobsActive });
      } catch (err) {
        logger.error('Failed to send heartbeat', { workerId: this.workerId, error: String(err) });
      }
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
