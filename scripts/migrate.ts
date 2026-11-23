import { createNeonDb } from '../lib/server/db.ts';
import { loadConfig } from '../lib/server/config.ts';
import { loadMigrations, migrate } from '../lib/server/migrate.ts';

// Applies pending migrations to the database named by POSTGRES_URL. Run by the
// owner (or a deploy step) with a role allowed to change the schema; the app
// itself never runs DDL.

const config = loadConfig(process.env);
if (!config.postgresUrl) {
  console.error('POSTGRES_URL is not set: nothing to migrate.');
  process.exit(1);
}
try {
  const applied = await migrate(createNeonDb(config.postgresUrl), loadMigrations('db/migrations'));
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
} catch (error) {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'none';
  console.error(
    `Migration failed (code ${code}). Fix the cause and run it again; every migration is safe to repeat.`,
  );
  process.exit(1);
}
