import logger from '../utils/logger';
import { writeJobLog } from './JobClaimer';
import { markJobRunning, markJobCompleted, markJobFailed } from './JobClaimer';

interface JobPayload {
  id: string;
  queueId: string;
  name: string | null;
  payload: unknown;
  type: string;
  retryCount: number;
  maxRetries: number;
  cronExpression: string | null;
}

/**
 * JobExecutor runs a single job and records its outcome.
 *
 * In a real system, the payload would reference a registered handler.
 * Here we simulate execution with a sleep + success/failure probability.
 */
export class JobExecutor {
  async execute(job: JobPayload, workerId: string): Promise<void> {
    const startTime = Date.now();
    const executionId = await markJobRunning(job, workerId, job.retryCount + 1);

    logger.info('Executing job', {
      jobId: job.id,
      jobName: job.name,
      attempt: job.retryCount + 1,
    });

    try {
      await writeJobLog(executionId, 'INFO', `Job started: ${job.name ?? job.id}`, {
        attempt: job.retryCount + 1,
        payload: job.payload,
      });

      // Simulate job execution
      await this.simulate(job, executionId);

      const durationMs = Date.now() - startTime;
      await markJobCompleted(job, executionId, durationMs);

      await writeJobLog(executionId, 'INFO', `Job completed in ${durationMs}ms`);

      logger.info('Job completed', { jobId: job.id, durationMs });
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? (err.stack ?? '') : '';

      await writeJobLog(executionId, 'ERROR', `Job failed: ${errorMessage}`, {
        stack: errorStack,
      });

      await markJobFailed(job, executionId, errorMessage, errorStack, durationMs);

      logger.warn('Job failed', { jobId: job.id, error: errorMessage, durationMs });
    }
  }

  /**
   * Simulates job work. In production, this would dispatch to registered handlers.
   * Payload can include `_simulateFailure: true` or `_durationMs: number` for testing.
   */
  private async simulate(job: JobPayload, executionId: string): Promise<void> {
    const payload = (job.payload ?? {}) as Record<string, unknown>;
    const durationMs = typeof payload._durationMs === 'number' ? payload._durationMs : Math.random() * 2000 + 100;
    const shouldFail = payload._simulateFailure === true;

    // Simulate work progress
    await writeJobLog(executionId, 'DEBUG', `Processing payload`, { payload });
    await sleep(durationMs * 0.5);
    await writeJobLog(executionId, 'DEBUG', `50% complete`);
    await sleep(durationMs * 0.5);

    if (shouldFail) {
      throw new Error(`Simulated failure for job ${job.id}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
