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
    farm        shot 11: a winter farm with a server shed, solar field and the warm-water run
                to the farmhouse, the shed going X-ray (8 s; on assets/plantroom.blend)
    heatpump    shot 12, first half: X-ray of a heat pump, refrigerant and water circuits (4 s;
                run with --factory-startup and no .blend)
    orc         shot 12, second half: the ORC skid (assets/orc_skid.blend) into its cutaway,
                casings ghosted; a concept (4 s)
    tower       shot 12b, first half: rising up the tallest tower at dusk (4 s; frames only)
    plantfloor  shot 12b, second half: a plant floor with rows of racks and tanks (4 s)
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

import bmesh
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
    # The campus ground ends a few hundred metres out; a far plane keeps the edge out of view.
    far = bpy.data.meshes.new("Far_Ground")
    far.from_pydata(
        [(-2e4, -2e4, -0.3), (2e4, -2e4, -0.3), (2e4, 2e4, -0.3), (-2e4, 2e4, -0.3)],
        [],
        [(0, 1, 2, 3)],
    )
    fm = bpy.data.materials.new("Far_Ground")
    fm.use_nodes = True
    fm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (
        0.05,
        0.05,
        0.06,
        1,
    )
    far.materials.append(fm)
    sc.collection.objects.link(bpy.data.objects.new("Far_Ground", far))
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


def mat(name, colour, rough=0.6, emit=None, strength=0.0, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*colour, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if emit:
        p.inputs["Emission Color"].default_value = (*emit, 1)
        p.inputs["Emission Strength"].default_value = strength
    return m


def block(name, size, loc, m, coll, rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bm.to_mesh(me)
    bm.free()
    me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    o.location, o.rotation_euler = loc, rot
    coll.objects.link(o)
    return o


def gable(name, w, d, h, ridge, loc, wall, roof, coll):
    """A gable-roofed house: walls w x d x h, ridge `ridge` above the eaves, along y."""
    x, y, z = loc
    block(name + "_Walls", (w, d, h), (x, y, z + h / 2), wall, coll)
    me = bpy.data.meshes.new(name + "_Roof")
    o = 0.4  # overhang
    v = [(-w / 2 - o, -d / 2 - o, h), (w / 2 + o, -d / 2 - o, h), (0, -d / 2 - o, h + ridge),
         (-w / 2 - o, d / 2 + o, h), (w / 2 + o, d / 2 + o, h), (0, d / 2 + o, h + ridge)]  # fmt: skip
    me.from_pydata(v, [], [(0, 2, 5, 3), (1, 4, 5, 2), (0, 1, 2), (3, 5, 4)])
    me.materials.append(roof)
    r = bpy.data.objects.new(name + "_Roof", me)
    r.location = (x, y, z)
    coll.objects.link(r)
    return r


def shot_farm(a):
    """Shot 11: a farm in winter. A shed holds the plant room (servers, heat exchanger,
    tank), a field of solar panels stands on the lawn, snow lies as deep as the Bern snow
    day says at noon, and the shed's walls go X-ray to show the plant and the warm water
    running to the farmhouse. Servers, tank and flow follow that day's 12:00 row."""
    import daynight as dn
    import xray
    from snowdata import snow_hours

    days = Path(a.sched_out) / "bern"
    day = days / "day_snow.csv"
    with open(day, newline="") as fh:
        row = {int(r["hour"]): r for r in csv.DictReader(fh)}[12]
    depth = snow_hours(day, "bern")[12][0]
    kpis = json.loads((days / "kpis.json").read_text())
    cfg = dn.find_config(days)
    n_srv = int(kpis["servers_per_house"])
    h = ks.prepare(n_srv)
    sc = h["scene"]
    ks.setup_render(sc, a.width, a.height, a.samples)
    sc.render.use_persistent_data = True
    full = (
        n_srv * float(cfg["server"]["power_kw"]) * float(cfg["server"]["heat_recovery"])
    )
    hk = float(row["heat_produced"]) / full
    ks.apply_state(
        h,
        servers_on=round(float(row["server_hours"])),
        tank_frac=float(row["soc_kwh"]) / float(cfg["house"]["tank_kwh"]),
        heat_frac=hk,
        backup_frac=min(1.0, float(row["backup_kwh"]) / full),
        space_frac=0.0,
        draw_on=False,
    )
    coll = bpy.data.collections.new("Farm")
    sc.collection.children.link(coll)
    for o in sc.objects:
        if o.name.startswith(("Batten", "Ceiling", "Wall_Front")):
            o.hide_render = True
    # Winter noon in Bern: the real sun, a clear sky.
    dn.LAT, dn.LON = dn.CITIES["bern"]
    date = datetime.strptime(row["time"][:10], "%Y-%m-%d")
    elev, az = dn.sun_position(date + timedelta(hours=12))
    w = sc.world
    w.use_nodes = True
    nt = w.node_tree
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sun_elevation, sky.sun_rotation = math.radians(elev), math.radians(90 - az)
    nt.links.new(sky.outputs[0], nt.nodes["Background"].inputs[0])
    nt.nodes["Background"].inputs[1].default_value = 0.12
    sd = bpy.data.lights.new("Farm_Sun", "SUN")
    sd.energy, sd.angle = 1.6, math.radians(1.5)
    sun = bpy.data.objects.new("Farm_Sun", sd)
    sun.rotation_euler = (math.radians(90 - elev), 0, math.radians(90 - az + 90))
    coll.objects.link(sun)
    sc.view_settings.exposure = -1.7
    # Ground and snow, white as far as the depth goes (full at 10 cm).
    cover = min(1.0, depth / dn.SNOW_FULL_M)
    snow = mat(
        "Farm_Snow", tuple((0.3 + 0.32 * cover) * k for k in (1.0, 1.02, 1.08)), 0.7
    )
    gm = bpy.data.meshes.new("Farm_Ground")
    gm.from_pydata(
        [
            (-400, -400, -0.02),
            (400, -400, -0.02),
            (400, 400, -0.02),
            (-400, 400, -0.02),
        ],
        [],
        [(0, 1, 2, 3)],
    )
    gm.materials.append(snow)
    coll.objects.link(bpy.data.objects.new("Farm_Ground", gm))
    # The shed round the plant room, and the farmhouse.
    wood = mat("Farm_Wood", (0.25, 0.14, 0.08), 0.8)
    plaster = mat("Farm_Plaster", (0.75, 0.7, 0.6), 0.8)
    roof_snow = mat("Farm_RoofSnow", tuple(0.25 + 0.35 * cover for _ in range(3)), 0.6)
    shed = [gable("Shed", 5.4, 4.7, 2.85, 1.2, (1.25, -0.5, 0), wood, roof_snow, coll)]
    shed.append(bpy.data.objects["Shed_Walls"])
    gable("House", 11.0, 13.0, 6.5, 3.6, (14.0, 19.0, 0), plaster, roof_snow, coll)
    warm = mat("Farm_Window", (0.2, 0.15, 0.1), 0.2, (1.0, 0.7, 0.4), 6.0)
    for k in range(4):
        for z in (1.6, 4.4):
            block(
                f"House_Win{k}{z}",
                (1.1, 0.06, 1.3),
                (10.2 + 2.6 * k, 12.48, z),
                warm,
                coll,
            )
    # A field of ground-mounted solar panels on the lawn south of the shed.
    pv = mat("Farm_PV", (0.02, 0.03, 0.06), 0.15, metal=0.3)
    frame = mat("Farm_Frame", (0.6, 0.6, 0.62), 0.4, metal=1.0)
    for r_ in range(5):
        for k in range(14):
            x, y = -9.0 + 1.75 * k, -9.0 - 4.2 * r_
            block(
                f"PV_{r_}_{k}",
                (1.7, 1.0, 0.04),
                (x, y, 1.1),
                pv,
                coll,
                (math.radians(30), 0, 0),
            )
            block(
                f"PV_Leg_{r_}_{k}", (0.06, 0.06, 1.1), (x, y + 0.2, 0.55), frame, coll
            )
    # Warm water to the farmhouse and back, in the ground.
    hot, cold = (
        xray.flow_material("Farm_FlowHot", (1.0, 0.25, 0.06)),
        xray.flow_material("Farm_FlowCold", (0.15, 0.5, 1.0)),
    )
    run = [
        (2.6, 1.7, 0.3),
        (2.6, 3.0, 0.05),
        (13.0, 3.0, 0.05),
        (13.0, 12.0, 0.05),
        (13.0, 12.6, 0.6),
    ]
    back = [(p[0] + 0.5, p[1], p[2]) for p in run][::-1]
    xray.tube("Farm_RunHot", xray.dense(run, 0.1), 0.09, hot, coll)
    xray.tube("Farm_RunCold", xray.dense(back, 0.1), 0.09, cold, coll)
    ghost = xray.ghost_material()
    cam = new_camera(sc, "Pitch_Farm", 28)
    n = 192
    path_keys(
        cam,
        [
            (1, (-26, -48, 26), (4, 2, 0), 28),
            (80, (-12, -20, 12), (2, 0, 1), 30),
            (140, (-4.5, -7.5, 4.0), (1.5, 0, 1.0), 24),
            (n, (5, -6, 7), (12, 12, 2), 24),
        ],
    )
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    phase = 0.0
    xray_at = 95
    for f in range(1, n + 1, a.step):
        if f >= xray_at and "ghosted" not in sc:
            for o in shed + [
                o
                for o in sc.objects
                if o.name.startswith(("Wall_", "Shed_", "Skirt", "Door"))
            ]:
                for slot in o.material_slots:
                    slot.link = "OBJECT"
                    slot.material = ghost
            sc["ghosted"] = 1
        phase += (0.004 + 0.03 * hk) * a.step
        for m in (hot, cold):
            m.node_tree.nodes["Phase"].outputs[0].default_value = phase
            m.node_tree.nodes["Gain"].inputs[1].default_value = 0.25 + 0.75 * hk
        sc.frame_set(f)
        sc.render.filepath = str(out / f"{f:04d}.png")
        bpy.ops.render.render(write_still=True)
    (out / "label.json").write_text(
        json.dumps({"snow_depth_m": depth, "row": row["time"]})
    )
    return sc, None


def studio(sc, strength=0.35):
    """A dark studio: graphite floor, soft key and rim lights, near-black background."""
    w = bpy.data.worlds.new("Studio")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.012, 0.014, 0.018, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    sc.world = w
    coll = sc.collection
    fl = bpy.data.meshes.new("Studio_Floor")
    fl.from_pydata(
        [(-30, -30, 0), (30, -30, 0), (30, 30, 0), (-30, 30, 0)], [], [(0, 1, 2, 3)]
    )
    fl.materials.append(mat("Studio_Floor", (0.03, 0.032, 0.036), 0.35))
    coll.objects.link(bpy.data.objects.new("Studio_Floor", fl))
    for name, loc, e, size in (
        ("Key", (-2.5, -3.0, 3.5), 400, 2.5),
        ("Rim", (2.5, 3.0, 2.5), 250, 2.0),
    ):
        ld = bpy.data.lights.new(name, "AREA")
        ld.energy, ld.size = e * strength, size
        lo = bpy.data.objects.new(name, ld)
        lo.location = loc
        lo.rotation_euler = (
            (Vector((0, 0, 0.6)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        )
        coll.objects.link(lo)


def shot_heatpump(a):
    """Shot 12, first half: X-ray of a heat pump. The casing is a ghosted shell; inside, the
    refrigerant circuit (violet) runs compressor, condenser, expansion valve, evaporator,
    and the water circuit (red out, blue back) leaves through the condenser. Illustrative:
    no figures."""
    import xray

    sc = bpy.context.scene
    for o in list(sc.objects):  # the factory scene's cube, lamp and camera
        bpy.data.objects.remove(o)
    ks.setup_render(sc, a.width, a.height, a.samples)
    studio(sc)
    coll = sc.collection
    ghost = xray.ghost_material()
    refr = xray.flow_material("HP_Refrigerant", (0.65, 0.25, 1.0))
    hot = xray.flow_material("HP_WaterHot", (1.0, 0.25, 0.06))
    cold = xray.flow_material("HP_WaterCold", (0.15, 0.5, 1.0))
    steel = mat("HP_Steel", (0.6, 0.6, 0.62), 0.35, metal=1.0)
    fins = mat("HP_Fins", (0.55, 0.6, 0.65), 0.4, metal=1.0)
    copper = mat("HP_Copper", (0.8, 0.4, 0.2), 0.3, metal=1.0)
    block("HP_Casing", (1.1, 0.5, 1.0), (0, 0, 0.55), ghost, coll)
    block("HP_Base", (1.14, 0.54, 0.05), (0, 0, 0.03), steel, coll)
    for k in range(24):  # evaporator fins at the back
        block(
            f"HP_Fin{k}", (0.004, 0.08, 0.8), (-0.48 + 0.04 * k, 0.17, 0.55), fins, coll
        )
    comp = xray.tube(
        "HP_Compressor",
        [(-0.3, -0.05, 0.08), (-0.3, -0.05, 0.42)],
        0.11,
        steel,
        coll,
        24,
    )
    comp.name = "HP_Compressor"
    block("HP_Condenser", (0.16, 0.08, 0.3), (0.3, -0.1, 0.35), copper, coll)
    block("HP_Valve", (0.05, 0.05, 0.08), (0.05, -0.12, 0.75), steel, coll)
    loop = [(-0.3, -0.05, 0.43), (-0.3, -0.05, 0.6), (0.3, -0.1, 0.6), (0.3, -0.1, 0.52),
            (0.3, -0.1, 0.2), (0.3, -0.1, 0.12), (0.05, -0.12, 0.12), (0.05, -0.12, 0.75),
            (-0.45, 0.12, 0.85), (0.45, 0.12, 0.85), (0.45, 0.12, 0.25), (-0.45, 0.12, 0.25),
            (-0.3, -0.05, 0.3)]  # fmt: skip
    xray.tube("HP_Loop", xray.dense(loop), 0.012, refr, coll)
    xray.tube(
        "HP_WaterOut",
        xray.dense([(0.38, -0.1, 0.45), (0.75, -0.1, 0.45), (1.6, -0.1, 0.45)]),
        0.025,
        hot,
        coll,
    )
    xray.tube(
        "HP_WaterIn",
        xray.dense([(1.6, -0.1, 0.25), (0.75, -0.1, 0.25), (0.38, -0.1, 0.25)]),
        0.025,
        cold,
        coll,
    )
    cam = new_camera(sc, "Pitch_HP", 35)
    n = 96
    path_keys(
        cam,
        [
            (1, (-1.6, -2.6, 1.5), (0.1, 0, 0.5), 35),
            (n, (1.4, -2.2, 1.2), (0.2, 0, 0.5), 40),
        ],
    )
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    for f in range(1, n + 1, a.step):
        for m in (refr, hot, cold):
            m.node_tree.nodes["Phase"].outputs[0].default_value = 0.02 * f
        sc.frame_set(f)
        sc.render.filepath = str(out / f"{f:04d}.png")
        bpy.ops.render.render(write_still=True)
    return sc, None


def shot_orc(a):
    """Shot 12, second half: the ORC skid from heat-atlas (a copy in assets), orbiting into
    its cutaway view while the casings turn to ghosted shells. A concept, with no figures;
    the label is added when encoding. Its sign texts are hidden."""
    import xray

    sc = bpy.context.scene
    ks.setup_render(sc, a.width, a.height, a.samples)
    lab = bpy.data.collections.get("ORC_Labels")
    if lab:
        for o in lab.all_objects:
            o.hide_render = True
    ghost = xray.ghost_material()
    hero, cut = bpy.data.objects["Cam_ORC_Hero"], bpy.data.objects["Cam_ORC_Cutaway"]
    cam = new_camera(sc, "Pitch_ORC", hero.data.lens)
    n = 96
    keys = []
    for f, c_ in ((1, hero), (n, cut)):
        fwd = c_.matrix_world.to_3x3() @ Vector((0, 0, -1))
        keys.append((f, c_.location.copy(), c_.location + fwd * 3, c_.data.lens))
    path_keys(cam, keys)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    for f in range(1, n + 1, a.step):
        if f == 40 or (f > 40 and "ghosted" not in sc):
            for o in sc.objects:
                if (
                    o.type == "MESH"
                    and o.name.startswith(("Turbine", "Evap", "Cond", "Gen"))
                    and "Fan" not in o.name
                ):
                    for slot in o.material_slots:
                        slot.link = "OBJECT"
                        slot.material = ghost
            sc["ghosted"] = 1
        sc.frame_set(f)
        sc.render.filepath = str(out / f"{f:04d}.png")
        bpy.ops.render.render(write_still=True)
    return sc, None


def shot_tower(a):
    """Shot 12b, first half: at dusk the camera rises up the tallest tower in the skyline,
    from street level to the crown, looking at the facade. Frames only."""
    SK = skyline()
    sc = bpy.context.scene
    ks.setup_render(sc, a.width, a.height, a.samples)
    sc.render.use_persistent_data = True
    dusk(SK, sc)
    t = json.loads(sc["meta"])["tallest"]
    c0 = Vector((t["cx"], t["cy"], 0))
    # Back towards the dusk camera, across the river, so nothing stands in between.
    src = bpy.data.objects["Cam_Dusk"].location
    away = Vector((src.x - c0.x, src.y - c0.y, 0)).normalized() * 480
    cam = new_camera(sc, "Pitch_Tower", 45)
    n = 96
    path_keys(
        cam,
        [
            (1, c0 + away + Vector((0, 0, 40)), c0 + Vector((0, 0, 50)), 50),
            (
                n,
                c0 + away * 0.85 + Vector((0, 0, t["zmax"] + 30)),
                c0 + Vector((0, 0, t["zmax"] - 30)),
                45,
            ),
        ],
    )
    return sc, n


def shot_plantfloor(a):
    """Shot 12b, second half: a plant floor in a tall building, with rows of server racks and
    hot-water tanks, as an illustration of scale (built from the plant-room models)."""
    h = ks.prepare(6)
    sc = h["scene"]
    ks.setup_render(sc, a.width, a.height, a.samples)
    sc.render.use_persistent_data = True
    for o in sc.objects:
        room = o.users_collection and o.users_collection[0].name in (
            "Room",
            "Tray",
            "Pipes",
        )
        if room and not o.name.startswith(("Tank_", "Heater_")):
            o.hide_render = True
    tank = bpy.data.collections.new("TankSet")
    for o in list(sc.objects):
        if o.name.startswith(("Tank_", "Heater_")):
            homes = list(o.users_collection)
            tank.objects.link(o)
            for c_ in homes:  # only the instances of the set are drawn
                c_.objects.unlink(o)
    tank.instance_offset = (3.0, 0.75, 0)
    rack = bpy.data.collections["Rack"]
    rack.instance_offset = (-0.55, 0, 0)
    sc.collection.children.unlink(rack)  # drawn only through its instances
    coll = bpy.data.collections.new("Floor")
    sc.collection.children.link(coll)
    for i in range(10):
        for row, y in enumerate((-3.0, 3.0)):
            e = bpy.data.objects.new(f"Rack_{row}_{i}", None)
            e.instance_type, e.instance_collection = "COLLECTION", rack
            e.location = (-12 + 1.0 * i, y, 0)
            e.rotation_euler = (0, 0, 0 if row else math.pi)  # fronts face the aisle
            coll.objects.link(e)
    for i in range(4):
        e = bpy.data.objects.new(f"Tank_{i}", None)
        e.instance_type, e.instance_collection = "COLLECTION", tank
        e.location = (-12 + 3.0 * i, 6.5, 0)
        coll.objects.link(e)
    concrete = mat("Floor_Concrete", (0.42, 0.42, 0.4), 0.7)
    block("Floor_Slab", (40, 20, 0.2), (0, 0, -0.1), concrete, coll)
    block("Floor_Ceiling", (40, 20, 0.3), (0, 0, 3.6), concrete, coll)
    for k in range(10):
        for y in (-2.0, 2.0):
            ld = bpy.data.lights.new(f"Floor_Light{k}{y}", "AREA")
            ld.energy, ld.size = 90, 1.6
            lo = bpy.data.objects.new(f"Floor_Light{k}{y}", ld)
            lo.location = (-14 + 2.5 * k, y, 3.4)
            coll.objects.link(lo)
    for o in sc.objects:
        if o.name.startswith("Server_U"):
            o["on"] = 1.0
    cam = new_camera(sc, "Pitch_Floor", 24)
    n = 96
    path_keys(
        cam,
        [(1, (-16, 0.3, 1.6), (-8, 0, 1.2), 22), (n, (-6, 0.5, 2.2), (2, 3, 1.0), 22)],
    )
    return sc, n


SHOTS = {
    "title": shot_title,
    "fly-city": shot_fly_city,
    "fly-campus": shot_fly_campus,
    "basement": shot_basement,
    "seasons": shot_seasons,
    "xray": shot_xray,
    "farm": shot_farm,
    "heatpump": shot_heatpump,
    "orc": shot_orc,
    "tower": shot_tower,
    "plantfloor": shot_plantfloor,
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
