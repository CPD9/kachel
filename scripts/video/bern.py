"""Build the Bern outside scene for the day-night film and save it to the cache.

    blender --background --factory-startup --python scripts/video/bern.py -- \
        --out ~/.cache/kachel/bern/bern.blend

It reuses the skyline builder from heat-atlas (read-only: its module is imported
without writing bytecode, and nothing is saved into heat-atlas). Buildings come
from swissBUILDINGS3D 3.0 tiles 1166-42 (old town, Bundeshaus) and 1166-24
(north bank), read with heat-atlas/blender/fgdb.py from ~/.cache/heat-atlas/gdb.
Terrain is interpolated from each building's ground point. The Aare is a ribbon
along a course traced from the building-free band round the old town, so it is
approximate. The ground is asphalt grey where buildings stand close and grass
elsewhere. There is no heat-demand overlay, because
the hectare data in heat-atlas covers Basel only.

The camera stands high above the Rosengarten and looks south-west over the old
town towards the Bundeshaus, into the winter sunset. The scene is 2D-only
material: render frames from it, never export it as 3D.
"""

import argparse
import itertools
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
# Rough course of the Aare round the old town (LV95), traced along the building-free band
# round the peninsula in the footprints.
AARE = [
    (2599700, 1199100), (2600000, 1199200), (2600300, 1199270), (2600650, 1199340),
    (2600950, 1199460), (2601250, 1199560), (2601380, 1199760), (2601260, 1199990),
    (2600950, 1200010), (2600650, 1199990), (2600350, 1200070), (2600050, 1200230),
    (2599750, 1200450),
]  # fmt: skip


def ground_material(SK):
    """Asphalt grey where buildings stand close together, muted grass elsewhere, with noise."""
    m, nt, b = SK.new_mat("Ground_Bern")
    L = nt.links
    built = nt.nodes.new("ShaderNodeAttribute")
    built.attribute_name = "built"
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 0.08
    nz.inputs["Detail"].default_value = 6
    tc = nt.nodes.new("ShaderNodeTexCoord")
    L.new(tc.outputs["Object"], nz.inputs["Vector"])
    mx = nt.nodes.new("ShaderNodeMix")
    mx.data_type = "RGBA"
    mx.inputs["A"].default_value = (0.045, 0.06, 0.03, 1)  # grass
    mx.inputs["B"].default_value = (0.07, 0.07, 0.072, 1)  # asphalt
    L.new(built.outputs["Fac"], mx.inputs["Factor"])
    var = nt.nodes.new("ShaderNodeMix")
    var.data_type = "RGBA"
    var.blend_type = "MULTIPLY"
    var.inputs["Factor"].default_value = 0.35
    L.new(mx.outputs["Result"], var.inputs["A"])
    L.new(nz.outputs["Color"], var.inputs["B"])
    L.new(var.outputs["Result"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.92
    b.inputs["Emission Color"].default_value = (1.0, 0.75, 0.5, 1)
    b.inputs["Emission Strength"].default_value = 0.008
    SK.finish(m, b.outputs[0])
    return m


def aare_ribbon(SK, T, mat, col, width=50.0):
    """The Aare as a ribbon along its rough course, laid on the interpolated terrain.

    The terrain comes from building ground points, so it has no real gorge; a carved river
    would sit under it. The ribbon follows the ground instead, a little above it.
    """
    pts = []
    for (ax, ay), (bx, by) in itertools.pairwise(AARE):
        n = max(1, int(np.hypot(bx - ax, by - ay) / 10))
        pts += [(ax + (bx - ax) * k / n, ay + (by - ay) * k / n) for k in range(n)]
    pts.append(AARE[-1])
    P = np.array([(x - SK.E0, y - SK.N0) for x, y in pts])
    nrm = []
    for i in range(len(P)):
        d = P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]
        nrm.append(np.array((-d[1], d[0])) / (np.hypot(*d) or 1.0))
    # Lay it on the highest ground across its width so the slope never pokes through.
    z = np.array(
        [
            max(T(*(p + n * o)) for o in (-width / 2, 0, width / 2))
            for p, n in zip(P, nrm, strict=True)
        ]
    )
    z = np.convolve(np.pad(z, 6, mode="edge"), np.ones(13) / 13, mode="valid") + 1.5
    verts, faces = [], []
    for i, (x, y) in enumerate(P):
        nx, ny = nrm[i] * width / 2
        verts += [(x + nx, y + ny, z[i]), (x - nx, y - ny, z[i])]
        if i:
            faces.append((2 * i - 2, 2 * i - 1, 2 * i + 1, 2 * i))
    me = bpy.data.meshes.new("Aare")
    me.from_pydata(verts, [], faces)
    me.materials.append(mat)
    ob = bpy.data.objects.new("Aare", me)
    col.objects.link(ob)
    return ob


def built_density(terrain, B, xs, ys):
    """Per terrain vertex: 0 in open ground, 1 where footprints are dense (within ~40 m)."""
    g = 20.0
    nx, ny = int((xs[-1] - xs[0]) / g) + 1, int((ys[-1] - ys[0]) / g) + 1
    occ = np.zeros((ny, nx))
    for b in B:
        i, j = int((b["cx"] - xs[0]) / g), int((b["cy"] - ys[0]) / g)
        if 0 <= i < nx and 0 <= j < ny:
            occ[j, i] += 1
    for _ in range(2):
        p = np.pad(occ, 1, mode="edge")
        occ = (
            sum(
                p[1 + dj : 1 + dj + ny, 1 + di : 1 + di + nx]
                for dj in (-1, 0, 1)
                for di in (-1, 0, 1)
            )
            / 9
        )
    occ = np.clip(occ / 0.6, 0, 1)
    me = terrain.data
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    i = np.clip(((co[:, 0] - xs[0]) / g).astype(int), 0, nx - 1)
    j = np.clip(((co[:, 1] - ys[0]) / g).astype(int), 0, ny - 1)
    at = me.attributes.new("built", "FLOAT", "POINT")
    at.data.foreach_set("value", occ[j, i].astype(np.float32))


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
    SK.WATER = -1000.0  # nothing carved: the Aare is a ribbon (aare_ribbon)
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
    ground = ground_material(SK)
    cb = SK.H.get_collection("Buildings")
    SK.build_mesh(
        "Buildings_Low", [b for b in B if b["h"] < 45], [wall, roof_p, roof_f], cb
    )
    tall = [b for b in B if b["h"] >= 45]
    if tall:
        SK.build_mesh("Buildings_Tall", tall, [tower, roof_p, roof_f], cb)
    env = SK.H.get_collection("Environment")
    terrain = SK.terrain_object(T, ground, env)
    built_density(terrain, B, xs, ys)
    aare_ribbon(SK, T, SK.water_material(), env)
    # Past the far edge the haze (daynight.py) carries the land into the sky.
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
