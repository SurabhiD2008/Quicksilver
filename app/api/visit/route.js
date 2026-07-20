import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '../../../lib/db';

// Serverless functions here talk to Postgres, so keep them on the Node.js runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/visit  → record a new page load, return its id.
// The client keeps this id in memory for the session and sends it to
// /api/scroll as the visitor scrolls further. No cookies, no localStorage.
export async function POST() {
  try {
    await ensureSchema();
    const { rows } = await sql`
      INSERT INTO visits (max_zone) VALUES (0)
      RETURNING id
    `;
    return NextResponse.json({ visitId: rows[0].id });
  } catch (err) {
    console.error('POST /api/visit failed:', err);
    return NextResponse.json({ error: 'could not record visit' }, { status: 500 });
  }
}
