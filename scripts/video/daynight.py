"""Render the day-night split film: Basel outside on the left, the plant room on the right.

Run by `make video-daynight`, in two Blender passes (one Cycles job at a time):

    blender --background ~/Projects/heat-atlas/renders/skyline.blend \
        --python scripts/video/daynight.py -- --part outside \
        --day services/scheduler/out/day_january.csv --out ~/.cache/kachel/video/work/daynight
    blender --background scripts/video/assets/plantroom.blend \
        --python scripts/video/daynight.py -- --part inside \
        --day services/scheduler/out/day_january.csv --out ~/.cache/kachel/video/work/daynight

compose_daynight.py then puts the halves side by side with one clock.

Outside, the skyline scene from heat-atlas is opened read-only and never
saved; the towers only ever leave it as rendered frames. The sun stands where
the real sun stands over Basel (47.56 N, 7.59 E, Europe/Zurich) at that local
time on the date in the CSV, so the sky runs night, dawn, day, dusk and night,
and the window lights follow the darkness. A heat-demand overlay, built from
the SFOE hectare cells in heat-atlas/research/data, glows in proportion to the
hour's demand_kwh, and the concept supply and return lines glow in
proportion to heat_produced. Inside, the servers and the tank follow the same
row, as in segment 3. Nothing is keyframed.

Options after "--": --part outside|inside, --day CSV, --out DIR,
--width/--height of one half (960x1080), --samples, --steps (stills per hour),
--times 07:30,13:00 to render only those times (previews).
"""

import argparse
import csv
import json
import math
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kachel_scene as ks

HEAT_ATLAS = Path.home() / "Projects/heat-atlas"
LAT, LON, TZ = 47.56, 7.59, ZoneInfo("Europe/Zurich")
INSIDE_EYE = (3.4, -2.4, 2.0)
INSIDE_AIM = (0.95, 0.7, 1.05)
# Pipe runs in the plant room, in the direction the water flows: hot from the servers to the
# heat exchanger and on to the tank, cooled water back the other way.
FLOW = {
    "hot": [
        [(-0.3, 0.55, 2.2), (-0.3, 0.55, 2.5), (-0.3, 1.28, 2.5), (1.08, 1.28, 2.5),
         (1.08, 1.28, 0.8), (1.23, 1.28, 0.8)],
        [(1.88, 1.12, 0.8), (2.2, 1.12, 0.8), (2.2, 1.12, 1.55), (2.58, 0.75, 1.55)],
    ],
    "cold": [
        [(2.58, 0.75, 0.35), (2.36, 0.99, 0.35), (2.36, 1.28, 0.26), (1.82, 1.28, 0.26)],
        [(1.23, 1.12, 0.2), (0.95, 1.42, 0.2), (0.95, 1.42, 2.32), (-0.4, 1.42, 2.32),
         (-0.4, 0.55, 2.32), (-0.4, 0.55, 2.2)],
    ],
}  # fmt: skip


def args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--part", choices=("outside", "inside"), required=True)
    ap.add_argument("--day", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--width", type=int, default=960)
    ap.add_argument("--height", type=int, default=1080)
    ap.add_argument("--samples", type=int, default=48)
    ap.add_argument("--steps", type=int, default=1, help="stills per hour (outside)")
    ap.add_argument(
        "--times", default="", help="HH:MM list to render only those (previews)"
    )
    ap.add_argument("--lens", type=float, default=20.0)
    return ap.parse_args(argv)


def load(path):
    out = Path(path).parent
    cfg = json.loads((out.parent / "config.json").read_text())
    kpis = json.loads((out / "kpis.json").read_text())
    with open(path, newline="") as f:
        rows = sorted(csv.DictReader(f), key=lambda r: int(r["hour"]))
    return rows, cfg, kpis


def sun_position(local):
    """Solar elevation and azimuth (degrees, azimuth clockwise from north), NOAA formulae."""
    utc = local.replace(tzinfo=TZ).astimezone(ZoneInfo("UTC"))
    doy = utc.timetuple().tm_yday
    minutes = utc.hour * 60 + utc.minute + utc.second / 60
    g = 2 * math.pi / 365 * (doy - 1 + (minutes / 60 - 12) / 24)
    eqt = 229.18 * (
        0.000075
        + 0.001868 * math.cos(g)
        - 0.032077 * math.sin(g)
        - 0.014615 * math.cos(2 * g)
        - 0.040849 * math.sin(2 * g)
    )
    decl = (
        0.006918
        - 0.399912 * math.cos(g)
        + 0.070257 * math.sin(g)
        - 0.006758 * math.cos(2 * g)
        + 0.000907 * math.sin(2 * g)
        - 0.002697 * math.cos(3 * g)
        + 0.00148 * math.sin(3 * g)
    )
    ha = math.radians((minutes + eqt + 4 * LON) / 4 - 180)
    lat = math.radians(LAT)
    cz = math.sin(lat) * math.sin(decl) + math.cos(lat) * math.cos(decl) * math.cos(ha)
    elev = 90 - math.degrees(math.acos(max(-1.0, min(1.0, cz))))
    az = math.degrees(
        math.atan2(
            math.sin(ha), math.cos(ha) * math.sin(lat) - math.tan(decl) * math.cos(lat)
        )
    )
    return elev, (az + 180) % 360


def lerp(a, b, t):
    t = max(0.0, min(1.0, t))
    if isinstance(a, tuple):
        return tuple(x + (y - x) * t for x, y in zip(a, b, strict=True))
    return a + (b - a) * t


# ---------------------------------------------------------------- outside


def heat_overlay(SK, cam, col):
    """SFOE hectare cells as flat glowing squares, pulled in front of the buildings."""
    d = json.loads(
        (
            HEAT_ATLAS / "research/data/heat-demand-ha_basel-stadt_lv95.geojson"
        ).read_text()
    )
    terrain = bpy.data.objects["Terrain"]
    dg = bpy.context.evaluated_depsgraph_get()
    breaks = [0, 250, 500, 700, 1500, 3000, 1e12]
    pal = [(0.984, 0.788, 0.627), (0.957, 0.635, 0.400), (0.882, 0.459, 0.192),
           (0.85, 0.35, 0.12), (0.8, 0.25, 0.06), (0.75, 0.15, 0.03)]  # fmt: skip
    mats = [
        SK.hud_material(f"DN_Heat{k}", tuple(x**2.2 for x in c), 1.0, alpha=0.08)
        for k, c in enumerate(pal)
    ]
    vs, fs, mi = [], [], []
    for f in d["features"]:
        ring = f["geometry"]["coordinates"][0]
        x0, y0 = min(p[0] for p in ring), min(p[1] for p in ring)
        t = SK.TILE
        if not (t[0] <= x0 and x0 + 100 <= t[2] and t[1] <= y0 and y0 + 100 <= t[3]):
            continue
        v = f["properties"]["needtotal"] or 0.0
        if v < 700:
            continue  # only the hot cells (>= 700 MWh per hectare and year) glow
        k = next(i for i in range(6) if breaks[i] <= v < breaks[i + 1])
        ax, ay = x0 - SK.E0, y0 - SK.N0
        bx, by = ax + 100, ay + 100
        hit, loc, *_ = terrain.evaluated_get(dg).ray_cast(
            terrain.matrix_world.inverted()
            @ Vector(((ax + bx) / 2, (ay + by) / 2, 2000)),
            Vector((0, 0, -1)),
        )
        z = (terrain.matrix_world @ loc).z + 1.0 if hit else 8.0
        b = len(vs)
        vs += [(ax, ay, z), (bx, ay, z), (bx, by, z), (ax, by, z)]
        fs.append((b, b + 1, b + 2, b + 3))
        mi.append(k)
    me = bpy.data.meshes.new("DN_HeatOverlay")
    me.from_pydata(vs, [], fs)
    for m in mats:
        me.materials.append(m)
    for p, k in zip(me.polygons, mi, strict=True):
        p.material_index = k
    ob = bpy.data.objects.new("DN_HeatOverlay", me)
    col.objects.link(ob)
    c = cam.matrix_world.translation.copy()
    ob.matrix_world = (
        Matrix.Translation(c) @ Matrix.Scale(0.006, 4) @ Matrix.Translation(-c)
    )
    for a in (
        "visible_diffuse",
        "visible_glossy",
        "visible_transmission",
        "visible_volume_scatter",
        "visible_shadow",
    ):
        setattr(ob, a, False)
    return mats


def outside(a, rows):
    sys.dont_write_bytecode = True  # read heat-atlas, never write into it
    sys.path.insert(0, str(HEAT_ATLAS / "blender"))
    import skyline as SK

    sc = bpy.context.scene
    ks.setup_render(sc, a.width, a.height, a.samples)
    src = bpy.data.objects["Cam_Dusk"]
    cam = bpy.data.objects.new("DN_Cam", src.data.copy())
    cam.matrix_world = src.matrix_world.copy()
    sc.collection.objects.link(cam)
    sc.camera = cam
    # Half-width frame: keep the vertical view of the dusk shot, centred on the towers.
    cam.data.sensor_fit = "VERTICAL"
    cam.data.sensor_height = cam.data.sensor_width * 9 / 16
    cam.data.shift_x = 0.33
    hud = SK.H.get_collection("HUD")
    sky = SK.setup_world("dusk")
    bg = sc.world.node_tree.nodes["Background"]
    SK.show("HeatColumns", False)
    SK.show("Concept", False)
    bpy.context.view_layer.update()
    SK.xray(cam, hud)
    lines = [bpy.data.materials[n] for n in ("HUD_XSupply", "HUD_XReturn")]
    for o in hud.objects:
        if not o.name.startswith(("XRay_Loop_Supply", "XRay_Loop_Return")):
            o.hide_render = True  # keep only the pipe lines, not the concept markers
    heat_mats = heat_overlay(SK, cam, hud)
    gains = {}
    for m in bpy.data.materials:
        if m.node_tree and "WindowGain" in m.node_tree.nodes:
            gains[m.name] = m.node_tree.nodes["WindowGain"].outputs[0].default_value
    sun = bpy.data.objects["Sun"]
    demand_max = max(float(r["demand_kwh"]) for r in rows) or 1.0
    heat_max = max(float(r["heat_produced"]) for r in rows) or 1.0
    date = datetime.strptime(rows[0]["time"][:10], "%Y-%m-%d")
    log = []
    if a.times:
        by_hour = {int(r["hour"]): r for r in rows}
        plan = [(by_hour[int(t[:2])], int(t[3:5])) for t in a.times.split(",")]
    else:
        plan = [(r, 60 * s // a.steps) for r in rows for s in range(a.steps)]
    for r, minute in plan:
        local = date + timedelta(hours=int(r["hour"]), minutes=minute)
        elev, az = sun_position(local)
        rot = 90 - az
        # Twilight: from about -12 deg the sky brightens into the dusk colours of the
        # heat-atlas still; below the horizon the sky model is held just under it.
        SK.set_sun(sky, max(elev, -2.0) if elev > -12 else max(elev, -18.0), rot)
        if elev >= 0:
            bg.inputs["Strength"].default_value = lerp(0.9, 0.15, elev / 12)
        else:
            t = max(0.0, min(1.0, (elev + 12) / 9))
            bg.inputs["Strength"].default_value = 0.03 + 0.9 * t * t * (3 - 2 * t)
        day = max(0.0, min(1.0, elev / 12))
        night = max(0.0, min(1.0, (-elev - 4) / 8))
        sun.hide_render = elev <= 0
        sun.data.energy = 1.2 * day + 0.4 * min(1.0, max(0.0, elev) / 3) * (1 - day)
        sun.data.color = lerp((1.0, 0.6, 0.35), (1.0, 0.97, 0.93), elev / 15)
        sun.rotation_euler = (
            math.radians(90 - max(elev, 0.5)),
            0,
            math.radians(rot + 90),
        )
        fog = lerp(
            lerp((0.06, 0.14, 0.29), (0.55, 0.6, 0.68), day),
            (0.012, 0.025, 0.06),
            night,
        )
        SK.set_fog(lerp(1900.0, 2600.0, day), lerp(700.0, 1500.0, day), 1.0, fog)
        sc.view_settings.exposure = -0.3
        dark = max(0.0, min(1.0, (3 - elev) / 9))
        for n, g in gains.items():
            bpy.data.materials[n].node_tree.nodes["WindowGain"].outputs[
                0
            ].default_value = g * (0.05 + 0.95 * dark)
        dk = float(r["demand_kwh"]) / demand_max
        for m in heat_mats:
            m.node_tree.nodes["Emission"].inputs["Strength"].default_value = (
                0.05 + 0.5 * dk
            )
        hk = float(r["heat_produced"]) / heat_max
        for m in lines:
            m.node_tree.nodes["Emission"].inputs["Strength"].default_value = (
                0.3 + 2.4 * hk
            )
        key = f"{int(r['hour']):02d}{minute:02d}"
        sc.render.filepath = str(Path(a.out) / "outside" / f"{key}.png")
        bpy.ops.render.render(write_still=True)
        log.append({"key": key, "elev": round(elev, 2), "az": round(az, 1)})
        print("outside", key, round(elev, 1), round(az, 1), flush=True)
    (Path(a.out) / "sun.json").write_text(json.dumps(log, indent=1))


# ---------------------------------------------------------------- inside


def inside(a, rows, cfg, kpis):
    h = ks.prepare()
    sc = h["scene"]
    ks.setup_render(sc, a.width, a.height, a.samples)
    # Portrait half: a raised view down into the room, so rack and tank stack up the frame
    # instead of leaving bare floor and ceiling. Ceiling and front wall stay out of the shot
    # but still light the room.
    cd = bpy.data.cameras.new("DN_Inside")
    cd.sensor_fit = "HORIZONTAL"
    cd.lens = a.lens
    cam = bpy.data.objects.new("DN_Inside", cd)
    sc.collection.objects.link(cam)
    cam.location = INSIDE_EYE
    d = Vector(INSIDE_AIM) - Vector(INSIDE_EYE)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    for o in sc.objects:
        if o.name == "Wall_Front" or o.name.startswith("Batten"):
            o.visible_camera = False
    tank = float(cfg["house"]["tank_kwh"])
    n = int(kpis["servers_per_house"])
    per = float(cfg["server"]["power_kw"]) * float(cfg["server"]["heat_recovery"])
    backup_max = max(float(r["backup_kwh"]) for r in rows) or 1.0
    bpy.context.view_layer.update()  # camera matrix before projecting
    flow = {
        k: [[ks.project(sc, p) for p in path] for path in paths]
        for k, paths in FLOW.items()
    }
    (Path(a.out) / "flow.json").write_text(json.dumps(flow, indent=1))
    for r in rows:
        if a.times and int(r["hour"]) not in {int(t[:2]) for t in a.times.split(",")}:
            continue
        ks.apply_state(
            h,
            servers_on=round(float(r["server_hours"])),
            tank_frac=float(r["soc_kwh"]) / tank,
            heat_frac=float(r["heat_produced"]) / (n * per),
            backup_frac=float(r["backup_kwh"]) / backup_max,
            space_frac=0.0,
            draw_on=False,
        )
        sc.render.filepath = str(Path(a.out) / "inside" / f"{int(r['hour']):02d}.png")
        bpy.ops.render.render(write_still=True, scene=sc.name)
        print("inside", r["hour"], flush=True)


def main():
    a = args()
    rows, cfg, kpis = load(a.day)
    (Path(a.out) / a.part).mkdir(parents=True, exist_ok=True)
    if a.part == "outside":
        outside(a, rows)
    else:
        inside(a, rows, cfg, kpis)


main()
