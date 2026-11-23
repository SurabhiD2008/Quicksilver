import { errorResponse } from '../../../lib/server/http.ts';

// Unknown API paths answer in the API's JSON error shape instead of the HTML
// not-found page.
export const dynamic = 'force-dynamic';

function notFound(): Response {
  return errorResponse('NOT_FOUND');
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
