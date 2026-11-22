import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from heatsched import profile as P
from heatsched.ledger import Ledger, read, verify
from heatsched.live import ZURICH, plan
from heatsched.live_db import SupabaseError
from heatsched.live_loop import DbHeat, Loop, ReplayHeat, write_signal

CFG = json.loads((Path(__file__).parent.parent / "config.json").read_text())
SITE = "house"
AGENT_JOB = "304"


class FakeSupabase:
    """The loop's store in memory: the seed's reference house in miniature."""

    def __init__(self, heat=()):
        self.servers = {
            f"s{n}": dict(id=f"s{n}", slot=n, name=f"Server {n}", state="OFF", power_kw=1.0, heat_recovery=0.8)
            for n in range(1, 5)
        }
        self.jobs = {
            "301": dict(
                id="301",
                kind="opportunistic",
                state="RUNNING",
                label="Backlog 1",
                site_id=SITE,
                server_id="s1",
                server_hours=None,
                deadline_at=None,
                active_cpu_s=0.0,
            ),
            "303": dict(
                id="303",
                kind="batch",
                state="RUNNING",
                label="Batch",
                site_id=SITE,
                server_id="s3",
                server_hours=2.0,
                deadline_at="2025-01-14T08:00:00+01:00",
                active_cpu_s=0.0,
            ),
            AGENT_JOB: dict(
                id=AGENT_JOB,
                kind="opportunistic",
                state="PAUSED",
                label="Backlog 3",
                site_id=SITE,
                server_id="s4",
                server_hours=None,
                deadline_at=None,
                active_cpu_s=0.0,
            ),
            "new": dict(
                id="new",
                kind="batch",
                state="QUEUED",
                label="From the console",
                site_id=None,
                server_id=None,
                server_hours=1.0,
                deadline_at="2025-01-14T08:00:00+01:00",
                active_cpu_s=0.0,
            ),
            "fleet": dict(
                id="fleet",
                kind="batch",
                state="QUEUED",
                label="Sweep (synthetic)",
                site_id=None,
                server_id=None,
                server_hours=4.0,
                deadline_at=None,
                active_cpu_s=0.0,
            ),
        }
        for j in self.jobs.values():
            if j["server_id"]:
                self.servers[j["server_id"]]["state"] = j["state"]
        self.heat = list(heat)
        self.decisions, self.writes, self.down = [], [], False

    def house(self, site_id):
        return dict(id=SITE, name="Reference house", tank_kwh=35.0, servers=list(self.servers.values()))

    def house_jobs(self, server_ids):
        return [
            dict(j) for j in self.jobs.values() if j["server_id"] in server_ids and j["state"] in ("RUNNING", "PAUSED")
        ]

    def queued(self, site_id):
        return [dict(j) for j in self.jobs.values() if j["state"] == "QUEUED" and j["server_id"] is None]

    def heat_rows(self, site_id, start, end):
        a, b = datetime.fromisoformat(start), datetime.fromisoformat(end)
        return [r for r in self.heat if a <= datetime.fromisoformat(r["time"]) < b]

    def update_job(self, job_id, fields):
        self.writes.append(("jobs", job_id, fields))
        self.jobs[job_id].update(fields)

    def update_server(self, server_id, fields):
        self.writes.append(("servers", server_id, fields))
        self.servers[server_id].update(fields)

    def add_decision(self, row):
        if self.down:
            raise SupabaseError("POST decisions: connection refused")
        self.decisions.append(row)


def heat(hour, demand, soc):
    t = datetime(2025, 1, 13, hour, tzinfo=ZURICH).isoformat()
    return dict(time=t, temp_c=-4.0, demand_kwh=demand, soc_kwh=soc, forecast_demand=[demand] * 24)


@pytest.fixture
def setup(tmp_path):
    store = FakeSupabase()
    signal = tmp_path / "heat"
    said = []
    loop = Loop(store, SITE, Ledger(tmp_path / "decisions.jsonl"), {AGENT_JOB: signal}, say=said.append)
    return store, loop, signal, tmp_path / "decisions.jsonl", said


def test_a_cold_hour_runs_the_real_job_and_places_the_console_job(setup):
    store, loop, signal, _, said = setup
    entry = loop.tick(heat(8, 9.7, 0.0))
    lines = signal.read_text().splitlines()
    assert lines == ["run", "heat needed", entry["hash"]]
    # the agent's job and server are left to the agent
    assert not any(w[1] in (AGENT_JOB, "s4") for w in store.writes)
    # the console job lands on the free server and runs; the made-up fleet job is not placed
    new = store.jobs["new"]
    assert (new["site_id"], new["server_id"], new["state"]) == (SITE, "s2", "RUNNING")
    assert store.jobs["fleet"]["state"] == "QUEUED"
    assert store.servers["s2"]["state"] == "RUNNING"
    # a running simulated job gains an hour of run time
    assert store.jobs["301"]["active_cpu_s"] == 3600.0
    assert store.decisions[0]["hash"] == entry["hash"] and store.decisions[0]["opportunistic"] == 2
    assert said and entry["hash"][:12] in said[0]


def test_a_full_tank_pauses_the_backlog_by_itself_and_demand_brings_it_back(setup):
    store, loop, signal, log, _ = setup
    loop.tick(heat(0, 0.5, 35.0))
    assert signal.read_text().splitlines()[:2] == ["pause", "tank full / no heat sink: backlog paused"]
    assert store.jobs["301"]["state"] == "PAUSED" and store.servers["s1"]["state"] == "PAUSED"
    loop.tick(heat(1, 9.7, 20.0))
    assert signal.read_text().splitlines()[0] == "run"
    assert store.jobs["301"]["state"] == "RUNNING"
    assert verify(read(log), plan) == []


def test_a_finished_job_is_done_and_its_server_off(setup):
    store, loop, _, _, said = setup
    for hour in range(4):
        loop.tick(heat(hour, 9.7, 0.0))
    assert store.jobs["303"]["state"] == "GONE" and store.servers["s3"]["state"] == "OFF"
    assert store.jobs["new"]["state"] == "GONE"
    assert any("done" in s for s in said)


def test_the_loop_carries_on_when_the_mirror_is_down(setup):
    store, loop, _, log, said = setup
    store.down = True
    loop.tick(heat(8, 9.7, 0.0))
    assert len(read(log)) == 1 and store.decisions == []
    assert any("could not mirror" in s for s in said)


def test_write_signal_replaces_the_file_in_one_step(tmp_path):
    path = tmp_path / "heat"
    write_signal(path, False, "tank full\nabc\n")
    write_signal(path, True)
    assert path.read_text() == "run\n"
    assert [p.name for p in tmp_path.iterdir()] == ["heat"]


def test_replay_starts_from_the_yearly_model_and_keeps_its_own_tank():
    prof = P.build_profile(P.synthetic_weather(), CFG)
    replay = ReplayHeat(prof, CFG, 6)
    hours = replay.day("2025-01-03")
    assert len(hours) == 24
    first = replay.at(hours[0])
    assert first["time"] == "2025-01-03T00:00:00+01:00" and len(first["forecast_demand"]) == 24
    replay.after(dict(first, demand_kwh=0.5, soc_kwh=30.0), running=6, heat_per_server=0.8, tank=35.0)
    assert replay.at(hours[1])["soc_kwh"] == 34.3


def test_db_heat_reads_the_clock_s_hour_and_the_tank_before_it():
    rows = [
        dict(
            time=datetime(2025, 1, 13, h, tzinfo=ZURICH).isoformat(),
            temp_c=-3.0 + h,
            demand_kwh=9.0 - h / 10,
            soc_kwh=float(h),
        )
        for h in range(6, 12)
    ]
    source = DbHeat(FakeSupabase(heat=rows), SITE)
    now = datetime(2025, 1, 13, 8, 25, tzinfo=ZURICH)
    got = source.at(now)
    assert got["time"] == "2025-01-13T08:00:00+01:00"
    assert got["soc_kwh"] == 7.0 and got["temp_c"] == 5.0 and got["demand_kwh"] == 8.2
    assert got["forecast_demand"] == [8.1, 8.0, 7.9]
    assert source.at(now + timedelta(hours=6)) is None
