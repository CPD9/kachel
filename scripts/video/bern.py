"""Build the Bern outside scene for the day-night film and save it to the cache.

    blender --background --factory-startup --python scripts/video/bern.py -- \
        --out ~/.cache/kachel/bern/bern.blend

It reuses the skyline builder from heat-atlas (read-only: its module is imported
without writing bytecode, and nothing is saved into heat-atlas). Buildings come
from swissBUILDINGS3D 3.0 tiles 1166-42 (old town, Bundeshaus) and 1166-24
(north bank), read with heat-atlas/blender/fgdb.py from ~/.cache/heat-atlas/gdb.
Terrain is interpolated from each building's ground point; the Aare is not
modelled (no water data is loaded), and there is no heat-demand overlay, because
the hectare data in heat-atlas covers Basel only.

The camera stands high above the Rosengarten and looks south-west over the old
town towards the Bundeshaus, into the winter sunset. The scene is 2D-only
material: render frames from it, never export it as 3D.
"""

import argparse
import os
import sys
from pathlib import Path

import bpy
import numpy as np

HEAT_ATLAS = Path.home() / "Projects/heat-atlas"
GDB = Path.home() / ".cache/heat-atlas/gdb"
TILES = ("swissBUILDINGS3D_3-0_1166-42.gdb", "swissBUILDINGS3D_3-0_1166-24.gdb")
ORIGIN = (2600500.0, 1199600.0, 500.0)  # local origin, LV95 m and LN02 height
KEEP = (2598400.0, 1198400.0, 2602400.0, 1201400.0)  # buildings kept, LV95
EYE = (2601420.0, 1200330.0, 95.0)  # above the Rosengarten: E, N, metres above ground
AIM = (2600440.0, 1199470.0, 555.0)  # Bundeshaus: E, N, height
LENS = 46.0


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    sys.dont_write_bytecode = True  # read heat-atlas, never write into it
    sys.path.insert(0, str(HEAT_ATLAS / "blender"))
    import skyline as SK

    SK.E0, SK.N0, SK.Z0 = ORIGIN
    SK.TX0, SK.TY0, SK.TX1, SK.TY1 = (
        KEEP[0] - 600,
        KEEP[1] - 600,
        KEEP[2] + 600,
        KEEP[3] + 600,
    )
    SK.WATER = -1000.0  # no river carved
    SK.river_mask = lambda B, xs, ys: np.zeros((len(ys), len(xs)), bool)
    sc = SK.H.reset_scene()
    B = []
    for t in TILES:
        SK.GDB = str(GDB / t)
        for b in SK.load_buildings():
            e, n = b["cx"] + SK.E0, b["cy"] + SK.N0
            if KEEP[0] <= e <= KEEP[2] and KEEP[1] <= n <= KEEP[3]:
                B.append(b)
    print("buildings", len(B), flush=True)
    xs, ys, Z = SK.terrain_grid(B)
    T = SK.Terrain(xs, ys, Z)
    wall = SK.facade_material("Facade_Plaster")
    tower = SK.facade_material("Facade_Tower", tall=True)
    roof_p, roof_f = (
        SK.roof_material("Roof_Pitched", True),
        SK.roof_material("Roof_Flat", False),
    )
    ground = SK.simple_material(
        "Ground_Urban",
        (0.1, 0.1, 0.1),
        0.9,
        noise=0.02,
        emission=(1.0, 0.75, 0.5),
        strength=0.012,
    )
    cb = SK.H.get_collection("Buildings")
    SK.build_mesh(
        "Buildings_Low", [b for b in B if b["h"] < 45], [wall, roof_p, roof_f], cb
    )
    tall = [b for b in B if b["h"] >= 45]
    if tall:
        SK.build_mesh("Buildings_Tall", tall, [tower, roof_p, roof_f], cb)
    SK.terrain_object(T, ground, SK.H.get_collection("Environment"))
    sd = bpy.data.lights.new("Sun", "SUN")
    sd.angle = 0.0175
    sun = bpy.data.objects.new("Sun", sd)
    sc.collection.objects.link(sun)
    x, y = EYE[0] - SK.E0, EYE[1] - SK.N0
    tx, ty = AIM[0] - SK.E0, AIM[1] - SK.N0
    cam = SK.H.camera(
        "Cam_Dusk",
        SK.H.get_collection("Cameras"),
        (x, y, T(x, y) + EYE[2]),
        (tx, ty, AIM[2] - SK.Z0),
        lens=LENS,
    )
    cam.data.clip_start, cam.data.clip_end = 0.5, 40000
    sc.camera = cam
    SK.setup_world("dusk")
    SK.H.setup_cycles(sc, (960, 1080), 32)
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    sc["meta"] = "{}"
    os.makedirs(os.path.dirname(os.path.expanduser(a.out)), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.expanduser(a.out), compress=True)
    print("saved", a.out)


main()
