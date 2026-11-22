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

1. [ ] Nothing else on ports 5173 to 5177: `ss -ltnp | grep 517`. One old Vite on any of them
       stops `make dev` and all five apps with it.
2. [ ] Start the database, then the keys, then the apps:

   ```sh
   pnpm exec supabase start
   make db-reset                    # back to the seed: Server 4 paused, no test jobs
   pnpm exec supabase status -o env # API_URL, ANON_KEY, SERVICE_ROLE_KEY into the four .env files
   make dev
   ```

   `permission denied ... docker.sock`: run `newgrp docker` in that terminal first. The reset
   also ends every sign-in, so sign in to the tabs after it.

3. [ ] A second terminal, from the repo root, ready but not started:

   ```sh
   make live-demo LIVE_PACE=1.2
   ```

   It starts a real embedding job on Server 4, the agent, and the scheduler's live loop on 13
   January then 15 July, about 29 s a day (the default `LIVE_PACE` of 2.5 is a minute a day).
   The scheduler writes the agent's signal; no one types `pause`. Dry run on 22 Nov: the pill
   followed each decision in under a second. It ends by itself after July and stops the job and
   the agent with it; Ctrl-C does the same at any time.

4. [ ] Once now, as a rehearsal: run it, watch Server 4 pause and resume in July, then
       `make verify-live` (no mismatch) and `make db-reset`, which puts Server 4 back. Sign in to
       the tabs again after the reset.
5. [ ] Only if you show the chat: ask one question now, so the model is loaded. Warm, the four
       example questions took 5 to 16 s each on the GPU.

## Tabs, in this order

1. Slides (PDF, full screen).
2. Host app, http://localhost:5173, signed in as `host@kachel.test` / `kachel-demo`, scrolled to
   "Your servers now" and "Why this decision". Server 4 shows Paused (the seed).
3. Console, http://localhost:5174, signed in as `buyer@kachel.test` / `kachel-demo`. A Batch
   job needs a deadline; Backlog does not.
4. Pitch intro, http://localhost:5176 (`?at=fhnw` for FHNW Campus Dreispitz). Press the
   presentation button in the prompt: the scripted line plays (no microphone), then the map
   opens at the building with its card. With no Mapbox token there is no globe; that is
   expected. With one, the globe lands on the building: `a` for the house and its questions,
   Esc to come back, `m` for the map. The map alone:
   http://localhost:5175/?egid=442141&card=1 (FHNW: `?egid=243058419&card=1`).
5. Map, http://localhost:5175. Click Basel, then a building, for its energy card. **Tour** (top
   centre) stops at FHNW Campus Dreispitz, where we are: newer than swisstopo's 3D data, so an
   orange pin stands on its site.
6. Operator console, http://localhost:5177: Today names the homes that need you. Under Jobs,
   sign in as `operator@kachel.test` / `kachel-demo` for the buyers, live. Under Billing, click
   July, then slide the temperature up: the settlement and the year's revenue fall.
7. The two films, open in the video player.

If a tab is blank, reload it once.

## Needs internet

The map does: swisstopo 3D buildings and imagery, OpenStreetMap tiles, the geo.admin API behind
the building card, and Overpass where the card reads rooftop solar from OSM. The host app, the
console, the agent and the chat run offline. With no network, skip the map.

## When something fails

| What you see                         | Do this                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------- |
| "Is the local database running?"     | `.env` keys against `pnpm exec supabase status -o env`, restart `make dev`  |
| Server 4 shows Done or Off           | The job ended: `make live-demo LIVE_PACE=1.2` again                         |
| The pill does not move               | Is the loop printing hours? The agent's log is `/tmp/kachel-live/agent.log` |
| "Why this decision" stays empty      | `services/agent/.env` keys against `pnpm exec supabase status -o env`       |
| The chat says the model is off       | `ollama serve`; leave the chat out                                          |
| Anything else in the 60 s live block | Play live-demo.mp4 and say the same lines                                   |
| The whole laptop                     | Play kachel-film-2min.mp4 from a USB stick on any laptop                    |

## Afterwards

`make live-demo` stops its job and agent when it ends or on Ctrl-C, resuming the job first so
nothing is left frozen. `make verify-live` replays the day's decisions. `make db-stop` stops
the database.
