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
        │  • MercuryScene  ('use client') │   ← Three.js: HDR reflections + post
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
  the WebGL canvas, the fixed header/footer bars, HUD/wordmark/credit/cursor, and the entire
  Three.js render loop. It reads the shared scroll state and writes to DOM nodes
  (HUD %, zone label, wordmark opacity, the epilogue veil) each frame.
- **`Analytics`** (`'use client'`) is a pure side-effect recorder — it renders
  nothing, just POSTs to the API as the reader scrolls.

Keeping the copy in RSC means the text is in the initial HTML (good for SEO and
the social cards defined in `app/layout.js`), while the ~200 KB of Three.js only
loads for the interactive layer.

### The Three.js scene

The blob is an `IcosahedronGeometry(1, 48)` shaded with a custom `ShaderMaterial`:

- **Vertex shader** — displaces each vertex along its normal using low-frequency
  fbm noise (three octaves with a steep falloff, so the surface has broad glassy
  swells rather than fine crumple), one extra smooth octave that grows with heat,
  plus up to three decaying sine-wave ripples sourced from pointer touches. It
  recomputes the normal from two tangential neighbours so reflections actually
  bend with the surface, and passes world-space position and normal on.
- **Fragment shader** — a true mirror. The view vector is reflected about the
  world-space normal and looked up in a **procedural HDR studio**: a GLSL
  function that returns radiance for any direction (grey ceiling → crisp horizon
  seam → dark floor, a key softbox, strip and rim lights, coloured gels and a
  few tiny, very hot practicals for glints). Because it is evaluated
  analytically per pixel it is infinitely sharp, and because the lights are many
  times brighter than white the highlights bloom. Schlick Fresnel, a warm tint
  that follows heat, and a faint thin-film sheen at grazing angles finish it.

**Inter-reflections.** A `CubeCamera` at the centre of the drop captures only the
droplets and beads, on transparent black, into a small mip-mapped cube target
each frame; the drop composites that over the analytic studio. Going the other
way, droplets and beads intersect their reflection ray with the drop's bounding
sphere analytically and shade that hit with the same studio function — one
bounce, no extra render.

**HDR post chain.** Nothing is tone-mapped in the materials. The scene renders
into a multisampled half-float target, then:

1. a soft-knee bright pass and a 4–5 level downsample / tent-upsample pyramid
   produce the bloom;
2. the final pass adds the bloom, applies a trace of radial colour fringing,
   ACES tone-mapping and gamma, and a fine animated grain that also dithers the
   dark gradients against banding.

Colours authored for the screen (the CSS-hex backgrounds, the backlight halo) are
pushed through the inverse of that tone curve first, so they land on exactly the
intended colour. Where float render targets are unavailable the chain falls back
to 8-bit buffers.

**Staging.** The studio is rotated by a uniform as the story advances, so the
key light swings to the side away from the copy (sections alternate left and
right), and it tilts as the drop flattens so the wordmark sits on dark mirror.
The camera itself travels with the scroll: it orbits around the drop, rises a
little and pushes in through the middle acts, then returns square-on for the
plaque, with pointer parallax layered on top. Most beads hang behind the drop
but every fifth is a small one in the foreground, so the layers slide against
each other and read as depth. On tall, narrow viewports the camera pulls back so
the whole drop fits the width.
The canvas is given an explicit CSS size — a `<canvas>` is a replaced element and
would otherwise be laid out at its backing-store size, i.e. 2× too large on a
HiDPI display.

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

### Header and footer bars

The HUD, zone label and byline are `position: fixed`, so long copy (the
epilogue especially) used to scroll straight through them. Two fixed, frosted
bars (`.chrome-bar` — a translucent fill plus `backdrop-filter: blur`) now sit at
the top and bottom edges, on the same layer as the labels and ahead of them in
the DOM so the labels paint on top. The labels are vertically centred inside the
bars via a shared `--bar-h` custom property, with safe-area insets added for
notched phones. `body.is-daylight` — the class the scene already toggles when the
epilogue veil takes over — switches the bars from dark to pale glass. Browsers
without `backdrop-filter` get a near-opaque fill instead.

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
`prototype/`). This app began as a faithful port of that build — same narrative,
same scroll choreography — restructured into Next.js and given a real backend.
The rendering has since moved on from the prototype's baked matcap to the HDR
reflection pipeline described above; the prototype is kept as the original
reference. Three.js remains pinned to `0.128.0`.
