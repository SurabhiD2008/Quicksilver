// Numeric limits shared by the API, the client, the tests and the docs check.
// Kept free of imports so command-line scripts can load it directly.

/** Narrative zones: 0 Solid State, 1 Molten, 2 Fracture, 3 Reformation, 4 Epilogue. */
export const MAX_ZONE = 4;

/** Request bodies here are under 100 bytes; anything near this cap is abuse. */
export const JSON_BODY_LIMIT_BYTES = 2048;

/** Per-IP request budgets. Counters live in process memory (per instance). */
export const RATE_LIMITS = {
  visit: { limit: 6, windowMs: 10 * 60 * 1000 },
  scroll: { limit: 60, windowMs: 10 * 60 * 1000 },
  statsAuthFailures: { limit: 5, windowMs: 15 * 60 * 1000 },
} as const;

/** Global cap on recorded visits per UTC day, enforced in the database. */
export const DAILY_VISIT_CAP = 5000;

/** Minimum length of the bearer token that unlocks the stats route. */
export const STATS_TOKEN_MIN_LENGTH = 32;

/** Upper bound on a single database round trip. */
export const DB_TIMEOUT_MS = 5000;

/** Most distinct client keys a limiter tracks before evicting the oldest. */
export const RATE_LIMIT_MAX_KEYS = 10000;

/** Browser widths every layout is tested at. */
export const TEST_WIDTHS = [320, 390, 768, 1024, 1360] as const;

/** Initial JavaScript budget for the page, gzipped. */
export const INITIAL_JS_BUDGET_BYTES = 250 * 1024;
