# Quicksilver

Quicksilver is an interactive liquid-metal experience: a chrome drop that ripples where you touch it and, as you scroll, melts, fractures into orbiting droplets and reforms into a mirror-bright plaque that speaks its name. Then a quiet epilogue breaks the fourth wall and explains why real mercury, thawing out of the Arctic permafrost, does not come back together.

Live: [quicksilver-orpin.vercel.app](https://quicksilver-orpin.vercel.app/)

![The solid-state drop at the top of the page](media/screenshot-01-hero-solid-state.png)

Demo video: [watch the walkthrough](media/quicksilver-demo.mp4)

## Features

- Touch-reactive liquid chrome. Ripples spread from wherever you disturb the metal: continuously as the pointer moves on desktop, and on tap on phones. Each ripple decays over about 2.2 seconds.
- Mirror-finish mercury. The metal reflects a procedural photo studio (softboxes, strip lights, a horizon seam, coloured gels), and the drop and its droplets reflect each other.
- A cinematic finish: linear HDR rendering, multisampling, soft bloom, ACES tone-mapping, a trace of lens fringing and fine film grain.
- A scroll-driven story in five acts (Solid State, Molten, Fracture, Reformation, Epilogue), eased rather than cut. The surface-tension readout is the same value that drives the shader.
- A cited epilogue in daylight, with numbered sources.
- Works without WebGL: a static drop stands in and every word stays readable. If the GPU context is lost, the page falls back the same way and restarts the scene when the context returns.
- Accessible: keyboard operable, visible focus, tap targets of at least the platform minimum, text contrast checked against the worst case behind it, and reduced-motion support that applies live.
- Passive, private analytics: how far visitors scroll, stored in Postgres. No cookies, no local storage, no personal data. Off entirely when no database is configured.

## How it works

The page is prerendered. Its copy is plain server-rendered markup, so it is in the first HTML response. Two client components sit on top:

- The scene (`components/MercuryScene.tsx`, code in `lib/scene/`) draws a subdivided icosahedron of 48,020 triangles with a custom shader. A vertex shader swells the surface with low-frequency noise and decaying touch ripples; a fragment shader shades it as a true mirror of an analytic HDR studio. One number, the scroll position through the four fiction acts, drives every change in the drop through pure functions in `lib/scene/story.ts`.
- The analytics beacon (`components/Analytics.tsx`, `lib/client/analytics.ts`) records the visit and reports the furthest act reached, only when it increases. The zone rule is shared with the on-screen zone label, so the two always agree.

The epilogue's daylight veil runs on its own scroll maths (`lib/client/epilogue.ts`) and does not need WebGL.

## Architecture

```
Browser
  prerendered page (copy, metadata)       app/page.tsx, components/*
  scene: Three.js + GLSL                   lib/scene/*
  analytics beacon                         lib/client/analytics.ts
        |  same-origin fetch
Serverless functions (Node runtime)        app/api/*/route.ts
  validation, rate limits, auth, errors    lib/server/handlers.ts, lib/server/http.ts
  SQL                                      lib/server/visits-repo.ts
        |  Neon serverless driver
Postgres (Neon)                            db/migrations/*.sql
```

- Shared contracts: every request and response shape is a zod schema in `lib/shared/schemas.ts`, used by the server to validate and by the client to parse. Error codes live in `lib/shared/errors.ts`, limits in `lib/shared/limits.ts`.
- Configuration is read and validated in one place, `lib/server/config.ts`, and the server refuses to start when a variable is invalid.
- Every API error has the same shape: `{ "error": { "code": "...", "message": "..." } }`.

Details: [docs/architecture.md](docs/architecture.md) (rendering and structure) and [docs/analytics.md](docs/analytics.md) (data model and endpoints).

## Setup from a clean clone

Requires Node.js 22 (the exact version is pinned in `.nvmrc`: 22.23.4).

```bash
git clone https://github.com/SurabhiD2008/Quicksilver.git
cd Quicksilver
npm ci
npx playwright install chromium
npm run dev
```

The site runs with no configuration at all; analytics stays off until a database is configured. To turn it on, copy `.env.example` to `.env.local`, set `POSTGRES_URL`, then create the tables:

```bash
npm run db:migrate
```

## Environment variables

All optional. The configuration schema, `.env.example` and this table list the same variables; `verify` checks that they match.

| Variable       | Purpose                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_URL` | Postgres connection string. Enables the analytics routes. Injected by the Vercel Postgres (Neon) integration. |
| `STATS_TOKEN`  | Bearer token for the stats route, at least 32 characters. Unset means the route refuses everyone.             |
| `SITE_URL`     | Public address used for canonical and social links. Defaults to the production deployment.                    |

`NODE_ENV` and `NEXT_RUNTIME` are set by Next.js itself.

## Commands

| Command                 | What it does                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run dev`           | Development server                                                                                              |
| `npm run build`         | Production build                                                                                                |
| `npm start`             | Serve the production build                                                                                      |
| `npm run lint`          | ESLint, zero warnings allowed                                                                                   |
| `npm run format`        | Format with Prettier                                                                                            |
| `npm run format:check`  | Check formatting                                                                                                |
| `npm run typecheck`     | Strict TypeScript check                                                                                         |
| `npm test`              | Unit and API tests                                                                                              |
| `npm run test:coverage` | Tests with coverage                                                                                             |
| `npm run e2e`           | Browser tests (needs a build)                                                                                   |
| `npm run verify`        | Every check below, one line each                                                                                |
| `npm run verify:final`  | Verify, plus three shuffled test runs and a fresh-clone run                                                     |
| `npm run smoke`         | Smoke-check a running instance: `npm run smoke -- <url>`                                                        |
| `npm run screenshots`   | Capture review screenshots of the production build (into the git-ignored test results; `media/` is not touched) |
| `npm run db:migrate`    | Apply pending database migrations                                                                               |
| `npm run mutation`      | Mutation proof: remove a rule, watch its test fail, restore it                                                  |

## Tests and verification

- Unit and API tests (Vitest) need no running app, no network and no keys. API tests run the real SQL against an in-process Postgres (PGlite) inside a throwaway schema. They cover the zone state matrix, the stats authorization matrix, rate limits and the daily cap at their time boundaries, concurrent requests, database failure, configuration errors, and an edge-case table for every input field. Property tests (fast-check) cover the zone and story maths.
- Browser tests (Playwright with axe) run against the production build at 320, 390, 768, 1024, 1360 px. A shared guard fails any test on a console error, a failed request, horizontal overflow, clipped text, a small tap target, an accessibility violation, layout shift or lost focus; the guard has its own self-tests. Separate tests cover keyboard-only use, reduced motion and a browser without WebGL.
- `npm run verify` runs formatting and lint, types, tests with coverage, the build, the browser suite, a secret scan of the tree, the build output and git history, a dependency audit, a scan for forbidden patterns, this README's consistency with the code, and the initial JavaScript budget of 250 KB gzipped. It writes its summary table to a git-ignored report file.

## Deployment

Vercel, from this repository. Add the Postgres (Neon) integration to provide `POSTGRES_URL`, set `STATS_TOKEN` if you want the stats route, and run `npm run db:migrate` once against the database. Then check the live site:

```bash
npm run smoke -- https://quicksilver-orpin.vercel.app
```

Because the page is prerendered, whether analytics is on is decided at build time: redeploy after adding or removing the database.

## Limitations

- Rate limits are kept in each serverless instance's memory, so they reset when an instance restarts and are not shared between instances. Budgets: 6 visits per 10 minutes and 60 scroll reports per 10 minutes per address; 5 failed attempts per 15 minutes locks an address out of the stats route. The daily cap of 5,000 visits per UTC day is enforced in the database and is global.
- Per-address limits trust the proxy's `x-forwarded-for` header. On Vercel the platform sets it; behind another host it could be forged, which only weakens those limits.
- Request bodies are capped at 2 KB.
- The content security policy allows inline scripts, because a prerendered page cannot carry per-request nonces. The page renders no user content.
- Three.js 0.128.0 is pinned: the shaders and render targets are tuned against it.
- The custom cursor and hover ripples are desktop-only by design; phones get tap ripples.
- Safari on iOS ignores fixed background attachment, so a faint seam can show at the top of the epilogue there once the daylight is complete.
- The stats route is the only private endpoint; without the token it answers with HTTP 401 to everyone.

## Project structure

```
app/
  layout.tsx, page.tsx      metadata, fonts, the page
  styles/                   design tokens and styles, one file per area
  api/                      visit, scroll, stats, health, JSON 404 for unknown paths
components/                 scene shell, error boundary, analytics, story sections, epilogue
lib/
  shared/                   schemas, error codes, limits, zone rule (client and server)
  server/                   config, handlers, HTTP helpers, rate limiter, SQL, migrations, logger
  client/                   analytics beacon, epilogue reveal
  scene/                    Three.js world, post chain, props, ripples, story maths, shaders
db/migrations/              versioned schema
scripts/                    verify kit, smoke, screenshots, migrate, mutation proof
tests/                      unit and API tests
e2e/                        browser tests and the guard
media/                      screenshots and the demo video
docs/                       architecture and analytics notes
```

MIT licence, Copyright (c) 2026 Surabhi Datta. See [LICENSE](LICENSE).
