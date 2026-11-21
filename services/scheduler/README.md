# Useful Load ⇒ Useful Heat: demonstrator

One scheduler function (`heatsched/scheduler.py: decide`) drives both the yearly balance and a real
running process. No hardware, CPU only.

## Run it (5 minutes)

```
pip install numpy pandas matplotlib            # optional: sentence-transformers (real AI job), psutil (Windows)
python measure.py --seconds 60 --device-watts 30    # must-have 1: measure the real job
python run_year.py --profile <case.csv>             # must-have 3 (or no flag: downloads Open-Meteo Basel 2025)
python demo_live.py --profile <case.csv> --date 2025-01-15 --speed 1
python demo_live.py --profile <case.csv> --date 2025-07-15 --speed 2
python demo_live.py --profile <case.csv> --date 2025-07-15 --force-full-tank-at 10   # the interrupted job
python chat.py                                      # local AI chat with tools (needs Ollama)
python economics.py                                 # charts, tables and sources in docs/economics
```

Outputs land in `out/`: `kpis.json`, `sweep.csv`, `hourly.csv`, `measurements.json`, six plots (PNG + SVG).

`make year` (from the repo root) runs the year on the saved Basel 2025 weather and also writes `out/day_january.csv`
(the coldest January day) and `out/day_july.csv` (15 July), one row per hour, for the animation. `kpis.json` and the
two day CSVs are committed; rerun `make year` after any model change.

## The fleet: many houses, one stream of jobs

`make fleet` runs `heatsched/fleet.py` on 50 synthetic houses in Basel (`config.json: fleet`), each with its own
servers, tank, hot water and size of heating demand, on the real Basel 2025 weather. Every hour each waiting job goes,
least slack first, to the house with the most useful heat room left. It waits while its deadline allows and goes to
an ordinary data centre only when no house can use its heat in time. Each day also runs with every job kept at the
house it was sent to, for comparison.

| Day (1,000 jobs)  | Compute heat used | House heat covered | Moved to a data centre | Kept at its house: moved | Deadline misses |
| ----------------- | ----------------- | ------------------ | ---------------------- | ------------------------ | --------------- |
| 13 January (cold) | 100 %             | 19 %               | 0                      | 1                        | 0               |
| 15 July           | 55 %              | 100 %              | 331                    | 489                      | 0               |

Compute heat used is the share of the jobs' heat that went into a house. House heat covered is the share of the
houses' heat demand that day the jobs met; the rest came from their own heating. In January the job stream is far
smaller than what 50 houses could absorb.

In July the houses can only take what hot water and the tanks absorb, so routing cannot raise the heat used much;
it sends a third fewer jobs off-site by putting each where there is room. Outputs in `out/`: `fleet_sites.csv`,
`fleet_jobs_<day>.csv` (where each job was sent, where it ran, when it moved), `fleet_hourly_<day>.csv` (each house's
heat by the hour), `fleet_placements_<day>.csv` (each job's house, hour by hour) and `fleet_kpis.json`. Every house is made up. Bern needs its own weather file first.

`fleet_write.py --day january --hour 18` puts one hour of a fleet day into the local Supabase (`make dev`): the 50
houses, their servers, their heat for the day and the newest jobs, each on the house it landed on or marked as moved
to a data centre. It reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment
(`services/agent/.env`); `--dry-run` prints what it would write.

## Before you present: three things to replace

1. `config.json → prices.electricity_chf_per_kwh` is a placeholder (Swiss H4 median 2026, 27.7 Rp). Put in IWB Basel H4.
2. Run on the case CSV. The numbers in this folder were produced with `--synthetic` weather and are previews only.
3. Run `measure.py` on your own machine with a stated power figure; install sentence-transformers so the job is real inference.
   Our run, its method and the cited second job type are in `docs/measurements.md` and `docs/job-types.md`.

## How the scheduler decides (every hour)

1. Interactive sessions (local AI chat, game streaming) run now. Heat with nowhere to go is dumped.
2. Deadline batch runs as early as its heat is useful. If it hits its last hour with no heat sink, it is
   moved to another site (config: `move` / `run_and_dump` / `miss`). Moved jobs are reported separately.
3. The opportunistic backlog fills the remaining useful heat room, after keeping tank head-room for
   interactive heat that the forecast says is coming.
4. A server whose heat is not needed is off.

## Assumptions (all in `config.json`, each with a `source`)

- Reference house, tank, hot water, server power, 80% recovery, heat value = price ÷ 2.5: case brief.
- Hot water drawn evenly over the day (ours; replaced by the case CSV).
- A paused server draws 0 kW (ours; real idle power would raise cost).
- Tank has no losses and no temperature levels (brief).
- Job arrivals per house and day: 4 server-hours interactive (18:00 to 22:00), 8 server-hours batch due in 24 h (ours).
- **Unlimited backlog of deadline-free work.** The utilisation figure depends on it.
- Forecast: persistence (tomorrow's demand = last 24 h). `"forecast": "perfect"` gives the upper bound.
- Scaling laptop → 1 kW server: equal energy per item (equal performance per watt).
- Servers per house: add servers while the last one added still runs ≥ 40% of the year (`sim.recommend`).
- Compute price of 0.50 CHF per server-hour is illustrative; only the break-even is a result.

## When the model does not pay off

- Break-even is 0.68 × electricity price when all heat is used and 1.00 × when it is dumped. Below that
  computing price, every server-hour loses money.
- Hardware cost is outside the brief's formula. At roughly 55 to 60% utilisation, hardware that needs
  more than that to amortise does not pay off, whatever the heat is worth.
- Without a steady backlog of interruptible work, utilisation falls toward the deadline jobs only.
- Each server beyond the recommended count adds coverage but runs under 40% of the year.
