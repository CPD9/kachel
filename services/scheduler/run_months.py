"""The Basel and Bern fleet month by month, with what-ifs on the outdoor temperature (make months).

  python run_months.py                     # offsets -6 to +6 degrees, every city of fleet_basel_bern
  python run_months.py --offsets -2 0 2    # fewer what-ifs (faster)

Every house of the fleet run (config.json: fleet.runs.fleet_basel_bern; all synthetic) runs the
year through the scheduler on its city's real 2025 weather, once as it was and once for each
offset, every hour that many degrees warmer or colder (heatsched/months.py). Writes
out/fleet_months.json: for each house, month and offset the heat demand, the heat the servers
delivered, the backup heat and the server-hours; for each city the peak servers running and the
mean outdoor temperature. The prices and their sources come along, so a reader can turn
server-hours into money exactly as kpis.json does.
"""
import argparse
import json
import os
from concurrent.futures import ProcessPoolExecutor

from heatsched import profile as P
from heatsched.months import SUMS, city_year

ap = argparse.ArgumentParser()
ap.add_argument("--run", default="fleet_basel_bern", help="a name from config.json: fleet.runs")
ap.add_argument("--offsets", type=int, nargs="+", default=list(range(-6, 7)), help="degrees C")
ap.add_argument("--config", default="config.json")
ap.add_argument("--out", default="out")
a = ap.parse_args()
cfg = json.load(open(a.config))
f = cfg["fleet"]
cities = f["runs"][a.run]
offsets = sorted(set(a.offsets) | {0})


def one(job):
    city, offset = job
    return city, offset, city_year(P.load_weather(f["cities"][city]["weather"]), cfg, city, offset)


if __name__ == "__main__":
    os.makedirs(a.out, exist_ok=True)
    with ProcessPoolExecutor() as pool:
        results = {(c, o): r for c, o, r in pool.map(one, [(c, o) for c in cities for o in offsets])}

    r1 = lambda x: round(float(x), 1)  # noqa: E731
    houses = []
    for city in cities:
        sites = results[(city, 0)][0]
        for s in sites:
            per_offset = [results[(city, o)][1][s.id] for o in offsets]
            houses.append(dict(
                id=s.id, name=s.name, city=s.city, servers=s.n_servers, tank_kwh=s.tank_kwh,
                hot_water_kwh_per_day=s.hot_water_kwh_per_day, heat_demand_kwh_2025=round(sum(s.demand)),
                # [offset][month], in the order of `offsets` and January to December
                **{k: [[round(float(m[k][i])) for i in range(1, 13)] for m in per_offset] for k in SUMS},
            ))
    first = results[(cities[0], 0)][1]
    hours = [int(first[next(iter(first))]["hours"][i]) for i in range(1, 13)]
    pr, sv = cfg["prices"], cfg["server"]
    result = {
        "profile_source": f"Open-Meteo archive, {' and '.join(cities)} 2025",
        "synthetic": True,
        "run": a.run,
        "model": "Each house of the fleet run through the one-house scheduler (heatsched/sim.py: House, the same "
                 "decide as run_year.py) on its city's real 2025 weather: its own servers, tank, hot water and "
                 "space-heating scale, the reference jobs (config.json: jobs) with their unlimited backlog. A "
                 "what-if moves every hour of the year by the offset and applies the brief's 20/12 heating-degree "
                 "rule again; houses, jobs and prices stay the same.",
        "offsets_c": offsets,
        "hours": hours,
        "prices": {
            "electricity_chf_per_kwh": pr["electricity_chf_per_kwh"],
            "heat_pump_cop": pr["heat_pump_cop"],
            "compute_chf_per_server_hour": pr["compute_chf_per_server_hour"],
            "server_power_kw": sv["power_kw"],
            "heat_recovery": sv["heat_recovery"],
            "source": pr["source"],
        },
        "cities": {
            city: dict(
                mean_temp_c=[r1(results[(city, 0)][3][i]) for i in range(1, 13)],
                peak_servers_running=[[int(results[(city, o)][2][i]) for i in range(1, 13)] for o in offsets],
            )
            for city in cities
        },
        "houses": houses,
    }
    path = f"{a.out}/fleet_months.json"
    open(path, "w").write(json.dumps(result, separators=(",", ":")) + "\n")
    total = lambda k, o: sum(sum(h[k][offsets.index(o)]) for h in houses)  # noqa: E731
    print(f"{a.run}: {len(houses)} synthetic houses, {sum(h['servers'] for h in houses)} servers")
    for o in offsets:
        print(f"  {o:+d} C: demand {total('demand_kwh', o):,.0f} kWh | servers delivered {total('served_kwh', o):,.0f} "
              f"| backup {total('backup_kwh', o):,.0f} | server-hours {total('server_hours', o):,.0f}")
    print(f"written to {path}")
