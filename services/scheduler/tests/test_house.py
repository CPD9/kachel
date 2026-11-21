import json
from pathlib import Path

import pytest

from heatsched import house

CFG = json.loads((Path(__file__).parent.parent / "config.json").read_text())

# Space heating per m², single-family house: 156 kWh times the period's factor (config.json: house_quality).
TABLE = {
    "before_1919": 138.84,
    "1919_1945": 182.52,
    "1946_1960": 182.52,
    "1961_1970": 179.4,
    "1971_1980": 179.4,
    "1981_1990": 126.36,
    "1991_2000": 82.68,
    "2001_2005": 65.52,
    "2006_2010": 65.52,
    "2011_2015": 51.48,
    "after_2015": 48.36,
}


@pytest.mark.parametrize(("period", "kwh_per_m2"), TABLE.items())
def test_space_heating_per_m2_by_period(period: str, kwh_per_m2: float) -> None:
    d = house.heat_demand(CFG, 1.0, period)
    assert d["space_heating_kwh"] == pytest.approx(kwh_per_m2)
    assert d["hot_water_kwh"] == 12


def test_every_period_has_a_factor() -> None:
    assert set(house.PERIODS) == set(CFG["house_quality"]["period_factor"])
    assert set(house.GBAUP.values()) == set(house.PERIODS)


def test_the_1960s_need_more_than_three_times_a_new_house() -> None:
    old = house.heat_demand(CFG, 150, "1961_1970")["space_heating_kwh"]
    new = house.heat_demand(CFG, 150, "after_2015")["space_heating_kwh"]
    assert old / new == pytest.approx(1.15 / 0.31)


def test_renovation_halves_space_heating_but_not_below_a_new_house() -> None:
    old = house.heat_demand(CFG, 200, "1961_1970")
    done = house.heat_demand(CFG, 200, "1961_1970", renovated=True)
    assert done["space_heating_kwh"] == pytest.approx(old["space_heating_kwh"] / 2)
    assert done["hot_water_kwh"] == old["hot_water_kwh"]
    newer = house.heat_demand(CFG, 200, "2011_2015", renovated=True)
    assert newer["space_heating_kwh"] == pytest.approx(house.heat_demand(CFG, 200, "after_2015")["space_heating_kwh"])


def test_flats_use_their_own_figures() -> None:
    d = house.heat_demand(CFG, 1000, "1971_1980", kind="multi")
    assert d["space_heating_kwh"] == pytest.approx(1000 * 94 * 1.15)
    assert d["total_kwh"] == pytest.approx(1000 * (94 * 1.15 + 16))


def test_period_from_the_register() -> None:
    assert house.period_of(gbauj=1874) == "before_1919"
    assert house.period_of(gbauj=1919) == "1919_1945"
    assert house.period_of(gbauj=1985) == "1981_1990"
    assert house.period_of(gbauj=2024) == "after_2015"
    assert house.period_of(gbaup=8018) == "1991_2000"
    assert house.period_of(gbaup=8023, gbauj=1999) == "1991_2000"  # the year wins
    assert house.period_of() is None
    assert house.kind_of(1110) == "single"
    assert house.kind_of(1122) == "multi"
    assert house.kind_of(1220) == "office"
    assert house.kind_of(1242) is None  # a garage
    assert set(house.USE_OF_GKLAS.values()) == set(CFG["house_quality"]["space_heating_kwh_per_m2"])
