"""X-ray pass through the plant room for shot 4 of the pitch film (right half, portrait).

Imported by pitch_shots.py (shot "xray"), inside Blender, on assets/plantroom.blend. The
camera visits the devices in order. As it reaches each one its casing turns into a ghosted,
holographic shell and the water inside shows: through cold plates in every server, through
the plate heat exchanger and the pump, into the tank, where the warm layer at the top is as
deep as the tank's charge, and the backup heater's element glows with its power. Servers,
tank, flow speed and heater all follow the scheduler's rows for the frame (same days as the
left half); nothing is keyframed except the camera.

For every frame it also writes the image position of each device, for the labels.
"""

import itertools
import math

import bmesh
import bpy
import kachel_scene as ks
from mathutils import Vector

# (name, first frame, last frame, camera eye, camera target, lens): frames count from 0.
STOPS = [
    ("rack", 0, 48, (0.55, -1.25, 1.35), (-0.5, 0.05, 0.75), 24),
    ("hx", 48, 96, (1.95, -0.05, 1.05), (1.52, 1.2, 0.55), 26),
    ("pump", 96, 132, (1.55, 0.35, 1.45), (0.95, 1.38, 1.1), 30),
    ("tank", 132, 204, (2.1, -1.25, 1.55), (3.0, 0.75, 0.95), 24),
    ("heater", 204, 240, (1.75, -0.15, 1.1), (2.68, 0.6, 0.92), 32),
    ("overview", 240, 264, (3.4, -2.4, 2.0), (0.95, 0.7, 1.05), 20),
]
FRAMES = 264
LABEL_AT = {
    "rack": (-0.55, -0.62, 0.86),
    "hx": (1.52, 1.0, 0.95),
    "pump": (0.95, 1.3, 1.25),
    "tank": (3.0, 0.37, 1.5),
    "heater": None,  # filled from the heater object
}
CYAN = (0.25, 0.85, 1.0)


def ghost_material():
    m = bpy.data.materials.new("Xray_Ghost")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    lw = nt.nodes.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.35
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*CYAN, 1)
    em.inputs["Strength"].default_value = 3.0
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mx = nt.nodes.new("ShaderNodeMixShader")
    pw = nt.nodes.new("ShaderNodeMath")
    pw.operation = "POWER"
    pw.inputs[1].default_value = 2.2
    nt.links.new(lw.outputs["Facing"], pw.inputs[0])
    add = nt.nodes.new("ShaderNodeMath")
    add.operation = "ADD"
    add.inputs[1].default_value = 0.03
    add.use_clamp = True
    nt.links.new(pw.outputs[0], add.inputs[0])
    nt.links.new(add.outputs[0], mx.inputs[0])
    nt.links.new(tr.outputs[0], mx.inputs[1])
    nt.links.new(em.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs["Surface"])
    m.blend_method = "BLEND" if hasattr(m, "blend_method") else None
    return m


def flow_material(name, colour):
    """Emissive dashes running along a tube's length (U), shifted by a Phase value."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    uv = nt.nodes.new("ShaderNodeUVMap")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(uv.outputs["UV"], sep.inputs[0])
    phase = nt.nodes.new("ShaderNodeValue")
    phase.name = "Phase"
    sub = nt.nodes.new("ShaderNodeMath")
    sub.operation = "SUBTRACT"
    nt.links.new(sep.outputs["X"], sub.inputs[0])
    nt.links.new(phase.outputs[0], sub.inputs[1])
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = 9.0  # dashes per metre
    nt.links.new(sub.outputs[0], mul.inputs[0])
    fr = nt.nodes.new("ShaderNodeMath")
    fr.operation = "FRACT"
    nt.links.new(mul.outputs[0], fr.inputs[0])
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = 0.35
    ramp.inputs["From Max"].default_value = 0.95
    ramp.inputs["To Min"].default_value = 0.6
    ramp.inputs["To Max"].default_value = 5.0
    nt.links.new(fr.outputs[0], ramp.inputs["Value"])
    gain = nt.nodes.new("ShaderNodeMath")
    gain.operation = "MULTIPLY"
    gain.name = "Gain"
    gain.inputs[1].default_value = 1.0
    nt.links.new(ramp.outputs["Result"], gain.inputs[0])
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*colour, 1)
    nt.links.new(gain.outputs[0], em.inputs["Strength"])
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m


def tube(name, pts, radius, mat, coll, sides=10):
    """A mesh tube through the points, with U = distance along it (metres)."""
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
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            ring.append(
                bm.verts.new(p + (side * math.cos(a) + up * math.sin(a)) * radius)
            )
        rings.append(ring)
        us.append(u)
    for i in range(len(rings) - 1):
        for k in range(sides):
            k2 = (k + 1) % sides
            f = bm.faces.new(
                (rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k])
            )
            for lp, uu, vv in zip(f.loops, (us[i], us[i], us[i + 1], us[i + 1]),
                                  (k / sides, k2 / sides, k2 / sides, k / sides), strict=True):  # fmt: skip
                lp[uvl].uv = (uu, vv)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def dense(path, step=0.05):
    """Insert points so the tube bends round corners and dashes run evenly."""
    out = []
    for a, b in itertools.pairwise(path):
        a, b = Vector(a), Vector(b)
        n = max(1, int((b - a).length / step))
        out += [a + (b - a) * k / n for k in range(n)]
    out.append(Vector(path[-1]))
    return out


def server_cold_plates(hot, cold):
    """Inside the server model (so every rack slot gets them): four cold plates in a
    serpentine loop from the rear supply connector back to the return connector."""
    src = bpy.data.collections["ServerSource"]
    copper = bpy.data.materials.new("Xray_Copper")
    copper.use_nodes = True
    p = copper.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (0.8, 0.38, 0.2, 1)
    p.inputs["Metallic"].default_value = 1.0
    p.inputs["Roughness"].default_value = 0.3
    p.inputs["Emission Color"].default_value = (1.0, 0.45, 0.2, 1)
    p.inputs["Emission Strength"].default_value = 0.6
    z = 0.13
    plates = [(-0.13, 0.12), (0.03, 0.12), (-0.13, -0.08), (0.03, -0.08)]
    for i, (x, y) in enumerate(plates):
        me = bpy.data.meshes.new(f"Xray_Plate{i}")
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co = Vector((v.co.x * 0.1, v.co.y * 0.12, v.co.z * 0.018))
        bm.to_mesh(me)
        bm.free()
        me.materials.append(copper)
        ob = bpy.data.objects.new(f"Xray_Plate{i}", me)
        ob.location = (x, y, z)
        src.objects.link(ob)
    zt = z + 0.016
    supply = [
        (0.125, 0.43, 0.21),
        (0.125, 0.3, zt),
        (0.03, 0.12, zt),
        (-0.13, 0.12, zt),
    ]
    back = [(-0.13, -0.08, zt), (0.03, -0.08, zt), (0.19, 0.05, zt), (0.19, 0.3, zt),
            (0.125, 0.43, 0.135)]  # fmt: skip
    tube("Xray_ServerIn", dense(supply), 0.006, cold, src)
    tube(
        "Xray_ServerCross",
        dense([(-0.13, 0.12, zt), (-0.13, -0.08, zt)]),
        0.006,
        hot,
        src,
    )
    tube("Xray_ServerOut", dense(back), 0.006, hot, src)


def build(h, flow):
    """Ghost material, flow tubes, cold plates, tank layers and heater element."""
    coll = h["coll"]
    ghost = ghost_material()
    hot = flow_material("Xray_FlowHot", (1.0, 0.22, 0.06))
    cold = flow_material("Xray_FlowCold", (0.15, 0.5, 1.0))
    server_cold_plates(hot, cold)
    tubes = []
    for kind, mat in (("hot", hot), ("cold", cold)):
        for i, path in enumerate(flow[kind]):
            tubes.append(tube(f"Xray_{kind}{i}", dense(path), 0.022, mat, coll))
    # Rack manifolds: cool water down the supply riser, warm up the return riser.
    tube(
        "Xray_ManifoldIn",
        dense([(-0.4, 0.55, 2.2), (-0.4, 0.55, 0.2)]),
        0.016,
        cold,
        coll,
    )
    tube(
        "Xray_ManifoldOut",
        dense([(-0.3, 0.55, 0.2), (-0.3, 0.55, 2.2)]),
        0.016,
        hot,
        coll,
    )
    # Heat exchanger: the two circuits in counter-flow across the plate pack.
    hx_hot = [(1.23, 1.28, 0.8), (1.4, 1.25, 0.8)]
    for k in range(6):
        hx_hot += [(1.4 + 0.05 * k, 1.25 - 0.1 * (k % 2), 0.8 - 0.1 * k)]
    hx_hot += [(1.68, 1.2, 0.25), (1.23, 1.12, 0.2)]
    tube("Xray_HXHot", dense(hx_hot), 0.012, hot, coll)
    hx_cold = [(1.82, 1.28, 0.26)] + [
        (1.68 - 0.05 * k, 1.15 + 0.1 * (k % 2), 0.3 + 0.1 * k) for k in range(6)
    ] + [(1.82, 1.12, 0.8)]  # fmt: skip
    tube("Xray_HXCold", dense(hx_cold), 0.012, cold, coll)
    # Pump impeller, turned by the flow.
    imp = bpy.data.objects.new("Xray_Impeller", None)
    imp.location = (0.95, 1.42, 1.14)
    coll.objects.link(imp)
    blade_mat = bpy.data.materials.new("Xray_Blade")
    blade_mat.use_nodes = True
    bp = blade_mat.node_tree.nodes["Principled BSDF"]
    bp.inputs["Base Color"].default_value = (0.9, 0.9, 0.95, 1)
    bp.inputs["Emission Color"].default_value = (*CYAN, 1)
    bp.inputs["Emission Strength"].default_value = 1.5
    for k in range(6):
        me = bpy.data.meshes.new(f"Xray_Blade{k}")
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co = Vector((v.co.x * 0.05, v.co.y * 0.006, v.co.z * 0.08))
        bm.to_mesh(me)
        bm.free()
        me.materials.append(blade_mat)
        b = bpy.data.objects.new(f"Xray_Blade{k}", me)
        b.parent = imp
        b.rotation_euler = (0, math.radians(60 * k), 0)
        b.location = (
            0.025 * math.cos(math.radians(60 * k)),
            0,
            -0.025 * math.sin(math.radians(60 * k)),
        )
        coll.objects.link(b)
    # Tank water: two layers, the warm one on top as deep as the charge.
    layers = {}
    for name, col in (
        ("Xray_TankWarm", (1.0, 0.3, 0.07)),
        ("Xray_TankCool", (0.12, 0.4, 1.0)),
    ):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        p = m.node_tree.nodes["Principled BSDF"]
        p.inputs["Base Color"].default_value = (*col, 1)
        p.inputs["Emission Color"].default_value = (*col, 1)
        p.inputs["Emission Strength"].default_value = 1.4
        p.inputs["Alpha"].default_value = 0.75
        me = bpy.data.meshes.new(name)
        bm = bmesh.new()
        bmesh.ops.create_cone(
            bm, cap_ends=True, segments=48, radius1=0.33, radius2=0.33, depth=1.0
        )
        bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 0.5))  # origin at the bottom
        bm.to_mesh(me)
        bm.free()
        me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        ob.location = (3.0, 0.75, 0.25)
        coll.objects.link(ob)
        layers[name] = ob
    # Heater element: a rod into the tank from the heater head.
    el_mat = bpy.data.materials.new("Xray_Element")
    el_mat.use_nodes = True
    ep = el_mat.node_tree.nodes["Principled BSDF"]
    ep.inputs["Base Color"].default_value = (0.5, 0.5, 0.5, 1)
    ep.inputs["Emission Color"].default_value = (1.0, 0.35, 0.05, 1)
    head = h["heater_pt"]
    inward = (Vector((3.0, 0.75, head.z)) - head).normalized()
    tube("Xray_Element", dense([head, head + inward * 0.55]), 0.012, el_mat, coll)
    LABEL_AT["heater"] = tuple(head)
    return {
        "ghost": ghost,
        "flows": (hot, cold),
        "impeller": imp,
        "warm": layers["Xray_TankWarm"],
        "cool": layers["Xray_TankCool"],
        "element": el_mat,
        "tubes": tubes,
    }


DEVICES = {
    "rack": lambda o: (
        o.name.startswith(("Rack_", "Blank_", "Switch", "Patch_", "PDU", "Manifold"))
        or (
            o.users_collection
            and o.users_collection[0].name == "ServerSource"
            and not o.name.startswith(("Xray_", "LightBar", "StatusLED", "Accent"))
        )
    ),
    "hx": lambda o: o.name.startswith(("HX_", "Valve_HX")),
    "pump": lambda o: o.name.startswith(("PrimPump_", "Pump_", "Pipe_")),
    "tank": lambda o: o.name.startswith(("Tank_", "Gauge", "ExpVessel")),
    "heater": lambda o: o.name.startswith("Heater_") and o.name != "Heater_Lamp",
}


def ghost_objects(device, ghost):
    for o in bpy.data.objects:
        if o.type == "MESH" and DEVICES[device](o):
            for slot in o.material_slots:
                slot.link = "OBJECT"
                slot.material = ghost


def camera_at(frame):
    """Eye, target and lens for a frame: eased moves between the stops."""
    for i, (_, f0, f1, eye, tgt, lens) in enumerate(STOPS):
        if f0 <= frame < f1 or i == len(STOPS) - 1:
            prev = STOPS[i - 1] if i else STOPS[0]
            move = min(
                1.0, (frame - f0) / 14.0
            )  # 14 frames to travel, then a slow drift
            s = move * move * (3 - 2 * move)
            e = Vector(prev[3]).lerp(Vector(eye), s)
            t = Vector(prev[4]).lerp(Vector(tgt), s)
            drift = (frame - f0) / max(1, f1 - f0)
            e = e + (Vector(tgt) - Vector(eye)).normalized() * 0.12 * drift
            return e, t, prev[5] + (lens - prev[5]) * s
    raise ValueError(frame)


def project(scene, p):
    return ks.project(scene, p)
