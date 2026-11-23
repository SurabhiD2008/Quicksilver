import { methodNotAllowed } from '../../../lib/server/http.ts';
import { api } from '../../../lib/server/runtime.ts';

// Live counts: a cached copy would be stale the moment it was stored.
export const dynamic = 'force-dynamic';

export const GET = api.stats;
export const POST = methodNotAllowed(['GET']);
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
