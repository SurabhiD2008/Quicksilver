import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import type { Db } from '../../lib/server/db.ts';
import { loadMigrations, migrate } from '../../lib/server/migrate.ts';

/** Tests run only inside schemas with this prefix, created fresh and dropped after. */
export const TEST_SCHEMA_PATTERN = /^quicksilver_test_[0-9a-f]{12}$/;

export interface TestDb {
  db: Db;
  pg: PGlite;
  close: () => Promise<void>;
}

export function pgliteDb(pg: PGlite): Db {
  return {
    async query<T>(text: string, params: readonly unknown[]) {
      const result = await pg.query<T>(text, [...params]);
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    },
  };
}

export async function createTestDb(options: { migrate?: boolean } = {}): Promise<TestDb> {
  const pg = await PGlite.create();
  const schema = `quicksilver_test_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  await pg.exec(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};`);
  const current = await pg.query<{ s: string }>('SELECT current_schema() AS s');
  if (!TEST_SCHEMA_PATTERN.test(current.rows[0]?.s ?? '')) {
    throw new Error(
      'Refusing to run: the test database schema does not match the test naming rule.',
    );
  }
  const db = pgliteDb(pg);
  if (options.migrate !== false) await migrate(db, loadMigrations('db/migrations'));
  return {
    db,
    pg,
    close: async () => {
      await pg.exec(`DROP SCHEMA ${schema} CASCADE`);
      await pg.close();
    },
  };
}
