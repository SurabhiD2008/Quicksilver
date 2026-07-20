import { sql } from '@vercel/postgres';

// Lazily ensure the analytics table exists. Guarded so the DDL runs at most
// once per serverless instance (CREATE TABLE IF NOT EXISTS is also idempotent).
let ensured = false;

export async function ensureSchema() {
  if (ensured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS visits (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      max_zone    SMALLINT NOT NULL DEFAULT 0
    )
  `;
  ensured = true;
}

export { sql };
