# Quicksilver

> *"Everything flows, nothing stands still."* — Heraclitus

**Live:** _deploying to Vercel — replace this line with your URL after the first deploy._

**Docs:** [Architecture](docs/architecture.md) · [Analytics](docs/analytics.md)

**Quicksilver is a decorative, interactive liquid-metal experience.** A chrome
blob that ripples where you touch it, then — as you scroll — melts, fractures
into orbiting droplets, and reforms into a mirror-bright plaque that speaks its
name. It is built purely to be beautiful. Then a quiet epilogue breaks the
fourth wall and tells you why real liquid metal doesn't always get a happy
ending: the mercury thawing out of the Arctic permafrost doesn't reassemble.

It is one project in two parts:

- **Frontend** (`app/`, `components/`) — a **Next.js 14 (App Router)** app in
  **React 18**. The centrepiece is a custom **Three.js** scene: a subdivided
  icosahedron shaded with a hand-baked chrome *matcap* and a GLSL vertex shader
  that displaces the surface with fbm noise plus decaying touch-ripples. The
  whole narrative is driven by a single scroll fraction. Fonts are self-hosted
  via `next/font`; every texture is generated procedurally on a `<canvas>` —
  no external image assets.
- **Backend** (`app/api/`, `lib/`) — a small, privacy-light **visitor & scroll
  analytics** API on **PostgreSQL (Neon / Vercel Postgres)**, deployed as
  **Vercel serverless functions**. It records each visit and how far the reader
  travels through the narrative. No cookies, no localStorage, no personal data.

The experience never blocks on the backend: the analytics calls are
best-effort, so the site works perfectly even with no database attached. See
the **[Architecture doc](docs/architecture.md)** for how it all fits together.

---

## The narrative

Five full-height scroll zones, driven by one scroll fraction and eased between
with smoothstep — not hard cuts.

| Zone | Name | What happens |
|---|---|---|
| 00 | **Solid State** | A still chrome drop. Move your pointer over it and it ripples like real mercury — several ripples can overlap and decay over ~2s. |
| 01 | **Molten** | Warmth loosens the hold; the surface wobbles harder and gives up its fixed shape. |
| 02 | **Fracture** | Surface tension fails; the body scatters into orbiting droplets. |
| 03 | **Reformation** | The droplets recombine and flatten into a plaque as the metallic **QUICKSILVER** wordmark fades in. |
| — | **Epilogue** | The page surfaces out of the dark chrome stage into cold daylight for a short, cited piece on permafrost mercury. Set in Fraunces, centered, deliberately calm. |

A HUD reads **SURFACE TENSION** as an honest percentage of the same value that
drives the shader morph — it falls as the metal melts and partially recovers as
it reforms.

---

## Features

- **Touch-reactive liquid chrome** — ripples propagate from wherever the cursor
  meets the blob, computed from an analytic ray↔sphere pick so pointer movement
  never hitches the frame.
- **Procedural everything** — the chrome look is a studio *matcap* baked on a
  canvas (bright ceiling, crisp horizon, dark floor, iridescent blooms), sampled
  by the view-space normal; the backlight glow and floating mercury beads are
  generated in code. No image files ship with the app.
- **Honest, scroll-linked storytelling** — the blob's arc finishes exactly at
  the end of Reformation; the epilogue's daylight "veil" and text reveal run on
  their own, decoupled scroll math so the two never fight.
- **Passive analytics** — a tiny funnel of how far visitors scroll, stored in
  Postgres. Aggregates are available at `/api/stats` (not surfaced on the page).
- **Accessible & responsive** — verified from **375 px mobile up to desktop**:
  no horizontal scroll, and on narrow phones the HUD relocates to the top so the
  corner labels and the byline never overlap. Visible keyboard focus states,
  `prefers-reduced-motion` support (ambient motion damped, interaction preserved),
  and a custom glowing cursor on desktop that falls back to the system cursor on
  touch/small screens.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router), React 18 |
| 3D | Three.js `0.128.0` (pinned to match the original build exactly) |
| Styling | Plain CSS (`app/globals.css`), fonts via `next/font` |
| Database | PostgreSQL — Neon / Vercel Postgres, via `@vercel/postgres` |
| Hosting | Vercel (static page on the CDN, API as serverless functions) |

---

## Running locally

```bash
npm install
cp .env.example .env.local     # paste your Postgres pooled URL into POSTGRES_URL
npm run dev                    # http://localhost:3000
```

A database is only needed for the analytics API. The easiest is a free
[Neon](https://neon.tech) project — copy its **pooled** connection string into
`POSTGRES_URL`. The `visits` table is created automatically on first request
(see `lib/db.js`), or run `db/schema.sql` by hand. Without a database the visual
experience still works; the analytics calls just fail silently.

---

## Deploy

1. Push this repo to GitHub and **Import** it in Vercel — it auto-detects
   Next.js, no configuration needed.
2. In the project's **Storage** tab, add **Postgres** (Neon). Vercel injects
   `POSTGRES_URL` (and friends) automatically.
3. Deploy. The `visits` table is created on the first API hit.

---

## API

| Method | Route | Body → Result |
|---|---|---|
| POST | `/api/visit` | → `{ visitId }` |
| POST | `/api/scroll` | `{ visitId, zone }` (zone 0–4) → `{ ok, zone }` |
| GET | `/api/stats` | → `{ total, reachedMolten, reachedFracture, reachedReformation, reachedEpilogue }` |

Zones: `0` Solid State · `1` Molten · `2` Fracture · `3` Reformation · `4` Epilogue.
Full details in the **[Analytics doc](docs/analytics.md)**.

---

## Project layout

```
app/
  layout.js            metadata (title/description/OG/Twitter) + fonts (next/font)
  globals.css          all styling
  page.js              the five sections (four fiction + verbatim epilogue)
  api/visit/route.js   POST → record a page load
  api/scroll/route.js  POST → advance furthest zone reached
  api/stats/route.js   GET  → aggregate funnel
components/
  MercuryScene.jsx     'use client' — the Three.js scene + fixed UI
  Analytics.jsx        'use client' — records visit/scroll (renders nothing)
lib/db.js              Postgres client + lazy CREATE TABLE
db/schema.sql          canonical schema
prototype/             the original single-file build that this app was ported from
```

---

## License

© 2026 Surabhi Datta. All rights reserved — see [LICENSE](LICENSE). Published for
viewing and portfolio/evaluation only.

## Author

Built by **Surabhi Datta**.
