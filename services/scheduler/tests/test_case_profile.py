"""The reference profile against the case's own CSV (#17).

The Open-Meteo profile (test_sim.py) stands in until the DigitalHeat case CSV arrives. Save it
as tests/data/case_profile.csv and it becomes the source (`run_year.py --profile`); these tests
then check that both profiles describe the same house. Until then they are skipped.
"""

import json
from pathlib import Path

import pandas as pd
import pytest

from heatsched import profile

HERE = Path(__file__).parent
CFG = json.loads((HERE.parent / "config.json").read_text())
CASE = HERE / "data" / "case_profile.csv"
# One tolerance for both profiles: energy within 5%, and heating days within 5% of the 206
# the Open-Meteo profile gives (about 10 days).
AGREE = 0.05

pytestmark = pytest.mark.skipif(not CASE.exists(), reason="the case CSV has not arrived yet")


@pytest.fixture(scope="module")
def both() -> tuple[pd.DataFrame, pd.DataFrame]:
    case = profile.load_case_profile(CASE, CFG)
    ours = profile.build_profile(profile.load_weather(HERE / "data" / "weather_basel_2025.csv"), CFG)
    return case, ours


def heating_days(df: pd.DataFrame) -> int:
    return int(df.groupby("date")["heating_day"].first().sum())


def test_case_csv_covers_a_whole_year(both: tuple[pd.DataFrame, pd.DataFrame]) -> None:
    case, _ = both
    assert case["date"].nunique() in (365, 366)


def test_case_csv_matches_the_brief(both: tuple[pd.DataFrame, pd.DataFrame]) -> None:
    case, _ = both
    assert case["heat_kwh"].sum() == pytest.approx(27_000, rel=AGREE)
    assert case["dhw_kwh"].sum() == pytest.approx(CFG["house"]["hot_water_kwh_per_day"] * 365, rel=AGREE)


def test_open_meteo_profile_agrees_with_the_case(both: tuple[pd.DataFrame, pd.DataFrame]) -> None:
    case, ours = both
    assert ours["heat_kwh"].sum() == pytest.approx(case["heat_kwh"].sum(), rel=AGREE)
    assert heating_days(ours) == pytest.approx(heating_days(case), rel=AGREE)
