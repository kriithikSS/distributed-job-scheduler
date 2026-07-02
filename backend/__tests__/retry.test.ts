import { computeNextRunAt } from '../src/utils/retry';

describe('computeNextRunAt', () => {
  it('FIXED: always returns base delay regardless of attempt', () => {
    const t1 = computeNextRunAt(1, 'FIXED', 60, 3600);
    const t2 = computeNextRunAt(5, 'FIXED', 60, 3600);
    const delta1 = t1.getTime() - Date.now();
    const delta2 = t2.getTime() - Date.now();

    // Should be ~60s (±10% jitter)
    expect(delta1).toBeGreaterThanOrEqual(59_000);
    expect(delta1).toBeLessThanOrEqual(67_000);
    expect(delta2).toBeGreaterThanOrEqual(59_000);
    expect(delta2).toBeLessThanOrEqual(67_000);
  });

  it('LINEAR: delay increases linearly with attempt', () => {
    const t1 = computeNextRunAt(1, 'LINEAR', 30, 3600);
    const t2 = computeNextRunAt(2, 'LINEAR', 30, 3600);
    const t3 = computeNextRunAt(3, 'LINEAR', 30, 3600);

    // t1 ~30s, t2 ~60s, t3 ~90s
    expect(t2.getTime()).toBeGreaterThan(t1.getTime());
    expect(t3.getTime()).toBeGreaterThan(t2.getTime());
  });

  it('EXPONENTIAL: delay grows exponentially', () => {
    const t1 = computeNextRunAt(1, 'EXPONENTIAL', 30, 3600);
    const t2 = computeNextRunAt(2, 'EXPONENTIAL', 30, 3600);
    const t3 = computeNextRunAt(3, 'EXPONENTIAL', 30, 3600);

    // t1 ~30s, t2 ~60s, t3 ~120s
    const d1 = t1.getTime() - Date.now();
    const d2 = t2.getTime() - Date.now();
    const d3 = t3.getTime() - Date.now();

    expect(d2).toBeGreaterThan(d1);
    expect(d3).toBeGreaterThan(d2);
  });

  it('respects maxDelay cap', () => {
    const maxDelay = 60; // 60 seconds
    const t = computeNextRunAt(10, 'EXPONENTIAL', 30, maxDelay);
    const delta = t.getTime() - Date.now();
    // Should be capped at 60s + 10% jitter = max ~66s
    expect(delta).toBeLessThanOrEqual(67_000);
  });
});
