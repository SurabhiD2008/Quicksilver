# Architecture

How Quicksilver fits together: the prerendered page, the Three.js scene, the serverless analytics API and the database.

## At a glance

Everything is served from one origin on Vercel: the prerendered page at `/` from the CDN and the API at `/api/*` as Node serverless functions. The client calls the API with relative URLs, so there is no CORS.

The experience never depends on the backend. Without a database the page is built with analytics disabled and makes no API calls. Without WebGL the page shows a static drop and keeps every word readable.

## The page

`app/page.tsx` is a server component: the four fiction acts (`components/FictionSections.tsx`) and the epilogue (`components/Epilogue.tsx`, `components/Sources.tsx`) are static markup in the first HTML response, which is what social cards and search engines read. Two client components sit on top:

- `components/MercuryScene.tsx` renders the fixed layer (canvas holder, fallback drop, vignette, daylight veil, wordmark, frosted bars, surface-tension readout, zone label, credit, cursor) and mounts the scene. It sits inside `components/SceneBoundary.tsx`, an error boundary that switches to the static fallback rather than letting a scene failure unmount the copy.
- `components/Analytics.tsx` records the visit and the furthest zone reached. It renders nothing.

Styles live in `app/styles/`: `tokens.css` defines every colour, type size, spacing step and radius; the other files (`base.css`, `sections.css`, `chrome.css`, `epilogue.css`) only use tokens. `tests/unit/contrast.test.ts` checks the text colours against their backdrops under the worst case: pure white metal behind a scrim or bar, and the daylight veil at the opacity at which the labels switch colour.

## The scene (`lib/scene/`)

| Module                     | Role                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `stage.ts`                 | Mounts the scene into its holder and wires pointer, scroll, resize, reduced-motion changes and WebGL context loss              |
| `world.ts`                 | Acquires the WebGL context (or reports there is none), builds renderer, camera, meshes, materials, cube capture and post chain |
| `frame.ts`                 | The render loop: per-frame updates of the drop, the room, the camera and the readout                                           |
| `story.ts`                 | Pure functions of the scroll fraction: heat, fracture, plaque, wordmark reveal, camera path, studio rotation                   |
| `materials.ts`, `props.ts` | Shader materials; droplets and floating beads                                                                                  |
| `post.ts`                  | HDR post chain and the cube capture for live reflections                                                                       |
| `ripples.ts`               | Touch ripples via an analytic ray/sphere hit                                                                                   |
| `tone.ts`                  | Inverse tone curve so CSS colours land exactly on screen                                                                       |
| `glsl/*`                   | The shaders, unchanged from the original build                                                                                 |

The drop is an `IcosahedronGeometry(1, 48)` with a custom `ShaderMaterial`:

- Vertex shader: displaces each vertex along its normal with low-frequency fbm noise (broad, glassy swells), one extra smooth octave that grows with heat, and up to three decaying sine-wave ripples from touches. It rebuilds the normal from two tangential neighbours so reflections bend with the surface.
- Fragment shader: a true mirror. The view vector is reflected about the world-space normal and looked up in a procedural HDR studio, a GLSL function that returns radiance for any direction. Because the lights are many times brighter than white, highlights bloom. Schlick Fresnel, a warm tint that follows heat and a faint thin-film sheen finish it.

Inter-reflections: a `CubeCamera` at the centre of the drop captures only the droplets and beads, on transparent black, each frame (every other frame on touch devices); the drop composites that over the studio. Droplets and beads intersect their reflection ray with the drop's bounding sphere analytically: one bounce, no extra render.

Post chain: the scene renders into a multisampled half-float target; a soft-knee bright pass and a downsample/upsample pyramid make the bloom; the final pass adds bloom, slight colour fringing, ACES tone-mapping, gamma and fine animated grain. Without float render targets the chain falls back to 8-bit buffers.

The scroll fraction is anchored to the bottom of Reformation, not the whole document, so the epilogue below does not stretch the timeline. The zone label uses the same rule as the analytics beacon (`lib/shared/zones.ts`).

Resizing happens on demand (window resize and a `ResizeObserver`), not every frame. A lost WebGL context stops the loop and shows the fallback; when the browser restores the context, the component remounts the scene with a fresh canvas.

## The backend

| Module                      | Role                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `app/api/*/route.ts`        | Thin route files: export the handlers, refuse other methods with 405, and opt out of caching            |
| `lib/server/handlers.ts`    | The three analytics endpoints: rate limit, body validation, authorization, database call, error mapping |
| `lib/server/http.ts`        | Body reading under the size cap, content-type check, the JSON response and error helpers                |
| `lib/server/visits-repo.ts` | All SQL, parameterised                                                                                  |
| `lib/server/rate-limit.ts`  | Sliding-window limiter with an injectable clock                                                         |
| `lib/server/config.ts`      | The validated configuration; `instrumentation.ts` loads it at server start                              |
| `lib/server/migrate.ts`     | Applies `db/migrations/*.sql` once each                                                                 |
| `lib/server/runtime.ts`     | Production wiring: real config, Neon driver, wall clock, limiters                                       |

The handlers take their dependencies (configuration, database, clock, logger, limiters) as arguments, so the tests run the same code with an in-process Postgres and a controllable clock.

Concurrency: the scroll update uses `GREATEST`, so concurrent or repeated reports converge on the highest zone. The visit insert claims the day's slot in `daily_visit_counts` and inserts the visit in one statement, so the daily cap holds when requests race.

Security headers (content security policy, `nosniff`, frame denial, referrer policy, permissions policy) are set for every response in `next.config.ts`.

See [analytics.md](analytics.md) for the data model and the request and response shapes.

## Provenance

Quicksilver began as a single self-contained HTML file. The Next.js app was a faithful port of it, then moved from a baked matcap to the HDR reflection pipeline above. The original file lives in the git history; it is no longer shipped, so the scene has one implementation.
