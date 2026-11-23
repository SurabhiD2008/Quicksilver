import { ERRORS, errorBody, type ErrorCode } from '../shared/errors.ts';
import { JSON_BODY_LIMIT_BYTES } from '../shared/limits.ts';

// Request parsing and response building shared by every API route.

const NO_STORE = { 'Cache-Control': 'no-store' };

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(data, { status, headers: { ...NO_STORE, ...headers } });
}

export function errorResponse(code: ErrorCode, headers: Record<string, string> = {}): Response {
  return json(errorBody(code), ERRORS[code].status, headers);
}

/**
 * The caller's address as reported by the hosting platform's proxy. On Vercel
 * the platform sets x-forwarded-for itself; elsewhere the header can be forged,
 * which only weakens the per-IP rate limits.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export type BodyResult = { ok: true; value: unknown } | { ok: false; code: ErrorCode };

async function readCapped(request: Request, limit: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Reads a JSON body under the size cap. An empty body is allowed only when asked. */
export async function readJsonBody(request: Request, allowEmpty: boolean): Promise<BodyResult> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > JSON_BODY_LIMIT_BYTES) {
    return { ok: false, code: 'PAYLOAD_TOO_LARGE' };
  }
  const bytes = await readCapped(request, JSON_BODY_LIMIT_BYTES);
  if (bytes === null) return { ok: false, code: 'PAYLOAD_TOO_LARGE' };
  if (bytes.byteLength === 0) {
    return allowEmpty ? { ok: true, value: {} } : { ok: false, code: 'VALIDATION_FAILED' };
  }
  const type = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (type !== 'application/json') return { ok: false, code: 'UNSUPPORTED_MEDIA_TYPE' };
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    // Invalid UTF-8 and invalid JSON are the same client mistake.
    return { ok: false, code: 'MALFORMED_JSON' };
  }
}

export function methodNotAllowed(allowed: readonly string[]): () => Response {
  return () => errorResponse('METHOD_NOT_ALLOWED', { Allow: allowed.join(', ') });
}

export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
