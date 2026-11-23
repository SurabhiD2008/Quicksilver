import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_ZONE, RATE_LIMITS } from '../../lib/shared/limits.ts';
import { ErrorResponse, ScrollResponse } from '../../lib/shared/schemas.ts';
import { harness, readBody, request } from '../helpers/api.ts';
import { createTestDb, type TestDb } from '../helpers/db.ts';

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(async () => {
  await t.close();
});

async function newVisit(zone = 0): Promise<string> {
  const r = await t.db.query<{ id: string }>(
    'INSERT INTO visits (max_zone) VALUES ($1) RETURNING id',
    [zone],
  );
  return r.rows[0]?.id ?? '';
}
const stored = async (id: string) =>
  (await t.db.query<{ z: number }>('SELECT max_zone AS z FROM visits WHERE id = $1', [id])).rows[0]
    ?.z;
const scroll = (visitId: string, zone: number, ip?: string) =>
  request('POST', '/api/scroll', { json: { visitId, zone }, ip });

// The state matrix: every recorded zone x every reported zone. The stored zone
// is always the larger of the two, so the record only ever moves forward.
const ZONES = Array.from({ length: MAX_ZONE + 1 }, (_, z) => z);
const matrix = ZONES.flatMap((from) => ZONES.map((to) => [from, to, Math.max(from, to)] as const));

describe('POST /api/scroll: state matrix', () => {
  it.each(matrix)('from %i, report %i -> stored %i', async (from, to, expected) => {
    const { api } = harness(t.db);
    const id = await newVisit(from);
    const response = await api.scroll(scroll(id, to));
    expect(response.status).toBe(200);
    expect(ScrollResponse.parse(await readBody(response))).toEqual({ ok: true, zone: expected });
    expect(await stored(id)).toBe(expected);
  });
});

describe('POST /api/scroll: refusals', () => {
  it.each<[string, Parameters<typeof request>[2], number, string]>([
    ['a malformed id', { json: { visitId: 'not-a-uuid', zone: 1 } }, 400, 'VALIDATION_FAILED'],
    [
      'a numeric string zone',
      { json: { visitId: '3f2a6f7e-1b2c-4d5e-8f90-a1b2c3d4e5f6', zone: '1e3' } },
      400,
      'VALIDATION_FAILED',
    ],
    [
      'an out-of-range zone',
      { json: { visitId: '3f2a6f7e-1b2c-4d5e-8f90-a1b2c3d4e5f6', zone: 5 } },
      400,
      'VALIDATION_FAILED',
    ],
    [
      'an unknown field',
      { json: { visitId: '3f2a6f7e-1b2c-4d5e-8f90-a1b2c3d4e5f6', zone: 1, role: 'admin' } },
      400,
      'VALIDATION_FAILED',
    ],
    ['an empty body', {}, 400, 'VALIDATION_FAILED'],
    [
      'an unknown visit',
      { json: { visitId: '3f2a6f7e-1b2c-4d5e-8f90-a1b2c3d4e5f6', zone: 1 } },
      404,
      'VISIT_NOT_FOUND',
    ],
    [
      'the nil UUID',
      { json: { visitId: '00000000-0000-0000-0000-000000000000', zone: 1 } },
      404,
      'VISIT_NOT_FOUND',
    ],
  ])('%s -> %i %s', async (_name, options, status, code) => {
    const { api } = harness(t.db);
    const response = await api.scroll(request('POST', '/api/scroll', options));
    expect(response.status).toBe(status);
    expect(ErrorResponse.parse(await readBody(response)).error.code).toBe(code);
  });

  it('rate-limits each address', async () => {
    const { api } = harness(t.db);
    const id = await newVisit();
    for (let i = 0; i < RATE_LIMITS.scroll.limit; i++) await api.scroll(scroll(id, 1));
    expect((await api.scroll(scroll(id, 2))).status).toBe(429);
    expect(await stored(id)).toBe(1);
  });

  it('answers 503 without a database', async () => {
    const { api } = harness(null);
    expect((await api.scroll(scroll('3f2a6f7e-1b2c-4d5e-8f90-a1b2c3d4e5f6', 1))).status).toBe(503);
  });
});

describe('POST /api/scroll: idempotency and concurrency', () => {
  it('replaying a report changes nothing', async () => {
    const { api } = harness(t.db);
    const id = await newVisit();
    for (let i = 0; i < 5; i++) expect((await api.scroll(scroll(id, 3))).status).toBe(200);
    expect(await stored(id)).toBe(3);
  });

  it('two reports released together converge on the higher zone (20 runs)', async () => {
    for (let run = 0; run < 20; run++) {
      const { api } = harness(t.db);
      const id = await newVisit();
      const [a, b] = await Promise.all([
        api.scroll(scroll(id, 2, '198.51.100.1')),
        api.scroll(scroll(id, 3, '198.51.100.2')),
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(await stored(id)).toBe(3);
    }
  });
});
