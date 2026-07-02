import { isValidCron, getNextCronDate } from '../src/utils/cron';

describe('isValidCron', () => {
  it('accepts valid cron expressions', () => {
    expect(isValidCron('* * * * *')).toBe(true);
    expect(isValidCron('0 2 * * *')).toBe(true);
    expect(isValidCron('*/5 * * * *')).toBe(true);
    expect(isValidCron('0 0 1 * *')).toBe(true);
  });

  it('rejects invalid cron expressions', () => {
    expect(isValidCron('not-a-cron')).toBe(false);
    expect(isValidCron('99 * * * *')).toBe(false);
    expect(isValidCron('')).toBe(false);
  });
});

describe('getNextCronDate', () => {
  it('returns a future date for valid expressions', () => {
    const next = getNextCronDate('* * * * *');
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(Date.now());
  });

  it('returns null for invalid expressions', () => {
    expect(getNextCronDate('invalid')).toBeNull();
  });
});
