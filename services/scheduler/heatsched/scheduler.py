"""The scheduler. ONE pure function, used by the yearly simulation AND the live demo.

Rule set (in priority order):
  1. Interactive sessions run now. If their heat has nowhere to go it is dumped.
  2. Deadline batch runs as early as its heat is useful (earliest deadline first).
     If it reaches its last possible hour without a heat sink -> policy: move / dump / miss.
  3. Opportunistic backlog fills whatever useful heat room is left, after keeping
     head-room in the tank for the interactive heat forecast to arrive soon.
     With roof PV, it also keeps tank room for the hours the sun is forecast to power the
     servers, so the tank fills on sunshine and not on bought power. That room never cuts
     into this hour's heat demand: the house is never left colder to wait for the sun.
  4. Nothing else runs. A server whose heat is not needed is off.
"""
from dataclasses import dataclass, field

@dataclass
class Signal:                 # what the scheduler sees each hour
    n_servers: int
    heat_per_server: float    # kWh of recoverable heat per server-hour
    demand_kwh: float         # space heat + hot water this hour
    soc_kwh: float            # tank state of charge
    tank_kwh: float
    interactive_due: float    # server-hours that must run this hour
    batch_queue: list         # [(hours_until_deadline, server_hours), ...] sorted by deadline
    forecast_demand: list     # next hours' demand (kWh)
    forecast_interactive: list  # next hours' interactive server-hours
    batch_policy: str = "move"
    opp_unlimited: bool = True
    opp_queue: float = 0.0
    forecast_pv: list = field(default_factory=list)  # next hours' servers own PV could power (0 without PV)

@dataclass
class Decision:
    interactive: int = 0
    batch: int = 0
    opportunistic: int = 0
    batch_moved: float = 0.0
    batch_missed: float = 0.0
    interactive_missed: float = 0.0
    reserve_kwh: float = 0.0
    reason: str = ""
    @property
    def running(self): return self.interactive + self.batch + self.opportunistic

def decide(s: Signal) -> Decision:
    d, h, eps = Decision(), s.heat_per_server, 1e-9
    room = s.demand_kwh + (s.tank_kwh - s.soc_kwh)        # heat that can be used or stored this hour

    # 1. interactive: always
    d.interactive = int(min(s.n_servers, round(s.interactive_due)))
    d.interactive_missed = s.interactive_due - d.interactive
    free = s.n_servers - d.interactive
    room -= d.interactive * h

    # head-room to keep for interactive heat that is coming (cumulative look-ahead)
    need = worst = 0.0
    for dem, inter in zip(s.forecast_demand, s.forecast_interactive):
        need += inter * h - dem
        worst = max(worst, need)
    # with PV: also keep room for the heat that sun-powered servers will make (never more than the tank has free)
    pv_need = pv_worst = 0.0
    for dem, inter, sun in zip(s.forecast_demand, s.forecast_interactive, s.forecast_pv):
        pv_need += max(inter, sun) * h - dem
        pv_worst = max(pv_worst, pv_need)
    must_make = max(0.0, s.demand_kwh - s.soc_kwh - d.interactive * h)   # heat the tank cannot cover this hour
    keep = -(-must_make // h) * h                                        # ... in whole server-hours
    pv_extra = min(max(0.0, pv_worst - worst), max(0.0, room - worst - keep))
    if any(dem > s.n_servers * h for dem in s.forecast_demand):
        pv_extra = 0.0                    # a cold hour is coming that needs a full tank: do not wait for the sun
    d.reserve_kwh = worst + pv_extra
    usable = room - d.reserve_kwh

    # 2. batch, earliest deadline first, while its heat is useful
    total_batch = sum(w for _, w in s.batch_queue)
    d.batch = int(max(0, min(free, total_batch, (usable + eps) // h)))
    # work that cannot wait any longer: more than the remaining hours can absorb
    urgent, cum = 0.0, 0.0
    for dl, w in s.batch_queue:
        cum += w
        urgent = max(urgent, cum - free * max(0, dl - 1))
    left = max(0.0, urgent - d.batch)
    if left > 0:
        if s.batch_policy == "dump":
            extra = int(min(free - d.batch, left)); d.batch += extra; left -= extra
            d.batch_missed = left
        elif s.batch_policy == "move":
            d.batch_moved = left
        else:
            d.batch_missed = left
    free -= d.batch
    usable -= d.batch * h

    # 3. opportunistic: only into useful heat
    want = free if s.opp_unlimited else min(free, s.opp_queue)
    d.opportunistic = int(max(0, min(want, (usable + eps) // h)))

    d.reason = ("heat needed" if d.opportunistic else
                "tank full / no heat sink: backlog paused" if usable < h else "no free server")
    return d
