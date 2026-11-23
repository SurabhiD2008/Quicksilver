import { afterEach, describe, expect, it } from 'vitest';
import { loadMigrations, migrate, splitStatements } from '../../lib/server/migrate.ts';
import { createTestDb, type TestDb } from '../helpers/db.ts';

let t: TestDb | null = null;
afterEach(async () => {
  await t?.close();
  t = null;
});

describe('splitStatements', () => {
  it('splits on statement ends and drops comment lines', () => {
    expect(
      splitStatements('-- note\nCREATE TABLE a (x int);\n\nALTER TABLE a ADD y int;\n'),
    ).toEqual(['CREATE TABLE a (x int)', 'ALTER TABLE a ADD y int']);
  });
});

describe('migrate', () => {
  it('applies every migration once and records it', async () => {
    t = await createTestDb({ migrate: false });
    const all = loadMigrations('db/migrations');
    expect(await migrate(t.db, all)).toEqual(all.map((m) => m.name));
    expect(await migrate(t.db, all)).toEqual([]);
  });

  it('upgrades a database that already has the table from the old lazy setup', async () => {
    t = await createTestDb({ migrate: false });
    await t.db.query(
      'CREATE TABLE visits (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), max_zone SMALLINT NOT NULL DEFAULT 0)',
      [],
    );
    await t.db.query('INSERT INTO visits (max_zone) VALUES (0), (4)', []);
    await migrate(t.db, loadMigrations('db/migrations'));
    const rows = await t.db.query<{ n: number }>('SELECT count(*)::int AS n FROM visits', []);
    expect(rows.rows[0]?.n).toBe(2);
    await expect(t.db.query('UPDATE visits SET max_zone = 9', [])).rejects.toThrow();
  });
});
