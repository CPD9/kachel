import json
from pathlib import Path

import pytest

import economics

HERE = Path(__file__).parent
CFG = json.loads((HERE.parent / "config.json").read_text())
SUMMARY = json.loads((HERE.parent.parent.parent / "docs/economics/data/summary.json").read_text())


@pytest.mark.parametrize("case", ["low", "mid", "high"])
def test_six_1_kw_servers_are_the_reference_house(case: str) -> None:
    h = economics.hardware(CFG, case)
    assert round(h["capex"]) == SUMMARY["hardware"][case]["capex_chf"]
    assert round(h["per_year"]) == SUMMARY["hardware"][case]["hardware_chf_per_year"]


def test_the_servers_are_sold_at_the_end_of_their_life() -> None:
    mid = CFG["hardware"]["cases"]["mid"]
    h = economics.hardware(CFG, "mid")
    assert mid["lifetime_years"] == 6
    assert h["resale"] == pytest.approx(6 * mid["server_chf"] * mid["resale_share"])
    assert h["net_capex"] == pytest.approx(h["capex"] - h["resale"] * (1 + h["r"]) ** -h["life"])
    assert h["per_year"] == pytest.approx(h["net_capex"] * h["annuity"] + h["upkeep"])


def test_smaller_servers_cost_more_per_kw_for_their_water_loops() -> None:
    one = economics.hardware(CFG, "mid", n=6, kw=1.0)
    half = economics.hardware(CFG, "mid", n=12, kw=0.5)
    two = economics.hardware(CFG, "mid", n=3, kw=2.0)
    kit = CFG["hardware"]["cases"]["mid"]["cooling_kit_chf"]
    assert half["capex"] - one["capex"] == pytest.approx(6 * kit)
    assert one["capex"] - two["capex"] == pytest.approx(3 * kit)
    assert half["upkeep"] == pytest.approx(one["upkeep"])


def test_the_gpu_workstation_costs_its_full_price() -> None:
    kw = CFG["server"]["gpu_workstation_kw"]
    gpu = economics.hardware(CFG, "mid", n=6, kw=kw, gpu=True)
    mid = CFG["hardware"]["cases"]["mid"]
    one = economics.hardware(CFG, "mid")
    labour = one["capex"] - 6 * (mid["server_chf"] + mid["cooling_kit_chf"])
    assert gpu["capex"] == pytest.approx(6 * (mid["server_chf"] + mid["cooling_kit_chf"]) + labour * kw)
