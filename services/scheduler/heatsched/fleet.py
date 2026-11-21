"""The fleet: many houses, one stream of compute jobs.

`decide` (scheduler.py) plans one house. Here every hour the fleet looks at all its houses and
the jobs waiting, and places each job where its heat is most useful right now:

  1. Jobs are taken least slack first (slack = hours a job can still wait and finish in time).
  2. A job goes to the house with the most useful heat room left this hour: heat demand plus
     free tank space, minus what the jobs already placed there will make. A job that ran last
     hour stays on its house while that house still has room, so it is not moved for nothing.
  3. A house only takes a job while one more server's heat still fits in its room. Heat is
     never made where it has nowhere to go.
  4. A job with slack left waits for the next hour. A job with none, which no house can take,
     goes to an ordinary data centre and finishes there. Its heat is lost; it counts as moved.
  5. With no data centre (`datacentre=False`) such a job runs on any free server and its heat
     is dumped; with no free server it misses its deadline.

Every function is pure: state goes in, new state comes out. One job uses one server at a time
and runs in whole server-hours, as the agent pauses and resumes it (services/agent).
"""
from dataclasses import dataclass, field, replace
from math import inf

DATACENTRE = "datacentre"
EPS = 1e-9


@dataclass(frozen=True)
class Site:
    """A house: its servers, its tank and its heat demand for each hour of the run (kWh)."""
    id: str
    n_servers: int
    tank_kwh: float
    heat_per_server: float           # kWh of recoverable heat per server-hour
    demand: tuple                    # kWh per hour, index = hour of the run
    name: str = ""
    city: str = ""
    lat: float = 0.0
    lon: float = 0.0


@dataclass(frozen=True)
class Job:
    """A compute job: `hours` server-hours, due `deadline` (hour index; None = no deadline)."""
    id: str
    kind: str
    arrival: int
    hours: int
    deadline: int | None
    home: str = ""                   # the house it was sent to (used by routing="home")


@dataclass(frozen=True)
class Waiting:
    """A job in the queue: what is left of it and where it ran last."""
    job: Job
    left: int
    last_site: str | None = None


@dataclass(frozen=True)
class Placement:
    job_id: str
    site_id: str                     # a site id, or DATACENTRE
    hours: int                       # server-hours run this hour (1), or all that was left (data centre)
    reason: str


def slack(w: Waiting, t: int) -> float:
    """Hours the job can still wait and finish by its deadline (inf without one)."""
    return inf if w.job.deadline is None else w.job.deadline - t - w.left


def room(site: Site, soc: float, t: int) -> float:
    """Heat this house can use or store this hour (kWh)."""
    return site.demand[t] + site.tank_kwh - soc


def place_hour(sites, soc, queue, t, routing="fleet", datacentre=True):
    """Place the waiting jobs for hour t.

    sites: list[Site]; soc: {site_id: kWh in the tank}; queue: list[Waiting].
    routing: "fleet" (any house) or "home" (only the house the job was sent to).
    Returns (placements, still_waiting, missed_job_ids).
    """
    by_id = {s.id: s for s in sites}
    left_room = {s.id: room(s, soc.get(s.id, 0.0), t) for s in sites}
    free = {s.id: s.n_servers for s in sites}

    def useful(sid):
        return free[sid] > 0 and left_room[sid] + EPS >= by_id[sid].heat_per_server

    def candidates(w):
        ids = [w.job.home] if routing == "home" else list(by_id)
        return [sid for sid in ids if sid in by_id]

    def take(sid):
        free[sid] -= 1
        left_room[sid] -= by_id[sid].heat_per_server

    placements, waiting, missed = [], [], []
    for w in sorted(queue, key=lambda w: (slack(w, t), w.job.deadline if w.job.deadline is not None else inf, w.job.id)):
        ids = candidates(w)
        if w.last_site in ids and useful(w.last_site):
            sid = w.last_site
        else:
            ok = [sid for sid in ids if useful(sid)]
            sid = max(ok, key=lambda s: (left_room[s], s)) if ok else None
        if sid is not None:
            take(sid)
            placements.append(Placement(w.job.id, sid, 1, "heat needed"))
            if w.left > 1:
                waiting.append(replace(w, left=w.left - 1, last_site=sid))
            continue
        if slack(w, t) > 0:
            waiting.append(w)
        elif datacentre:
            placements.append(Placement(w.job.id, DATACENTRE, w.left, "no house can use its heat in time"))
        else:
            spare = [sid for sid in ids if free[sid] > 0]
            if spare:
                sid = max(spare, key=lambda s: (left_room[s], s))
                take(sid)
                placements.append(Placement(w.job.id, sid, 1, "deadline: run and dump heat"))
                if w.left > 1:
                    waiting.append(replace(w, left=w.left - 1, last_site=sid))
            else:
                missed.append(w.job.id)
    return placements, waiting, missed


def apply_hour(sites, soc, placements, t):
    """Run the placed jobs for hour t and keep each house's heat books.

    Returns (new_soc, rows): one row per house with the heat made, used, served and dumped.
    """
    running = {}
    for p in placements:
        if p.site_id != DATACENTRE:
            running[p.site_id] = running.get(p.site_id, 0) + p.hours
    new_soc, rows = {}, []
    for s in sites:
        before = soc.get(s.id, 0.0)
        n = running.get(s.id, 0)
        produced = n * s.heat_per_server
        demand = s.demand[t]
        served = min(demand, produced + before)
        after = before + produced - served
        dumped = max(0.0, after - s.tank_kwh)
        new_soc[s.id] = min(after, s.tank_kwh)
        rows.append(dict(t=t, site_id=s.id, servers=s.n_servers, running=n, demand_kwh=demand,
                         heat_produced=produced, heat_used=produced - dumped, served_kwh=served,
                         backup_kwh=demand - served, dumped_kwh=dumped, soc_kwh=new_soc[s.id]))
    return new_soc, rows


@dataclass
class JobBook:
    """What happened to one job over the run."""
    job: Job
    house_hours: int = 0
    datacentre_hours: int = 0
    sites: list = field(default_factory=list)   # the house of each hour it ran at a house
    moved_at: int | None = None
    finished_at: int | None = None
    missed: bool = False

    @property
    def site(self):
        """The house it ran on longest (DATACENTRE if it never ran on one, None if it never ran)."""
        if self.sites:
            return max(set(self.sites), key=lambda s: (self.sites.count(s), -self.sites.index(s)))
        return DATACENTRE if self.datacentre_hours else None

    @property
    def migrations(self):
        return sum(a != b for a, b in zip(self.sites, self.sites[1:]))


def run(sites, jobs, start, end, routing="fleet", datacentre=True, soc=None):
    """Step the fleet from hour `start` to `end` (exclusive).

    Returns (books, rows, placements_by_hour, soc): a JobBook per job id, one heat row per house
    and hour, the placements of every hour and the tanks at the end.
    """
    soc = dict(soc or {s.id: 0.0 for s in sites})
    arrivals = {}
    for j in jobs:
        arrivals.setdefault(j.arrival, []).append(j)
    books = {j.id: JobBook(j) for j in jobs}
    queue, rows, by_hour = [], [], {}
    for t in range(start, end):
        queue += [Waiting(j, j.hours) for j in arrivals.get(t, [])]
        placed, queue, missed = place_hour(sites, soc, queue, t, routing, datacentre)
        for jid in missed:
            books[jid].missed = True
        for p in placed:
            b = books[p.job_id]
            if p.site_id == DATACENTRE:
                b.datacentre_hours += p.hours
                b.moved_at = t
                b.finished_at = t + p.hours
            else:
                b.house_hours += p.hours
                b.sites.append(p.site_id)
                if b.house_hours + b.datacentre_hours >= b.job.hours:
                    b.finished_at = t + 1
        soc, hour_rows = apply_hour(sites, soc, placed, t)
        rows += hour_rows
        by_hour[t] = placed
    return books, rows, by_hour, soc


def kpis(books, rows, hours=None):
    """Fleet KPIs for the jobs that arrived in `hours` (a range; None = all), wherever and
    whenever they then ran. Their compute heat used = the heat their house hours made, less the
    run's dumped share, over the heat of all their server-hours, data centre too. The house
    figures (demand covered, heat dumped) are for the houses in those hours."""
    hs = set(hours) if hours is not None else None
    rs = [r for r in rows if hs is None or r["t"] in hs]
    bs = [b for b in books.values() if hs is None or b.job.arrival in hs]
    produced = sum(r["heat_produced"] for r in rows)
    kept = 1 - sum(r["dumped_kwh"] for r in rows) / produced if produced else 1.0
    house_sh = sum(b.house_hours for b in bs)
    dc_sh = sum(b.datacentre_hours for b in bs)
    all_sh = house_sh + dc_sh
    demand = sum(r["demand_kwh"] for r in rs)
    served = sum(r["served_kwh"] for r in rs)
    deadline_jobs = [b for b in bs if b.job.deadline is not None]
    n = len(bs)
    return {
        "jobs": n,
        "server_hours_in_houses": house_sh,
        "server_hours_in_datacentre": dc_sh,
        "compute_heat_used_pct": round(100 * house_sh * kept / all_sh, 1) if all_sh else 0.0,
        "heat_dumped_kwh": round(sum(r["dumped_kwh"] for r in rs), 1),
        "house_heat_covered_pct": round(100 * served / demand, 1) if demand else 0.0,
        "jobs_moved_offsite": sum(b.moved_at is not None for b in bs),
        "jobs_moved_offsite_pct": round(100 * sum(b.moved_at is not None for b in bs) / n, 1) if n else 0.0,
        "deadline_misses": sum(b.missed for b in deadline_jobs),
        "jobs_unfinished": sum(b.finished_at is None and not b.missed for b in bs),
        "job_moves_between_houses": sum(b.migrations for b in bs),
    }
