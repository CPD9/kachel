"""The fleet month by month, and what-ifs on the outdoor temperature (make months).

Every house of a `make fleet` run (heatsched/fleet_scenario.py: make_sites) runs the year through
the one-house scheduler (sim.House, the same `decide` as run_year.py): its own servers, tank, hot
water and size of space heating, on the real 2025 weather of its city. The jobs are the reference
house's (config.json: jobs), with its unlimited backlog.

A what-if shifts every hour of the year's weather by `offset` degrees and builds the profile
again with the brief's formula (profile.build_profile): the 20/12 heating-degree rule, so a
warmer year has fewer heating days and less space heat in each. Hot water does not change.
Nothing else is shifted: the houses, the jobs and the prices stay as they are.
"""
import pandas as pd

from .fleet_scenario import make_sites
from .profile import build_profile
from .sim import House

# The sums kept for each house and month, in kWh or server-hours (sim.House.apply).
SUMS = ("demand_kwh", "served_kwh", "backup_kwh", "dumped_kwh", "server_hours")


def shifted(weather, offset):
    """The weather with every hour `offset` degrees warmer (negative: colder)."""
    out = weather.copy()
    out["temp_c"] = (out["temp_c"] + offset).round(1)
    return out


def house_year(profile, site, cfg):
    """One fleet house through the year: sim.House on its own demand, tank and servers."""
    prof = profile.copy()
    prof["demand_kwh"] = site.demand
    house_cfg = {**cfg, "house": {**cfg["house"], "tank_kwh": site.tank_kwh}}
    df = House(prof, house_cfg, site.n_servers).run()
    df["month"] = pd.to_datetime(df["time"]).dt.month
    return df


def monthly(df):
    """Sums per month (1 to 12) of SUMS, plus the hours in each month."""
    g = df.groupby("month")
    out = g[list(SUMS)].sum()
    out["hours"] = g.size()
    return out.reindex(range(1, 13), fill_value=0)


def city_year(weather, cfg, city, offset):
    """Every house of `city` on its weather shifted by `offset`. Returns (sites, {id: monthly},
    peak servers running in the city in each month, mean outdoor temperature of each month)."""
    profile = build_profile(shifted(weather, offset), cfg)
    sites = make_sites(profile, cfg, city)
    per_house, running = {}, None
    for s in sites:
        df = house_year(profile, s, cfg)
        per_house[s.id] = monthly(df)
        running = df["server_hours"].to_numpy() if running is None else running + df["server_hours"].to_numpy()
    months = pd.to_datetime(profile["time"]).dt.month.to_numpy()
    peak = pd.Series(running).groupby(months).max().reindex(range(1, 13), fill_value=0)
    temp = profile.groupby(months)["temp_c"].mean().reindex(range(1, 13))
    return sites, per_house, peak, temp
