import { json, methodNotAllowed } from '../../../lib/server/http.ts';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return json({ status: 'ok' });
}
export const POST = methodNotAllowed(['GET']);
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
