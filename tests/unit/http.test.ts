import { describe, expect, it } from 'vitest';
import { clientIp, readJsonBody, utcDay } from '../../lib/server/http.ts';
import { JSON_BODY_LIMIT_BYTES } from '../../lib/shared/limits.ts';

const post = (
  body: BodyInit | null,
  headers: Record<string, string> = { 'content-type': 'application/json' },
) => new Request('http://localhost/api/x', { method: 'POST', body, headers });

describe('readJsonBody', () => {
  it('parses a JSON object', async () => {
    expect(await readJsonBody(post('{"a":1}'), false)).toEqual({ ok: true, value: { a: 1 } });
  });

  it('accepts a content type with parameters, in any case', async () => {
    const r = await readJsonBody(
      post('{}', { 'content-type': 'Application/JSON; charset=utf-8' }),
      false,
    );
    expect(r.ok).toBe(true);
  });

  it.each([
    ['an empty body where one is required', post(null), false, 'VALIDATION_FAILED'],
    [
      'a body over the cap',
      post('x'.repeat(JSON_BODY_LIMIT_BYTES + 1)),
      false,
      'PAYLOAD_TOO_LARGE',
    ],
    [
      'a declared length over the cap',
      post('{}', {
        'content-type': 'application/json',
        'content-length': String(JSON_BODY_LIMIT_BYTES + 1),
      }),
      false,
      'PAYLOAD_TOO_LARGE',
    ],
    [
      'a form body',
      post('a=1', { 'content-type': 'application/x-www-form-urlencoded' }),
      false,
      'UNSUPPORTED_MEDIA_TYPE',
    ],
    ['no content type', post('{}', {}), false, 'UNSUPPORTED_MEDIA_TYPE'],
    ['malformed JSON', post('{"a":'), false, 'MALFORMED_JSON'],
    ['invalid UTF-8', post(new Uint8Array([0x7b, 0xff, 0x7d])), false, 'MALFORMED_JSON'],
  ])('refuses %s', async (_name, request, allowEmpty, code) => {
    expect(await readJsonBody(request, allowEmpty)).toEqual({ ok: false, code });
  });

  it('accepts a body exactly at the cap', async () => {
    const body = `"${'x'.repeat(JSON_BODY_LIMIT_BYTES - 2)}"`;
    expect((await readJsonBody(post(body), false)).ok).toBe(true);
  });

  it('treats an empty body as {} when allowed', async () => {
    expect(await readJsonBody(post(null, {}), true)).toEqual({ ok: true, value: {} });
  });
});

describe('clientIp', () => {
  const ip = (headers: Record<string, string>) =>
    clientIp(new Request('http://localhost/', { headers }));
  it('uses the first forwarded address', () => {
    expect(ip({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' })).toBe('198.51.100.1');
  });
  it('falls back to x-real-ip, then to a shared bucket', () => {
    expect(ip({ 'x-real-ip': '198.51.100.2' })).toBe('198.51.100.2');
    expect(ip({})).toBe('unknown');
  });
});

describe('utcDay', () => {
  it.each([
    ['2024-02-29T23:59:59.999Z', '2024-02-29'], // leap day, last millisecond
    ['2024-03-01T00:00:00.000Z', '2024-03-01'],
    ['2026-01-31T18:29:59Z', '2026-01-31'], // 23:59 in UTC+05:30 is still the 31st in UTC
    ['2026-01-31T18:30:00Z', '2026-01-31'], // midnight in UTC+05:30
    ['1970-01-01T00:00:00Z', '1970-01-01'],
  ])('%s is day %s', (iso, day) => {
    expect(utcDay(new Date(iso))).toBe(day);
  });
});
