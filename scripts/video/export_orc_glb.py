"""Export the heat pump + ORC concept as one model for the operator: docs/models/orc-concept.glb.

    blender --background scripts/video/assets/orc_skid.blend \
        --python scripts/video/export_orc_glb.py -- --out docs/models/orc-concept.glb

Run it on a copy of orc_skid.blend: it changes the open scene. Export only, no render.

The chain from the film's shot 12, in a line: the server rack and the plate heat exchanger from
plantroom.blend, a small heat pump (the stand-in built in pitch_shots.heatpump_unit, here with a
solid casing), then the ORC skid from orc_skid.blend: evaporator, turbine, generator and
condenser. Each part is one named node (Rack, HeatExchanger, HeatPump, Evaporator, Turbine,
Generator, Condenser, Skid) so a viewer can pull them apart and label them. The pipes that carry
the flow are named Flow_* and have U = metres along the pipe, for running dashes. Spin_* nodes
turn about their own axis (the turbine shaft, the condenser fans). The signs and flow arrows of
the film are left out, and nothing here is a measured design: it is a concept.

Metres, +Z up in Blender (+Y up in the glTF). Meshes are Draco-compressed; the rack's servers are
decimated until the file is under --max-mb.
"""

import argparse
import itertools
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ASSETS = Path(__file__).resolve().parent / "assets"

# Where the plant-room parts go: the rack and the heat exchanger stand left of the skid.
RACK_SHIFT = Vector((-3.9, 0.0, 0.0))
HX_SHIFT = Vector((-5.03, -1.2, 0.0))
HP_AT = Vector((-1.75, 0.0, 0.0))

# Server parts nobody sees from outside the chassis, dropped to keep the file small.
SERVER_INSIDE = (
    "Lbl_",
    "Hose_",
    "FanR_",
    "QD_",
    "PSU",
    "Lid_Screw",
    "LC_",
    "RearFanLED",
    "GPU",
)

GROUPS = {
    "Evaporator": ("Evap_", "Fl_HotIn", "Fl_CoolOut"),
    "Turbine": ("Turbine_", "Valve_", "Coupling"),
    "Generator": ("Gen_",),
    "Condenser": ("Cond_", "CondFan"),
    "Skid": ("Skid_", "Pedestal", "HotIn_Support", "Pump_"),
}
ORC_PIPES = {
    "Pipe_HotIn": "Flow_HotIn",
    "Pipe_Vapour": "Flow_Vapour",
    "Pipe_Exhaust": "Flow_Exhaust",
    "Pipe_Liquid": "Flow_Liquid",
    "Pipe_Liquid2": "Flow_Liquid2",
    "Pipe_CoolOut": "Flow_CoolOut",
}


def material(name, colour, rough=0.45, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*colour, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    return m


def block(name, size, loc, mat, coll):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2])) + Vector(
            loc
        )
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def dense(path, step=0.05):
    out = []
    for a, b in itertools.pairwise(path):
        a, b = Vector(a), Vector(b)
        n = max(1, int((b - a).length / step))
        out += [a + (b - a) * k / n for k in range(n)]
    out.append(Vector(path[-1]))
    return out


def tube(name, pts, radius, mat, coll, sides=12):
    """A mesh tube through the points, U = metres along it (as xray.tube)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new()
    pts = [Vector(p) for p in pts]
    rings, us, u = [], [], 0.0
    for i, p in enumerate(pts):
        if i:
            u += (p - pts[i - 1]).length
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        side = d.cross(Vector((0, 0, 1)))
        if side.length < 1e-3:
            side = d.cross(Vector((1, 0, 0)))
        side.normalize()
        up = side.cross(d)
        rings.append(
            [
                bm.verts.new(
                    p
                    + (
                        side * math.cos(2 * math.pi * k / sides)
                        + up * math.sin(2 * math.pi * k / sides)
                    )
                    * radius
                )
                for k in range(sides)
            ]
        )
        us.append(u)
    for i in range(len(rings) - 1):
        for k in range(sides):
            k2 = (k + 1) % sides
            f = bm.faces.new(
                (rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k])
            )
            for lp, uu, vv in zip(
                f.loops,
                (us[i], us[i], us[i + 1], us[i + 1]),
                (k / sides, k2 / sides, k2 / sides, k / sides),
                strict=True,
            ):
                lp[uvl].uv = (uu, vv)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def cylinder(name, a, b, radius, mat, coll, sides=24):
    return tube(name, [a, b], radius, mat, coll, sides)


def bounds(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def group(name, objs, coll, at=(0, 0, 0)):
    """An empty that holds the part; children keep their place in the world."""
    e = bpy.data.objects.new(name, None)
    e.location = at
    coll.objects.link(e)
    bpy.context.view_layer.update()
    for o in objs:
        if o.parent is None or o.parent.name not in {x.name for x in objs}:
            mw = o.matrix_world.copy()
            o.parent = e
            o.matrix_parent_inverse = e.matrix_world.inverted()
            o.matrix_world = mw
    return e


def clean_orc():
    """Drop the film's signs, arrows, studio and cameras; recolour what would read green."""
    for o in list(bpy.data.objects):
        drop = (
            o.type in {"CAMERA", "LIGHT", "FONT"}
            or o.name.startswith(("Sign_", "Cyclorama", "Pump_LED"))
            or "_Arrow" in o.name
            or (
                o.users_collection
                and o.users_collection[0].name in {"ORC_Labels", "Studio"}
            )
        )
        if drop:
            bpy.data.objects.remove(o)
    liquid = bpy.data.materials.get("Pipe_Liquid")
    if liquid:  # condensed working fluid: steel grey, not the film's green
        liquid.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (
            0.2,
            0.22,
            0.25,
            1,
        )
    # Unparent the skid's parts; each goes into its own group below.
    skid = bpy.data.objects.get("ORC_Skid")
    for o in list(bpy.data.objects):
        if o.parent == skid:
            mw = o.matrix_world.copy()
            o.parent = None
            o.matrix_world = mw
    if skid:
        bpy.data.objects.remove(skid)


def load_plantroom(coll):
    """The rack (with its four servers made real) and the plate heat exchanger."""
    with bpy.data.libraries.load(str(ASSETS / "plantroom.blend"), link=False) as (
        src,
        dst,
    ):
        dst.collections = ["Rack", "ServerSource"]
        dst.objects = [n for n in src.objects if n.startswith(("HX_", "Valve_HX"))]
    for o in list(bpy.data.collections["ServerSource"].all_objects):
        if o.name.startswith(SERVER_INSIDE):
            bpy.data.objects.remove(o)
    rack = bpy.data.collections["Rack"]
    sc = bpy.context.scene
    sc.collection.children.link(rack)
    for o in rack.all_objects:
        if o.parent is None:
            o.location += RACK_SHIFT
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    inst = [o for o in rack.all_objects if o.instance_type == "COLLECTION"]
    for o in inst:
        o.select_set(True)
    bpy.context.view_layer.objects.active = inst[0]
    bpy.ops.object.duplicates_make_real(use_base_parent=True, use_hierarchy=True)
    hx = []
    for o in dst.objects:
        if o is None:
            continue
        coll.objects.link(o)
        o.location += HX_SHIFT
        hx.append(o)
    bpy.context.view_layer.update()
    return [o for o in rack.all_objects if o.type in {"MESH", "EMPTY"}], hx


def heat_pump(coll):
    """A small water-to-water heat pump: a powder-coated casing (the viewer shows it see-through),
    compressor, plate condenser, expansion valve, evaporator fins and the copper refrigerant loop."""
    steel = material("HP_Steel", (0.6, 0.6, 0.62), 0.35, 1.0)
    fins = material("HP_Fins", (0.55, 0.57, 0.6), 0.4, 1.0)
    copper = material("HP_Copper", (0.72, 0.38, 0.2), 0.3, 1.0)
    casing = material("HP_Casing", (0.86, 0.87, 0.88), 0.55)
    frame = material("Skid_Frame", (0.09, 0.1, 0.11), 0.45)
    ox, oy, oz = HP_AT

    def at(p):
        return (p[0] + ox, p[1] + oy, p[2] + oz)

    objs = [
        block("HP_Casing", (1.1, 0.5, 0.95), at((0, 0, 0.575)), casing, coll),
        block("HP_Base", (1.14, 0.54, 0.06), at((0, 0, 0.07)), frame, coll),
    ]
    for i, x in enumerate((-0.5, 0.5)):
        objs.append(
            block(f"HP_Foot{i}", (0.06, 0.5, 0.04), at((x, 0, 0.02)), frame, coll)
        )
    for k in range(24):
        objs.append(
            block(
                f"HP_Fin{k}",
                (0.004, 0.08, 0.7),
                at((-0.48 + 0.04 * k, 0.17, 0.55)),
                fins,
                coll,
            )
        )
    objs.append(
        cylinder(
            "HP_Compressor",
            at((-0.3, -0.05, 0.1)),
            at((-0.3, -0.05, 0.42)),
            0.11,
            steel,
            coll,
        )
    )
    objs.append(
        cylinder(
            "HP_CompressorCap",
            at((-0.3, -0.05, 0.42)),
            at((-0.3, -0.05, 0.46)),
            0.08,
            steel,
            coll,
        )
    )
    objs.append(
        block("HP_Condenser", (0.16, 0.08, 0.3), at((0.3, -0.1, 0.35)), copper, coll)
    )
    objs.append(
        block("HP_Valve", (0.05, 0.05, 0.08), at((0.05, -0.12, 0.75)), steel, coll)
    )
    loop = [(-0.3, -0.05, 0.46), (-0.3, -0.05, 0.6), (0.3, -0.1, 0.6), (0.3, -0.1, 0.52),
            (0.3, -0.1, 0.2), (0.3, -0.1, 0.12), (0.05, -0.12, 0.12), (0.05, -0.12, 0.75),
            (-0.45, 0.12, 0.85), (0.45, 0.12, 0.85), (0.45, 0.12, 0.25), (-0.45, 0.12, 0.25),
            (-0.3, -0.05, 0.3)]  # fmt: skip
    objs.append(
        tube("HP_Refrigerant", dense([at(p) for p in loop]), 0.012, copper, coll)
    )
    return objs


def flows(coll, gen_box):
    """The pipes between the parts, each a Flow_* tube with U = metres."""
    pipe = material("Pipe_Insulated", (0.16, 0.17, 0.19), 0.6)
    cable = material("Cable_Power", (0.08, 0.08, 0.09), 0.5)
    rx = -0.3 + RACK_SHIFT.x  # the rack's rear risers (as in the plant room)
    paths = {
        # Warm water from the servers' cold plates to the heat exchanger
        "Flow_ServerWarm": [(rx, 0.55, 1.95), (rx, 0.55, 2.12), (-3.98, 0.55, 2.12),
                            (-3.98, 0.55, 0.8), (-3.98, 0.08, 0.8), (-3.84, 0.08, 0.8)],
        # Cooled water back to the servers
        "Flow_ServerReturn": [(-3.84, -0.08, 0.2), (-4.06, -0.08, 0.2), (-4.06, 0.7, 0.2),
                              (rx - 0.1, 0.7, 0.2), (rx - 0.1, 0.55, 0.2)],
        # From the heat exchanger into the heat pump
        "Flow_ToHeatPump": [(-3.15, -0.08, 0.8), (-2.62, -0.08, 0.8), (-2.62, -0.08, 0.45),
                            (-2.3, -0.08, 0.45)],
        "Flow_HeatPumpReturn": [(-2.3, 0.08, 0.26), (-3.15, 0.08, 0.26)],
        # Lifted, hotter water from the heat pump into the ORC's evaporator
        "Flow_Lifted": [(-1.2, -0.1, 0.62), (-0.72, -0.1, 0.62), (-0.72, -0.38, 0.62),
                        (-0.72, -0.38, 0.85), (-0.15, -0.38, 0.85)],
        # Water back from the evaporator to the heat pump
        "Flow_ORCReturn": [(-0.15, -0.25, 0.32), (-0.9, -0.25, 0.32), (-0.9, 0.1, 0.32),
                           (-1.2, 0.1, 0.32)],
    }  # fmt: skip
    out = []
    for name, path in paths.items():
        out.append(tube(name, dense(path), 0.035, pipe, coll))
    top = Vector((gen_box.x, gen_box.y, gen_box.z))
    power = [top, top + Vector((0, 0, 1.25 - (top.z - 1.1))), (top.x, 0.0, 2.35),
             (-4.45, 0.0, 2.35), (-4.45, 0.0, 2.02)]  # fmt: skip
    out.append(tube("Flow_Power", dense(power), 0.012, cable, coll, 8))
    return out


def metres_along(ob):
    """Rewrite a film pipe's UVs so U is metres along it, like the Flow_* tubes. The film maps
    0..1 on one axis; the axis along the pipe is the one whose equal values form small rings."""
    me = ob.data
    uv = me.uv_layers[0].data
    best = None
    for axis in (0, 1):
        rings = {}
        for poly in me.polygons:
            for li in poly.loop_indices:
                key = round(uv[li].uv[axis], 4)
                rings.setdefault(key, []).append(
                    Vector(me.vertices[me.loops[li].vertex_index].co)
                )
        spread = 0.0
        centres = {}
        for key, pts in rings.items():
            c = sum(pts, Vector()) / len(pts)
            centres[key] = c
            spread += max((p - c).length for p in pts)
        spread /= len(rings)
        if best is None or spread < best[0]:
            best = (spread, axis, centres)
    _, axis, centres = best
    keys = sorted(centres)
    metres, run = {}, 0.0
    for i, k in enumerate(keys):
        if i:
            run += (centres[k] - centres[keys[i - 1]]).length
        metres[k] = run
    for d in uv:
        d.uv = (metres[round(d.uv[axis], 4)], d.uv[1 - axis])


def spin(name, objs, coll, axis_at):
    e = bpy.data.objects.new(name, None)
    e.location = axis_at
    coll.objects.link(e)
    bpy.context.view_layer.update()
    for o in objs:
        mw = o.matrix_world.copy()
        o.parent = e
        o.matrix_parent_inverse = e.matrix_world.inverted()
        o.matrix_world = mw
    return e


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--max-mb", type=float, default=3.0)
    a = ap.parse_args(argv)

    sc = bpy.context.scene
    clean_orc()
    coll = bpy.data.collections.new("Concept")
    sc.collection.children.link(coll)
    orc = [o for o in sc.objects if o.type in {"MESH", "EMPTY"}]

    # The turbine shaft and its coupling turn together; the condenser fans on their own.
    shaft_parts = [
        o
        for o in orc
        if o.name.startswith(
            ("Turbine_Rotor", "Turbine_Hub", "Turbine_Shaft", "Coupling")
        )
    ]
    lo, hi = bounds([bpy.data.objects["Turbine_Shaft"]])
    shaft = spin("Spin_Shaft", shaft_parts, coll, (lo + hi) / 2)
    for o in orc:  # the fans' empties already sit on their axes
        if o.type == "EMPTY" and o.name.startswith("Cond_Fan"):
            o.name = "Spin_" + o.name
    for old, new in ORC_PIPES.items():
        if old in bpy.data.objects:
            bpy.data.objects[old].name = new
            metres_along(bpy.data.objects[new])

    parts = {}
    for gname, prefixes in GROUPS.items():
        objs = [
            o
            for o in sc.objects
            if o.parent is None
            and o.name.startswith(prefixes)
            and o.type in {"MESH", "EMPTY"}
        ]
        if gname == "Turbine":
            objs.append(shaft)
        if gname == "Condenser":
            objs += [o for o in sc.objects if o.name.startswith("Spin_Cond_Fan")]
        parts[gname] = group(gname, list(dict.fromkeys(objs)), coll)

    rack_objs, hx = load_plantroom(coll)
    parts["Rack"] = group("Rack", [o for o in rack_objs if o.parent is None], coll)
    parts["HeatExchanger"] = group("HeatExchanger", hx, coll)
    parts["HeatPump"] = group("HeatPump", heat_pump(coll), coll)

    gbox = bpy.data.objects["Gen_TerminalBox"]
    glo, ghi = bounds([gbox])
    gtop = Vector(((glo.x + ghi.x) / 2, (glo.y + ghi.y) / 2, ghi.z))
    flow_objs = flows(coll, gtop)
    orc_pipes = [
        bpy.data.objects[n] for n in ORC_PIPES.values() if n in bpy.data.objects
    ]
    group("Pipes", flow_objs + orc_pipes, coll)

    keep = set()
    for root in [*parts.values(), bpy.data.objects["Pipes"]]:
        keep.add(root)
        keep.update(root.children_recursive)
    bpy.context.view_layer.update()

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    rack_meshes = [o for o in parts["Rack"].children_recursive if o.type == "MESH"]
    for ratio in (1.0, 0.5, 0.3, 0.2, 0.12):
        if ratio < 1.0:
            for o in rack_meshes:
                if len(o.data.polygons) > 150:
                    m = o.modifiers.get("Decimate") or o.modifiers.new(
                        "Decimate", "DECIMATE"
                    )
                    m.ratio = ratio
        bpy.ops.object.select_all(action="DESELECT")
        for o in keep:
            if o.name in sc.objects:
                o.select_set(True)
        bpy.ops.export_scene.gltf(
            filepath=str(out),
            export_format="GLB",
            use_selection=True,
            export_apply=True,
            export_cameras=False,
            export_lights=False,
            export_texcoords=True,  # the Flow_* pipes carry U = metres for the dashes
            export_extras=False,
            use_active_scene=True,
            export_draco_mesh_compression_enable=True,  # load with three.js DRACOLoader
            export_draco_mesh_compression_level=6,
        )
        mb = out.stat().st_size / 1e6
        print(f"decimate {ratio}: {mb:.2f} MB", flush=True)
        if mb <= a.max_mb:
            break


main()
