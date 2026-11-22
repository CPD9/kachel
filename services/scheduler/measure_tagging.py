"""Measure image tagging on this machine with the power meter of measure_ai.py; scale it to the 1 kW reference server.

  make measure-tagging    (needs torch and torchvision: TORCH_PY=/path/to/venv/bin/python)

The job: torchvision's RetinaNet ResNet-50 FPN with its COCO detection weights (about 130 MB, fetched once into
TORCH_HOME) finds and labels the objects in each frame, the same network family as MLPerf's object-detection benchmark.
The frames are synthetic, drawn here with a fixed seed: 1280x720 street-like scenes of sky, ground, track lines,
blocks and discs. No photo dataset is used, so nothing is copied, and accuracy is NOT measured: the frames have no
ground truth. Only energy and throughput are.

What a run counts: frames already in memory as 8-bit pixels go to the GPU, are scaled and normalised by the model's
own transform (shorter side to 800 pixels), run through the network in fp32 batches, and the boxes, labels and scores
above 0.5 come back to the CPU. Reading and decoding image files is not counted.

Energy, the GPU gate (below 5 % utilisation, no Blender) and the Blender watch are measure_ai.measure, unchanged. The
CPU share counts this process's own CPU seconds above its idle rate, priced at 11.9 W per busy core as in
measure_ai.py, because RAPL is root-only here. The run is repeated (--runs, default 2) for repeatability, each with
its own gate and idle baseline. Writes docs/measurements/tagging-run<N>-samples.csv and tagging-summary.json.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import time
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from measure_ai import REFERENCE_WH, Meter, mean, measure, rapl_uj, write_samples

WIDTH, HEIGHT = 1280, 720
SCORE_MIN = 0.5


def frames(n: int, seed: int = 2026) -> np.ndarray:
    """n synthetic 1280x720 RGB frames (n, 720, 1280, 3) uint8, the same on every run.

    Each frame: a sky gradient over a ground plane, two track lines meeting at a vanishing point, a few blocks
    (buildings or carriages) and discs (lamps or signals) in random colours, and a little noise.
    """
    rng = np.random.default_rng(seed)
    ys, xs = np.mgrid[0:HEIGHT, 0:WIDTH]
    out = np.empty((n, HEIGHT, WIDTH, 3), dtype=np.uint8)
    for i in range(n):
        horizon = int(rng.integers(260, 420))
        sky_top, sky_low = rng.integers(90, 200, 3), rng.integers(170, 250, 3)
        t = np.clip(ys / horizon, 0, 1)[..., None]
        img = (sky_top * (1 - t) + sky_low * t).astype(np.float32)
        img[horizon:] = rng.integers(60, 140, 3)
        vx = int(rng.integers(400, 880))
        for x0 in (vx - 420, vx + 420):  # two rails from the bottom edge to the vanishing point
            along = (ys - horizon) / max(HEIGHT - horizon, 1)
            rail_x = vx + (x0 - vx) * along
            img[(ys > horizon) & (np.abs(xs - rail_x) < 2 + 6 * along)] = (70, 70, 75)
        for _ in range(int(rng.integers(3, 8))):
            w, h = int(rng.integers(60, 360)), int(rng.integers(40, 260))
            x, y = int(rng.integers(0, WIDTH - w)), int(rng.integers(max(horizon - h, 0), horizon + 120))
            img[y : y + h, x : x + w] = rng.integers(20, 235, 3)
        for _ in range(int(rng.integers(2, 6))):
            cx, cy, r = int(rng.integers(0, WIDTH)), int(rng.integers(0, HEIGHT)), int(rng.integers(8, 60))
            img[(xs - cx) ** 2 + (ys - cy) ** 2 < r * r] = rng.integers(20, 255, 3)
        img += rng.normal(0, 4, img.shape)
        out[i] = np.clip(img, 0, 255).astype(np.uint8)
    return out


def own_cpu_s() -> float:
    """CPU seconds (user + system) of this process and its threads."""
    t = os.times()
    return t.user + t.system


def load_model():
    """RetinaNet ResNet-50 FPN with torchvision's COCO weights, on the GPU, in eval mode."""
    import torch
    from torchvision.models.detection import RetinaNet_ResNet50_FPN_Weights, retinanet_resnet50_fpn

    weights = RetinaNet_ResNet50_FPN_Weights.COCO_V1
    model = retinanet_resnet50_fpn(weights=weights, score_thresh=SCORE_MIN).eval().to("cuda")
    return torch, model, weights


def run_tagging(torch, model, pixels: np.ndarray, passes: int, batch: int) -> dict:
    """Tag every frame `passes` times in batches; boxes, labels and scores come back to the CPU."""
    done = tags = 0
    with torch.inference_mode():
        for _ in range(passes):
            for i in range(0, len(pixels), batch):
                chunk = torch.from_numpy(pixels[i : i + batch]).to("cuda").permute(0, 3, 1, 2).float().div_(255)
                out = model(list(chunk))
                tags += sum(len(o["labels"].cpu()) for o in out)
                done += len(out)
        torch.cuda.synchronize()
    return {"items": done, "tags_above_0_5": tags}


def summarise(runs: list[dict]) -> dict:
    """The headline figures: the mean of the runs, and how far the runs are apart."""
    wh = [r["wh_per_item"] for r in runs]
    ips = [r["items_per_s"] for r in runs]
    wh_item = mean(wh)
    return {
        "images_per_s": round(mean(ips), 2),
        "gpu_w_above_idle": round(mean([r["gpu_w_above_idle"] for r in runs]), 1),
        "wh_per_1000_images": round(1000 * wh_item, 3),
        "j_per_image": round(3600 * wh_item, 3),
        "images_per_reference_server_hour": int(round(REFERENCE_WH / wh_item, -3)),
        "spread_between_runs_pct": {
            "images_per_s": round(100 * (max(ips) - min(ips)) / mean(ips), 1),
            "wh_per_1000_images": round(100 * (max(wh) - min(wh)) / wh_item, 1),
        },
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--frames", type=int, default=300, help="synthetic frames drawn")
    ap.add_argument("--passes", type=int, default=4, help="times the frame set is tagged in one run")
    ap.add_argument("--batch", type=int, default=4)
    ap.add_argument("--runs", type=int, default=2)
    ap.add_argument("--baseline-s", type=float, default=15)
    ap.add_argument("--cpu-watts-per-core", type=float, default=11.9)
    ap.add_argument("--max-wait-min", type=float, default=60)
    ap.add_argument("--check-every-min", type=float, default=3)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "docs" / "measurements")
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)

    pixels = frames(a.frames)
    torch, model, weights = load_model()
    # Warm up before metering: CUDA kernels chosen and memory allocated, so start-up is not counted.
    run_tagging(torch, model, pixels[: a.batch * 4], 1, a.batch)

    time.sleep(30)  # let the warm-up's utilisation reading fall back before the first gate
    meter = Meter()
    meter.start()
    time.sleep(1)
    started = datetime.now(UTC)
    runs, raw = [], []
    try:
        for n in range(1, a.runs + 1):
            m, phases = measure(
                f"tagging_run{n}",
                lambda: run_tagging(torch, model, pixels, a.passes, a.batch),
                meter,
                a,
                cpu_s=own_cpu_s,
                cpu_who="this process",
            )
            name = f"tagging-run{n}-samples.csv"
            write_samples(a.out / name, meter, phases)
            m["wh_per_1000_images"] = round(1000 * m["wh_per_item"], 3)
            m["wh_per_item"] = round(m["wh_per_item"], 7)
            runs.append(m)
            raw.append(name)
    finally:
        meter.stop()

    gpu = subprocess.run(
        ["nvidia-smi", "--query-gpu=name,driver_version,power.limit", "--format=csv,noheader"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    import torchvision

    summary = {
        "measured_utc": started.strftime("%Y-%m-%d %H:%M"),
        "machine": {
            "gpu": gpu,
            "cpu": "Intel Core i7-9700K, 8 cores, 95 W TDP",
            "os": f"{platform.system()} {platform.release()}",
            "torch": torch.__version__,
            "torchvision": torchvision.__version__,
            "rapl_readable": rapl_uj() is not None,
        },
        "model": "torchvision RetinaNet ResNet-50 FPN, COCO_V1 weights "
        f"(retinanet_resnet50_fpn_coco-eeacb38b.pth, {weights.meta['num_params']:,} parameters), fp32",
        "images": f"{a.frames} synthetic {WIDTH}x{HEIGHT} frames (seed 2026, measure_tagging.frames) "
        f"x {a.passes} passes = {a.frames * a.passes} images a run, batches of {a.batch}",
        "counted": "frames in memory to the GPU, the model's own resize (shorter side 800) and normalisation, "
        f"detection, and boxes, labels and scores above {SCORE_MIN} back to the CPU; file reading and decoding "
        "not counted",
        "accuracy": "not measured: the frames are synthetic and have no ground truth; only energy and throughput are",
        "meter": (
            "nvidia-smi power.draw (board power, instantaneous on Turing, +/- 5 W) and utilization.gpu every 100 ms; "
            "energy by trapezoids over the run, minus the mean idle baseline sampled just before it"
        ),
        "gate": "each run starts only with the GPU below 5 % and no Blender process on it",
        "scaling_rule": "equal energy per item on the 1 kW reference server (equal performance per watt): "
        "images per server-hour = 1,000 Wh / Wh per image, with Wh per image = (GPU above idle + CPU share) / images",
        "raw_samples": raw,
        "image_tagging": summarise(runs),
        "runs": runs,
    }
    (a.out / "tagging-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
