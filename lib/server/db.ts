import { neon } from '@neondatabase/serverless';
import { DB_TIMEOUT_MS } from '../shared/limits.ts';

// The data layer talks to this interface only, so tests can run the same SQL
// against an in-process Postgres instead of the network.

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface Db {
  query<T>(text: string, params: readonly unknown[]): Promise<QueryResult<T>>;
}

export function createNeonDb(connectionString: string): Db {
  const sql = neon(connectionString, { fullResults: true });
  return {
    async query<T>(text: string, params: readonly unknown[]) {
      const result = await sql.query(text, [...params], {
        fullResults: true,
        fetchOptions: { signal: AbortSignal.timeout(DB_TIMEOUT_MS) },
      });
      return { rows: result.rows as T[], rowCount: result.rowCount };
    },
  };
}
