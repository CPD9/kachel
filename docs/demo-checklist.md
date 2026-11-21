# Demo checklist, Sunday morning

One page for the demo laptop. The talk track is in [pitch.md](pitch.md); the full setup is in
[Run it yourself](wiki/Run-it-yourself.md). Dry run from a fresh clone on 21 Nov, warm caches:
clone 3 s, `make bootstrap` 3 s, the apps up in under a second.

## The night before (needs internet)

- [ ] `git pull` on main, then `make bootstrap`.
- [ ] Download the fallback films to the desktop and play each once:
      [live-demo.mp4](https://github.com/CPD9/kachel/releases/download/media-v1/live-demo.mp4)
      (30 s) and
      [kachel-film-2min.mp4](https://github.com/CPD9/kachel/releases/download/media-v1/kachel-film-2min.mp4)
      (2 min; the
      [720p copy](https://github.com/CPD9/kachel/releases/download/media-v1/kachel-film-2min-720p.mp4)
      if the laptop stutters).
- [ ] `ollama list` shows `qwen3:4b` (only if you show the chat).

## 30 minutes before

1. [ ] Nothing else on ports 5173, 5174 or 5175: `ss -ltnp | grep 517`. One old Vite on any of
       them stops `make dev` and all three apps with it.
2. [ ] Start the database, then the keys, then the apps:

   ```sh
   pnpm exec supabase start
   make db-reset                    # back to the seed: Server 4 paused, no test jobs
   pnpm exec supabase status -o env # API_URL, ANON_KEY, SERVICE_ROLE_KEY into the three .env files
   make dev
   ```

   `permission denied ... docker.sock`: run `newgrp docker` in that terminal first.

3. [ ] A second terminal, from the repo root: a fresh job that runs for hours, and the agent.

   ```sh
   rm -f /tmp/job_progress.json
   JOB_ITEMS=100000000 services/scheduler/.venv/bin/python services/scheduler/jobs/embed_job.py /tmp/job_progress.json &
   JOB=$!
   echo run > /tmp/heat
   set -a; . services/agent/.env; set +a
   uv run --project services/agent python -m kachel_agent --pid $JOB --signal /tmp/heat --tick 0.2 \
     --job-id 00000000-0000-4000-8000-000000000304 \
     --server-id 00000000-0000-4000-8000-000000000204
   ```

   Without `JOB_ITEMS` the job ends after about 30 s and Server 4 shows Done. Without the `rm` an
   old progress file makes it end at once.

4. [ ] A third terminal, ready for the flip: `echo pause > /tmp/heat` and `echo run > /tmp/heat`.
       In the dry run the pill changed in about 0.3 s.
5. [ ] Only if you show the chat: ask one question now, so the model is loaded. Warm, the four
       example questions took 5 to 16 s each on the GPU.

## Tabs, in this order

1. Slides (PDF, full screen).
2. Host app, http://localhost:5173, signed in as `host@kachel.test` / `kachel-demo`. Server 4
   shows Running.
3. Console, http://localhost:5174, signed in as `buyer@kachel.test` / `kachel-demo`. A Batch
   job needs a deadline; Backlog does not.
4. Map, http://localhost:5175. Click Basel, then a building, for its energy card.
5. The two films, open in the video player.

If a tab is blank, reload it once.

## Needs internet

The map does: swisstopo 3D buildings and imagery, OpenStreetMap tiles, the geo.admin API behind
the building card, and Overpass where the card reads rooftop solar from OSM. The host app, the
console, the agent and the chat run offline. With no network, skip the map.

## When something fails

| What you see                         | Do this                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------- |
| "Is the local database running?"     | `.env` keys against `pnpm exec supabase status -o env`, restart `make dev` |
| Server 4 shows Done or Off           | The job ended: step 3 again                                                |
| The pill does not move               | Is the agent running? Its terminal prints `signal pause -> PAUSED`         |
| The chat says the model is off       | `ollama serve`; leave the chat out                                         |
| Anything else in the 60 s live block | Play live-demo.mp4 and say the same lines                                  |
| The whole laptop                     | Play kachel-film-2min.mp4 from a USB stick on any laptop                   |

## Afterwards

Stop the agent (Ctrl-C), then the job: `kill -CONT $JOB; kill $JOB`. A job left paused stays
stopped. `make db-stop` stops the database.
