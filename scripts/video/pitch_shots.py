"""3D shots for the investor pitch film (see ~/.cache/kachel/pitch/storyboard.md).

Run inside Blender, one shot per call, for example:

    blender --background ~/Projects/heat-atlas/renders/skyline.blend \
        --python scripts/video/pitch_shots.py -- --shot title --out DIR

Shots:
    title       the Basel skyline at dusk: a slow orbit and push-in round the towers, with the
                upper third left as clean sky for the title (6 s)
    fly-city    over Basel at dusk, flying south towards Dreispitz (3 s; first half of shot 2)
    fly-campus  dive from high over FHNW Campus Dreispitz to its aerial view (3 s; second half)
    basement    from the aerial view through the cutaway into the plant room (4 s)
    xray        shot 4, right half after the setup: the X-ray pass, device by device (11 s)
    seasons     shot 4, left half: Basel orbiting from the snow day to midsummer, sun, snow
                and windows from the date and data (15.5 s, portrait half frame)

Shots 2 and 3 run at dusk; the campus scene is dreispitz_campus.blend from the assets.

The skyline scene comes from heat-atlas, opened read-only and never saved; the towers leave
it only as rendered frames. Camera motion is keyframed (it is not data). encode_shot.py adds
the credit line and writes the MP4 and contact sheet.
"""

import argparse
import csv
import json
import math
import sys
from datetime import datetime, timedelta
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kachel_scene as ks

HEAT_ATLAS = Path.home() / "Projects/heat-atlas"
FPS = 24


def args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--shot", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--width", type=int, default=1920)
    ap.add_argument("--height", type=int, default=1080)
    ap.add_argument("--samples", type=int, default=48)
    ap.add_argument("--step", type=int, default=1)
    ap.add_argument("--sched-out", default="services/scheduler/out")
    return ap.parse_args(argv)


def skyline():
    sys.dont_write_bytecode = True  # read heat-atlas, never write into it
    sys.path.insert(0, str(HEAT_ATLAS / "blender"))
    import skyline as SK

    return SK


def dusk(SK, sc):
    """The look of heat-atlas skyline_dusk.png: sun just set, blue fog, no overlays."""
    SK.setup_world("dusk")
    SK.set_fog(1900.0, 700.0, 1.0, (0.06, 0.14, 0.29))
    SK.show("HeatColumns", False)
    SK.show("Concept", False)
    sc.view_settings.exposure = -0.3


def orbit_keys(cam, pivot, f0, f1, turn_deg, push, lift=0.0):
    """Keyframe a camera from its pose: orbit `turn_deg` round the pivot's vertical axis and
    move `push` of the way in, keeping its view direction relative to the pivot. Blender's
    default Bezier keys ease in and out."""
    bpy.context.view_layer.update()
    start = cam.matrix_world.copy()
    rel = start.translation - pivot
    for f, k in ((f0, 0.0), (f1, 1.0)):
        rot = Matrix.Rotation(math.radians(turn_deg * k), 4, "Z")
        p = pivot + (rot @ rel) * (1 - push * k) + Vector((0, 0, lift * k))
        cam.matrix_world = Matrix.Translation(p) @ (rot @ start.to_3x3().to_4x4())
        cam.keyframe_insert("location", frame=f)
        cam.keyframe_insert("rotation_euler", frame=f)


def shot_title(a):
    SK = skyline()
    sc = bpy.context.scene
    ks.setup_render(sc, a.width, a.height, a.samples)
    sc.render.use_persistent_data = True
    dusk(SK, sc)
    meta = json.loads(sc["meta"])
    t = meta["tallest"]
    pivot = Vector((t["cx"], t["cy"], 60.0))
    src = bpy.data.objects["Cam_Dusk"]
    cam = bpy.data.objects.new("Pitch_Cam", src.data.copy())
    sc.collection.objects.link(cam)
    cam.matrix_world = src.matrix_world.copy()
    cam.rotation_mode = "XYZ"
    sc.camera = cam
    # Keep the towers in the lower two thirds: tilt the view up a touch and shift the frame.
    cam.data.shift_y = -0.08
    n = 6 * FPS
    orbit_keys(cam, pivot, 1, n, turn_deg=10.0, push=0.2, lift=-8.0)
    return sc, n


def look(cam, eye, target):
    cam.location = eye
    cam.rotation_euler = (
        (Vector(target) - Vector(eye)).to_track_quat("-Z", "Y").to_euler()
    )


def path_keys(cam, keys):
    """Keyframe (frame, eye, target, lens) poses; Bezier keys ease between them."""
    for f, eye, target, lens in keys:
        look(cam, eye, target)
        cam.data.lens = lens
        cam.keyframe_insert("location", frame=f)
        cam.keyframe_insert("rotation_euler", frame=f)
        cam.data.keyframe_insert("lens", frame=f)


def new_camera(sc, name, lens=35.0):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.clip_start, cd.clip_end = 0.1, 40000
    cam = bpy.data.objects.new(name, cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def shot_fly_city(a):
    """Part one of shot 2: over Basel at dusk, flying south towards Dreispitz and tipping down."""
    SK = skyline()
    sc = bpy.context.scene
    ks.setup_render(sc, a.width, a.height, a.samples)
    sc.render.use_persistent_data = True
    dusk(SK, sc)
    cam = new_camera(sc, "Pitch_Fly")
    dreispitz = Vector((2612450 - SK.E0, 1265300 - SK.N0, 0))
    n = 72
    path_keys(
        cam,
        [
            (1, (650, 900, 420), dreispitz + Vector((0, 0, 60)), 30),
            (n, (120, -700, 170), Vector((-250, -1450, 0)), 34),
        ],
    )
    return sc, n


def campus_dusk(sc):
    """Dusk for the campus scene: sun just below the horizon in the west, sun lamp off. The
    neighbours get the city's lit windows, and the FHNW building warm light inside and a
    soft amber rim on its roof, so it reads as the hero."""
    w = sc.world.node_tree
    sky = next(nd for nd in w.nodes if nd.type == "TEX_SKY")
    sky.sun_elevation = math.radians(-1.5)
    sky.sun_rotation = math.radians(90 - 240)
    next(nd for nd in w.nodes if nd.type == "BACKGROUND").inputs[1].default_value = 0.9
    bpy.data.objects["Sun"].hide_render = True
    sc.view_settings.exposure = -0.3
    SK = skyline()
    lit = SK.facade_material("Facade_Plaster")
    lit.node_tree.nodes["LitFraction"].outputs[0].default_value = 0.22
    for o in bpy.data.collections["Context"].all_objects:
        for slot in getattr(o, "material_slots", []):
            if slot.material and slot.material.name == "Context_Plaster":
                slot.material = lit
    facade = bpy.data.materials["Campus_Facade"].node_tree
    b = next(nd for nd in facade.nodes if nd.type == "BSDF_PRINCIPLED")
    mix = next(nd for nd in facade.nodes if nd.type == "MIX" and nd.inputs[0].is_linked)
    b.inputs["Emission Color"].default_value = (1.0, 0.72, 0.42, 1)
    gain = facade.nodes.new("ShaderNodeMath")
    gain.operation = "MULTIPLY"
    gain.inputs[1].default_value = 3.0
    facade.links.new(mix.inputs[0].links[0].from_socket, gain.inputs[0])
    facade.links.new(gain.outputs[0], b.inputs["Emission Strength"])
    panel = next(nd for nd in bpy.data.materials["Ceiling_Panel"].node_tree.nodes
                 if nd.type == "BSDF_PRINCIPLED")  # fmt: skip
    panel.inputs["Emission Color"].default_value = (1.0, 0.85, 0.65, 1)
    panel.inputs["Emission Strength"].default_value = 4.0
    rim = bpy.data.materials.new("Hero_Rim")
    rim.use_nodes = True
    rp = rim.node_tree.nodes["Principled BSDF"]
    rp.inputs["Base Color"].default_value = (1.0, 0.6, 0.25, 1)
    rp.inputs["Emission Color"].default_value = (1.0, 0.6, 0.25, 1)
    rp.inputs["Emission Strength"].default_value = 6.0
    for o in bpy.data.objects:
        if o.name.startswith("Parapet_"):
            for slot in o.material_slots:
                slot.link = "OBJECT"
                slot.material = rim


HERO = (0.0, 20.0, 26.0)  # top of the FHNW building in the campus scene (m)


def shot_fly_campus(a):
    """Part two of shot 2: dive from high over the campus to the aerial view of the building."""
    sc = bpy.context.scene
    ks.setup_render(sc, a.width, a.height, a.samples)
    sc.render.use_persistent_data = True
    campus_dusk(sc)
    aerial = bpy.data.objects["Cam_Aerial"]
    eye = aerial.location.copy()
    fwd = aerial.matrix_world.to_3x3() @ Vector((0, 0, -1))
    target = eye + fwd * (eye.z / max(0.2, -fwd.z))
    cam = new_camera(sc, "Pitch_Dive")
    n = 72
    path_keys(
        cam,
        [
            (1, eye + Vector((260, -260, 380)), target, 40),
            (n, eye, target, aerial.data.lens),
        ],
    )
    sc.frame_set(n)
    bpy.context.view_layer.update()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    pin = ks.project(sc, HERO)
    (out / "label.json").write_text(
        json.dumps(
            {"text": "FHNW Campus Dreispitz, Basel", "frame": n, "at_0_to_1": pin}
        )
    )
    return sc, n


def shot_basement(a):
    """Shot 3: from the aerial view through the cutaway down into the plant room."""
    sc = bpy.context.scene
    ks.setup_render(sc, a.width, a.height, a.samples)
    sc.render.use_persistent_data = True
    campus_dusk(sc)
    cams = [bpy.data.objects[n] for n in ("Cam_Aerial", "Cam_Cutaway", "Cam_Basement")]
    cam = new_camera(sc, "Pitch_Down")
    n = 96
    keys = []
    for f, c in zip((1, 48, n), cams, strict=True):
        fwd = c.matrix_world.to_3x3() @ Vector((0, 0, -1))
        keys.append((f, c.location.copy(), c.location + fwd * 20, c.data.lens))
    path_keys(cam, keys)
    # Ease the exposure down over the last second, so the lit plant room is no flash.
    vs = sc.view_settings
    for f, e in ((n - 30, -0.3), (n, -1.2)):
        vs.exposure = e
        vs.keyframe_insert("exposure", frame=f)
    return sc, n


SEASON_DAYS = (
    "snow",
    "january",
    "march",
    "may",
    "july",
)  # out/day_<name>.csv, in order
SPLIT_FRAMES = 372  # the split's left half; the last 1.5 s of shot 4 is the pull-back
DAY_HOURS = (9.0, 16.0)  # each day runs from 09:00 to 16:00


def season_plan(sched_out, n=SPLIT_FRAMES):
    """For each frame of the sweep: (day name, csv path, hour as float)."""
    per = n / len(SEASON_DAYS)
    plan = []
    for f in range(n):
        d = min(len(SEASON_DAYS) - 1, int(f / per))
        t = DAY_HOURS[0] + (DAY_HOURS[1] - DAY_HOURS[0]) * (f - d * per) / per
        plan.append(
            (SEASON_DAYS[d], str(Path(sched_out) / f"day_{SEASON_DAYS[d]}.csv"), t)
        )
    return plan


def shot_seasons(a):
    """Shot 4, left half: Basel orbiting slowly from the snow day to midsummer. Sun, snow and
    window light come from the date, the hour and the data, frame by frame."""
    import daynight as dn
    from snowdata import snow_hours

    SK = skyline()
    sc = bpy.context.scene
    ks.setup_render(sc, a.width, a.height, a.samples)
    sc.render.use_persistent_data = True
    SK.show("HeatColumns", False)
    SK.show("Concept", False)
    sky = SK.setup_world("dusk")
    bg = sc.world.node_tree.nodes["Background"]
    sun = bpy.data.objects["Sun"]
    gains = {
        m.name: m.node_tree.nodes["WindowGain"].outputs[0].default_value
        for m in bpy.data.materials
        if m.node_tree and "WindowGain" in m.node_tree.nodes
    }
    covers = [
        dn.add_snow(bpy.data.materials[n])
        for n in ("Roof_Pitched", "Roof_Flat", "Ground_Urban")
    ]
    t = json.loads(sc["meta"])["tallest"]
    pivot = Vector((t["cx"], t["cy"], 70.0))
    src = bpy.data.objects["Cam_Dusk"]
    cam = new_camera(sc, "Pitch_Seasons", 35)
    cam.data.sensor_fit = "VERTICAL"
    cam.data.sensor_height = 36 * 9 / 16
    eye = src.location.copy()
    eye = pivot + (eye - pivot) * 0.85
    look(cam, eye, pivot + Vector((0, 0, 40)))
    plan = season_plan(a.sched_out)
    orbit_keys(cam, pivot, 1, len(plan), turn_deg=28.0, push=0.15, lift=10.0)
    snows = {}
    info = []
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    for f, (name, path, hour) in enumerate(plan, start=1):
        if (f - 1) % a.step:
            continue
        if name not in snows:
            snows[name] = snow_hours(path, "basel")
            with open(path, newline="") as fh:
                snows[name + "_date"] = next(csv.DictReader(fh))["time"][:10]
        date = datetime.strptime(snows[name + "_date"], "%Y-%m-%d")
        local = date + timedelta(hours=hour)
        elev, az = dn.sun_position(local)
        dn.light_sky(SK, sc, sky, bg, sun, gains, elev, az, "basel")
        depth = snows[name].get(int(hour), (0.0, 0.0))[0]
        for v in covers:
            v.outputs[0].default_value = min(1.0, depth / dn.SNOW_FULL_M)
        sc.frame_set(f)
        sc.render.filepath = str(out / f"{f:04d}.png")
        bpy.ops.render.render(write_still=True)
        info.append(
            {"frame": f, "day": name, "csv": path, "hour": hour, "elev": round(elev, 2)}
        )
    (out / "plan.json").write_text(json.dumps(info, indent=1))
    return sc, None


SETUP_FRAMES = 72  # shot 4 right half: the setup at speed comes first (setup.py)


def shot_xray(a):
    """Shot 4, right half after the setup: the X-ray pass (xray.py), driven by the same
    scheduler rows as the left half."""
    import daynight as dn
    import xray

    h = ks.prepare(6)
    sc = h["scene"]
    ks.setup_render(sc, a.width, a.height, a.samples)
    sc.render.use_persistent_data = True
    cam = new_camera(sc, "Pitch_Xray", 24)
    cam.data.sensor_fit = "HORIZONTAL"
    for o in sc.objects:
        if o.name == "Wall_Front" or o.name.startswith("Batten"):
            o.visible_camera = False
    x = xray.build(h, dn.FLOW)
    # Dim the room so the ghosted shells and the water read as light.
    for o in sc.objects:
        if o.type == "LIGHT":
            o.data.energy *= 0.22
    sc.view_settings.exposure = -0.8
    cfg = dn.find_config(Path(a.sched_out))
    kpis = json.loads((Path(a.sched_out) / "kpis.json").read_text())
    n = int(kpis["servers_per_house"])
    full = n * float(cfg["server"]["power_kw"]) * float(cfg["server"]["heat_recovery"])
    tank = float(cfg["house"]["tank_kwh"])
    plan = season_plan(a.sched_out)
    rows = {}
    for name in SEASON_DAYS:
        with open(Path(a.sched_out) / f"day_{name}.csv", newline="") as fh:
            rows[name] = {int(r["hour"]): r for r in csv.DictReader(fh)}
    backup_max = (
        max(float(r["backup_kwh"]) for d in rows.values() for r in d.values()) or 1.0
    )
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    phase, angle, info = 0.0, 0.0, []
    ghosted = set()
    for i in range(xray.FRAMES):
        name, _, hour = plan[min(len(plan) - 1, SETUP_FRAMES + i)]
        r = rows[name][int(hour)]
        hk = float(r["heat_produced"]) / full
        frac = float(r["soc_kwh"]) / tank
        ks.apply_state(
            h,
            servers_on=round(float(r["server_hours"])),
            tank_frac=frac,
            heat_frac=hk,
            backup_frac=float(r["backup_kwh"]) / backup_max,
            space_frac=0.0,
            draw_on=False,
        )
        for dev, f0, *_ in xray.STOPS:
            if dev in xray.DEVICES and i >= f0 and dev not in ghosted:
                xray.ghost_objects(dev, x["ghost"])
                ghosted.add(dev)
        phase += 0.004 + 0.03 * hk
        angle += 0.6 * hk
        for m in x["flows"]:
            m.node_tree.nodes["Phase"].outputs[0].default_value = phase
            m.node_tree.nodes["Gain"].inputs[1].default_value = 0.25 + 0.75 * hk
        x["impeller"].rotation_euler = (0, angle, 0)
        hgt = 1.45
        warm, cool = x["warm"], x["cool"]
        warm.scale.z = max(1e-3, hgt * frac)
        warm.location.z = 0.25 + hgt * (1 - frac)
        warm.hide_render = frac <= 0.005
        cool.scale.z = max(1e-3, hgt * (1 - frac))
        cool.hide_render = frac >= 0.995
        el = x["element"].node_tree.nodes["Principled BSDF"]
        el.inputs["Emission Strength"].default_value = (
            12.0 * float(r["backup_kwh"]) / backup_max
        )
        eye, tgt, lens = xray.camera_at(i)
        look(cam, eye, tgt)
        cam.data.lens = lens
        bpy.context.view_layer.update()
        if i % a.step == 0:
            sc.render.filepath = str(out / f"{i + 1:04d}.png")
            bpy.ops.render.render(write_still=True)
        at = {k: ks.project(sc, v) for k, v in xray.LABEL_AT.items() if v}
        info.append({"frame": i + 1, "day": name, "hour": hour, "anchors": at})
    (out / "plan.json").write_text(json.dumps(info))
    return sc, None


SHOTS = {
    "title": shot_title,
    "fly-city": shot_fly_city,
    "fly-campus": shot_fly_campus,
    "basement": shot_basement,
    "seasons": shot_seasons,
    "xray": shot_xray,
}


def main():
    a = args()
    sc, n = SHOTS[a.shot](a)
    if n is None:
        return  # the shot rendered its own frames
    sc.frame_start, sc.frame_end, sc.frame_step = 1, n, a.step
    sc.render.fps = FPS
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    sc.render.filepath = str(out) + "/"
    bpy.ops.render.render(animation=True)


main()
