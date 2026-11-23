# Analytics

A small record of how far visitors travel through the narrative, and nothing more. There is no personal data, no cookies, no local storage and no fingerprinting. It answers one question: of everyone who arrives, how many reach the epilogue?

## Data model

Two tables, created by the versioned migrations in `db/migrations/` (run with `npm run db:migrate`).

| Table                | Purpose                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `visits`             | One row per page load: `id` (UUID), `created_at`, `max_zone` (0 to 4, enforced by a check constraint) |
| `daily_visit_counts` | One row per UTC day: how many visits were recorded, used to enforce the daily cap                     |
| `schema_migrations`  | Which migration files have been applied                                                               |

`max_zone` is the furthest zone reached: 0 Solid State, 1 Molten, 2 Fracture, 3 Reformation, 4 Epilogue. It only moves forward: the update uses `GREATEST`, so a repeated, late or concurrent report can never lower it.

## Lifecycle of a visit

```
page load -> POST /api/visit  -> claim a daily slot and insert a row -> { visitId }
scroll    -> furthest zone    -> POST /api/scroll { visitId, zone } -> max_zone = GREATEST(max_zone, zone)
```

The client (`lib/client/analytics.ts`) keeps the `visitId` in memory for the session and reports the zone only when it increases. The zone rule (`lib/shared/zones.ts`) is the same one the on-screen zone label uses.

When the deployment has no database, the page is built with analytics disabled and makes no requests at all.

## Endpoints

All responses are JSON and sent with `Cache-Control: no-store`. Errors use one shape:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request body does not match the expected shape."
  }
}
```

### `POST /api/visit`

Body: empty, or `{}`. Any other field is refused.

| Status | When                                                                      |
| ------ | ------------------------------------------------------------------------- |
| 201    | `{ "visitId": "<uuid>" }`                                                 |
| 400    | Unknown fields, or malformed JSON                                         |
| 413    | Body over the size cap                                                    |
| 415    | A body that is not `application/json`                                     |
| 429    | `RATE_LIMITED` (per address) or `DAILY_CAP_REACHED` (global, per UTC day) |
| 503    | `ANALYTICS_DISABLED` (no database configured) or `DATABASE_UNAVAILABLE`   |

### `POST /api/scroll`

Body: `{ "visitId": "<uuid>", "zone": <integer 0..4> }`. Nothing else is accepted: numeric strings, fractions, out-of-range zones and extra fields are refused with 400.

| Status             | When                                             |
| ------------------ | ------------------------------------------------ |
| 200                | `{ "ok": true, "zone": <stored furthest zone> }` |
| 400                | Invalid body                                     |
| 404                | `VISIT_NOT_FOUND`                                |
| 413, 415, 429, 503 | As above                                         |

### `GET /api/stats`

Requires `Authorization: Bearer <STATS_TOKEN>`. Without the token configured, every request is refused. After repeated failures from one address, that address is locked out for a while, even with the right token.

| Status | When                                                     |
| ------ | -------------------------------------------------------- |
| 200    | The funnel                                               |
| 401    | Missing or wrong token (with `WWW-Authenticate: Bearer`) |
| 429    | Too many failed attempts from this address               |
| 503    | No database, or the database is unavailable              |

Each `reached*` value counts visits whose `max_zone` is at least that zone, so the numbers can only narrow. The server checks this before answering.

Worked example. For seven visits whose furthest zones are the ones below, the endpoint returns this body. The test suite seeds exactly these visits and compares the response with this block, so the example cannot drift from the code.

<!-- stats-example-seed: [0, 0, 1, 2, 3, 4, 4] -->
<!-- stats-example -->

```json
{
  "total": 7,
  "reachedMolten": 5,
  "reachedFracture": 4,
  "reachedReformation": 3,
  "reachedEpilogue": 2
}
```

### `GET /api/health`

`{ "status": "ok" }`. Nothing else.

## Limits

The numbers live in `lib/shared/limits.ts`; the docs check compares the README against that file.

- Rate limits are per address and per server instance, kept in memory, so they reset when an instance restarts.
- The daily visit cap is global and enforced in the database: claiming the day's slot and inserting the visit happen in one statement.
- Every value reaches Postgres as a query parameter.
