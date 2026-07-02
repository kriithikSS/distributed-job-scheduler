import prisma from '../db/client';
import logger from '../utils/logger';
import { computeNextRunAt } from '../utils/retry';
import { getNextCronDate } from '../utils/cron';

interface ClaimedJob {
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
 * Atomically claims a single pending job from the given queue using
 * SELECT FOR UPDATE SKIP LOCKED — the core of the distributed scheduler.
 *
 * This prevents multiple workers from claiming the same job even under
 * heavy concurrent load.
 */
export async function claimJob(
  workerId: string,
  queueId: string
): Promise<ClaimedJob | null> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Raw query for SKIP LOCKED — not supported natively in Prisma
      const jobs = await tx.$queryRaw<{ id: string }[]>`
        SELECT j.id
        FROM jobs j
        JOIN queues q ON q.id = j.queue_id
        WHERE j.queue_id::text = ${queueId}
          AND j.status IN ('QUEUED', 'SCHEDULED')
          AND j.run_at <= NOW()
          AND q.status = 'ACTIVE'
        ORDER BY j.priority DESC, j.run_at ASC
        LIMIT 1
        FOR UPDATE OF j SKIP LOCKED
      `;

      if (jobs.length === 0) return null;

      const jobId = jobs[0].id;

      // Atomically update to CLAIMED
      const claimed = await tx.job.update({
        where: { id: jobId },
        data: {
          status: 'CLAIMED',
          workerId,
          claimedAt: new Date(),
        },
      });

      return claimed;
    });

    return result as ClaimedJob | null;
  } catch (err) {
    logger.error('Error claiming job', { queueId, workerId, error: String(err) });
    return null;
  }
}

/**
 * Mark a claimed job as RUNNING and create a JobExecution record.
 */
export async function markJobRunning(
  job: ClaimedJob,
  workerId: string,
  attemptNumber: number
): Promise<string> {
  const [, execution] = await prisma.$transaction([
    prisma.job.update({
      where: { id: job.id },
      data: { status: 'RUNNING', startedAt: new Date() },
    }),
    prisma.jobExecution.create({
      data: {
        jobId: job.id,
        workerId,
        attemptNumber,
        status: 'RUNNING',
      },
    }),
  ]);

  return execution.id;
}

/**
 * Mark a job as COMPLETED and finalize its execution record.
 */
export async function markJobCompleted(
  job: ClaimedJob,
  executionId: string,
  durationMs: number
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: job.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    await tx.jobExecution.update({
      where: { id: executionId },
      data: { status: 'COMPLETED', completedAt: new Date(), durationMs },
    });

    // If this is a RECURRING job, schedule its next run
    if (job.type === 'RECURRING' && job.cronExpression) {
      const nextRun = getNextCronDate(job.cronExpression);
      if (nextRun) {
        await tx.job.create({
          data: {
            queueId: job.queueId,
            type: 'RECURRING',
            status: 'SCHEDULED',
            name: job.name,
            payload: job.payload as object,
            cronExpression: job.cronExpression,
            runAt: nextRun,
            maxRetries: job.maxRetries,
          },
        });
        logger.debug('Scheduled next cron run', { jobName: job.name, nextRun });
      }
    }
  });
}

/**
 * Mark a job as FAILED. Schedules retry or moves to DLQ.
 */
export async function markJobFailed(
  job: ClaimedJob,
  executionId: string,
  errorMessage: string,
  errorStack: string,
  durationMs: number
): Promise<void> {
  const newRetryCount = job.retryCount + 1;
  const shouldRetry = newRetryCount <= job.maxRetries;

  await prisma.$transaction(async (tx) => {
    await tx.jobExecution.update({
      where: { id: executionId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        durationMs,
        errorMessage,
        errorStack,
      },
    });

    if (shouldRetry) {
      // Get retry policy for this job
      const jobWithPolicy = await tx.job.findUnique({
        where: { id: job.id },
        include: {
          retryPolicy: true,
          queue: { include: { retryPolicy: true } },
        },
      });

      const policy = jobWithPolicy?.retryPolicy ?? jobWithPolicy?.queue.retryPolicy;
      const strategy = policy?.strategy ?? 'EXPONENTIAL';
      const baseDelay = policy?.baseDelaySeconds ?? 30;
      const maxDelay = policy?.maxDelaySeconds ?? 3600;

      const nextRunAt = computeNextRunAt(newRetryCount, strategy, baseDelay, maxDelay);

      await tx.job.update({
        where: { id: job.id },
        data: {
          status: 'SCHEDULED',
          retryCount: newRetryCount,
          runAt: nextRunAt,
          lastError: errorMessage,
          workerId: null,
          claimedAt: null,
          startedAt: null,
          failedAt: new Date(),
        },
      });

      logger.info('Job scheduled for retry', {
        jobId: job.id,
        attempt: newRetryCount,
        nextRunAt,
      });
    } else {
      // Move to Dead Letter Queue
      await tx.job.update({
        where: { id: job.id },
        data: {
          status: 'DEAD',
          retryCount: newRetryCount,
          lastError: errorMessage,
          failedAt: new Date(),
        },
      });

      // Upsert DLQ entry
      await tx.dlqEntry.upsert({
        where: { jobId: job.id },
        update: {
          reason: errorMessage,
          failureCount: newRetryCount,
          lastError: errorMessage,
          movedAt: new Date(),
        },
        create: {
          jobId: job.id,
          queueId: job.queueId,
          reason: errorMessage,
          originalPayload: job.payload as object,
          failureCount: newRetryCount,
          lastError: errorMessage,
        },
      });

      logger.warn('Job moved to DLQ', { jobId: job.id, retries: newRetryCount });
    }
  });
}

/**
 * Write a log entry for a job execution.
 */
export async function writeJobLog(
  executionId: string,
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
  message: string,
  metadata?: object
): Promise<void> {
  await prisma.jobLog.create({
    data: { jobExecutionId: executionId, level, message, metadata },
  });
}
