import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DAILY_VISIT_CAP } from '../../lib/shared/limits.ts';
import { harness, request } from '../helpers/api.ts';
import { createTestDb, type TestDb } from '../helpers/db.ts';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

describe('daily cap under concurrent requests', () => {
  it('with one slot left, exactly one of two simultaneous visits gets in (20 runs)', async () => {
    for (let run = 0; run < 20; run++) {
      await t.db.query('DELETE FROM visits', []);
      await t.db.query(
        `INSERT INTO daily_visit_counts (day, visits) VALUES ('2026-02-28', $1)
         ON CONFLICT (day) DO UPDATE SET visits = $1`,
        [DAILY_VISIT_CAP - 1],
      );
      const { api } = harness(t.db);
      const results = await Promise.all([
        api.visit(request('POST', '/api/visit', { ip: '198.51.100.1' })),
        api.visit(request('POST', '/api/visit', { ip: '198.51.100.2' })),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 429]);
      const rows = await t.db.query<{ n: number }>('SELECT count(*)::int AS n FROM visits', []);
      expect(rows.rows[0]?.n).toBe(1);
      const counter = await t.db.query<{ v: number }>(
        "SELECT visits AS v FROM daily_visit_counts WHERE day = '2026-02-28'",
        [],
      );
      expect(counter.rows[0]?.v).toBe(DAILY_VISIT_CAP);
    }
  });
});
