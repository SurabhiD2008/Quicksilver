import { RATE_LIMITS } from '../../lib/shared/limits.ts';
import { loadConfig, type Config } from '../../lib/server/config.ts';
import type { Db } from '../../lib/server/db.ts';
import { createApi, type Deps } from '../../lib/server/handlers.ts';
import { createLogger } from '../../lib/server/logger.ts';
import { createRateLimiter } from '../../lib/server/rate-limit.ts';

export const STATS_TOKEN = 'test-token-0123456789abcdefghijklmnop';
export const START = Date.UTC(2026, 1, 28, 23, 0, 0); // 2026-02-28 23:00 UTC

export interface Harness {
  api: ReturnType<typeof createApi>;
  logs: string[];
  clock: { now: number; advance: (ms: number) => void };
  deps: Deps;
}

/** Builds the API with an injected clock, a capturing logger and the given database. */
export function harness(db: Db | null, config?: Partial<Config>): Harness {
  const clock = {
    now: START,
    advance(ms: number) {
      clock.now += ms;
    },
  };
  const logs: string[] = [];
  const now = () => clock.now;
  const base = loadConfig({
    STATS_TOKEN,
    POSTGRES_URL: db ? 'postgres://test@localhost/x' : undefined,
  });
  const deps: Deps = {
    config: { ...base, ...config },
    db,
    now: () => new Date(clock.now),
    logger: createLogger('debug', (_level, line) => logs.push(line)),
    limiters: {
      visit: createRateLimiter({ ...RATE_LIMITS.visit, now }),
      scroll: createRateLimiter({ ...RATE_LIMITS.scroll, now }),
      statsAuth: createRateLimiter({ ...RATE_LIMITS.statsAuthFailures, now }),
    },
  };
  return { api: createApi(() => deps), logs, clock, deps };
}

interface RequestOptions {
  body?: string;
  json?: unknown;
  headers?: Record<string, string>;
  ip?: string;
}

export function request(method: string, path: string, options: RequestOptions = {}): Request {
  const headers: Record<string, string> = {
    'x-forwarded-for': options.ip ?? '203.0.113.7',
    ...options.headers,
  };
  let body = options.body;
  if (options.json !== undefined) {
    body = JSON.stringify(options.json);
    headers['content-type'] ??= 'application/json';
  }
  return new Request(`http://localhost${path}`, { method, headers, body });
}

export async function readBody(response: Response): Promise<unknown> {
  return response.json();
}
