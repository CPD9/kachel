"""Render segment 2, "Setup": the plant room assembled step by step.

Run by `make video-setup`, inside Blender:

    blender --background scripts/video/assets/plantroom.blend \
        --python scripts/video/setup.py -- --out ~/.cache/kachel/video/work/setup

The room starts empty. The rack slides in and its six servers slide into it,
the plate heat exchanger and the tank are set down, the supply (red) and the
return (blue) pipes run from left to right, the pumps and valves go in, and the
sensors and the controller appear. At the end the system comes alive: servers
light up and the pipes take their colour. This segment is keyframed; it shows
the build, not data.

It writes frames/0001.png ... and labels.json, the word labels with where they
point and when they appear, for compose_setup.py.
"""

import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kachel_scene as ks

FPS = 24
HIDDEN = set()  # objects hidden before any keyframe is set
END = 480  # 20 s

# Steps: (group, first frame, last frame, caption)
STEPS = [
    ("rack", 18, 66, "The rack goes in"),
    ("servers", 60, 132, "Six servers, water-cooled"),
    ("hx", 132, 174, "Plate heat exchanger"),
    ("tank", 174, 222, "Hot-water tank with backup heater"),
    ("hot", 222, 282, "Supply and return pipes"),
    ("cold", 246, 306, "Supply and return pipes"),
    ("fittings", 300, 336, "Pumps and valves"),
    ("sensors", 336, 396, "Sensors and controller"),
    ("alive", 400, 440, "Running"),
]

PREFIXES = {
    "hx": ("HX_",),
    "tank": ("Tank_", "Gauge", "Heater_", "ExpVessel"),
    "hot": (
        "Pipe_PrimaryReturn",
        "Pipe_SecondaryHot",
        "Hanger_R",
        "HangerY_R",
        "WallBracket_R",
        "WallClamp_R",
    ),
    "cold": (
        "Pipe_PrimarySupply",
        "Pipe_SecondaryCold",
        "PSup_",
        "Hanger_S",
        "HangerY_S",
        "WallBracket_S",
        "WallClamp_S",
    ),
    "fittings": ("Valve_", "PrimPump_", "Pump_"),
    "sensors": ("TT1", "TT2", "Ctrl_"),
    "cables": ("Cable", "Tray_", "Riser_"),
}


def args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--width", type=int, default=1920)
    ap.add_argument("--height", type=int, default=1080)
    ap.add_argument("--samples", type=int, default=32)
    ap.add_argument("--frames", default="", help="first,last to render a part")
    ap.add_argument(
        "--step", type=int, default=1, help="render every n-th frame (previews)"
    )
    return ap.parse_args(argv)


def group_of(o):
    for g, pre in PREFIXES.items():
        if o.name.startswith(pre):
            return g
    return None


def bbox(objs):
    pts = []
    for o in objs:
        for d in [o, *o.children_recursive]:
            if d.type == "MESH":
                pts += [d.matrix_world @ Vector(c) for c in d.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    return lo, hi


def holder(name, objs, at):
    """Parent the root objects of a group to a new empty at `at`."""
    e = bpy.data.objects.new(name, None)
    e.location = at
    bpy.context.scene.collection.objects.link(e)
    bpy.context.view_layer.update()
    for o in objs:
        mw = o.matrix_world.copy()
        o.parent = e
        o.matrix_parent_inverse = e.matrix_world.inverted()
        o.matrix_world = mw
    return e


def key_move(obj, f0, f1, start, end, prop="location"):
    setattr(obj, prop, start)
    obj.keyframe_insert(prop, frame=f0)
    setattr(obj, prop, end)
    obj.keyframe_insert(prop, frame=f1)


def key_show(o, frame):
    """Hidden before `frame`, shown from it (and its children with it)."""
    for d in [o, *o.children_recursive]:
        if d.name in HIDDEN:
            continue  # left out of the video for good (see kachel_scene)
        d.hide_render = True
        d.keyframe_insert("hide_render", frame=frame - 1)
        d.hide_render = False
        d.keyframe_insert("hide_render", frame=frame)


def wipe(mat, x_from, x_to, f0, f1):
    """Reveal a material from left to right in world x: transparent beyond `reveal`."""
    nt = mat.node_tree
    out = nt.nodes["Material Output"]
    shader = out.inputs["Surface"].links[0].from_socket
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    val = nt.nodes.new("ShaderNodeValue")
    val.name = "reveal"
    gt = nt.nodes.new("ShaderNodeMath")
    gt.operation = "GREATER_THAN"
    mix = nt.nodes.new("ShaderNodeMixShader")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    nt.links.new(geo.outputs["Position"], sep.inputs[0])
    nt.links.new(sep.outputs["X"], gt.inputs[0])
    nt.links.new(val.outputs[0], gt.inputs[1])
    nt.links.new(gt.outputs[0], mix.inputs[0])
    nt.links.new(shader, mix.inputs[1])
    nt.links.new(tr.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    sock = val.outputs[0]
    sock.default_value = x_from
    sock.keyframe_insert("default_value", frame=f0)
    sock.default_value = x_to
    sock.keyframe_insert("default_value", frame=f1)
    return x_from, x_to


def main():
    a = args()
    h = ks.prepare()
    scene = h["scene"]
    ks.setup_render(scene, a.width, a.height, a.samples)
    scene.render.use_persistent_data = True
    scene.frame_start, scene.frame_end = 1, END
    scene.render.fps = FPS
    ks.apply_state(
        h,
        servers_on=0,
        tank_frac=0,
        heat_frac=0,
        backup_frac=0,
        space_frac=0,
        draw_on=False,
    )
    HIDDEN.update(o.name for o in scene.objects if o.hide_render)
    HIDDEN.difference_update(s.name for s in h["servers"])
    HIDDEN.discard(h["strip"].name)
    st = {g: (f0, f1) for g, f0, f1, _ in STEPS}
    groups = {}
    for o in list(scene.objects):
        if o.parent is None:
            g = group_of(o)
            if g:
                groups.setdefault(g, []).append(o)
    labels = []

    def lab(text, point, frame, colour="ink"):
        labels.append(
            {
                "text": text,
                "at": ks.project(scene, point),
                "frame": frame,
                "colour": colour,
            }
        )

    # Rack slides in from the front; its servers slide into their slots.
    rack = bpy.data.objects["RackRoot"]
    home = rack.location.copy()
    f0, f1 = st["rack"]
    key_move(rack, f0, f1, home + Vector((0, -1.2, 0)), home)
    for s in h["servers"]:
        s.hide_render = True
    f0, f1 = st["servers"]
    n = len(h["servers"])
    for i, s in enumerate(h["servers"]):
        a0 = f0 + i * (f1 - f0 - 18) // max(1, n - 1)
        key_show(s, a0)
        key_move(s, a0, a0 + 18, s.location + Vector((0, -0.75, 0)), s.location.copy())
    for o in groups.get("cables", []):
        key_show(o, st["rack"][1])
    lab("Server rack", (-0.55, -0.58, 1.9), st["rack"][1])
    lab("Servers", (-0.55, -0.62, 0.86), st["servers"][0] + 30)

    # Heat exchanger is set down from above; the tank slides in from the right.
    lo, hi = bbox(groups["hx"])
    e = holder("Grp_HX", groups["hx"], (lo + hi) / 2)
    f0, f1 = st["hx"]
    key_move(e, f0, f1, e.location + Vector((0, 0, 1.4)), e.location.copy())
    key_show(e, f0)
    lab("Heat exchanger", ((lo.x + hi.x) / 2, lo.y, hi.z), f1)
    lo, hi = bbox(groups["tank"])
    e = holder("Grp_Tank", groups["tank"], (lo + hi) / 2)
    f0, f1 = st["tank"]
    key_move(e, f0, f1, e.location + Vector((1.8, 0, 0)), e.location.copy())
    key_show(e, f0)
    lab("Tank", (3.0, 0.37, 1.45), f1)
    lab("Backup heater", tuple(h["heater_pt"]), f1 + 10)

    # Pipes run from the servers to the tank: a left-to-right wipe of the
    # cladding, with every other part shown as the wipe passes it.
    for g, key in (("hot", "hot"), ("cold", "cold")):
        lo, hi = bbox(groups[g])
        f0, f1 = st[g]
        x0, x1 = wipe(h["pipes"][key], lo.x - 0.05, hi.x + 0.05, f0, f1)
        for o in groups[g]:
            olo, _ = bbox([o])
            t = (olo.x - x0) / (x1 - x0)
            key_show(o, int(f0 + max(0.0, min(1.0, t)) * (f1 - f0)))
    lab("Supply", (0.39, 1.28, 2.5), st["hot"][0] + 30, "hot")
    lab("Return", (0.28, 1.42, 2.32), st["cold"][0] + 30, "cold")

    f0, f1 = st["fittings"]
    fit = sorted(groups["fittings"], key=lambda o: bbox([o])[0].x)
    for i, o in enumerate(fit):
        key_show(o, f0 + i * (f1 - f0) // max(1, len(fit)))
    lab("Pump", (0.95, 1.2, 1.14), f0 + 6)

    # Sensors and controller pop in, one tag at a time.
    f0, f1 = st["sensors"]
    tags = {}
    for o in groups["sensors"]:
        tags.setdefault(o.name.split("_")[0], []).append(o)
    for i, (tag, objs) in enumerate(sorted(tags.items())):
        lo, hi = bbox(objs)
        e = holder(f"Grp_{tag}", objs, (lo + hi) / 2)
        a0 = f0 + i * (f1 - f0 - 12) // max(1, len(tags) - 1)
        key_move(e, a0, a0 + 10, (0.01, 0.01, 0.01), (1.0, 1.0, 1.0), "scale")
        key_show(e, a0)
        if tag == "Ctrl":
            blo, bhi = bbox([bpy.data.objects["Ctrl_Box"]])
            lab("Controller", tuple((blo + bhi) / 2), a0 + 6)
        elif i == 1:
            lab("Temperature sensors", tuple((lo + hi) / 2), a0 + 6)

    # The system comes alive: servers on, pipes coloured.
    f0, f1 = st["alive"]
    for s in h["servers"]:
        s["on"] = 0.0
        s.keyframe_insert('["on"]', frame=f0)
        s["on"] = 1.0
        s.keyframe_insert('["on"]', frame=f1)
    strip = h["strip"]
    strip.hide_render = False
    key_move(strip, f0, f1 + 30, (1, 1, 1e-4), (1, 1, strip["z_span"] * 0.6), "scale")
    for key, colour in (("hot", ks.RED), ("cold", ks.BLUE)):
        m = h["pipes"][key]
        p = m.node_tree.nodes["Principled BSDF"]
        for f, k in ((f0, 0.0), (f1, 0.8)):
            ks._tint(m, colour, k)
            p.inputs["Base Color"].keyframe_insert("default_value", frame=f)
            p.inputs["Emission Strength"].keyframe_insert("default_value", frame=f)
            p.inputs["Metallic"].keyframe_insert("default_value", frame=f)

    out = Path(a.out)
    (out / "frames").mkdir(parents=True, exist_ok=True)
    (out / "labels.json").write_text(
        json.dumps({"fps": FPS, "end": END, "steps": STEPS, "labels": labels}, indent=1)
    )
    if a.frames:
        scene.frame_start, scene.frame_end = (int(x) for x in a.frames.split(","))
    scene.frame_step = a.step
    scene.render.filepath = str(out / "frames") + "/"
    bpy.ops.render.render(animation=True)


main()
