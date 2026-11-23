import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DAILY_VISIT_CAP, JSON_BODY_LIMIT_BYTES, RATE_LIMITS } from '../../lib/shared/limits.ts';
import { ErrorResponse, VisitResponse } from '../../lib/shared/schemas.ts';
import { harness, readBody, request, START } from '../helpers/api.ts';
import { createTestDb, type TestDb } from '../helpers/db.ts';

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(async () => {
  await t.close();
});

const count = async () =>
  (await t.db.query<{ n: number }>('SELECT count(*)::int AS n FROM visits', [])).rows[0]?.n;
const codeOf = async (r: Response) => ErrorResponse.parse(await readBody(r)).error.code;

describe('POST /api/visit', () => {
  it('records a visit and returns its id', async () => {
    const { api } = harness(t.db);
    const response = await api.visit(request('POST', '/api/visit'));
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(VisitResponse.safeParse(await readBody(response)).success).toBe(true);
    expect(await count()).toBe(1);
  });

  it('accepts an explicit empty JSON object', async () => {
    const { api } = harness(t.db);
    expect((await api.visit(request('POST', '/api/visit', { json: {} }))).status).toBe(201);
  });

  it.each<[string, Parameters<typeof request>[2], number, string]>([
    ['a privileged field', { json: { max_zone: 4 } }, 400, 'VALIDATION_FAILED'],
    [
      'a client-chosen id',
      { json: { id: '3f2a6f7e-1b2c-4d5e-8f90-a1b2c3d4e5f6' } },
      400,
      'VALIDATION_FAILED',
    ],
    ['an array', { json: [] }, 400, 'VALIDATION_FAILED'],
    [
      'malformed JSON',
      { body: '{', headers: { 'content-type': 'application/json' } },
      400,
      'MALFORMED_JSON',
    ],
    [
      'a text body',
      { body: 'hi', headers: { 'content-type': 'text/plain' } },
      415,
      'UNSUPPORTED_MEDIA_TYPE',
    ],
    [
      'an oversized body',
      {
        body: 'x'.repeat(JSON_BODY_LIMIT_BYTES + 1),
        headers: { 'content-type': 'application/json' },
      },
      413,
      'PAYLOAD_TOO_LARGE',
    ],
  ])('refuses %s and records nothing', async (_name, options, status, code) => {
    const { api } = harness(t.db);
    const response = await api.visit(request('POST', '/api/visit', options));
    expect(response.status).toBe(status);
    expect(await codeOf(response)).toBe(code);
    expect(await count()).toBe(0);
  });

  it('rate-limits each address and lets it back in when the window passes', async () => {
    const { api, clock } = harness(t.db);
    for (let i = 0; i < RATE_LIMITS.visit.limit; i++) {
      expect((await api.visit(request('POST', '/api/visit'))).status).toBe(201);
    }
    const refused = await api.visit(request('POST', '/api/visit'));
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await api.visit(request('POST', '/api/visit', { ip: '198.51.100.9' }))).status).toBe(
      201,
    );
    clock.advance(RATE_LIMITS.visit.windowMs - 1);
    expect((await api.visit(request('POST', '/api/visit'))).status).toBe(429);
    clock.advance(1);
    expect((await api.visit(request('POST', '/api/visit'))).status).toBe(201);
  });

  it('stops at the daily cap and reopens at UTC midnight', async () => {
    const { api, clock } = harness(t.db);
    await t.db.query('INSERT INTO daily_visit_counts (day, visits) VALUES ($1, $2)', [
      '2026-02-28',
      DAILY_VISIT_CAP - 1,
    ]);
    const ips = ['198.51.100.1', '198.51.100.2', '198.51.100.3'];
    expect((await api.visit(request('POST', '/api/visit', { ip: ips[0] }))).status).toBe(201);
    const capped = await api.visit(request('POST', '/api/visit', { ip: ips[1] }));
    expect(capped.status).toBe(429);
    expect(await codeOf(capped)).toBe('DAILY_CAP_REACHED');
    expect(await count()).toBe(1);
    clock.advance(Date.UTC(2026, 2, 1) - START - 1); // 23:59:59.999 on the 28th
    expect((await api.visit(request('POST', '/api/visit', { ip: ips[2] }))).status).toBe(429);
    clock.advance(1); // midnight: 1 March (2026 is not a leap year)
    expect((await api.visit(request('POST', '/api/visit', { ip: ips[2] }))).status).toBe(201);
  });

  it('answers 503 when the deployment has no database', async () => {
    const { api } = harness(null);
    const response = await api.visit(request('POST', '/api/visit'));
    expect(response.status).toBe(503);
    expect(await codeOf(response)).toBe('ANALYTICS_DISABLED');
  });

  it('reports a database failure honestly and logs only the error code', async () => {
    const failing = {
      query: () =>
        Promise.reject(Object.assign(new Error('password=hunter2 host=db'), { code: '57P01' })),
    };
    const { api, logs } = harness(failing);
    const response = await api.visit(request('POST', '/api/visit'));
    expect(response.status).toBe(503);
    expect(await codeOf(response)).toBe('DATABASE_UNAVAILABLE');
    expect(logs.join('\n')).toContain('57P01');
    expect(logs.join('\n')).not.toContain('hunter2');
  });

  it('turns an unexpected failure into a clean 500', async () => {
    const { api, deps } = harness(t.db);
    deps.limiters.visit = {
      take: () => {
        throw new TypeError('boom');
      },
      blocked: () => ({ blocked: false, retryAfterSeconds: 0 }),
    };
    const response = await api.visit(request('POST', '/api/visit'));
    expect(response.status).toBe(500);
    expect(await codeOf(response)).toBe('INTERNAL_ERROR');
  });
});
