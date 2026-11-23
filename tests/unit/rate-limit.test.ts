import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../../lib/server/rate-limit.ts';

function limiter(limit = 3, windowMs = 1000, maxKeys?: number) {
  const clock = { t: 0 };
  return { clock, rl: createRateLimiter({ limit, windowMs, now: () => clock.t, maxKeys }) };
}

describe('createRateLimiter', () => {
  it('allows up to the limit, then refuses with a retry hint', () => {
    const { rl } = limiter();
    expect([1, 2, 3].map(() => rl.take('a').allowed)).toEqual([true, true, true]);
    expect(rl.take('a')).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it('frees a slot exactly when the window passes, not one millisecond before', () => {
    const { rl, clock } = limiter();
    rl.take('a');
    rl.take('a');
    rl.take('a');
    clock.t = 999;
    expect(rl.take('a').allowed).toBe(false);
    clock.t = 1000;
    expect(rl.take('a').allowed).toBe(true);
  });

  it('keeps keys apart', () => {
    const { rl } = limiter(1);
    expect(rl.take('a').allowed).toBe(true);
    expect(rl.take('b').allowed).toBe(true);
    expect(rl.take('a').allowed).toBe(false);
  });

  it('checks without recording', () => {
    const { rl } = limiter(1);
    expect(rl.blocked('a').blocked).toBe(false);
    expect(rl.blocked('a').blocked).toBe(false);
    rl.take('a');
    expect(rl.blocked('a')).toEqual({ blocked: true, retryAfterSeconds: 1 });
  });

  it('bounds memory by evicting the oldest key', () => {
    const { rl } = limiter(1, 1000, 2);
    rl.take('a');
    rl.take('b');
    rl.take('c'); // evicts a
    expect(rl.take('a').allowed).toBe(true);
  });

  it('never allows more than the limit inside any window', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 300 }), { maxLength: 60 }), (gaps) => {
        const { rl, clock } = limiter(3, 1000);
        const allowed: number[] = [];
        for (const gap of gaps) {
          clock.t += gap;
          if (rl.take('k').allowed) allowed.push(clock.t);
        }
        return allowed.every((t) => allowed.filter((u) => u > t - 1000 && u <= t).length <= 3);
      }),
    );
  });
});
