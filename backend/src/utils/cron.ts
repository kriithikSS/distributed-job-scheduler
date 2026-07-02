import cronParser from 'cron-parser';

/**
 * Returns the next run date for a cron expression.
 * Returns null if expression is invalid.
 */
export function getNextCronDate(expression: string): Date | null {
  try {
    const interval = cronParser.parseExpression(expression, {
      currentDate: new Date(),
      utc: true,
    });
    return interval.next().toDate();
  } catch {
    return null;
  }
}

/**
 * Validates a cron expression.
 */
export function isValidCron(expression: string): boolean {
  if (!expression || !expression.trim()) return false;
  try {
    cronParser.parseExpression(expression);
    return true;
  } catch {
    return false;
  }
}
