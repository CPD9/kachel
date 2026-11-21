import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from heatsched import profile, solar
from heatsched.scheduler import Signal, decide
from heatsched.sim import House, kpis

HERE = Path(__file__).parent
CFG = json.loads((HERE.parent / "config.json").read_text())
WEATHER = profile.load_weather(HERE / "data" / "weather_basel_2025.csv")


def test_roof_yield_matches_pvgis_for_basel() -> None:
    s = {**CFG["solar"], "roof_kwp": 1.0}
    pv = solar.pv_kwh(WEATHER, s)
    # PVGIS 5.3 gives 1,160 kWh per kWp a year for Basel, 30 degrees south, 2005-2023.
    assert pv.sum() == pytest.approx(1160, rel=0.05)
    assert pv.min() >= 0
    assert pv.max() < 1.0


def test_pv_peaks_around_solar_noon_in_july() -> None:
    pv = solar.pv_kwh(WEATHER, CFG["solar"])
    july = WEATHER["time"].str.startswith("2025-07-15").to_numpy()
    peak_label = int(WEATHER.loc[july, "time"].str[11:13].iloc[int(np.argmax(pv[july]))])
    assert 12 <= peak_label <= 14  # labels end the hour; solar noon is about 12:30 at UTC+1


def test_own_power_balances_every_kwh() -> None:
    load = np.array([1.0, 3.0, 0.0, 2.0])
    pv = np.array([4.0, 1.0, 0.0, 0.0])
    f = solar.own_power(load, pv, battery_kwh=2.0, round_trip=0.81)
    assert np.allclose(f["pv_direct"] + f["from_battery"] + f["from_grid"], load)
    charged = (pv - f["pv_direct"] - f["exported"]).sum()
    assert f["from_battery"].sum() == pytest.approx(charged * 0.81 - f["battery_soc"].iloc[-1] * 0.9)
    assert f["battery_soc"].max() <= 2.0 + 1e-9


def test_without_a_battery_the_surplus_is_sold() -> None:
    f = solar.own_power([1.0], [3.0], battery_kwh=0.0, round_trip=0.9)
    assert (f["pv_direct"][0], f["exported"][0], f["from_grid"][0]) == (1.0, 2.0, 0.0)


def summer_signal(**over: object) -> Signal:
    base: dict[str, object] = dict(
        n_servers=6,
        heat_per_server=0.8,
        demand_kwh=0.5,
        soc_kwh=20.0,
        tank_kwh=35.0,
        interactive_due=0.0,
        batch_queue=[],
        forecast_demand=[0.5] * 6,
        forecast_interactive=[0] * 6,
    )
    base.update(over)
    return Signal(**base)  # type: ignore[arg-type]


def test_backlog_waits_for_the_sun_when_the_tank_can_carry_the_house() -> None:
    dark = decide(summer_signal())
    sunny_later = decide(summer_signal(forecast_pv=[0, 0, 6, 6, 6, 6]))
    assert dark.opportunistic > 0
    assert sunny_later.opportunistic == 0


def test_waiting_for_the_sun_never_leaves_the_house_cold() -> None:
    d = decide(summer_signal(soc_kwh=0.0, forecast_pv=[6] * 6))
    assert d.running * 0.8 >= 0.5


def test_no_waiting_for_the_sun_when_a_cold_hour_is_coming() -> None:
    cold = decide(summer_signal(forecast_demand=[0.5, 8.0, 0.5, 0.5, 0.5, 0.5], forecast_pv=[0, 0, 6, 6, 6, 6]))
    assert cold.opportunistic == decide(summer_signal(forecast_demand=[0.5, 8.0, 0.5, 0.5, 0.5, 0.5])).opportunistic


def test_preferring_the_sun_keeps_the_heat_and_uses_more_of_it() -> None:
    basel = profile.build_profile(pd.read_csv(HERE / "data" / "weather_basel_2025.csv"), CFG)
    pv = solar.pv_kwh(WEATHER, CFG["solar"])
    plain, pref = House(basel, CFG, 6).run(), House(basel, CFG, 6, pv=pv).run()
    k_plain, k_pref = kpis(plain, CFG, 6), kpis(pref, CFG, 6)
    assert k_pref["share_of_heat_covered_pct"] >= k_plain["share_of_heat_covered_pct"] - 0.2

    def on_sun(df: pd.DataFrame) -> float:
        return float(np.minimum(df["server_hours"].to_numpy(), pv).sum())

    assert on_sun(pref) > on_sun(plain)
