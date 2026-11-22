"""One tick of the live loop: read the house, decide, log, act.

Each tick the loop reads the house's servers and jobs and the queued jobs from the store, takes
the heat (the replay hour, or heat_state for the clock's hour), runs plan() (live.py: the same
decide() the yearly balance uses), appends the entry to the decision log, then carries it out:

  - a job with an agent (a real process): its signal file says run or pause, with the reason and
    the entry's hash. The agent pauses or resumes the process and writes the job's state itself.
  - every other job on the house: its state, its progress, and its server's state, written here.
  - a placed job: its house and server, or the data centre.

The heat sources keep no state of their own beyond the replay's tank, which follows the loop's
own decisions the way the house model keeps its books.
"""
import os
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path

from .live import ZURICH, job_inputs, local_iso, plan, tank_after
from .live_db import SupabaseError

SYNTHETIC = "synthetic)"   # the seed's and the fleet run's made-up jobs end so; they are not placed live
FORECAST_H = 24


def write_signal(path, run, note=""):
    """Write the agent's signal file in one step: "run" or "pause", then the note."""
    path = Path(path)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    with os.fdopen(fd, "w") as f:
        f.write(("run" if run else "pause") + "\n" + note)
    os.replace(tmp, path)


class ReplayHeat:
    """The heat of a stored day, hour by hour, from the yearly model's profile (saved weather).

    Each day starts with the tank the yearly model had that morning; after that the tank follows
    the live loop's decisions."""

    def __init__(self, profile, cfg, n_servers):
        from .sim import House
        self.p, self.cfg, self.n, self.House = profile, cfg, n_servers, House
        self.dem = profile["demand_kwh"].to_numpy()
        self.soc = 0.0

    def day(self, date):
        """The profile's hour indices of a date, and the tank that morning."""
        idx = self.p.index[self.p["time"].astype(str).str.startswith(date)]
        if len(idx) == 0:
            raise ValueError(f"{date}: no hours on that date in the profile")
        house = self.House(self.p, self.cfg, self.n)
        house.run(until=int(idx[0]))
        self.soc = float(house.soc)
        return [int(i) for i in idx]

    def at(self, t):
        nxt = range(t + 1, min(t + 1 + FORECAST_H, len(self.dem)))
        if self.cfg.get("forecast") == "perfect":
            fd = [float(self.dem[i]) for i in nxt]
        else:                                   # persistence, as sim.House: tomorrow looks like today
            fd = [float(self.dem[max(0, i - 24)]) for i in nxt]
        temp = self.p["temp_c"].iloc[t]
        return dict(time=local_iso(self.p["time"].iloc[t]), temp_c=None if temp != temp else float(temp),
                    demand_kwh=float(self.dem[t]), soc_kwh=round(self.soc, 4), forecast_demand=fd)

    def after(self, heat, running, heat_per_server, tank):
        self.soc = tank_after(heat["soc_kwh"], running, heat_per_server, heat["demand_kwh"], tank)[0]


class DbHeat:
    """heat_state for the clock's hour, written by whatever measures the house. The tank is the
    one the previous hour ended with; the forecast is the rows after this hour, where there are."""

    def __init__(self, store, site_id):
        self.store, self.site_id = store, site_id

    def at(self, now):
        hour = now.astimezone(ZURICH).replace(minute=0, second=0, microsecond=0)
        rows = self.store.heat_rows(self.site_id, (hour - timedelta(hours=1)).isoformat(),
                                    (hour + timedelta(hours=FORECAST_H + 1)).isoformat())
        by_time = {datetime.fromisoformat(r["time"]): r for r in rows}
        row = by_time.get(hour)
        if row is None:
            return None
        before = by_time.get(hour - timedelta(hours=1))
        soc = (before or row)["soc_kwh"]
        fd = [float(r["demand_kwh"]) for t, r in sorted(by_time.items()) if t > hour]
        return dict(time=hour.isoformat(), temp_c=row["temp_c"], demand_kwh=float(row["demand_kwh"]),
                    soc_kwh=float(soc), forecast_demand=fd)


@dataclass
class Loop:
    store: object
    site_id: str
    ledger: object
    agents: dict = field(default_factory=dict)      # job id -> signal file
    hours_per_tick: float = 1.0                      # the run time a tick gives each running job
    say: object = print
    unsent: list = field(default_factory=list)       # decision rows the table has not taken yet, oldest first

    def inputs(self, heat):
        house = self.store.house(self.site_id)
        if house is None:
            raise SystemExit(f"No site {self.site_id} in the database: run make db-reset.")
        servers = sorted(house["servers"], key=lambda s: s["slot"])
        heat_per_server = sum(s["power_kw"] * s["heat_recovery"] for s in servers) / len(servers)
        rows = self.store.house_jobs([s["id"] for s in servers])
        now = heat["time"]
        jobs = []
        for r in rows:
            j = job_inputs(r, now)
            if j["left_h"] is not None and j["left_h"] <= 0 and r["id"] not in self.agents:
                self.finish(r)
                continue
            jobs.append({**j, "server": r["server_id"], "agent": r["id"] in self.agents})
        queue = [job_inputs(r, now) for r in self.store.queued(self.site_id)
                 if not (r.get("label") or "").endswith(SYNTHETIC)]
        inputs = dict(site=self.site_id, time=now, temp_c=heat["temp_c"], demand_kwh=heat["demand_kwh"],
                      soc_kwh=heat["soc_kwh"], tank_kwh=float(house["tank_kwh"]),
                      heat_per_server=round(heat_per_server, 6), forecast_demand=heat["forecast_demand"],
                      servers=[s["id"] for s in servers], jobs=jobs, queue=queue)
        return inputs, servers, {r["id"]: r for r in rows}

    def finish(self, row):
        self.store.update_job(row["id"], {"state": "GONE"})
        self.store.update_server(row["server_id"], {"state": "OFF"})
        self.say(f"  {row['id'][-4:]} done")

    def tick(self, heat):
        """Decide one tick and carry it out. Returns the logged entry."""
        inputs, servers, rows = self.inputs(heat)
        entry = self.ledger.append({"inputs": inputs, **plan(inputs)})
        self.act(entry, servers, rows)
        self.unsent.append(decision_row(entry))
        self.mirror()
        return entry

    def mirror(self):
        """Send the decisions the table has not taken, oldest first, so its chain has no gap. A row
        that fails stays, with every one after it, for the next tick."""
        while self.unsent:
            try:
                self.store.add_decision(self.unsent[0])
            except SupabaseError as err:
                self.say(f"  could not mirror {len(self.unsent)} decision(s) to Supabase, will retry: {err}")
                return
            self.unsent.pop(0)

    def act(self, entry, servers, rows):
        run, d, note = set(entry["run"]), entry["decision"], decision_note(entry)
        holder = {}
        for p in entry["placed"]:
            if p["to"] == "datacentre":
                self.store.update_job(p["job"], {"state": "GONE", "moved_offsite": True,
                                                 "site_id": None, "server_id": None})
                continue
            state = "RUNNING" if p["job"] in run else "PAUSED"
            self.store.update_job(p["job"], {"site_id": self.site_id, "server_id": p["server"], "state": state})
            holder[p["server"]] = (p["job"], state)
        for j in entry["inputs"]["jobs"]:
            on = j["id"] in run
            if j["id"] in self.agents:
                write_signal(self.agents[j["id"]], on, note)
                holder[j["server"]] = (j["id"], None)          # the agent writes this server
                continue
            state = "RUNNING" if on else "PAUSED"
            fields = {}
            if state != rows[j["id"]]["state"]:
                fields["state"] = state
            if on:
                fields["active_cpu_s"] = (rows[j["id"]].get("active_cpu_s") or 0.0) + 3600 * self.hours_per_tick
            if fields:
                self.store.update_job(j["id"], fields)
            holder[j["server"]] = (j["id"], state)
        for s in servers:
            job, state = holder.get(s["id"], (None, "OFF"))
            if state is not None and state != s["state"]:
                self.store.update_server(s["id"], {"state": state})
        self.say(f"{entry['inputs']['time'][:16]} {fmt_temp(entry['inputs']['temp_c'])} "
                 f"need {entry['inputs']['demand_kwh']:5.2f} tank {entry['inputs']['soc_kwh']:5.1f} | "
                 f"I{d['interactive']} B{d['batch']} O{d['opportunistic']} {d['reason']} | "
                 f"run {len(run)} placed {len(entry['placed'])} | {entry['hash'][:12]}")


def fmt_temp(t):
    return "   – °C" if t is None else f"{t:5.1f} °C"


def decision_note(entry):
    """What the agent's signal file says after run/pause: the scheduler's reason and the hash."""
    return f"{entry['decision']['reason']}\n{entry['hash']}\n"


def decision_row(entry):
    """The decisions table's row for an entry; `entry` keeps the exact logged text for replay."""
    from .ledger import canonical
    i, d = entry["inputs"], entry["decision"]
    return dict(hash=entry["hash"], prev_hash=entry["prev"], seq=entry["seq"], site_id=i["site"], time=i["time"],
                temp_c=i["temp_c"], demand_kwh=i["demand_kwh"], soc_kwh=i["soc_kwh"], tank_kwh=i["tank_kwh"],
                interactive=d["interactive"], batch=d["batch"], opportunistic=d["opportunistic"],
                reason=d["reason"], run=entry["run"], placed=len(entry["placed"]), entry=canonical(entry))
