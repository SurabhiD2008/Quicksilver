import { RATE_LIMITS } from '../shared/limits.ts';
import { getConfig } from './config.ts';
import { createNeonDb } from './db.ts';
import { createApi, type Deps } from './handlers.ts';
import { createLogger } from './logger.ts';
import { createRateLimiter } from './rate-limit.ts';

// The production wiring of the API: real configuration, the Neon driver, the
// wall clock and per-instance rate limiters. Built on first use.

let deps: Deps | null = null;

function runtimeDeps(): Deps {
  if (deps) return deps;
  const config = getConfig();
  const now = () => Date.now();
  deps = {
    config,
    db: config.postgresUrl ? createNeonDb(config.postgresUrl) : null,
    now: () => new Date(),
    logger: createLogger('info'),
    limiters: {
      visit: createRateLimiter({ ...RATE_LIMITS.visit, now }),
      scroll: createRateLimiter({ ...RATE_LIMITS.scroll, now }),
      statsAuth: createRateLimiter({ ...RATE_LIMITS.statsAuthFailures, now }),
    },
  };
  return deps;
}

export const api = createApi(runtimeDeps);
