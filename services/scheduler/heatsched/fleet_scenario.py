"""A synthetic fleet for `make fleet`: houses and a job stream drawn from config.json: fleet.

Every house is made up. Each one gets the real hourly weather of its city, its own size of
space-heating demand (a scale on the reference house), its own hot water, tank and servers.
Jobs arrive through the day and are each sent to one house, as a buyer would send them; the
fleet then decides where they really run (heatsched/fleet.py).
"""
import numpy as np

from .fleet import Job, Site


def _between(rng, lo_hi, integer=False):
    lo, hi = lo_hi
    return int(rng.integers(lo, hi + 1)) if integer else float(rng.uniform(lo, hi))


def make_sites(profile, cfg):
    """`profile` is heatsched.profile.build_profile for the city's weather (one row per hour)."""
    f, rng = cfg["fleet"], np.random.default_rng(cfg["fleet"]["seed"])
    h = cfg["server"]["power_kw"] * cfg["server"]["heat_recovery"]
    heat = profile["heat_kwh"].to_numpy()
    per_day = profile.groupby("date")["hour"].transform("count").to_numpy()
    sites = []
    for i in range(f["houses"]):
        scale = _between(rng, f["space_heating_scale"])
        dhw = _between(rng, f["hot_water_kwh_per_day"])
        demand = tuple(float(x) for x in np.round(scale * heat + dhw / per_day, 4))
        sites.append(Site(
            id=f"house-{i + 1:02d}",
            name=f"Synthetic house {i + 1:02d}",
            city=f["city"],
            lat=round(_between(rng, f["latitude"]), 5),
            lon=round(_between(rng, f["longitude"]), 5),
            n_servers=_between(rng, f["servers_per_house"], integer=True),
            tank_kwh=round(_between(rng, f["tank_kwh"]), 1),
            heat_per_server=h,
            demand=demand,
            hot_water_kwh_per_day=round(dhw, 1),
        ))
    return sites


def make_jobs(sites, cfg, start, end):
    """Jobs arriving from hour `start` to `end` (exclusive) of the profile."""
    f = cfg["fleet"]
    rng = np.random.default_rng([f["seed"], start])
    ids = [s.id for s in sites]
    jobs = []

    def add(kind, t, hours, deadline_h):
        jobs.append(Job(f"{kind[0]}{t:04d}-{len(jobs):05d}", kind, t, hours, t + deadline_h,
                        ids[int(rng.integers(len(ids)))]))

    for day in range(start, end, 24):
        n = len(sites)
        for _ in range(round(n * f["interactive_jobs_per_house_per_day"])):
            add("interactive", day + int(rng.integers(*f["interactive_hours_of_day"])), 1, 1)
        for _ in range(round(n * f["batch_jobs_per_house_per_day"])):
            hours = _between(rng, f["batch_hours"], integer=True)
            add("batch", day + int(rng.integers(24)), hours,
                max(hours, _between(rng, f["batch_deadline_h"], integer=True)))
        for _ in range(round(n * f["backlog_jobs_per_house_per_day"])):
            add("backlog", day + int(rng.integers(24)), _between(rng, f["backlog_hours"], integer=True),
                f["backlog_deadline_h"])
    jobs = [j for j in jobs if start <= j.arrival < end]
    return sorted(jobs, key=lambda j: (j.arrival, j.id))
