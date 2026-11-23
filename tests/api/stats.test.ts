import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RATE_LIMITS } from '../../lib/shared/limits.ts';
import { ErrorResponse, StatsResponse } from '../../lib/shared/schemas.ts';
import { tokenMatches } from '../../lib/server/handlers.ts';
import { isConsistentFunnel } from '../../lib/server/visits-repo.ts';
import { harness, readBody, request, STATS_TOKEN } from '../helpers/api.ts';
import { createTestDb, type TestDb } from '../helpers/db.ts';

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(async () => {
  await t.close();
});

const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
const seed = (zones: number[]) =>
  Promise.all(zones.map((z) => t.db.query('INSERT INTO visits (max_zone) VALUES ($1)', [z])));

// The authorization matrix for the one privileged route. Everything other than
// the configured token is refused with 401 and a Bearer challenge.
describe('GET /api/stats: authorization matrix', () => {
  it.each<[string, Parameters<typeof request>[2]]>([
    ['anonymous', {}],
    ['a wrong token', bearer('x'.repeat(40))],
    ['the token with a different case', bearer(STATS_TOKEN.toUpperCase())],
    ['the token with an extra character', bearer(`${STATS_TOKEN}x`)],
    ['basic auth', { headers: { authorization: `Basic ${STATS_TOKEN}` } }],
    ['the token without the scheme', { headers: { authorization: STATS_TOKEN } }],
    ['the token in the query string', {}],
  ])('%s -> 401', async (_name, options) => {
    const { api } = harness(t.db);
    const response = await api.stats(request('GET', `/api/stats?token=${STATS_TOKEN}`, options));
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
    expect(ErrorResponse.parse(await readBody(response)).error.code).toBe('UNAUTHENTICATED');
  });

  it('the configured token -> 200 with the funnel and nothing else', async () => {
    const { api } = harness(t.db);
    const response = await api.stats(request('GET', '/api/stats', bearer(STATS_TOKEN)));
    expect(response.status).toBe(200);
    expect(Object.keys((await readBody(response)) as object).sort()).toEqual([
      'reachedEpilogue',
      'reachedFracture',
      'reachedMolten',
      'reachedReformation',
      'total',
    ]);
  });

  it('with no token configured, nobody gets in', async () => {
    const { api } = harness(t.db, { statsToken: null });
    expect((await api.stats(request('GET', '/api/stats', bearer(STATS_TOKEN)))).status).toBe(401);
  });

  it('locks an address out after repeated failures, even with the right token', async () => {
    const { api, clock } = harness(t.db);
    for (let i = 0; i < RATE_LIMITS.statsAuthFailures.limit; i++) {
      expect(
        (
          await api.stats(
            request('GET', '/api/stats', bearer('wrong-token-wrong-token-wrong-token')),
          )
        ).status,
      ).toBe(401);
    }
    expect((await api.stats(request('GET', '/api/stats', bearer(STATS_TOKEN)))).status).toBe(429);
    clock.advance(RATE_LIMITS.statsAuthFailures.windowMs);
    expect((await api.stats(request('GET', '/api/stats', bearer(STATS_TOKEN)))).status).toBe(200);
  });

  it('answers 503 for an authorized caller when there is no database', async () => {
    const { api } = harness(null);
    expect((await api.stats(request('GET', '/api/stats', bearer(STATS_TOKEN)))).status).toBe(503);
  });
});

describe('GET /api/stats: the funnel', () => {
  it('matches the worked example in docs/analytics.md', async () => {
    const doc = readFileSync('docs/analytics.md', 'utf8');
    const seedLine = /<!-- stats-example-seed: (\[[\d, ]+\]) -->/.exec(doc);
    const block = /<!-- stats-example -->\s*```json\s*([\s\S]*?)```/.exec(doc);
    expect(seedLine?.[1] && block?.[1]).toBeTruthy();
    await seed(JSON.parse(seedLine?.[1] ?? '[]'));
    const { api } = harness(t.db);
    const response = await api.stats(request('GET', '/api/stats', bearer(STATS_TOKEN)));
    expect(await readBody(response)).toEqual(JSON.parse(block?.[1] ?? '{}'));
  });

  it('follows scroll updates made through the API', async () => {
    const { api } = harness(t.db);
    const created = await api.visit(request('POST', '/api/visit'));
    const { visitId } = (await readBody(created)) as { visitId: string };
    await api.scroll(request('POST', '/api/scroll', { json: { visitId, zone: 4 } }));
    const stats = StatsResponse.parse(
      await readBody(await api.stats(request('GET', '/api/stats', bearer(STATS_TOKEN)))),
    );
    expect(stats).toEqual({
      total: 1,
      reachedMolten: 1,
      reachedFracture: 1,
      reachedReformation: 1,
      reachedEpilogue: 1,
    });
  });

  it('refuses to publish a funnel that widens', () => {
    expect(
      isConsistentFunnel({
        total: 2,
        reachedMolten: 1,
        reachedFracture: 1,
        reachedReformation: 0,
        reachedEpilogue: 0,
      }),
    ).toBe(true);
    expect(
      isConsistentFunnel({
        total: 1,
        reachedMolten: 2,
        reachedFracture: 0,
        reachedReformation: 0,
        reachedEpilogue: 0,
      }),
    ).toBe(false);
  });
});

describe('tokenMatches', () => {
  it.each<[string | null, string | null, boolean]>([
    [`Bearer ${STATS_TOKEN}`, STATS_TOKEN, true],
    [null, STATS_TOKEN, false],
    [`Bearer ${STATS_TOKEN}`, null, false],
    ['Bearer ', STATS_TOKEN, false],
    [`Bearer  ${STATS_TOKEN}`, STATS_TOKEN, false],
    [`bearer ${STATS_TOKEN}`, STATS_TOKEN, false],
  ])('%s vs configured -> %s', (header, expected, ok) => {
    expect(tokenMatches(header, expected)).toBe(ok);
  });
});
