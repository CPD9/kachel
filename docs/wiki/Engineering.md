# Engineering

How the code is laid out, what it is built with, how it is checked, and how we work together.
The rules in full are in
[CONTRIBUTING.md](https://github.com/CPD9/kachel/blob/main/CONTRIBUTING.md).

## Repo map

| Path                 | What it is                                                                           |
| -------------------- | ------------------------------------------------------------------------------------ |
| `apps/host`          | React app for hosts: their house, their heat, their servers                          |
| `apps/console`       | React app for compute buyers: submit jobs, follow their state                        |
| `apps/map`           | 3D map of Basel: buildings, heat, day and night                                      |
| `apps/operator`      | The business view: every fleet house, its servers and heat, the revenue              |
| `packages/ui`        | Shared components (sign-in, state pill, sourced number, heat loop) and design tokens |
| `packages/db`        | Typed Supabase client, the live feeds and the generated types                        |
| `packages/economics` | The yearly result for each building and tariff, for the apps                         |
| `packages/config`    | Shared ESLint and TypeScript settings                                                |
| `services/agent`     | Python agent on the server box: pauses and resumes the real job                      |
| `services/scheduler` | Python scheduler: hourly decisions, yearly balance, fleet, economics                 |
| `supabase`           | Local Supabase config, migrations, synthetic seed and RLS tests                      |
| `scripts`            | Repository checks, screenshots, and the Blender scripts for the films                |
| `docs`               | Architecture, assumptions, economics, measurements, media, pitch, this wiki          |

## Stack

- **Apps:** TypeScript 6, React 19, Vite 8, Tailwind CSS 4, in a pnpm workspace run by
  Turborepo. The map draws with CesiumJS 1.147, with no Cesium ion and no keys.
- **Data:** Supabase (Postgres, Auth, Realtime), run locally in Docker. Schema in SQL migrations;
  types generated from it with `pnpm db:types`.
- **Python:** 3.12 with uv. The scheduler uses numpy, pandas and matplotlib; the agent uses
  httpx to write to Supabase's REST API.
- **Films and renders:** Blender 5.2 and ffmpeg, scripted in `scripts/heat-loop` and
  `scripts/video`.

## Design choices worth knowing

- **One decision function.** `decide` in `heatsched/scheduler.py` is pure: a signal goes in, a
  decision comes out. The yearly balance, the live demo and the fleet all call it, so they cannot
  drift apart.
- **Numbers are generated, never typed.** `docs/assumptions.md` is written from
  `services/scheduler/config.json` by `node scripts/assumptions.mjs`; the README figures from
  `kpis.json` by `scripts/readme-figures.mjs`; `packages/economics` from `economics.py`. CI fails
  if any of them is out of date.
- **Every input carries its source.** Each block of `config.json` has a `source` note, the
  assumptions page gives one per value, and the host app shows a number's source on hover.
- **The agent addresses a process by PID only,** and a failed write to Supabase is logged while
  the loop carries on: the heat signal matters more than the screen.
- **Row level security on every table.** Hosts read their own house, its servers, the jobs on
  them and its heat. Buyers read and submit their own jobs, and see the house and server each
  one ran on. A buyer can only insert a job as Queued, with no house, server or progress. The
  model's assumptions and measurements are public.

## Checks

`make check` runs everything CI runs, except the Docker-only steps.

| CI job   | What it runs                                                                                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apps     | `pnpm format:check` (Prettier, Markdown included), then lint, typecheck, Vitest and build for every package                                                                       |
| Python   | ruff format, ruff check and pytest for the agent and the scheduler                                                                                                                |
| README   | The script tests, no promise words in the README, README figures match `kpis.json`, assumptions match `config.json`                                                               |
| Database | Supabase in Docker: migrations and seed apply, `db lint`, the pgTAP tests, types match the schema, Realtime reaches a client within two seconds, the fleet writer fits the schema |
| Secrets  | gitleaks over the whole history                                                                                                                                                   |

The workflow is [`.github/workflows/ci.yml`](https://github.com/CPD9/kachel/blob/main/.github/workflows/ci.yml).
Every action is pinned to a commit SHA. A second workflow, `wiki.yml`, copies `docs/wiki` to
this wiki on every push to `main` that changes it.

### Tests

- **Row level security:** 45 pgTAP tests in
  [`supabase/tests/rls.test.sql`](https://github.com/CPD9/kachel/blob/main/supabase/tests/rls.test.sql),
  the allow and the deny of each policy, with a second host and buyer to prove one cannot see the
  other. Run with `make check-db`.
- **Python:** pytest for the scheduler's decisions, the yearly balance, the Basel profile, solar,
  buildings, the fleet and the fleet writer, and for the agent's process control, loop and
  reporting.
- **TypeScript:** Vitest with Testing Library for each app and package, including the live feeds
  and the job form's checks.
- **Pre-commit:** husky and lint-staged run Prettier, ESLint and ruff on the files you change.

## How we work

Pull requests are how we talk about a change.

1. **An issue first.** Every pull request closes one (`Closes #N`), and the issue sits on the
   team's project board.
2. **Small, signed commits.** `git commit -S -s`, a plain English instruction in sentence case
   under 72 characters, British spelling, no prefixes.
3. **About 100 words**, under **What**, **Why** and **Checked**, plus a "For the team:" line
   saying what changed for them and how to try it.
4. **Review.** Every pull request gets at least one comment on a changed line. The author replies
   "Done in abc1234: …" and resolves the thread.
5. **Green only.** Merge with "Squash and merge" when every check is green on the latest commit
   and no conversation is open. To update a branch, merge `main` into it; never force-push
   `main` or someone else's branch.

## Security

- Report a vulnerability privately through the Security tab, or by a direct message to
  [@CPD9](https://github.com/CPD9). Please do not open a public issue for it
  ([SECURITY.md](https://github.com/CPD9/kachel/blob/main/SECURITY.md)).
- Secrets live in local `.env` files that git ignores. Each app and service has an `.env.example`
  saying what it reads.
- The service role key is read only by `services/agent` (and `fleet_write.py`) from the
  environment. It never goes into an app bundle. The apps use the anon key, and row level
  security decides what each person sees.
- gitleaks scans every push and pull request.
