"""The pure parts of measure_ai.py: the fixed inputs and the energy integral."""

import json
from pathlib import Path

import pytest

from measure_ai import energy_wh, prompts, texts

SUMMARY = Path(__file__).resolve().parents[3] / "docs" / "measurements" / "ai-summary.json"
CONFIG = Path(__file__).resolve().parents[1] / "config.json"


def test_texts_are_the_same_on_every_run():
    a, b = texts(50), texts(50)
    assert a == b
    assert all(len(t.split()) == 40 for t in a)
    assert len(set(a)) == 50


def test_prompts_are_fixed():
    assert len(prompts()) == 24
    assert prompts() == prompts()


def test_energy_of_a_flat_draw():
    samples = [(t / 10, 100.0) for t in range(0, 361)]  # 100 W for 36 s
    assert energy_wh(samples, 0, 36) == pytest.approx(1.0)


def test_energy_holds_the_edges_flat():
    # Samples start late and stop early: the first and last readings are held to the window's edges.
    assert energy_wh([(1.0, 50.0), (2.0, 50.0)], 0, 72) == pytest.approx(1.0)


def test_energy_of_a_ramp():
    assert energy_wh([(0.0, 0.0), (3600.0, 2.0)], 0, 3600) == pytest.approx(1.0)


def test_config_cites_the_measurement():
    summary = json.loads(SUMMARY.read_text())
    jobs = json.loads(CONFIG.read_text())["jobs"]
    emb, inf = summary["embeddings"], summary["inference"]
    assert f"{emb['wh_per_job']}" in jobs["opportunistic"]["source"]
    assert "docs/measurements/ai-summary.json" in jobs["opportunistic"]["source"]
    assert f"{inf['wh_per_job']}" in jobs["interactive"]["source"]
    assert "docs/measurements/ai-summary.json" in jobs["interactive"]["source"]
    for name in summary["raw_samples"]:
        assert (SUMMARY.parent / name).stat().st_size > 0
