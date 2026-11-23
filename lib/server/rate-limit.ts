import { RATE_LIMIT_MAX_KEYS } from '../shared/limits.ts';

// Sliding-window counter per key. State lives in this process only, so on a
// platform with many instances each instance enforces its own budget.

export interface RateLimiter {
  /** Records one event for the key and reports whether it was within budget. */
  take(key: string): { allowed: boolean; retryAfterSeconds: number };
  /** Reports whether the key is over budget without recording anything. */
  blocked(key: string): { blocked: boolean; retryAfterSeconds: number };
}

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  now: () => number;
  maxKeys?: number;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { limit, windowMs, now } = options;
  const maxKeys = options.maxKeys ?? RATE_LIMIT_MAX_KEYS;
  const hits = new Map<string, number[]>();

  const recent = (key: string, at: number): number[] => {
    const kept = (hits.get(key) ?? []).filter((t) => t > at - windowMs);
    if (kept.length === 0) hits.delete(key);
    else hits.set(key, kept);
    return kept;
  };
  const retryAfter = (times: number[], at: number) =>
    times.length === 0 ? 0 : Math.max(1, Math.ceil(((times[0] ?? at) + windowMs - at) / 1000));

  return {
    take(key) {
      const at = now();
      const times = recent(key, at);
      if (times.length >= limit)
        return { allowed: false, retryAfterSeconds: retryAfter(times, at) };
      if (!hits.has(key) && hits.size >= maxKeys) {
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) hits.delete(oldest);
      }
      hits.set(key, [...times, at]);
      return { allowed: true, retryAfterSeconds: 0 };
    },
    blocked(key) {
      const at = now();
      const times = recent(key, at);
      const over = times.length >= limit;
      return { blocked: over, retryAfterSeconds: over ? retryAfter(times, at) : 0 };
    },
  };
}
