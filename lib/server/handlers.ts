import { createHash, timingSafeEqual } from 'node:crypto';
import { DAILY_VISIT_CAP } from '../shared/limits.ts';
import { ScrollRequest, StatsResponse, VisitRequest } from '../shared/schemas.ts';
import type { Config } from './config.ts';
import type { Db } from './db.ts';
import { clientIp, errorResponse, json, readJsonBody, utcDay } from './http.ts';
import type { Logger } from './logger.ts';
import type { RateLimiter } from './rate-limit.ts';
import {
  advanceZone,
  insertVisitWithinCap,
  isConsistentFunnel,
  readFunnel,
} from './visits-repo.ts';

// The three analytics endpoints. Each owns its rules end to end: rate limit,
// body validation, authorization, the database call and the error mapping.

export interface Deps {
  config: Config;
  db: Db | null;
  now: () => Date;
  logger: Logger;
  limiters: { visit: RateLimiter; scroll: RateLimiter; statsAuth: RateLimiter };
}

type Handler = (request: Request) => Promise<Response>;

/** Wraps a handler so an unexpected failure becomes a clean 500, logged once. */
function guarded(
  route: string,
  deps: () => Deps,
  run: (request: Request, d: Deps) => Promise<Response>,
): Handler {
  return async (request) => {
    const d = deps();
    const started = d.now().getTime();
    try {
      const response = await run(request, d);
      d.logger.log('info', 'request', {
        route,
        status: response.status,
        ms: d.now().getTime() - started,
      });
      return response;
    } catch (error) {
      const name = error instanceof Error ? error.name : 'unknown';
      d.logger.log('error', 'request_failed', {
        route,
        error: name,
        ms: d.now().getTime() - started,
      });
      return errorResponse('INTERNAL_ERROR');
    }
  };
}

/** Runs a database call; a failure is reported as an unavailable dependency. */
async function withDb<T>(
  d: Deps,
  route: string,
  run: (db: Db) => Promise<T>,
): Promise<T | Response> {
  if (!d.db) return errorResponse('ANALYTICS_DISABLED');
  try {
    return await run(d.db);
  } catch (error) {
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : 'none';
    d.logger.log('error', 'db_failed', { route, code });
    return errorResponse('DATABASE_UNAVAILABLE');
  }
}

function rateLimited(retryAfterSeconds: number): Response {
  return errorResponse('RATE_LIMITED', { 'Retry-After': String(retryAfterSeconds) });
}

async function visit(request: Request, d: Deps): Promise<Response> {
  const budget = d.limiters.visit.take(clientIp(request));
  if (!budget.allowed) return rateLimited(budget.retryAfterSeconds);
  const body = await readJsonBody(request, true);
  if (!body.ok) return errorResponse(body.code);
  if (!VisitRequest.safeParse(body.value).success) return errorResponse('VALIDATION_FAILED');
  const id = await withDb(d, 'visit', (db) =>
    insertVisitWithinCap(db, utcDay(d.now()), DAILY_VISIT_CAP),
  );
  if (id instanceof Response) return id;
  if (id === null) return errorResponse('DAILY_CAP_REACHED');
  return json({ visitId: id }, 201);
}

async function scroll(request: Request, d: Deps): Promise<Response> {
  const budget = d.limiters.scroll.take(clientIp(request));
  if (!budget.allowed) return rateLimited(budget.retryAfterSeconds);
  const body = await readJsonBody(request, false);
  if (!body.ok) return errorResponse(body.code);
  const parsed = ScrollRequest.safeParse(body.value);
  if (!parsed.success) return errorResponse('VALIDATION_FAILED');
  const stored = await withDb(d, 'scroll', (db) =>
    advanceZone(db, parsed.data.visitId, parsed.data.zone),
  );
  if (stored instanceof Response) return stored;
  if (stored === null) return errorResponse('VISIT_NOT_FOUND');
  return json({ ok: true, zone: stored });
}

/** Constant-time comparison of the presented bearer token with the configured one. */
export function tokenMatches(header: string | null, expected: string | null): boolean {
  if (expected === null || header === null) return false;
  const match = /^Bearer (\S+)$/.exec(header);
  if (!match?.[1]) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(match[1]), digest(expected));
}

async function stats(request: Request, d: Deps): Promise<Response> {
  const ip = clientIp(request);
  const lock = d.limiters.statsAuth.blocked(ip);
  if (lock.blocked) return rateLimited(lock.retryAfterSeconds);
  if (!tokenMatches(request.headers.get('authorization'), d.config.statsToken)) {
    d.limiters.statsAuth.take(ip);
    return errorResponse('UNAUTHENTICATED', { 'WWW-Authenticate': 'Bearer' });
  }
  const funnel = await withDb(d, 'stats', readFunnel);
  if (funnel instanceof Response) return funnel;
  if (!isConsistentFunnel(funnel) || !StatsResponse.safeParse(funnel).success) {
    d.logger.log('error', 'stats_inconsistent', { route: 'stats' });
    return errorResponse('INTERNAL_ERROR');
  }
  return json(funnel);
}

export function createApi(deps: () => Deps) {
  return {
    visit: guarded('visit', deps, visit),
    scroll: guarded('scroll', deps, scroll),
    stats: guarded('stats', deps, stats),
  };
}
