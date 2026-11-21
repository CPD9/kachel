"""Render segment 3, "The scheduler at work", one still per hour of two days.

Run by `make video-scheduler`, inside Blender:

    blender --background scripts/video/assets/plantroom.blend \
        --python scripts/video/scheduler.py -- \
        --csv services/scheduler/out/hourly.csv --out ~/.cache/kachel/video/scheduler

Every visible state comes from one row of the scheduler's hourly output: the
number of servers lit is server_hours, the tank strip is soc_kwh over the tank
size, the pipe colour follows heat_produced, the backup heater follows
backup_kwh, and in the flat upstairs the radiator follows the space-heat part
of demand_kwh while the shower runs whenever there is a hot-water draw. The
tank size comes from the scheduler's config.json and the server count from its
kpis.json, so no figure is typed here.

For each hour it writes plant/<date>_<HH>.png, flat/<date>_<HH>.png and, once,
anchors.json with where the labelled parts sit in the picture. compose.py
turns those into the video.
"""

import argparse
import csv
import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kachel_scene as ks

DAYS = ("2025-01-15", "2025-07-15")


def args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--width", type=int, default=1920)
    ap.add_argument("--height", type=int, default=1080)
    ap.add_argument("--samples", type=int, default=96)
    ap.add_argument(
        "--only",
        default="",
        help="comma list of row times to render, e.g. 2025-01-15 06",
    )
    return ap.parse_args(argv)


def load(csv_path):
    out = Path(csv_path).parent
    cfg = json.loads((out.parent / "config.json").read_text())
    kpis = json.loads((out / "kpis.json").read_text())
    with open(csv_path, newline="") as f:
        rows = list(csv.DictReader(f))
    return rows, cfg, kpis


def main():
    a = args()
    rows, cfg, kpis = load(a.csv)
    tank = float(cfg["house"]["tank_kwh"])
    n_servers = int(kpis["servers_per_house"])
    heat_per_server = float(cfg["server"]["power_kw"]) * float(
        cfg["server"]["heat_recovery"]
    )
    # Hot water is drawn evenly over the day (config "hot_water_shape": "flat").
    hot_water = float(cfg["house"]["hot_water_kwh_per_day"]) / 24
    picked = [r for r in rows if r["time"][:10] in DAYS]
    space_max = max(float(r["demand_kwh"]) - hot_water for r in picked) or 1.0
    backup_max = max(float(r["backup_kwh"]) for r in picked) or 1.0
    only = {s.strip() for s in a.only.split(",") if s.strip()}

    h = ks.prepare()
    if len(h["servers"]) != n_servers:
        raise SystemExit(
            f"rack has {len(h['servers'])} servers, scheduler uses {n_servers}"
        )
    plant, flat = h["scene"], h["flat"]
    ks.setup_render(plant, a.width, a.height, a.samples)
    ks.setup_render(flat, a.width // 4, a.width // 4 * 9 // 16, max(16, a.samples // 2))
    out = Path(a.out)
    (out / "plant").mkdir(parents=True, exist_ok=True)
    (out / "flat").mkdir(parents=True, exist_ok=True)
    anchors = {k: ks.project(plant, v) for k, v in ks.anchors(h).items()}
    (out / "anchors.json").write_text(json.dumps(anchors, indent=1))

    for r in picked:
        key = f"{r['time'][:10]}_{r['time'][11:13]}"
        if only and key.replace("_", " ") not in only:
            continue
        demand = float(r["demand_kwh"])
        ks.apply_state(
            h,
            servers_on=round(float(r["server_hours"])),
            tank_frac=float(r["soc_kwh"]) / tank,
            heat_frac=float(r["heat_produced"]) / (n_servers * heat_per_server),
            backup_frac=float(r["backup_kwh"]) / backup_max,
            space_frac=max(0.0, demand - hot_water) / space_max,
            draw_on=min(demand, hot_water) > 0,
        )
        for sc, sub in ((plant, "plant"), (flat, "flat")):
            sc.render.filepath = str(out / sub / f"{key}.png")
            bpy.ops.render.render(write_still=True, scene=sc.name)
        print(f"rendered {key}", flush=True)


main()
