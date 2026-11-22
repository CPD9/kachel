import pytest

from heatsched.fleet import (
    DATACENTRE,
    Job,
    Placement,
    Site,
    Waiting,
    apply_hour,
    kpis,
    place_hour,
    run,
)

H = 0.8  # kWh of heat per server-hour (config.json: server)


def site(sid: str, demand: float, hours: int = 24, n: int = 4, tank: float = 0.0) -> Site:
    return Site(sid, n, tank, H, tuple([demand] * hours))


def job(jid: str, hours: int = 1, deadline: int | None = 10, arrival: int = 0, home: str = "") -> Job:
    return Job(jid, "batch", arrival, hours, deadline, home)


def test_a_job_goes_to_the_house_that_needs_its_heat_most() -> None:
    sites = [site("cold", 3.0), site("mild", 1.0)]
    placed, waiting, missed = place_hour(sites, {}, [Waiting(job("a"), 1)], 0)
    assert [(p.job_id, p.site_id) for p in placed] == [("a", "cold")]
    assert waiting == [] and missed == []


def test_jobs_spread_as_each_house_fills() -> None:
    # 1.7 kWh of room takes two servers' heat (1.6 kWh); 0.9 kWh takes one.
    sites = [site("a", 1.7), site("b", 0.9)]
    queue = [Waiting(job(f"j{i}"), 1) for i in range(4)]
    placed, waiting, _ = place_hour(sites, {}, queue, 0)
    assert sorted(p.site_id for p in placed) == ["a", "a", "b"]
    assert len(waiting) == 1


def test_no_job_lands_where_its_heat_has_nowhere_to_go() -> None:
    full = site("full", 0.0, tank=10.0)
    placed, waiting, _ = place_hour([full], {"full": 10.0}, [Waiting(job("a"), 1)], 0)
    assert placed == []
    assert [w.job.id for w in waiting] == ["a"]


def test_a_job_with_no_slack_and_no_house_goes_to_the_data_centre() -> None:
    full = site("full", 0.0)
    w = Waiting(job("late", hours=3, deadline=3), 3)
    placed, waiting, missed = place_hour([full], {}, [w], 0)
    assert [(p.site_id, p.hours) for p in placed] == [(DATACENTRE, 3)]
    assert waiting == [] and missed == []


def test_without_a_data_centre_it_runs_and_dumps_or_misses() -> None:
    full = site("full", 0.0, n=1)
    queue = [Waiting(job("a", deadline=1), 1), Waiting(job("b", deadline=1), 1)]
    placed, _, missed = place_hour([full], {}, queue, 0, datacentre=False)
    assert [(p.job_id, p.reason) for p in placed] == [("a", "deadline: run and dump heat")]
    assert missed == ["b"]


def test_least_slack_goes_first() -> None:
    one = site("one", 0.8, n=1)
    queue = [Waiting(job("relaxed", deadline=20), 1), Waiting(job("urgent", deadline=2), 1)]
    placed, waiting, _ = place_hour([one], {}, queue, 0)
    assert [p.job_id for p in placed] == ["urgent"]
    assert [w.job.id for w in waiting] == ["relaxed"]


def test_a_running_job_stays_on_its_house_while_there_is_room() -> None:
    sites = [site("big", 5.0), site("small", 1.0)]
    placed, _, _ = place_hour(sites, {}, [Waiting(job("a", hours=2), 1, last_site="small")], 0)
    assert placed[0].site_id == "small"


def test_home_routing_keeps_a_job_on_the_house_it_was_sent_to() -> None:
    sites = [site("cold", 3.0), site("full", 0.0)]
    w = Waiting(job("a", deadline=1, home="full"), 1)
    fleet, _, _ = place_hour(sites, {}, [w], 0)
    home, _, _ = place_hour(sites, {}, [w], 0, routing="home")
    assert fleet[0].site_id == "cold"
    assert home[0].site_id == DATACENTRE


def private(jid: str, privacy: str, home: str = "", deadline: int = 1) -> Waiting:
    return Waiting(Job(jid, "batch", 0, 1, deadline, home, privacy), 1)


def test_a_swiss_job_stays_on_the_houses_and_never_goes_to_the_data_centre() -> None:
    full = site("full", 0.0, n=1)
    placed, _, missed = place_hour([full], {}, [private("a", "swiss"), private("b", "swiss")], 0)
    assert [(p.job_id, p.site_id, p.reason) for p in placed] == [("a", "full", "deadline: run and dump heat")]
    assert missed == ["b"]


def test_a_swiss_job_still_goes_where_its_heat_is_needed() -> None:
    sites = [site("cold", 3.0), site("mild", 1.0)]
    placed, _, _ = place_hour(sites, {}, [private("a", "swiss", deadline=10)], 0)
    assert placed[0].site_id == "cold"


def test_a_site_job_runs_only_on_its_own_house() -> None:
    sites = [site("cold", 3.0), site("own", 0.0, n=1)]
    placed, _, _ = place_hour(sites, {}, [private("a", "site", home="own")], 0)
    assert [(p.site_id, p.reason) for p in placed] == [("own", "deadline: run and dump heat")]


def test_a_site_job_with_slack_waits_for_its_own_house() -> None:
    sites = [site("cold", 3.0), site("own", 0.0)]
    placed, waiting, _ = place_hour(sites, {}, [private("a", "site", home="own", deadline=10)], 0)
    assert placed == [] and [w.job.id for w in waiting] == ["a"]


def test_a_site_job_on_a_full_house_misses_rather_than_leaves() -> None:
    sites = [site("cold", 3.0), site("own", 0.0, n=0)]
    placed, _, missed = place_hour(sites, {}, [private("a", "site", home="own")], 0)
    assert placed == [] and missed == ["a"]


def test_the_heat_books_balance() -> None:
    s = site("a", 1.0, tank=1.0, n=4)
    soc, rows = apply_hour([s], {"a": 0.5}, [_p("x", "a"), _p("y", "a"), _p("z", "a")], 0)
    (r,) = rows
    assert r["heat_produced"] == pytest.approx(2.4)
    # 1.0 served, 0.5 + 2.4 - 1.0 = 1.9 in a 1.0 kWh tank: 0.9 dumped.
    assert r["served_kwh"] == pytest.approx(1.0)
    assert r["dumped_kwh"] == pytest.approx(0.9)
    assert r["heat_produced"] == pytest.approx(r["heat_used"] + r["dumped_kwh"])
    assert soc["a"] == pytest.approx(1.0)


def test_a_run_places_every_job_and_counts_moves() -> None:
    # Hours 0 to 5 are cold, then no heat is wanted at all.
    s = Site("a", 2, 0.0, H, tuple([1.6] * 6 + [0.0] * 18))
    jobs = [job("early", hours=4, deadline=12), job("big", hours=8, deadline=12)]
    books, rows, _, _ = run([s], jobs, 0, 24)
    assert books["early"].house_hours == 4 and books["early"].moved_at is None
    # "big" has less slack, so it runs every warm hour (0 to 5), waits while it still can and
    # moves its last 2 server-hours at hour 10, the last hour that still meets its deadline.
    assert books["big"].house_hours == 6
    assert books["big"].datacentre_hours == 2
    assert books["big"].moved_at == 10
    assert books["big"].finished_at == 12
    k = kpis(books, rows)
    assert k["jobs_moved_offsite"] == 1
    assert k["server_hours_in_houses"] == 10
    assert k["server_hours_in_datacentre"] == 2
    assert k["compute_heat_used_pct"] == pytest.approx(83.3)
    assert k["deadline_misses"] == 0 and k["jobs_unfinished"] == 0


def test_the_fleet_uses_heat_a_single_house_cannot() -> None:
    sites = [site("cold", 1.6, n=2), site("warm", 0.0, n=2)]
    jobs = [job(f"j{i}", deadline=1, home="warm") for i in range(2)]
    fleet = kpis(*run(sites, jobs, 0, 2)[:2])
    home = kpis(*run(sites, jobs, 0, 2, routing="home")[:2])
    assert fleet["compute_heat_used_pct"] == 100.0 and fleet["jobs_moved_offsite"] == 0
    assert home["compute_heat_used_pct"] == 0.0 and home["jobs_moved_offsite"] == 2


def test_kpis_follow_the_jobs_that_arrived_in_the_window() -> None:
    # One warm hour, then none. "late" arrives in the window and moves after it; "early"
    # arrived before the window and ran in it. Only "late" is the window's job.
    s = Site("a", 1, 0.0, H, (0.8, 0.8, 0.0, 0.0, 0.0, 0.0))
    jobs = [job("early", deadline=6, arrival=0), job("late", hours=2, deadline=5, arrival=1)]
    books, rows, _, _ = run([s], jobs, 0, 6)
    k = kpis(books, rows, range(1, 2))
    assert k["jobs"] == 1
    assert books["late"].moved_at == 4
    assert k["server_hours_in_houses"] == 1 and k["server_hours_in_datacentre"] == 1
    assert k["compute_heat_used_pct"] == pytest.approx(50.0)
    assert k["jobs_moved_offsite"] == 1


def _p(jid: str, sid: str) -> Placement:
    return Placement(jid, sid, 1, "test")
