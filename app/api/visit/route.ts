import { methodNotAllowed } from '../../../lib/server/http.ts';
import { api } from '../../../lib/server/runtime.ts';

// Writes to the database on every call, so never prerender or cache it.
export const dynamic = 'force-dynamic';

export const POST = api.visit;
export const GET = methodNotAllowed(['POST']);
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
