"""More buildings and tariffs (issue #28): the yearly balance for each reference building.

A building's hourly heat demand is the Basel reference profile scaled to its yearly space heat
(area × specific demand × climate factor) and hot water (area × specific demand). The tank grows
with daily demand. The number of servers follows the same 40% rule as the reference house.
"""
import copy
import math

from .sim import House, kpis


def building_profile(ref, b):
    """The reference profile scaled to one building. The reference building itself is returned as is."""
    if b.get("reference"):
        return ref
    p = ref.copy()
    heat = b["area_m2"] * b["space_heat_kwh_per_m2"] * b.get("climate_factor", 1.0)
    dhw = b["area_m2"] * b["hot_water_kwh_per_m2"]
    p["heat_kwh"] = ref["heat_kwh"] * heat / ref["heat_kwh"].sum()
    p["dhw_kwh"] = ref["dhw_kwh"] * dhw / ref["dhw_kwh"].sum()
    p["demand_kwh"] = p["heat_kwh"] + p["dhw_kwh"]
    return p


def building_config(cfg, ref, prof):
    """config.json with the tank scaled to the building's demand, as the reference house's tank is to its own."""
    c = copy.deepcopy(cfg)
    c["house"]["tank_kwh"] = cfg["house"]["tank_kwh"] * prof["demand_kwh"].sum() / ref["demand_kwh"].sum()
    return c


def servers_for(prof, cfg, min_marginal_util=40.0):
    """Most servers for which the last one added still runs at least min_marginal_util % of the year.

    Same rule as sim.recommend, found by bisection so a campus does not need hundreds of yearly runs.
    """
    hours, cache = len(prof), {0: 0.0}

    def sold(n):
        if n not in cache:
            cache[n] = float(House(prof, cfg, n).run()["server_hours"].sum())
        return cache[n]

    def ok(n):
        return 100 * (sold(n) - sold(n - 1)) / hours >= min_marginal_util

    h = cfg["server"]["power_kw"] * cfg["server"]["heat_recovery"]
    lo, hi = 1, max(2, math.ceil(prof["demand_kwh"].max() / h) + 1)
    if not ok(lo):
        return 1
    while hi - lo > 1:                     # ok(lo) holds; find the last n that is ok
        mid = (lo + hi) // 2
        lo, hi = (mid, hi) if ok(mid) else (lo, mid)
    return lo


def run_building(ref, cfg, b):
    """Simulate one building for a year. Returns its profile, config, servers and hourly frame."""
    prof = building_profile(ref, b)
    c = building_config(cfg, ref, prof)
    n = servers_for(prof, c)
    return prof, c, n, House(prof, c, n).run()


def money(df, c, n, price, hardware_per_server_year):
    """The yearly result at one electricity price, before and after hardware."""
    c = copy.deepcopy(c)
    c["prices"]["electricity_chf_per_kwh"] = price
    k = kpis(df, c, n)
    net = k["computing_income_chf"] - k["electricity_cost_chf"] + k["value_of_heat_used_chf"]
    hw = hardware_per_server_year * n
    return dict(electricity_cost_chf=k["electricity_cost_chf"], value_of_heat_used_chf=k["value_of_heat_used_chf"],
                computing_income_chf=k["computing_income_chf"], net_chf_before_hardware=round(net),
                hardware_chf_per_year=round(hw), net_chf_after_hardware=round(net - hw),
                break_even_chf_per_server_hour=k["break_even_chf_per_server_hour"],
                break_even_chf_per_server_hour_incl_hardware=round(
                    (k["electricity_cost_chf"] - k["value_of_heat_used_chf"] + hw) / k["server_hours_sold"], 3))
