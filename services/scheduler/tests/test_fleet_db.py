import json
from pathlib import Path

import pandas as pd

from heatsched.fleet_db import TAG, rows_for_hour, ts, uid

HOST, BUYER = "host", "buyer"
SERVER = json.loads((Path(__file__).parent.parent / "config.json").read_text())["server"]
SITES = pd.DataFrame(
    dict(
        id=["house-01", "house-02"],
        name=["Synthetic house 01", "Synthetic house 02"],
        city=["Basel", "Basel"],
        latitude=[47.56, 47.55],
        longitude=[7.59, 7.60],
        servers=[2, 1],
        tank_kwh=[30.0, 20.0],
        hot_water_kwh_per_day=[12.0, 8.0],
    )
)
JOBS = pd.DataFrame(
    dict(
        job_id=["run", "moved", "done", "waits", "later"],
        kind=["batch", "interactive", "backlog", "backlog", "batch"],
        arrival=["2025-07-15 17:00", "2025-07-15 18:00", "2025-07-15 16:00", "2025-07-15 16:00", "2025-07-15 19:00"],
        server_hours=[3, 1, 1, 2, 2],
        deadline=["2025-07-16 05:00", "2025-07-15 19:00", "2025-07-17 16:00", "2025-07-17 16:00", "2025-07-16 07:00"],
        ran_at=["house-01", "datacentre", "house-02", "house-02", "house-01"],
        house_hours=[3, 0, 1, 1, 2],
        moved_offsite=[False, True, False, False, False],
        moved_at=[None, "2025-07-15 18:00", None, None, None],
        finished_at=["2025-07-15 20:00", "2025-07-15 19:00", "2025-07-15 17:00", None, "2025-07-15 21:00"],
    )
)
PLACEMENTS = pd.DataFrame(
    dict(
        hour=[16, 16, 17, 18, 18],
        job_id=["done", "waits", "run", "moved", "run"],
        kind=["backlog", "backlog", "batch", "interactive", "batch"],
        site_id=["house-02", "house-02", "house-01", "datacentre", "house-01"],
    )
)
HOURLY = pd.DataFrame(
    dict(
        time=[f"2025-07-15 {h:02d}:00" for h in (16, 16, 18, 18)],
        hour=[16, 16, 18, 18],
        site_id=["house-01", "house-02", "house-01", "house-02"],
        running=[0, 2, 1, 0],
        demand_kwh=[0.5] * 4,
        heat_produced=[0.0, 1.6, 0.8, 0.0],
        heat_used=[0.0, 1.6, 0.8, 0.0],
        served_kwh=[0.5] * 4,
        backup_kwh=[0.0] * 4,
        dumped_kwh=[0.0] * 4,
        soc_kwh=[10.0, 11.1, 10.3, 10.6],
    )
)


def rows() -> dict:
    return rows_for_hour(SITES, JOBS, PLACEMENTS, HOURLY, 18, SERVER, HOST, BUYER)


def test_each_job_shows_where_it_is_at_that_hour() -> None:
    jobs = {j["label"].split()[-3]: j for j in rows()["jobs"]}
    assert set(jobs) == {"run", "moved", "done", "waits"}  # "later" has not arrived at 18:00
    assert jobs["run"]["state"] == "RUNNING"
    assert jobs["run"]["site_id"] == uid("site", "house-01")
    assert jobs["run"]["server_id"] == uid("server", "house-01", 1)
    assert jobs["run"]["active_cpu_s"] == 3600.0  # one hour (17:00) before this one
    assert jobs["moved"]["state"] == "GONE" and jobs["moved"]["moved_offsite"]
    assert jobs["moved"]["site_id"] is None and jobs["moved"]["server_id"] is None
    assert jobs["done"]["state"] == "GONE" and jobs["done"]["site_id"] == uid("site", "house-02")
    assert jobs["waits"]["state"] == "QUEUED" and jobs["waits"]["site_id"] == uid("site", "house-02")
    assert all(j["label"].endswith(TAG) and j["buyer_id"] == BUYER for j in jobs.values())
    assert jobs["moved"]["kind"] == "interactive" and not jobs["moved"]["interruptible"]
    assert jobs["done"]["kind"] == "opportunistic"


def test_servers_run_only_where_a_job_runs_this_hour() -> None:
    servers = {(s["site_id"], s["slot"]): s["state"] for s in rows()["servers"]}
    assert servers == {
        (uid("site", "house-01"), 1): "RUNNING",
        (uid("site", "house-01"), 2): "OFF",
        (uid("site", "house-02"), 1): "OFF",
    }


def test_servers_take_their_power_from_the_config() -> None:
    for s in rows()["servers"]:
        assert (s["power_kw"], s["heat_recovery"], s["idle_power_kw"]) == (
            SERVER["power_kw"],
            SERVER["heat_recovery"],
            SERVER["idle_power_kw"],
        )


def test_houses_are_synthetic_and_heat_has_local_times() -> None:
    out = rows()
    assert [s["name"] for s in out["sites"]] == ["Synthetic house 01, fleet run", "Synthetic house 02, fleet run"]
    assert all(s["host_id"] == HOST for s in out["sites"])
    heat = out["heat_state"]
    assert heat[0]["time"] == "2025-07-15T16:00:00+02:00"
    assert heat[1]["opportunistic"] == 2 and heat[2]["batch"] == 1
    assert ts("2025-01-13 18:00") == "2025-01-13T18:00:00+01:00"
