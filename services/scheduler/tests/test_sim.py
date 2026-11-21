import json
from pathlib import Path

import pandas as pd
import pytest

from heatsched import profile
from heatsched.sim import House, kpis

HERE = Path(__file__).parent
CFG = json.loads((HERE.parent / "config.json").read_text())


@pytest.fixture(scope="module")
def basel() -> pd.DataFrame:
    return profile.build_profile(pd.read_csv(HERE / "data" / "weather_basel_2025.csv"), CFG)


def test_basel_2025_profile_matches_the_case(basel: pd.DataFrame) -> None:
    heating_days = int(basel.groupby("date")["heating_day"].first().sum())
    assert heating_days == 206
    assert basel["heat_kwh"].sum() == pytest.approx(27_000, rel=0.02)
    assert basel["dhw_kwh"].sum() == pytest.approx(12 * 365)


def test_kpis_balance_the_books(basel: pd.DataFrame) -> None:
    df = House(basel, CFG, 6).run()
    k = kpis(df, CFG, 6)
    produced = df["heat_produced"].sum()
    assert produced == pytest.approx(df["heat_used"].sum() + k["heat_dumped_kwh"], abs=0.1)
    assert df["served_kwh"].sum() + df["backup_kwh"].sum() == pytest.approx(k["heat_demand_kwh"], abs=1)
    assert 0 < k["share_of_heat_covered_pct"] <= 100
    assert k["electricity_cost_chf"] == round(k["server_hours_sold"] * CFG["prices"]["electricity_chf_per_kwh"])


def test_break_even_is_cost_minus_heat_value_per_server_hour() -> None:
    df = pd.DataFrame(
        dict(
            server_hours=[2, 0],
            served_kwh=[1.6, 0.0],
            demand_kwh=[1.6, 1.0],
            dumped_kwh=[0.0, 0.0],
            backup_kwh=[0.0, 1.0],
            missed=[0, 0],
            moved=[0, 0],
            arr_interactive=[0, 0],
            arr_batch=[0, 0],
        )
    )
    k = kpis(df, CFG, 1)
    p, cop = CFG["prices"]["electricity_chf_per_kwh"], CFG["prices"]["heat_pump_cop"]
    assert k["break_even_chf_per_server_hour"] == round((2 * p - 1.6 * p / cop) / 2, 4)
