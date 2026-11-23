import { describe, expect, it } from 'vitest';
import {
  ErrorResponse,
  ScrollRequest,
  StatsResponse,
  VisitRequest,
  VisitResponse,
} from '../../lib/shared/schemas.ts';
import { ERROR_CODES, errorBody } from '../../lib/shared/errors.ts';

// The edge-case catalogue, applied to every field the API accepts.

const ID = '3f2a6f7e-1b2c-4d5e-8f90-a1b2c3d4e5f6';

const visitIdCases: [string, unknown, boolean][] = [
  ['a valid UUID', ID, true],
  ['the same UUID in upper case', ID.toUpperCase(), true],
  ['empty', '', false],
  ['whitespace only', '   ', false],
  ['one character', 'a', false],
  ['leading and trailing spaces', ` ${ID} `, false],
  ['Devanagari', 'नमस्ते', false],
  ['emoji with joiners', '👩‍👩‍👧‍👦', false],
  ['right-to-left text', 'مرحبا', false],
  ['combining marks', 'é', false],
  ['null byte', `${ID}\u0000`, false],
  ['a very long token', 'x'.repeat(10000), false],
  ['markup', '<script>alert(1)</script>', false],
  ['a query fragment', "' OR 1=1 --", false],
  ['path traversal', '../../etc/passwd', false],
  ['template syntax', '{{7*7}}', false],
  ['CR and LF', `${ID}\r\n`, false],
  ['a number', 12345, false],
  ['null', null, false],
  ['an object', { id: ID }, false],
];

const zoneCases: [string, unknown, boolean][] = [
  ['zero', 0, true],
  ['negative zero', -0, true],
  ['minus one', -1, false],
  ['one', 1, true],
  ['the maximum', 4, true],
  ['maximum plus one', 5, false],
  ['a fraction', 1.5, false],
  ['exponent notation', 1e3, false],
  ['a numeric string', '1', false],
  ['leading zeros', '01', false],
  ['above the safe integer range', 2 ** 53 + 2, false],
  ['not a number', Number.NaN, false],
  ['infinity', Number.POSITIVE_INFINITY, false],
  ['null', null, false],
  ['a boolean', true, false],
];

describe('ScrollRequest: visitId', () => {
  it.each(visitIdCases)('%s', (_name, visitId, ok) => {
    expect(ScrollRequest.safeParse({ visitId, zone: 1 }).success).toBe(ok);
  });
});

describe('ScrollRequest: zone', () => {
  it.each(zoneCases)('%s', (_name, zone, ok) => {
    expect(ScrollRequest.safeParse({ visitId: ID, zone }).success).toBe(ok);
  });
});

describe('ScrollRequest: payload shape', () => {
  it.each<[string, unknown]>([
    ['missing visitId', { zone: 1 }],
    ['missing zone', { visitId: ID }],
    ['an unknown extra field', { visitId: ID, zone: 1, note: 'x' }],
    ['a privileged field', { visitId: ID, zone: 1, role: 'admin' }],
    ['a client-supplied timestamp', { visitId: ID, zone: 1, created_at: '2020-01-01' }],
    ['null instead of an object', null],
    ['an array', [ID, 1]],
    ['deep nesting', { visitId: ID, zone: { a: { b: { c: 1 } } } }],
    ['a string', 'hello'],
  ])('refuses %s', (_name, body) => {
    expect(ScrollRequest.safeParse(body).success).toBe(false);
  });
});

describe('VisitRequest', () => {
  it('accepts only an empty object', () => {
    expect(VisitRequest.safeParse({}).success).toBe(true);
    expect(VisitRequest.safeParse({ max_zone: 4 }).success).toBe(false);
    expect(VisitRequest.safeParse({ id: ID }).success).toBe(false);
    expect(VisitRequest.safeParse([]).success).toBe(false);
  });
});

describe('response shapes', () => {
  it('accept what the server sends and nothing extra', () => {
    expect(VisitResponse.safeParse({ visitId: ID }).success).toBe(true);
    expect(VisitResponse.safeParse({ visitId: ID, email: 'x@y.z' }).success).toBe(false);
    const stats = {
      total: 3,
      reachedMolten: 2,
      reachedFracture: 1,
      reachedReformation: 1,
      reachedEpilogue: 0,
    };
    expect(StatsResponse.safeParse(stats).success).toBe(true);
    expect(StatsResponse.safeParse({ ...stats, total: -1 }).success).toBe(false);
  });

  it('every error code produces a valid error body', () => {
    for (const code of ERROR_CODES)
      expect(ErrorResponse.safeParse(errorBody(code)).success).toBe(true);
  });
});
