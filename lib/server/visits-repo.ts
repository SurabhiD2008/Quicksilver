import type { Db } from './db.ts';
import type { StatsResponse } from '../shared/schemas.ts';

// All SQL for the visits feature. Every value reaches Postgres as a parameter.

/**
 * Records a visit if today's counter is below the cap. Claiming the counter
 * slot and inserting the visit happen in one statement, so two requests at the
 * cap cannot both get through. Returns the new id, or null when the cap is hit.
 */
export async function insertVisitWithinCap(
  db: Db,
  day: string,
  cap: number,
): Promise<string | null> {
  const result = await db.query<{ id: string }>(
    `WITH slot AS (
       INSERT INTO daily_visit_counts (day, visits) VALUES ($1::date, 1)
       ON CONFLICT (day) DO UPDATE SET visits = daily_visit_counts.visits + 1
       WHERE daily_visit_counts.visits < $2
       RETURNING visits
     )
     INSERT INTO visits (max_zone) SELECT 0 FROM slot RETURNING id`,
    [day, cap],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Moves a visit's furthest zone forward. GREATEST makes the write commutative:
 * concurrent or repeated reports converge on the highest zone, never lower it.
 * Returns the stored zone, or null when no visit has that id.
 */
export async function advanceZone(db: Db, visitId: string, zone: number): Promise<number | null> {
  const result = await db.query<{ max_zone: number }>(
    'UPDATE visits SET max_zone = GREATEST(max_zone, $2::smallint) WHERE id = $1::uuid RETURNING max_zone',
    [visitId, zone],
  );
  const stored = result.rows[0]?.max_zone;
  return stored === undefined ? null : Number(stored);
}

export async function readFunnel(db: Db): Promise<StatsResponse> {
  const result = await db.query<Record<string, number>>(
    `SELECT
       count(*)::int                                AS total,
       (count(*) FILTER (WHERE max_zone >= 1))::int AS reached_molten,
       (count(*) FILTER (WHERE max_zone >= 2))::int AS reached_fracture,
       (count(*) FILTER (WHERE max_zone >= 3))::int AS reached_reformation,
       (count(*) FILTER (WHERE max_zone >= 4))::int AS reached_epilogue
     FROM visits`,
    [],
  );
  const row = result.rows[0] ?? {};
  return {
    total: Number(row.total ?? 0),
    reachedMolten: Number(row.reached_molten ?? 0),
    reachedFracture: Number(row.reached_fracture ?? 0),
    reachedReformation: Number(row.reached_reformation ?? 0),
    reachedEpilogue: Number(row.reached_epilogue ?? 0),
  };
}

/** A funnel can only narrow; any other shape means the query is wrong. */
export function isConsistentFunnel(stats: StatsResponse): boolean {
  const steps = [
    stats.total,
    stats.reachedMolten,
    stats.reachedFracture,
    stats.reachedReformation,
    stats.reachedEpilogue,
  ];
  return steps.every((value, i) => i === 0 || value <= (steps[i - 1] ?? 0));
}
