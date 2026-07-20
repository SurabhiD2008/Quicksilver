# Architecture

How the whole of Quicksilver fits together — the Next.js frontend, the Three.js
scene that does the heavy lifting, the serverless analytics API, the Postgres
database, and the decisions that tie them.

---

## The system at a glance

```
                    Browser
        ┌───────────────────────────────┐
        │  Next.js page (App Router)     │   ← prerendered HTML on Vercel's CDN
        │  • 5 scroll sections (RSC)      │
        │  • MercuryScene  ('use client') │   ← Three.js: matcap + GLSL shaders
        │  • Analytics     ('use client') │   ← fire-and-forget beacons
        └───────────────┬───────────────┘
                        │ fetch /api/*  (same origin)
                        ▼
        ┌───────────────────────────────┐
        │  Vercel serverless functions   │   ← app/api/*/route.js (Node runtime)
        │  • /api/visit   record a load   │
        │  • /api/scroll  advance zone    │
        │  • /api/stats   aggregate funnel│
        └───────────────┬───────────────┘
                        │ @vercel/postgres (pooled)
                        ▼
        ┌───────────────────────────────┐
        │  Neon — serverless PostgreSQL  │
        │  • one table: visits           │
        └───────────────────────────────┘
```

Everything is served from **one origin** on Vercel: the prerendered page at `/`
and the API at `/api/*`. Because they share an origin there is no CORS and the
client calls `/api` relatively.

**Design principle — the experience never blocks on the backend.** The analytics
calls are best-effort. If the database is missing or unreachable, the API routes
return a 500, the client swallows it, and the visual experience is completely
unaffected. Analytics is additive, never load-bearing.

---

## The frontend

### Server vs. client components

The page (`app/page.js`) is a **React Server Component**: the five sections and
the verbatim epilogue copy are plain markup, rendered to static HTML at build
time. Only two pieces opt into the client:

- **`MercuryScene`** (`'use client'`) owns everything visual and interactive —
  the WebGL canvas, the fixed HUD/wordmark/credit/cursor, and the entire
  Three.js render loop. It reads the shared scroll state and writes to DOM nodes
  (HUD %, zone label, wordmark opacity, the epilogue veil) each frame.
- **`Analytics`** (`'use client'`) is a pure side-effect recorder — it renders
  nothing, just POSTs to the API as the reader scrolls.

Keeping the copy in RSC means the text is in the initial HTML (good for SEO and
the social cards defined in `app/layout.js`), while the ~200 KB of Three.js only
loads for the interactive layer.

### The Three.js scene

The blob is an `IcosahedronGeometry(1, 48)` shaded with a custom `ShaderMaterial`:

- **Vertex shader** — displaces each vertex along its normal using 4-octave fbm
  noise (ambient wobble) plus up to three decaying sine-wave ripples sourced
  from pointer touches. It recomputes the normal from two tangential neighbours
  so the chrome reflection actually bends with the surface.
- **Fragment shader** — a classic **matcap** lookup: the view-space normal
  indexes a procedurally-baked chrome "studio" texture (bright ceiling → crisp
  horizon → dark floor, with iridescent colour blooms). Filmic ACES tone-mapping,
  an iridescent Fresnel rim, and a cheap specular bloom finish the metal.

A single **scroll fraction** — anchored to the *bottom of Reformation*, not the
whole document, so the epilogue below doesn't stretch the timeline — drives the
narrative via smoothstep easing: heat, fracture, plaque-flatten, and wordmark
reveal are all functions of it.

### Ripples without frame hitches

Touch ripples need the point on the blob under the cursor. Rather than raycast
the ~46k-triangle mesh on every pointer move (which stutters the frame), the
scene does an **analytic ray↔sphere** intersection against the blob's bounding
sphere — O(1), smooth. Cursor and camera-parallax smoothing are frame-rate
independent (exponential), so motion stays smooth on any refresh rate.

---

## The backend

Three serverless routes under `app/api`, all on the Node.js runtime and marked
`dynamic = 'force-dynamic'` (they touch the database, so they're never cached or
prerendered). They share a thin Postgres client in `lib/db.js` that lazily runs
`CREATE TABLE IF NOT EXISTS` once per instance, so the schema self-heals on first
use — no migration step required for a fresh database.

See **[Analytics](analytics.md)** for the data model and request/response shapes.

---

## Provenance

Quicksilver began life as a single self-contained HTML file (kept in
`prototype/`). This app is a faithful port of that build — same matcap, same
shaders, same narrative — restructured into Next.js and given a real backend.
Three.js is pinned to `0.128.0` so the visuals match the prototype exactly.
