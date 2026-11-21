"""One hour of a `make fleet` day as Supabase rows (fleet_write.py sends them).

Pure: CSV frames in, rows out. Ids are uuid5 of the fleet's own ids, so writing the same hour
twice updates the same rows. Times in the CSVs are Basel local time.
"""
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from .fleet import DATACENTRE

NS = uuid.uuid5(uuid.NAMESPACE_URL, "https://github.com/CPD9/kachel/fleet")
ZURICH = ZoneInfo("Europe/Zurich")
TAG = "(fleet, synthetic)"
KIND = {"interactive": "interactive", "batch": "batch", "backlog": "opportunistic"}
LABEL = {"interactive": "Interactive session", "batch": "Batch job", "backlog": "Backlog job"}


def uid(*parts):
    return str(uuid.uuid5(NS, "/".join(str(p) for p in parts)))


def ts(local):
    """'2025-07-15 18:00' (Basel) -> ISO 8601 with its offset; None stays None."""
    if not isinstance(local, str) or not local:
        return None
    return datetime.strptime(local, "%Y-%m-%d %H:%M").replace(tzinfo=ZURICH).isoformat()


def rows_for_hour(sites, jobs, placements, hourly, hour, host_id, buyer_id, limit=80):
    """sites, jobs, placements, hourly: the DataFrames of out/fleet_sites.csv and the day's
    fleet_jobs, fleet_placements and fleet_hourly CSVs. Returns {table: [row, ...]}."""
    day = hourly["time"].iloc[0][:10]
    now = f"{day} {hour:02d}:00"
    site_ids = {sid: uid("site", sid) for sid in sites["id"]}
    out = {"sites": [], "servers": [], "jobs": [], "heat_state": []}

    for s in sites.itertuples():
        out["sites"].append(dict(id=site_ids[s.id], host_id=host_id, name=f"{s.name}, fleet run", city=s.city,
                                 latitude=float(s.latitude), longitude=float(s.longitude), tank_kwh=float(s.tank_kwh),
                                 hot_water_kwh_per_day=float(s.hot_water_kwh_per_day), hot_water_shape="flat"))

    # This hour's placements: each house's running jobs take its servers in slot order.
    this_hour = placements[(placements["hour"] == hour) & (placements["site_id"] != DATACENTRE)]
    server_of, used = {}, {}
    for p in this_hour.itertuples():
        used[p.site_id] = used.get(p.site_id, 0) + 1
        server_of[p.job_id] = (p.site_id, used[p.site_id])
    for s in sites.itertuples():
        for slot in range(1, int(s.servers) + 1):
            out["servers"].append(dict(id=uid("server", s.id, slot), site_id=site_ids[s.id], slot=slot,
                                       name=f"Server {slot}", power_kw=1.0, heat_recovery=0.8, idle_power_kw=0.0,
                                       state="RUNNING" if slot <= used.get(s.id, 0) else "OFF"))

    # Jobs that arrived on the day by this hour, newest first.
    before = placements[(placements["hour"] < hour) & (placements["site_id"] != DATACENTRE)]
    ran_hours = before.groupby("job_id").size().to_dict()
    last_house = before.sort_values("hour").groupby("job_id")["site_id"].last().to_dict()
    arrived = jobs[jobs["arrival"] <= now].sort_values(["arrival", "job_id"], ascending=False).head(limit)
    for j in arrived.itertuples():
        moved = bool(j.moved_offsite) and isinstance(j.moved_at, str) and j.moved_at <= now
        done = isinstance(j.finished_at, str) and j.finished_at <= now
        site, server, state = None, None, "QUEUED"
        if moved:
            state = "GONE"
        elif j.job_id in server_of:
            house, slot = server_of[j.job_id]
            site, server, state = site_ids[house], uid("server", house, slot), "RUNNING"
        elif done:
            state = "GONE"
            site = site_ids.get(j.ran_at)
        elif j.job_id in last_house:
            site = site_ids[last_house[j.job_id]]
        hours_run = int(j.house_hours) if done and not moved else ran_hours.get(j.job_id, 0)
        out["jobs"].append(dict(id=uid("job", j.job_id), buyer_id=buyer_id, site_id=site, server_id=server,
                                kind=KIND[j.kind], label=f"{LABEL[j.kind]} {j.job_id} {TAG}",
                                interruptible=j.kind != "interactive", server_hours=float(j.server_hours),
                                deadline_at=ts(j.deadline), state=state, moved_offsite=moved,
                                active_cpu_s=3600.0 * hours_run, created_at=ts(j.arrival)))

    # Every hour of the day for every house, with the servers given to each kind of job.
    kinds = placements[placements["site_id"] != DATACENTRE].groupby(["hour", "site_id", "kind"]).size()
    for r in hourly.itertuples():
        def n(kind, r=r):
            return int(kinds.get((r.hour, r.site_id, kind), 0))
        out["heat_state"].append(dict(
            site_id=site_ids[r.site_id], time=ts(r.time), demand_kwh=float(r.demand_kwh),
            interactive=n("interactive"), batch=n("batch"), opportunistic=n("backlog"),
            server_hours=float(r.running), heat_produced=float(r.heat_produced), heat_used=float(r.heat_used),
            served_kwh=float(r.served_kwh), backup_kwh=float(r.backup_kwh), dumped_kwh=float(r.dumped_kwh),
            soc_kwh=float(r.soc_kwh), reason="fleet run (make fleet)"))
    return out
