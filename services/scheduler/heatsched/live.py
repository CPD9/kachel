"""The live loop's decision for one house and one tick: pure, so the decision log can replay it.

`plan(inputs)` takes what the loop read this tick and returns what it does:

  1. placed: the queued jobs (submitted in the console) that get a server. An interactive session
     takes a free server at once, as decide() runs sessions in any case. The rest go through the
     fleet's place_hour (fleet.py): a job lands while one more server's heat still fits in the
     house's room, waits in the queue while it has slack, and goes to a data centre once it has
     none. A placed job starts paused; step 4 decides whether it runs.
  2. signal: the scheduler's Signal for the house, from the heat inputs and the jobs now on its
     servers: interactive sessions due, batch work with the hours to each deadline, the backlog.
     No forecast of sessions that have not arrived yet.
  3. decision: decide(signal), the SAME function the yearly balance runs (scheduler.py).
  4. run: which jobs that decision runs. In each kind, a job with a real process behind it (an
     agent) goes first, then batch by deadline, then by id. Every other job on the house pauses.

The inputs are plain JSON, so ledger.verify can hand a logged entry's inputs back to plan().
"""
from dataclasses import asdict
from datetime import datetime
from math import ceil, floor, inf
from zoneinfo import ZoneInfo

from .fleet import DATACENTRE, Job, Site, Waiting, place_hour
from .scheduler import Signal, decide

ZURICH = ZoneInfo("Europe/Zurich")
NO_DEADLINE_H = 8760.0          # a batch job without a deadline waits like one due in a year
KINDS = ("interactive", "batch", "opportunistic")


def _rank(job):
    """Run order within a kind: a real process first, then the earliest deadline, then the id."""
    due = job.get("deadline_h")
    return (not job.get("agent", False), inf if due is None else due, job["id"])


def place(inputs):
    """Step 1: where each queued job goes this tick. Returns [{job, server, to, reason}]."""
    used = {j["server"] for j in inputs["jobs"] if j.get("server")}
    free = [s for s in inputs["servers"] if s not in used]
    placed = []
    queue = sorted(inputs["queue"], key=lambda q: (KINDS.index(q["kind"]), q["id"]))
    for q in [q for q in queue if q["kind"] == "interactive"]:
        if free:
            placed.append(dict(job=q["id"], server=free.pop(0), to="house", reason="interactive: runs at once"))
    rest = [q for q in queue if q["kind"] != "interactive"]
    if not rest:
        return placed
    site = Site(id=inputs["site"], n_servers=len(free), tank_kwh=inputs["tank_kwh"],
                heat_per_server=inputs["heat_per_server"], demand=(inputs["demand_kwh"],))
    # A "site" job may only run on the house it names; logged inputs without a tier read as "any".
    waiting = [Waiting(Job(id=q["id"], kind=q["kind"], arrival=0,
                           hours=max(1, ceil(q["left_h"])) if q.get("left_h") else 1,
                           deadline=None if q.get("deadline_h") is None else max(0, floor(q["deadline_h"])),
                           home=q.get("site") or "", privacy=q.get("privacy", "any")),
                       max(1, ceil(q["left_h"])) if q.get("left_h") else 1)
               for q in rest]
    placements, _, _ = place_hour([site], {site.id: inputs["soc_kwh"]}, waiting, 0)
    for p in placements:
        if p.site_id == DATACENTRE:
            placed.append(dict(job=p.job_id, server=None, to="datacentre", reason=p.reason))
        else:
            placed.append(dict(job=p.job_id, server=free.pop(0), to="house", reason=p.reason))
    return placed


def signal_for(inputs, jobs):
    """Step 2: the Signal decide() sees, from the heat inputs and the jobs on the house's servers."""
    by_kind = {k: [j for j in jobs if j["kind"] == k] for k in KINDS}
    # A job runs on one server, so it offers at most one server-hour this hour (the yearly model's
    # batch work spreads over servers; a live job does not).
    batch = sorted((NO_DEADLINE_H if j.get("deadline_h") is None else j["deadline_h"],
                    1.0 if j.get("left_h") is None else min(1.0, j["left_h"])) for j in by_kind["batch"])
    forecast = list(inputs["forecast_demand"])
    return Signal(n_servers=len(inputs["servers"]), heat_per_server=inputs["heat_per_server"],
                  demand_kwh=inputs["demand_kwh"], soc_kwh=inputs["soc_kwh"], tank_kwh=inputs["tank_kwh"],
                  interactive_due=float(len(by_kind["interactive"])), batch_queue=batch,
                  forecast_demand=forecast, forecast_interactive=[0.0] * len(forecast),
                  batch_policy="move", opp_unlimited=False, opp_queue=float(len(by_kind["opportunistic"])))


def plan(inputs):
    """What the loop does with one tick's inputs: {placed, signal, decision, run}."""
    placed = place(inputs)
    queued = {q["id"]: q for q in inputs["queue"]}
    jobs = list(inputs["jobs"]) + [{**queued[p["job"]], "server": p["server"], "agent": False}
                                   for p in placed if p["to"] == "house"]
    signal = signal_for(inputs, jobs)
    d = decide(signal)
    want = {"interactive": d.interactive, "batch": d.batch, "opportunistic": d.opportunistic}
    run = []
    for kind in KINDS:
        run += [j["id"] for j in sorted((j for j in jobs if j["kind"] == kind), key=_rank)][:want[kind]]
    return dict(placed=placed, signal=asdict(signal), decision=asdict(d), run=run)


def hours_between(start_iso, end_iso):
    """Hours from one ISO 8601 instant to another, to two decimals (negative when past)."""
    a, b = datetime.fromisoformat(start_iso), datetime.fromisoformat(end_iso)
    return round((b - a).total_seconds() / 3600, 2)


def job_inputs(job, now_iso):
    """A jobs row as plan() reads it: left_h from server_hours less the time it has run."""
    left = None
    if job.get("server_hours") is not None:
        left = round(max(0.0, job["server_hours"] - (job.get("active_cpu_s") or 0.0) / 3600), 4)
    due = None if not job.get("deadline_at") else hours_between(now_iso, job["deadline_at"])
    return dict(id=job["id"], kind=job["kind"], left_h=left, deadline_h=due,
                privacy=job.get("privacy") or "any", site=job.get("site_id"))


def tank_after(soc, running, heat_per_server, demand, tank):
    """The tank at the end of the hour, the way the house model keeps its books (sim.House.apply).

    Returns (soc, served, dumped, backup)."""
    produced = running * heat_per_server
    served = min(demand, produced + soc)
    after = soc + produced - served
    dumped = max(0.0, after - tank)
    return min(after, tank), served, dumped, demand - served


def local_iso(naive):
    """A profile time (Basel local, no zone) as ISO 8601 with its offset."""
    t = naive if isinstance(naive, datetime) else datetime.fromisoformat(str(naive))
    return t.replace(tzinfo=ZURICH).isoformat()
