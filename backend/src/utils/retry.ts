import { RetryStrategy } from '@prisma/client';

/**
 * Compute the next run timestamp for a failed job based on retry policy.
 */
export function computeNextRunAt(
  attempt: number,
  strategy: RetryStrategy,
  baseDelaySeconds: number,
  maxDelaySeconds: number
): Date {
  let delaySeconds: number;

  switch (strategy) {
    case 'FIXED':
      delaySeconds = baseDelaySeconds;
      break;
    case 'LINEAR':
      delaySeconds = baseDelaySeconds * attempt;
      break;
    case 'EXPONENTIAL':
      delaySeconds = baseDelaySeconds * Math.pow(2, attempt - 1);
      break;
    default:
      delaySeconds = baseDelaySeconds;
  }

  delaySeconds = Math.min(delaySeconds, maxDelaySeconds);
  const jitter = Math.random() * 0.1 * delaySeconds; // 10% jitter
  delaySeconds += jitter;

  return new Date(Date.now() + delaySeconds * 1000);
}
