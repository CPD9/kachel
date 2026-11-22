"""The live scheduler loop: the same decide() as the yearly balance, driving the house for real.

  set -a; . ../agent/.env; set +a             # SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
  python live.py --agent 00000000-0000-4000-8000-000000000304=/tmp/heat
      # replay 13 January and 15 July on the saved Basel weather, 2.5 s an hour (about 60 s a day)
  python live.py --day 2025-07-15 --seconds-per-hour 1
  python live.py --source db --tick 3600      # real time: heat_state for the clock's hour, hourly

Every tick it reads the house's servers and jobs and the queued jobs from Supabase, decides,
appends the decision to the hash-chained log (out/decisions.jsonl and the decisions table), and
carries it out: the agent's signal file for a job with a real process, the job and server rows
for every other job, and a server for each queued job it places. `make verify-live` replays the
log. The service role key is read here only, from the environment. Local stack only.
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime

from heatsched import profile as P
from heatsched.ledger import Ledger
from heatsched.live_db import Supabase
from heatsched.live_loop import DbHeat, Loop, ReplayHeat, write_signal

REFERENCE_HOUSE = "00000000-0000-4000-8000-000000000100"   # supabase/seed.sql
DAYS = ["2025-01-13", "2025-07-15"]                          # the January and July days of make year


def agent(text):
    job, sep, path = text.partition("=")
    if not sep or not job or not path:
        raise argparse.ArgumentTypeError("use JOB_ID=SIGNAL_FILE")
    return job, path


ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("--site", default=REFERENCE_HOUSE, help="the house (sites.id); default the seed's reference house")
ap.add_argument("--source", choices=["replay", "db"], default="replay",
                help="replay: stored days on the saved weather; db: heat_state for the clock's hour")
ap.add_argument("--day", action="append", metavar="YYYY-MM-DD", help=f"replay days (default {' '.join(DAYS)})")
ap.add_argument("--seconds-per-hour", type=float, default=2.5, help="replay pace (default 2.5: a day in 60 s)")
ap.add_argument("--weather", default="tests/data/weather_basel_2025.csv")
ap.add_argument("--config", default="config.json")
ap.add_argument("--tick", type=float, default=3600, help="db source: seconds between ticks (default 3600)")
ap.add_argument("--once", action="store_true", help="db source: one tick, then stop")
ap.add_argument("--agent", type=agent, action="append", default=[], metavar="JOB_ID=SIGNAL_FILE",
                help="a job with a real process: its agent follows this signal file (repeatable)")
ap.add_argument("--log", default="out/decisions.jsonl", help="the decision log (carried on if it exists)")
a = ap.parse_args()

url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if not url or not key:
    sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (services/agent/.env).")

store = Supabase(url, key)
agents = dict(a.agent)
ledger = Ledger(a.log)
house = store.house(a.site)
if house is None:
    sys.exit(f"No site {a.site} in the database: run make db-reset.")
print(f"{house['name']}: {len(house['servers'])} servers, tank {house['tank_kwh']} kWh | "
      f"log {a.log} from entry {ledger.seq} | agents {', '.join(agents) or 'none'}", flush=True)
loop = Loop(store, a.site, ledger, agents, say=lambda s: print(s, flush=True))

try:
    if a.source == "replay":
        cfg = json.load(open(a.config))
        heat = ReplayHeat(P.build_profile(P.load_weather(a.weather), cfg), cfg, len(house["servers"]))
        for day in a.day or DAYS:
            hours = heat.day(day)
            print(f"\n{day}: the tank starts at {heat.soc:.1f} kWh (the yearly model that morning)", flush=True)
            for t in hours:
                started = time.monotonic()
                now = heat.at(t)
                entry = loop.tick(now)
                heat.after(now, len(entry["run"]), entry["inputs"]["heat_per_server"], entry["inputs"]["tank_kwh"])
                time.sleep(max(0.0, a.seconds_per_hour - (time.monotonic() - started)))
    else:
        loop.hours_per_tick = a.tick / 3600
        source = DbHeat(store, a.site)
        while True:
            started = time.monotonic()
            now = source.at(datetime.now().astimezone())
            if now is None:
                print(f"{datetime.now():%Y-%m-%d %H:%M}: no heat_state row for this hour yet; waiting", flush=True)
            else:
                loop.tick(now)
            if a.once:
                break
            time.sleep(max(0.0, a.tick - (time.monotonic() - started)))
except KeyboardInterrupt:
    pass
finally:
    # Leave every real job running, as it was before the loop took over.
    for path in agents.values():
        write_signal(path, True, "live loop stopped\n")
    print(f"\n{ledger.seq} entries in {a.log}; check them with make verify-live", flush=True)
