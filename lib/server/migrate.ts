import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './db.ts';

// Applies db/migrations/*.sql in name order, once each, recording what ran in
// schema_migrations. Every migration is idempotent, so a run interrupted half
// way can simply be repeated.

export interface Migration {
  name: string;
  statements: string[];
}

export function loadMigrations(dir: string): Migration[] {
  return readdirSync(dir)
    .filter((file) => /^\d{3}_[a-z0-9_]+\.sql$/.test(file))
    .sort()
    .map((file) => ({
      name: file,
      statements: splitStatements(readFileSync(join(dir, file), 'utf8')),
    }));
}

/** Splits a migration on statement-ending semicolons and drops comment lines. */
export function splitStatements(sql: string): string[] {
  const code = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return code
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

export async function migrate(db: Db, migrations: readonly Migration[]): Promise<string[]> {
  await db.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    [],
  );
  const done = await db.query<{ name: string }>('SELECT name FROM schema_migrations', []);
  const applied = new Set(done.rows.map((row) => row.name));
  const ran: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    for (const statement of migration.statements) await db.query(statement, []);
    await db.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [
      migration.name,
    ]);
    ran.push(migration.name);
  }
  return ran;
}
