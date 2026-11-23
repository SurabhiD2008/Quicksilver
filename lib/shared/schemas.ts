import { z } from 'zod';
import { ERROR_CODES } from './errors.ts';
import { MAX_ZONE } from './limits.ts';

// Every request and response shape, defined once. Server validation and client
// parsing both use these, and the types are derived from them.

const zone = z.int().min(0).max(MAX_ZONE);
const count = z.int().min(0);

export const VisitRequest = z.strictObject({});
export const VisitResponse = z.strictObject({ visitId: z.uuid() });

export const ScrollRequest = z.strictObject({ visitId: z.uuid(), zone });
export const ScrollResponse = z.strictObject({ ok: z.literal(true), zone });

export const StatsResponse = z.strictObject({
  total: count,
  reachedMolten: count,
  reachedFracture: count,
  reachedReformation: count,
  reachedEpilogue: count,
});

export const HealthResponse = z.strictObject({ status: z.literal('ok') });

export const ErrorResponse = z.strictObject({
  error: z.strictObject({ code: z.enum(ERROR_CODES), message: z.string().min(1) }),
});

export type ScrollRequest = z.infer<typeof ScrollRequest>;
export type ScrollResponse = z.infer<typeof ScrollResponse>;
export type VisitResponse = z.infer<typeof VisitResponse>;
export type StatsResponse = z.infer<typeof StatsResponse>;
