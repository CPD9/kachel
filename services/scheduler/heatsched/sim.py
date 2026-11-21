"""House model: steps the scheduler hour by hour and keeps the books."""
import json
import pandas as pd
from .scheduler import Signal, decide

class House:
    def __init__(self, profile, cfg, n_servers, horizon=24):
        self.p, self.cfg, self.n, self.H = profile, cfg, n_servers, horizon
        self.h = cfg["server"]["power_kw"] * cfg["server"]["heat_recovery"]
        self.tank = cfg["house"]["tank_kwh"]
        self.soc = 0.0
        self.batch = []                       # [[deadline_abs_hour, server_hours], ...]
        j = cfg["jobs"]
        self.arr_i = {int(k): v for k, v in j["interactive"]["arrivals_server_h"].items()}
        self.arr_b = {int(k): v for k, v in j["batch"]["arrivals_server_h"].items()}
        self.dl_b = j["batch"]["deadline_h"]
        self.policy = {"move": "move", "run_and_dump": "dump", "miss": "miss"}[j["batch"]["when_heat_not_needed"]]
        self.opp_unlimited = j["opportunistic"].get("unlimited", True)
        self.dem = profile["demand_kwh"].values
        self.hour = profile["hour"].values
        self.rows = []

    def _forecast(self, t):
        idx = range(t + 1, min(t + 1 + self.H, len(self.dem)))
        if self.cfg.get("forecast") == "perfect":
            dem = [self.dem[i] for i in idx]
        else:                                  # persistence: tomorrow looks like the last 24 h
            dem = [self.dem[max(0, i - 24)] for i in idx]
        return dem, [self.arr_i.get(int(self.hour[i]), 0) for i in idx]

    def signal(self, t):
        hr = int(self.hour[t])
        if hr in self.arr_b:
            self.batch.append([t + self.dl_b, float(self.arr_b[hr])])
            self._arrived_b = self.arr_b[hr]
        else:
            self._arrived_b = 0
        self.batch.sort()
        fd, fi = self._forecast(t)
        return Signal(self.n, self.h, float(self.dem[t]), self.soc, self.tank,
                      self.arr_i.get(hr, 0), [(dl - t, w) for dl, w in self.batch],
                      fd, fi, self.policy, self.opp_unlimited)

    def apply(self, t, s, d):
        # remove batch work that ran or was moved/missed, earliest deadline first
        todo = d.batch + d.batch_moved + d.batch_missed
        for item in self.batch:
            take = min(item[1], todo); item[1] -= take; todo -= take
        self.batch = [b for b in self.batch if b[1] > 1e-9]
        produced = d.running * self.h
        served = min(s.demand_kwh, produced + self.soc)
        soc = self.soc + produced - served
        dumped = max(0.0, soc - self.tank)
        self.soc = min(soc, self.tank)
        row = dict(t=t, time=str(self.p["time"].iloc[t]), temp_c=float(self.p["temp_c"].iloc[t]),
                   demand_kwh=s.demand_kwh, interactive=d.interactive, batch=d.batch,
                   opportunistic=d.opportunistic, server_hours=d.running, heat_produced=produced,
                   heat_used=produced - dumped, served_kwh=served, backup_kwh=s.demand_kwh - served,
                   dumped_kwh=dumped, soc_kwh=self.soc, reserve_kwh=d.reserve_kwh,
                   arr_interactive=s.interactive_due, arr_batch=self._arrived_b,
                   moved=d.batch_moved, missed=d.batch_missed + d.interactive_missed, reason=d.reason)
        self.rows.append(row)
        return row

    def step(self, t):
        s = self.signal(t)
        d = decide(s)
        return self.apply(t, s, d), d

    def run(self, until=None):
        for t in range(len(self.rows), until if until is not None else len(self.dem)):
            self.step(t)
        return pd.DataFrame(self.rows)

def kpis(df, cfg, n):
    pr = cfg["prices"]; p = pr["electricity_chf_per_kwh"]
    sh = df["server_hours"].sum()
    served = df["served_kwh"].sum(); demand = df["demand_kwh"].sum()
    elec = sh * cfg["server"]["power_kw"] * p
    heat_value = served * p / pr["heat_pump_cop"]
    jobs = df["arr_interactive"].sum() + df["arr_batch"].sum()
    return {
        "servers_per_house": n,
        "heat_demand_kwh": round(demand),
        "share_of_heat_covered_pct": round(100 * served / demand, 1),
        "heat_dumped_kwh": round(df["dumped_kwh"].sum(), 1),
        "backup_heat_kwh": round(df["backup_kwh"].sum()),
        "utilisation_pct": round(100 * sh / (n * len(df)), 1),
        "server_hours_sold": round(sh),
        "missed_deadlines_pct_of_jobs": round(100 * df["missed"].sum() / jobs, 2) if jobs else 0.0,
        "moved_offsite_pct_of_deadline_jobs": round(100 * df["moved"].sum() / jobs, 2) if jobs else 0.0,
        "electricity_cost_chf": round(elec),
        "value_of_heat_used_chf": round(heat_value),
        "computing_income_chf": round(sh * pr["compute_chf_per_server_hour"]),
        "break_even_chf_per_server_hour": round((elec - heat_value) / sh, 4) if sh else None,
        "pays_off_at_assumed_compute_price": bool(sh and pr["compute_chf_per_server_hour"] > (elec - heat_value) / sh),
    }

def sweep(profile, cfg, ns=range(1, 15)):
    out = []
    for n in ns:
        out.append(kpis(House(profile, cfg, n).run(), cfg, n))
    df = pd.DataFrame(out)
    df["marginal_server_utilisation_pct"] = (df["server_hours_sold"].diff().fillna(df["server_hours_sold"]) / 87.6).round(1)
    return df

def recommend(sw, min_marginal_util=40.0):
    """Keep adding servers while the LAST server added still runs >= min_marginal_util % of the year."""
    ok = sw[sw["marginal_server_utilisation_pct"] >= min_marginal_util]
    return int(ok["servers_per_house"].max()) if len(ok) else 1
