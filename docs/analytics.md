# Analytics

A deliberately small, privacy-light record of **how far visitors travel through
the narrative** — nothing more. There is no personal data, no cookies, no
localStorage, no fingerprinting. It exists to answer one question: of everyone
who arrives, how many make it to the epilogue?

---

## Data model

One table, one row per page load.

```sql
CREATE TABLE IF NOT EXISTS visits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 0 Solid State · 1 Molten · 2 Fracture · 3 Reformation · 4 Epilogue
  max_zone    SMALLINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS visits_created_at_idx ON visits (created_at);
```

`max_zone` is the furthest narrative zone the visitor reached. It only ever
moves forward (the update uses `GREATEST`), so re-reporting the same or an
earlier zone is a no-op.

The table is created automatically the first time any route runs (see
`lib/db.js` → `ensureSchema`), so a brand-new database needs no migration.
`db/schema.sql` is the canonical copy for manual provisioning.

---

## The lifecycle of a visit

```
page load ──▶ POST /api/visit ──▶ INSERT row ──▶ { visitId }
                                                     │  (kept in memory only)
scroll ──▶ compute furthest zone ──▶ POST /api/scroll { visitId, zone }
                                          └▶ UPDATE max_zone = GREATEST(max_zone, zone)
```

The client (`components/Analytics.jsx`) holds the `visitId` in memory for the
session — never in storage. As the reader scrolls, it works out the furthest
section past the middle of the viewport and reports it, but only when that number
increases.

---

## Endpoints

### `POST /api/visit`
Records a new page load.

```json
// → 200
{ "visitId": "3f2a…-uuid" }
```

### `POST /api/scroll`
Advances the furthest zone reached for a visit. `zone` is clamped to `0..4`.

```json
// body
{ "visitId": "3f2a…-uuid", "zone": 4 }
// → 200
{ "ok": true, "zone": 4 }
```

Returns `400` if `visitId`/`zone` are missing or malformed, `404` for an unknown
`visitId`.

### `GET /api/stats`
Aggregate funnel across all visits.

```json
// → 200
{
  "total": 1284,
  "reachedMolten": 902,
  "reachedFracture": 640,
  "reachedReformation": 511,
  "reachedEpilogue": 388
}
```

Each `reached*` is the count of visits whose `max_zone` is at least that zone —
a monotonically decreasing funnel. Served with `Cache-Control: no-store`.

---

## Notes

- All queries are parameterized through `@vercel/postgres`' tagged-template `sql`,
  so user-supplied values (the `visitId`, the `zone`) are never string-concatenated.
- The routes are best-effort by contract: any failure returns a 5xx and the
  frontend ignores it. Analytics must never degrade the experience.
- `/api/stats` is intentionally **not** shown anywhere on the page. It's there for
  you to consume (a dashboard, a `curl`, a scheduled job) if you want it.
