import pytest

from heatsched.ledger import plain
from heatsched.live import hours_between, job_inputs, plan, tank_after
from heatsched.scheduler import Signal, decide

SERVERS = ["s1", "s2", "s3", "s4"]


def inputs(demand=9.0, soc=0.0, tank=35.0, jobs=(), queue=(), servers=SERVERS):
    return dict(
        site="house",
        time="2025-01-13T08:00:00+01:00",
        temp_c=-4.0,
        demand_kwh=demand,
        soc_kwh=soc,
        tank_kwh=tank,
        heat_per_server=0.8,
        forecast_demand=[demand] * 24,
        servers=list(servers),
        jobs=list(jobs),
        queue=list(queue),
    )


def job(id, kind="opportunistic", server=None, agent=False, left_h=None, deadline_h=None):
    return dict(id=id, kind=kind, server=server, agent=agent, left_h=left_h, deadline_h=deadline_h)


def test_plan_runs_decide_on_the_signal_it_logs():
    i = inputs(jobs=[job("a", server="s1"), job("b", server="s2")])
    out = plan(i)
    assert out["decision"] == plain(decide(Signal(**out["signal"])).__dict__)
    assert out["signal"]["opp_queue"] == 2 and out["signal"]["n_servers"] == 4
    assert out["signal"]["opp_unlimited"] is False


def test_a_cold_hour_runs_the_backlog():
    out = plan(inputs(jobs=[job("a", server="s1"), job("b", server="s2")]))
    assert out["decision"]["opportunistic"] == 2
    assert out["decision"]["reason"] == "heat needed"
    assert out["run"] == ["a", "b"]


def test_a_full_tank_in_summer_pauses_the_backlog():
    out = plan(inputs(demand=0.5, soc=35.0, jobs=[job("a", server="s1")]))
    assert out["decision"]["opportunistic"] == 0
    assert out["decision"]["reason"] == "tank full / no heat sink: backlog paused"
    assert out["run"] == []


def test_the_real_process_goes_first_in_its_kind():
    jobs = [job("301", server="s1"), job("302", server="s2"), job("304", server="s4", agent=True)]
    out = plan(inputs(demand=0.5, soc=34.0, jobs=jobs))
    assert out["decision"]["opportunistic"] == 1
    assert out["run"] == ["304"]


def test_sessions_then_batch_by_deadline_then_backlog():
    jobs = [
        job("late", "batch", "s1", left_h=2, deadline_h=30),
        job("soon", "batch", "s2", left_h=2, deadline_h=5),
        job("chat", "interactive", "s3", left_h=1),
        job("bg", server="s4"),
    ]
    out = plan(inputs(demand=0.9, soc=34.0, jobs=jobs))
    # room 0.9 + 1.0 = 1.9 kWh: the session (always), then one more server's heat (0.8 kWh)
    assert out["decision"]["interactive"] == 1 and out["decision"]["batch"] == 1
    assert out["run"] == ["chat", "soon"]


def test_queued_jobs_land_on_free_servers_when_their_heat_is_useful():
    queue = [
        dict(id="q-batch", kind="batch", left_h=3.0, deadline_h=20.0),
        dict(id="q-chat", kind="interactive", left_h=2.0, deadline_h=None),
    ]
    out = plan(inputs(jobs=[job("a", server="s1")], queue=queue))
    assert [(p["job"], p["server"], p["to"]) for p in out["placed"]] == [
        ("q-chat", "s2", "house"),
        ("q-batch", "s3", "house"),
    ]
    assert set(out["run"]) == {"a", "q-chat", "q-batch"}


def test_a_queued_job_waits_while_the_house_has_no_room_and_has_slack():
    queue = [dict(id="q", kind="batch", left_h=2.0, deadline_h=20.0)]
    out = plan(inputs(demand=0.5, soc=35.0, queue=queue))
    assert out["placed"] == []


def test_a_queued_job_out_of_slack_goes_to_a_data_centre():
    queue = [dict(id="q", kind="batch", left_h=3.0, deadline_h=2.0)]
    out = plan(inputs(demand=0.5, soc=35.0, queue=queue))
    assert out["placed"] == [dict(job="q", server=None, to="datacentre", reason="no house can use its heat in time")]


def test_no_free_server_no_placement():
    jobs = [job(f"j{n}", server=s) for n, s in enumerate(SERVERS)]
    out = plan(inputs(jobs=jobs, queue=[dict(id="q", kind="interactive", left_h=1.0, deadline_h=None)]))
    assert out["placed"] == []


def test_job_inputs_reads_what_is_left_and_the_deadline():
    row = dict(id="j", kind="batch", server_hours=8.0, active_cpu_s=3 * 3600.0, deadline_at="2025-01-13T20:00:00+01:00")
    assert job_inputs(row, "2025-01-13T08:00:00+01:00") == dict(id="j", kind="batch", left_h=5.0, deadline_h=12.0)
    assert job_inputs(dict(id="b", kind="opportunistic"), "2025-01-13T08:00:00+01:00")["left_h"] is None
    assert hours_between("2025-07-15T00:00:00+02:00", "2025-07-14T23:00:00+01:00") == 0.0


def test_the_tank_keeps_the_house_model_s_books():
    assert tank_after(34.9, 1, 0.8, 0.5, 35.0) == pytest.approx((35.0, 0.5, 0.2, 0.0))
    assert tank_after(0.0, 6, 0.8, 9.7, 35.0)[0] == 0.0
