import json
from pathlib import Path

import pandas as pd
import pytest

from heatsched import buildings, profile

HERE = Path(__file__).parent
CFG = json.loads((HERE.parent / "config.json").read_text())
SPEC = json.loads((HERE.parent / "buildings.json").read_text())


@pytest.fixture(scope="module")
def basel() -> pd.DataFrame:
    return profile.build_profile(pd.read_csv(HERE / "data" / "weather_basel_2025.csv"), CFG)


def test_a_building_gets_its_own_yearly_heat_and_hot_water(basel: pd.DataFrame) -> None:
    b = SPEC["buildings"]["bern_block"]
    p = buildings.building_profile(basel, b)
    assert p["heat_kwh"].sum() == pytest.approx(b["area_m2"] * b["space_heat_kwh_per_m2"] * b["climate_factor"])
    assert p["dhw_kwh"].sum() == pytest.approx(b["area_m2"] * b["hot_water_kwh_per_m2"])
    assert (p["demand_kwh"] == p["heat_kwh"] + p["dhw_kwh"]).all()
    assert p["heat_kwh"].idxmax() == basel["heat_kwh"].idxmax()  # same weather, same coldest hour


def test_the_tank_grows_with_demand(basel: pd.DataFrame) -> None:
    p = buildings.building_profile(basel, SPEC["buildings"]["fhnw_dreispitz"])
    c = buildings.building_config(CFG, basel, p)
    ratio = p["demand_kwh"].sum() / basel["demand_kwh"].sum()
    assert c["house"]["tank_kwh"] == pytest.approx(CFG["house"]["tank_kwh"] * ratio)
    assert CFG["house"]["tank_kwh"] == 35.0  # the original config is left alone


def test_the_reference_house_keeps_six_servers(basel: pd.DataFrame) -> None:
    ref = SPEC["buildings"]["basel_house"]
    assert buildings.building_profile(basel, ref) is basel
    assert buildings.servers_for(basel, CFG) == 6


def test_every_building_has_a_known_tariff_and_a_source() -> None:
    for b in SPEC["buildings"].values():
        assert b["default_tariff"] in SPEC["tariffs"]
        assert b["source"]
    for t in SPEC["tariffs"].values():
        assert 0.1 < t["chf_per_kwh"] < 0.5
        assert t["source"]
