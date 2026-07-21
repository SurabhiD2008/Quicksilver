import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// @vercel/postgres issues queries over HTTP (Neon driver). This SELECT is
// byte-identical on every request, so Next's Data Cache would memoise the first
// response and serve stale counts forever. Opt every fetch in this route out.
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// GET /api/stats  → aggregate funnel of how far visitors scroll.
export async function GET() {
  try {
    await ensureSchema();
    const { rows } = await sql`
      SELECT
        count(*)                                    AS total,
        count(*) FILTER (WHERE max_zone >= 1)       AS reached_molten,
        count(*) FILTER (WHERE max_zone >= 2)       AS reached_fracture,
        count(*) FILTER (WHERE max_zone >= 3)       AS reached_reformation,
        count(*) FILTER (WHERE max_zone >= 4)       AS reached_epilogue
      FROM visits
    `;
    const r = rows[0];
    const stats = {
      total: Number(r.total),
      reachedMolten: Number(r.reached_molten),
      reachedFracture: Number(r.reached_fracture),
      reachedReformation: Number(r.reached_reformation),
      reachedEpilogue: Number(r.reached_epilogue),
    };
    return NextResponse.json(stats, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('GET /api/stats failed:', err);
    return NextResponse.json({ error: 'could not load stats' }, { status: 500 });
  }
}
