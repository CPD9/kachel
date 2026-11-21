# Run it yourself

Everything runs on one laptop: the database in Docker, the three apps in the browser, the
scheduler and the agent in Python. No cloud account is needed.

## What you need

- Node 22.12 or newer (the repo pins 22.23.5 in `.nvmrc`) and pnpm 11
- [uv](https://docs.astral.sh/uv/) for Python 3.12
- Docker, for the local Supabase stack
- Linux or macOS for the agent, which pauses a process with `SIGSTOP`
- For the chat in the host app (optional): [Ollama](https://ollama.com) running, with `qwen3:4b`
  pulled
- Internet for the 3D map: its buildings, imagery and building cards come from swisstopo,
  geo.admin and OpenStreetMap

## The commands

```sh
make bootstrap                    # install the JavaScript and Python dependencies
pnpm exec supabase start          # start local Supabase in Docker
pnpm exec supabase status -o env  # the keys for the .env files (below)
make dev                          # Supabase (already up), then all four apps
make check                        # every check CI runs
```

`make dev` serves:

| App         | Address               |
| ----------- | --------------------- |
| Host app    | http://localhost:5173 |
| Console     | http://localhost:5174 |
| 3D heat map | http://localhost:5175 |
| Operator    | http://localhost:5177 |

Before `make dev`, copy each `.env.example` to `.env` (in `apps/host`, `apps/console` and
`services/agent`) and fill in the keys from `pnpm exec supabase status -o env`. The apps read
`.env` when they start, so restart `make dev` after changing it.

The apps take the URL and the anon (publishable) key. Only the agent takes the service role key:
anything in a `VITE_` variable ends up in the browser, so that key never goes there.

## The local database

| Command         | What it does                                                             |
| --------------- | ------------------------------------------------------------------------ |
| `make dev`      | Starts Supabase in Docker from `supabase/config.toml`                    |
| `make db-reset` | Rebuilds the database from `supabase/migrations` and `supabase/seed.sql` |
| `make db-stop`  | Stops the stack                                                          |
| `make check-db` | Runs the row level security tests on the running stack                   |
| `pnpm db:types` | Regenerates `packages/db/src/database.types.ts` from the schema          |

## Demo accounts (local stack only)

The seed makes two accounts. Both exist only in your local database.

| Who        | Email               | Password      | Sign in to |
| ---------- | ------------------- | ------------- | ---------- |
| Demo host  | `host@kachel.test`  | `kachel-demo` | Host app   |
| Demo buyer | `buyer@kachel.test` | `kachel-demo` | Console    |

The apps offer these accounts on the sign-in screen only when they talk to a local stack.

## The model

From the repo root:

| Command      | What it writes                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `make year`  | The yearly balance on saved Basel 2025 weather: `out/kpis.json`, the January and July day files |
| `make fleet` | The fleets in Basel, Bern and both: `out/fleet_*.csv` and `out/fleet_*kpis.json`                |

The economics charts and tables come from `services/scheduler/economics.py`.

To put one hour of a fleet day into the local database, so the console shows jobs on fleet
houses:

```sh
cd services/scheduler
set -a; . ../agent/.env; set +a
uv run python fleet_write.py --day january --hour 18   # --dry-run prints instead
```

## The live demo: pause a real job

The stage version, with the order and the fallbacks, is the
[demo checklist](https://github.com/CPD9/kachel/blob/main/docs/demo-checklist.md).

This is the moment from the pitch: a real job on Server 4 pauses and resumes, and the host app
follows within a second.

1. Run `make dev` and sign in to the host app as the demo host.
2. From the repo root, start the real embedding job and note its process id:

   ```sh
   rm -f /tmp/job_progress.json
   JOB_ITEMS=100000000 services/scheduler/.venv/bin/python services/scheduler/jobs/embed_job.py /tmp/job_progress.json &
   echo $!
   ```

   The scheduler's own Python (from `make bootstrap`) runs it directly, so `$!` is the job
   itself and not a wrapper. The default 200,000 items finish in about 30 s, so `JOB_ITEMS`
   keeps it going for hours. The job resumes from its progress file, so remove an old one first
   or it ends at once.

3. Tell the agent to follow it as Server 4's job from the seed:

   ```sh
   echo run > /tmp/heat
   set -a; . services/agent/.env; set +a
   uv run --project services/agent python -m kachel_agent --pid <pid> --signal /tmp/heat \
     --tick 0.2 \
     --job-id 00000000-0000-4000-8000-000000000304 \
     --server-id 00000000-0000-4000-8000-000000000204
   ```

4. "The tank is full": `echo pause > /tmp/heat`. The agent stops the process, writes to
   Supabase, and Server 4's pill turns Paused.
5. "The house wants heat again": `echo run > /tmp/heat`. The pill turns Running, and the job
   carries on where it stopped.

If the stack is not up, the same moment is recorded in
[live-demo.mp4](https://github.com/CPD9/kachel/releases/download/media-v1/live-demo.mp4).

## Screenshots and films

- `pnpm screenshots` retakes the two app screenshots with headless Chromium, with both apps
  running.
- `make heat-loop`, `make video-setup`, `make video-scheduler`, `make video-daynight` and
  `make video-charts` render the animations and films with Blender 5.2 and ffmpeg. They need a
  GPU and take a while.

## When something goes wrong

- **`make dev` stops all four apps with "Port 5175 is already in use":** each app needs its
  port free. Stop the old server on 5173, 5174, 5175 or 5177 (`ss -ltnp | grep 517`) and run it again.
- **`permission denied ... docker.sock`:** your user is not in the `docker` group in this shell;
  run `newgrp docker` first.
- **Server 4 shows Done:** the job ended and the agent with it. Start both again (step 2 above);
  `make db-reset` puts the seed back.
- **"Is the local database running?"** in an app: run `make dev`, and check the `.env` keys
  against `pnpm exec supabase status -o env`.
- **`make check-db` says skipped:** the local stack is not running. CI always runs these tests.
- **The house says "Replay":** the scheduler has not written today's hours. The house shows a
  stored day at your clock's hour; the server list is still live.
