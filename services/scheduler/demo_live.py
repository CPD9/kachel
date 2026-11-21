"""Live demo: replays one day with the SAME scheduler, holding a real process.

  python demo_live.py --date 2025-07-15 --speed 2      # 2 s per simulated hour
  python demo_live.py --date 2025-01-15 --speed 1
  python demo_live.py --date 2025-07-15 --force-full-tank-at 10   # "one interrupted job" on demand

The real embedding job is bound to the opportunistic slot: it runs while the scheduler
gives the backlog at least one server, and is paused (SIGSTOP) when its heat is not needed.
State is also written to out/live_state.json every tick for the dashboard.
"""
import argparse, json, time
from heatsched import profile as P
from heatsched.sim import House
from heatsched.scheduler import decide
from heatsched.realjob import RealJob

ap = argparse.ArgumentParser()
ap.add_argument("--date", default="2025-07-15"); ap.add_argument("--speed", type=float, default=2.0)
ap.add_argument("--servers", type=int); ap.add_argument("--profile"); ap.add_argument("--synthetic", action="store_true")
ap.add_argument("--force-full-tank-at", type=int, help="hour at which to fill the tank by hand")
a = ap.parse_args()
cfg = json.load(open("config.json"))
prof = (P.load_case_profile(a.profile, cfg) if a.profile else
        P.build_profile(P.synthetic_weather() if a.synthetic else P.download_weather(), cfg))
n = a.servers or json.load(open("out/kpis.json"))["servers_per_house"]
house = House(prof, cfg, n)
start = int(prof.index[prof["time"].astype(str).str.startswith(a.date)][0])
house.run(until=start)                       # fast-forward the year to this morning
job = RealJob(); log = []
print(f"\n{a.date} · {n} servers · real job pid {job.proc.pid}\n"
      f"{'hr':>2} {'°C':>5} {'need':>5} {'tank':<12} {'I B O':<6} {'real job':<8} {'items':>8}  note")
try:
    for t in range(start, start + 24):
        if a.force_full_tank_at is not None and int(prof["hour"].iloc[t]) == a.force_full_tank_at:
            house.soc = house.tank
        sig = house.signal(t); d = decide(sig); row = house.apply(t, sig, d)
        change = job.set_running(d.opportunistic >= 1)
        time.sleep(a.speed); st = job.status()
        bar = "█" * round(10 * row["soc_kwh"] / house.tank)
        note = (change.upper() + ": " + d.reason) if change else ""
        print(f"{int(prof['hour'].iloc[t]):>2} {row['temp_c']:>5.1f} {row['demand_kwh']:>5.2f} {bar:<12} "
              f"{d.interactive} {d.batch} {d.opportunistic:<2} {'PAUSED' if job.paused else 'RUNNING':<8} {st['done']:>8}  {note}")
        log.append({**row, "real_job": "paused" if job.paused else "running", "items_done": st["done"], "workload": st.get("kind")})
        json.dump({"date": a.date, "servers": n, "hours": log}, open("out/live_state.json", "w"))
finally:
    job.stop()
day_ = [r for r in log]
print(f"\nday total: {sum(r['server_hours'] for r in day_)} server-hours · {sum(r['dumped_kwh'] for r in day_):.1f} kWh dumped · "
      f"{sum(r['backup_kwh'] for r in day_):.1f} kWh backup · real job active {st['active_s']:.1f} CPU-s, {st['done']} items")
