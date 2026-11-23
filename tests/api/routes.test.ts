import { describe, expect, it } from 'vitest';
import * as health from '../../app/api/health/route.ts';
import * as notFound from '../../app/api/[...path]/route.ts';
import * as scroll from '../../app/api/scroll/route.ts';
import * as stats from '../../app/api/stats/route.ts';
import * as visit from '../../app/api/visit/route.ts';
import { ErrorResponse, HealthResponse } from '../../lib/shared/schemas.ts';

// The route files themselves, wired to the real runtime with no configuration:
// the state a fresh clone or a zero-key demo deployment runs in.

const call = (handler: unknown, path: string, method = 'GET') => {
  if (typeof handler !== 'function') throw new Error(`${method} ${path} is not exported`);
  return handler(new Request(`http://localhost${path}`, { method })) as Promise<Response>;
};

const FORBIDDEN_FIELDS = /"(email|role|admin|isAdmin|password|token|user|users|ip)"/i;

describe('public routes', () => {
  it('health returns status only, uncached', async () => {
    const response = await call(health.GET, '/api/health');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(HealthResponse.parse(await response.json())).toEqual({ status: 'ok' });
  });

  it('unknown API paths get a JSON 404 for every method', async () => {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const response = await call(notFound[method], '/api/nope', method);
      expect(response.status).toBe(404);
      expect(ErrorResponse.parse(await response.json()).error.code).toBe('NOT_FOUND');
    }
  });

  it.each([
    ['visit', visit, ['GET', 'PUT', 'PATCH', 'DELETE'], 'POST'],
    ['scroll', scroll, ['GET', 'PUT', 'PATCH', 'DELETE'], 'POST'],
    ['stats', stats, ['POST', 'PUT', 'PATCH', 'DELETE'], 'GET'],
    ['health', health, ['POST', 'PUT', 'PATCH', 'DELETE'], 'GET'],
  ] as const)(
    '%s refuses other methods with 405 and an Allow header',
    async (name, mod, methods, allowed) => {
      for (const method of methods) {
        const response = await call(
          (mod as Record<string, unknown>)[method],
          `/api/${name}`,
          method,
        );
        expect(response.status).toBe(405);
        expect(response.headers.get('allow')).toBe(allowed);
      }
    },
  );

  it('with no database configured, the analytics routes say so', async () => {
    const response = await call(visit.POST, '/api/visit', 'POST');
    expect(response.status).toBe(503);
    expect(ErrorResponse.parse(await response.json()).error.code).toBe('ANALYTICS_DISABLED');
  });

  it('an anonymous sweep of every route exposes no user, role or admin fields', async () => {
    const responses = [
      await call(health.GET, '/api/health'),
      await call(stats.GET, '/api/stats'),
      await call(visit.POST, '/api/visit', 'POST'),
      await call(notFound.GET, '/api/admin'),
      await call(notFound.GET, '/api/debug'),
      await call(notFound.POST, '/api/reseed', 'POST'),
    ];
    for (const response of responses) expect(await response.text()).not.toMatch(FORBIDDEN_FIELDS);
    expect(responses[1]?.status).toBe(401);
  });
});
