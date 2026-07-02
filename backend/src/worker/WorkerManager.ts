import os from 'os';
import prisma from '../db/client';
import logger from '../utils/logger';
import { config } from '../config';
import { claimJob } from './JobClaimer';
import { JobExecutor } from './JobExecutor';
import { HeartbeatService } from './HeartbeatService';
import { RecoveryService } from './RecoveryService';

/**
 * WorkerManager orchestrates the full worker lifecycle:
 * - Registers the worker in the DB
 * - Polls all active queues for claimable jobs (bounded by concurrency)
 * - Manages a set of in-flight job executions
 * - Sends heartbeats
 * - Recovers stale jobs from crashed workers
 * - Gracefully shuts down on SIGTERM/SIGINT
 */
export class WorkerManager {
  private workerId!: string;
  private isRunning = false;
  private isShuttingDown = false;
  private activeJobs = new Set<string>();
  private pollTimer: NodeJS.Timeout | null = null;

  private readonly executor = new JobExecutor();
  private heartbeatService!: HeartbeatService;
  private recoveryService!: RecoveryService;

  async start(): Promise<void> {
    logger.info('Starting worker...');

    // Register this worker instance
    const worker = await prisma.worker.create({
      data: {
        hostname: os.hostname(),
        pid: process.pid,
        status: 'ACTIVE',
        concurrency: config.worker.concurrency,
      },
    });
    this.workerId = worker.id;
    logger.info('Worker registered', { workerId: this.workerId, hostname: os.hostname() });

    // Start supporting services
    this.heartbeatService = new HeartbeatService(this.workerId, config.worker.heartbeatIntervalMs);
    this.heartbeatService.start(() => this.activeJobs.size);

    this.recoveryService = new RecoveryService(
      config.worker.recoveryIntervalMs,
      config.worker.stalledJobTimeoutMs
    );
    this.recoveryService.start();

    // Register graceful shutdown
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));

    this.isRunning = true;
    this.pollLoop();
  }

  private pollLoop(): void {
    if (!this.isRunning) return;

    this.pollTimer = setTimeout(async () => {
      if (!this.isShuttingDown) {
        await this.poll();
      }
      this.pollLoop();
    }, config.worker.pollIntervalMs);
  }

  private async poll(): Promise<void> {
    if (this.activeJobs.size >= config.worker.concurrency) return;

    try {
      // Get all active queues
      const queues = await prisma.queue.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { priority: 'desc' },
      });

      for (const queue of queues) {
        if (this.activeJobs.size >= config.worker.concurrency) break;

        // Enforce per-queue concurrency
        const activeInQueue = await prisma.job.count({
          where: {
            queueId: queue.id,
            status: { in: ['CLAIMED', 'RUNNING'] },
          },
        });

        if (activeInQueue >= queue.concurrencyLimit) continue;

        const job = await claimJob(this.workerId, queue.id);
        if (!job) continue;

        this.activeJobs.add(job.id);

        // Fire and forget — don't await
        this.executor
          .execute(job, this.workerId)
          .finally(() => {
            this.activeJobs.delete(job.id);
          });
      }
    } catch (err) {
      logger.error('Poll error', { error: String(err) });
    }
  }

  private async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info(`Received ${signal}. Graceful shutdown initiated...`);

    // Stop polling
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.isRunning = false;

    // Stop services
    this.heartbeatService.stop();
    this.recoveryService.stop();

    // Mark worker as draining
    await prisma.worker.update({
      where: { id: this.workerId },
      data: { status: 'DRAINING' },
    }).catch(() => {});

    // Wait for in-flight jobs to complete (max 30s)
    const deadline = Date.now() + 30_000;
    while (this.activeJobs.size > 0 && Date.now() < deadline) {
      logger.info(`Waiting for ${this.activeJobs.size} active jobs to complete...`);
      await sleep(1000);
    }

    if (this.activeJobs.size > 0) {
      logger.warn(`Forced shutdown with ${this.activeJobs.size} jobs still running`);
    }

    // Mark worker as offline
    await prisma.worker.update({
      where: { id: this.workerId },
      data: { status: 'OFFLINE' },
    }).catch(() => {});

    await prisma.$disconnect();
    logger.info('Worker shutdown complete');
    process.exit(0);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
