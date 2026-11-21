"""The fleet on the January and July showcase days (make fleet).

  python run_fleet.py --weather tests/data/weather_basel_2025.csv

50 synthetic houses (config.json: fleet) share one job stream. Each day is run twice: with
routing across the fleet, and with every job kept at the house it was sent to (the baseline).
The run starts warmup_days before the day so tanks and queues are not empty at midnight, and
goes on until every job that arrived on the day is done, moved or missed. Writes to out/:

  fleet_sites.csv            one row per house (all synthetic)
  fleet_jobs_<day>.csv       every job that arrived on the day: where it was sent, where it ran
  fleet_hourly_<day>.csv     one row per house and hour of the day: heat made, used, dumped, tank
  fleet_placements_<day>.csv one row per job and hour of the day it ran: the house, or the data centre
  fleet_kpis.json            per day, fleet and baseline: compute heat used, moved, missed
"""
import argparse
import json
import os

import pandas as pd

from heatsched import profile as P
from heatsched.fleet import kpis, run
from heatsched.fleet_scenario import make_jobs, make_sites

ap = argparse.ArgumentParser()
ap.add_argument("--weather", default="tests/data/weather_basel_2025.csv")
ap.add_argument("--config", default="config.json")
ap.add_argument("--out", default="out")
a = ap.parse_args()
cfg = json.load(open(a.config))
os.makedirs(a.out, exist_ok=True)
f = cfg["fleet"]

prof = P.build_profile(P.load_weather(a.weather), cfg)
times = prof["time"].dt.strftime("%Y-%m-%d %H:%M").tolist()
sites = make_sites(prof, cfg)

pd.DataFrame([dict(id=s.id, name=s.name, city=s.city, latitude=s.lat, longitude=s.lon, servers=s.n_servers,
                   tank_kwh=s.tank_kwh, heat_demand_kwh_2025=round(sum(s.demand)), synthetic=True)
              for s in sites]).to_csv(f"{a.out}/fleet_sites.csv", index=False)

result = {"profile_source": "Open-Meteo archive, Basel 2025", "houses": len(sites),
          "servers": sum(s.n_servers for s in sites), "synthetic": True,
          "routing": {"fleet": "each job to the house that can use its heat most, data centre only when none can in time",
                      "home_only": "each job only on the house it was sent to, else the data centre"},
          "days": {}}
when = lambda t: times[t] if t is not None and t < len(times) else None  # noqa: E731

for name, date in P.showcase_days(prof).items():
    day0 = times.index(f"{date} 00:00")
    start = max(0, day0 - 24 * f["warmup_days"])
    end = min(len(times), day0 + 24 + max(f["backlog_deadline_h"], f["batch_deadline_h"][1]) + 1)
    jobs = make_jobs(sites, cfg, start, day0 + 24)
    day = range(day0, day0 + 24)
    out = {"date": date, "jobs_arrived": sum(j.arrival in day for j in jobs)}
    for routing in ("fleet", "home"):
        books, rows, by_hour, _ = run(sites, jobs, start, end, routing=routing)
        k = kpis(books, rows, day)
        k["jobs_moved_offsite_by_kind"] = {kind: sum(b.moved_at is not None for b in books.values()
                                                     if b.job.arrival in day and b.job.kind == kind)
                                           for kind in ("interactive", "batch", "backlog")}
        out["fleet" if routing == "fleet" else "home_only"] = k
        if routing != "fleet":
            continue
        pd.DataFrame([dict(job_id=b.job.id, kind=b.job.kind, arrival=when(b.job.arrival), server_hours=b.job.hours,
                           deadline=when(b.job.deadline), sent_to=b.job.home, ran_at=b.site,
                           house_hours=b.house_hours, datacentre_hours=b.datacentre_hours,
                           moved_offsite=b.moved_at is not None, moved_at=when(b.moved_at),
                           finished_at=when(b.finished_at), missed=b.missed, moves_between_houses=b.migrations)
                      for b in books.values() if b.job.arrival in day]).to_csv(f"{a.out}/fleet_jobs_{name}.csv",
                                                                                 index=False)
        pd.DataFrame([dict(t=t, time=times[t], hour=int(times[t][11:13]), job_id=p.job_id,
                           kind=books[p.job_id].job.kind, site_id=p.site_id, server_hours=p.hours, reason=p.reason)
                      for t in day for p in by_hour[t]]).to_csv(f"{a.out}/fleet_placements_{name}.csv", index=False)
        hourly = pd.DataFrame([r for r in rows if r["t"] in day])
        hourly.insert(1, "time", [times[t] for t in hourly["t"]])
        hourly.insert(2, "hour", [int(times[t][11:13]) for t in hourly["t"]])
        hourly.round(4).to_csv(f"{a.out}/fleet_hourly_{name}.csv", index=False)
    result["days"][name] = out

open(f"{a.out}/fleet_kpis.json", "w").write(json.dumps(result, indent=2) + "\n")
for name, d in result["days"].items():
    fl, ho = d["fleet"], d["home_only"]
    print(f"{name} {d['date']}: {d['jobs_arrived']} jobs | compute heat used {fl['compute_heat_used_pct']}% "
          f"(home only {ho['compute_heat_used_pct']}%) | moved off-site {fl['jobs_moved_offsite']} "
          f"(home only {ho['jobs_moved_offsite']}) | deadline misses {fl['deadline_misses']}")
print(f"{len(sites)} synthetic houses, {result['servers']} servers; fleet_*.csv and fleet_kpis.json written to {a.out}/")
