"""Write one hour of a `make fleet` day into the local Supabase, so the console shows which
house each job landed on (#81).

  set -a; . ../agent/.env; set +a          # SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
  python fleet_write.py --day january --hour 18
  python fleet_write.py --day july --hour 20 --dry-run   # print what it would write, send nothing

It upserts the 50 synthetic fleet houses (owned by the seed's fleet@kachel.test), their servers
(RUNNING where a job runs this hour), every house's heat for the day, and the newest jobs that
arrived by this hour for the seed buyer. Fleet jobs from an earlier write are deleted first.
The service role key is read here only, from the environment. Local stack only.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

import pandas as pd

from heatsched.fleet_db import TAG, rows_for_hour

FLEET_HOST = "00000000-0000-4000-8000-000000000005"   # supabase/seed.sql: fleet@kachel.test
BUYER = "00000000-0000-4000-8000-000000000002"        # supabase/seed.sql: buyer@kachel.test
CONFLICT = {"sites": "id", "servers": "id", "jobs": "id", "heat_state": "site_id,time"}

ap = argparse.ArgumentParser()
ap.add_argument("--day", choices=["january", "july"], default="january")
ap.add_argument("--hour", type=int, default=18, choices=range(24), metavar="0-23")
ap.add_argument("--jobs", type=int, default=80, help="newest jobs to write (default 80)")
ap.add_argument("--out", default="out")
ap.add_argument("--config", default="config.json")
ap.add_argument("--dry-run", action="store_true")
a = ap.parse_args()

read = lambda name: pd.read_csv(f"{a.out}/{name}.csv")  # noqa: E731
rows = rows_for_hour(read("fleet_sites"), read(f"fleet_jobs_{a.day}"), read(f"fleet_placements_{a.day}"),
                     read(f"fleet_hourly_{a.day}"), a.hour, json.load(open(a.config))["server"], FLEET_HOST, BUYER,
                     a.jobs)
summary = {t: len(r) for t, r in rows.items()}
states = pd.Series([j["state"] for j in rows["jobs"]]).value_counts().to_dict()
moved = sum(j["moved_offsite"] for j in rows["jobs"])
print(f"{a.day} {a.hour:02d}:00: {summary} | jobs {states}, {moved} moved to a data centre")

if a.dry_run:
    print(json.dumps({t: r[:2] for t, r in rows.items()}, indent=2))
    sys.exit(0)

url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if not url or not key:
    sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (services/agent/.env), or use --dry-run.")


def call(method, path, body=None, prefer="return=minimal"):
    req = urllib.request.Request(f"{url}/rest/v1/{path}", method=method,
                                 data=None if body is None else json.dumps(body).encode(),
                                 headers={"apikey": key, "Authorization": f"Bearer {key}",
                                          "Content-Type": "application/json", "Prefer": prefer})
    try:
        urllib.request.urlopen(req, timeout=30).read()
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path.split('?')[0]} failed: {e.code} {e.read().decode()[:300]}")


call("DELETE", "jobs?label=like." + urllib.parse.quote(f"*{TAG}"))
for table in ("sites", "servers", "heat_state", "jobs"):
    call("POST", f"{table}?on_conflict={CONFLICT[table]}", rows[table],
         prefer="resolution=merge-duplicates,return=minimal")
print(f"written to {url}")
