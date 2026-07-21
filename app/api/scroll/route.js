import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Queries run over HTTP (Neon driver) — keep them out of Next's Data Cache.
export const fetchCache = 'force-no-store';

// POST /api/scroll  { visitId, zone }
// Advances the recorded scroll depth for a visit. Uses GREATEST so it only ever
// moves forward, and validates zone to 0..4. Safe to call repeatedly.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { visitId } = body;
    let zone = Number(body.zone);

    if (!visitId || !Number.isFinite(zone)) {
      return NextResponse.json({ error: 'visitId and numeric zone required' }, { status: 400 });
    }
    zone = Math.max(0, Math.min(4, Math.round(zone)));

    await ensureSchema();
    const { rowCount } = await sql`
      UPDATE visits
      SET max_zone = GREATEST(max_zone, ${zone})
      WHERE id = ${visitId}::uuid
    `;

    if (rowCount === 0) {
      return NextResponse.json({ error: 'unknown visitId' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, zone });
  } catch (err) {
    console.error('POST /api/scroll failed:', err);
    return NextResponse.json({ error: 'could not record scroll' }, { status: 500 });
  }
}
