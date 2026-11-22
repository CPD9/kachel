# Deploy on Vercel

Three apps go online as three Vercel projects, all imported from this repository. Each is a
static Vite build. The map also has one small function for electricity tariffs.

| Project  | Root Directory  | Environment variables                                               |
| -------- | --------------- | ------------------------------------------------------------------- |
| map      | `apps/map`      | `ENABLE_EXPERIMENTAL_COREPACK`                                      |
| pitch    | `apps/pitch`    | `ENABLE_EXPERIMENTAL_COREPACK`, `VITE_MAPBOX_TOKEN`, `VITE_MAP_URL` |
| operator | `apps/operator` | `ENABLE_EXPERIMENTAL_COREPACK`                                      |

For every project:

- Framework Preset: Vite. Build and output settings stay at their defaults (`vite build`, `dist`).
- Node.js Version: 22.x.
- `ENABLE_EXPERIMENTAL_COREPACK` set to `1`, so Vercel installs with the pnpm version in the root
  `package.json`.
- Leave "Include files outside the root directory" on: the apps use the workspace packages in
  `packages/`, which Vite builds from source.

Each app has a `vercel.json` that sends every page address to `index.html`, so links with query
strings like `?egid=`, `?tour=1` and `?at=fhnw` load, and caches the hashed files in `assets/`
for a year.

## Map

CesiumJS's workers, assets and widgets, and three.js's Draco decoder, are copied into the build
by `vite.config.ts`. ElCom's tariff API refuses calls from other sites, so in dev the Vite server
passes them on (`/elcom`) and on Vercel the function `api/elcom.ts` does. It takes a municipality
number only (`/api/elcom?bfs=2701`), always sends the same fixed query, and lets the answer be
cached for a day. If ElCom does not answer, the card shows the saved tariff or the Swiss median.

## Pitch

`VITE_MAP_URL` is the map project's production address. The intro hands over to it at the demo
building. Without it, a deployed pitch says the map is not linked instead of opening localhost.

`VITE_MAPBOX_TOKEN` is a Mapbox public token (`pk.`). It ends up in the browser bundle, so restrict
it to the pitch's address in the Mapbox account (URL restrictions), plus `http://localhost:5176`
for dev. Preview deployments get other addresses: without a token that works there, the intro
skips the globe and goes straight to the map.

Both are build-time values: redeploy after changing them.

## Operator

Without Supabase the operator view shows the model's figures for the whole fleet, and the live
buyers panel says live data needs the local stack. No Supabase values are set on Vercel.

## What stays local

The host app with its local model chat, the console, the agent and the scheduler, and the
Supabase stack run on the demo machine only (`make dev`, see [Run it yourself](wiki/Run-it-yourself.md)).
