"""The pure parts of measure_tagging.py, and the measured figures where the docs and config.json quote them."""

import json
from pathlib import Path

import numpy as np

from measure_tagging import HEIGHT, WIDTH, frames, summarise

ROOT = Path(__file__).resolve().parents[3]
SUMMARY = ROOT / "docs" / "measurements" / "tagging-summary.json"
CONFIG = Path(__file__).resolve().parents[1] / "config.json"


def test_frames_are_the_same_on_every_run():
    a, b = frames(3), frames(3)
    assert a.shape == (3, HEIGHT, WIDTH, 3)
    assert a.dtype == np.uint8
    assert np.array_equal(a, b)
    assert not np.array_equal(a[0], a[1])


def test_summary_is_the_mean_of_the_runs():
    runs = [
        {"wh_per_item": 0.002, "items_per_s": 20.0, "gpu_w_above_idle": 200.0},
        {"wh_per_item": 0.003, "items_per_s": 30.0, "gpu_w_above_idle": 210.0},
    ]
    s = summarise(runs)
    assert s["wh_per_1000_images"] == 2.5
    assert s["images_per_s"] == 25.0
    assert s["images_per_reference_server_hour"] == 400000
    assert s["spread_between_runs_pct"]["images_per_s"] == 40.0


def test_the_measurement_is_quoted_where_it_is_used():
    summary = json.loads(SUMMARY.read_text())
    tag = summary["image_tagging"]
    assert len(summary["runs"]) >= 2
    for name in summary["raw_samples"]:
        assert (SUMMARY.parent / name).stat().st_size > 0
    img = json.loads(CONFIG.read_text())["workloads"]["image_tagging"]
    assert img["measured_wh_per_1000_images"] == tag["wh_per_1000_images"]
    assert img["measured_images_per_server_hour"] == tag["images_per_reference_server_hour"]
    assert "docs/measurements/tagging-summary.json" in img["source"]
    assert img["measured_images_per_s"] == tag["images_per_s"]
    # The cited MLPerf figure stays next to ours.
    assert img["j_per_image"] == 0.4366
    for page in ("docs/job-types.md", "docs/measurements.md"):
        assert f"{tag['wh_per_1000_images']:.2f} Wh per 1,000 images" in (ROOT / page).read_text()
