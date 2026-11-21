import json
from pathlib import Path

import pandas as pd
import pytest

from heatsched.months import SUMS, city_year, shifted

HERE = Path(__file__).parent
CFG = json.loads((HERE.parent / "config.json").read_text())
SMALL = {**CFG, "fleet": {**CFG["fleet"], "houses": 2}}
OUT = HERE.parent / "out"


@pytest.fixture(scope="module")
def weather() -> pd.DataFrame:
    return pd.read_csv(HERE / "data" / "weather_basel_2025.csv")


@pytest.fixture(scope="module")
def as_it_was(weather: pd.DataFrame):
    return city_year(weather, SMALL, "Basel", 0)


@pytest.fixture(scope="module")
def warmer(weather: pd.DataFrame):
    return city_year(weather, SMALL, "Basel", 3)


def test_shift_moves_every_hour(weather: pd.DataFrame) -> None:
    out = shifted(weather, 2)
    assert (out["temp_c"] - weather["temp_c"]).round(1).eq(2).all()
    assert out["time"].equals(weather["time"])


def test_each_month_adds_up(as_it_was) -> None:
    sites, per_house, peak, temp = as_it_was
    for s in sites:
        m = per_house[s.id]
        assert m["demand_kwh"].sum() == pytest.approx(sum(s.demand), rel=1e-9)
        assert (m["served_kwh"] + m["backup_kwh"]).to_numpy() == pytest.approx(m["demand_kwh"].to_numpy())
        assert (m["server_hours"] <= s.n_servers * m["hours"]).all()
        assert m["hours"].sum() == 8760
    assert peak.max() <= sum(s.n_servers for s in sites)
    assert temp[1] < temp[7]


def test_warmer_means_less_heat_and_fewer_server_hours(as_it_was, warmer) -> None:
    sites, base, _, temp = as_it_was
    w_sites, warm, _, w_temp = warmer
    # Same houses: only the weather moved.
    assert [(s.id, s.n_servers, s.tank_kwh) for s in sites] == [(s.id, s.n_servers, s.tank_kwh) for s in w_sites]
    assert (w_temp - temp).round(1).eq(3).all()
    for s in sites:
        assert (warm[s.id]["demand_kwh"] <= base[s.id]["demand_kwh"] + 1e-9).all()
        assert warm[s.id]["demand_kwh"][1] < base[s.id]["demand_kwh"][1]
        assert warm[s.id]["server_hours"].sum() < base[s.id]["server_hours"].sum()


def test_the_committed_months_match_the_fleet() -> None:
    months = json.loads((OUT / "fleet_months.json").read_text())
    sites = pd.read_csv(OUT / f"{months['run']}_sites.csv").set_index("id")
    zero = months["offsets_c"].index(0)
    assert months["synthetic"] is True
    assert sum(months["hours"]) == 8760
    assert len(months["houses"]) == len(sites)
    for h in months["houses"]:
        site = sites.loc[h["id"]]
        assert (h["servers"], h["tank_kwh"], h["city"]) == (site["servers"], site["tank_kwh"], site["city"])
        # Monthly sums are rounded to whole kWh, so the year can be out by up to 6 kWh.
        assert abs(sum(h["demand_kwh"][zero]) - site["heat_demand_kwh_2025"]) <= 7
        for k in SUMS:
            assert len(h[k]) == len(months["offsets_c"]) and all(len(row) == 12 for row in h[k])
