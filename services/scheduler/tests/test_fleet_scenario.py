import json
from pathlib import Path

import pandas as pd
import pytest

from heatsched import profile
from heatsched.fleet import kpis, run
from heatsched.fleet_scenario import make_jobs, make_sites

HERE = Path(__file__).parent
CFG = json.loads((HERE.parent / "config.json").read_text())
F = CFG["fleet"]


@pytest.fixture(scope="module")
def basel() -> pd.DataFrame:
    return profile.build_profile(pd.read_csv(HERE / "data" / "weather_basel_2025.csv"), CFG)


def test_houses_are_synthetic_and_drawn_from_the_config(basel: pd.DataFrame) -> None:
    sites = make_sites(basel, CFG)
    assert len(sites) == F["houses"]
    assert len({s.id for s in sites}) == len(sites)
    for s in sites:
        assert s.name.startswith("Synthetic house")
        assert F["servers_per_house"][0] <= s.n_servers <= F["servers_per_house"][1]
        assert F["tank_kwh"][0] <= s.tank_kwh <= F["tank_kwh"][1]
        assert F["cities"]["Basel"]["latitude"][0] <= s.lat <= F["cities"]["Basel"]["latitude"][1]
        assert len(s.demand) == len(basel)
    # The same seed gives the same fleet.
    assert make_sites(basel, CFG) == sites


def test_the_job_stream_matches_the_config(basel: pd.DataFrame) -> None:
    sites = make_sites(basel, CFG)
    jobs = make_jobs(sites, CFG, 24, 48)
    per_house = sum(F[f"{k}_jobs_per_house_per_day"] for k in ("interactive", "batch", "backlog"))
    assert len(jobs) == per_house * F["houses"]
    assert all(24 <= j.arrival < 48 and j.deadline >= j.arrival + j.hours for j in jobs)
    evening = [j.arrival - 24 for j in jobs if j.kind == "interactive"]
    assert min(evening) >= F["interactive_hours_of_day"][0] and max(evening) < F["interactive_hours_of_day"][1]


def test_july_moves_work_off_site_and_january_does_not(basel: pd.DataFrame) -> None:
    sites = make_sites(basel, CFG)
    days = profile.showcase_days(basel)
    result = {}
    for name, date in days.items():
        day0 = int(basel.index[basel["date"] == pd.Timestamp(date).date()][0])
        jobs = make_jobs(sites, CFG, day0 - 48, day0 + 24)
        books, rows, _, _ = run(sites, jobs, day0 - 48, day0 + 24 + 49)
        result[name] = kpis(books, rows, range(day0, day0 + 24))
    assert result["january"]["compute_heat_used_pct"] == 100.0
    assert result["january"]["jobs_moved_offsite"] == 0
    assert result["july"]["jobs_moved_offsite"] > 0
    for k in result.values():
        assert k["deadline_misses"] == 0 and k["jobs_unfinished"] == 0


def test_bern_houses_get_bern_weather_and_their_own_ids(basel: pd.DataFrame) -> None:
    bern = profile.build_profile(pd.read_csv(HERE / "data" / "weather_bern_2025.csv"), CFG)
    assert len(bern) == len(basel)
    assert (bern["time"] == basel["time"]).all()
    # Bern is colder than Basel over the year, so the same house needs more heat there.
    assert bern["heat_kwh"].sum() > basel["heat_kwh"].sum()
    houses = make_sites(bern, CFG, "Bern")
    assert all(s.city == "Bern" and s.id.startswith("bern-") for s in houses)
    assert all(s.name.startswith("Synthetic Bern house") for s in houses)
    lat = F["cities"]["Bern"]["latitude"]
    assert all(lat[0] <= s.lat <= lat[1] for s in houses)
    assert not {s.id for s in houses} & {s.id for s in make_sites(basel, CFG, "Basel")}
