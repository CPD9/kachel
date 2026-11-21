"""Shared plant-room set-up for the pitch video segments.

Loaded inside Blender by scheduler.py and setup.py. It takes the plant room in
assets/plantroom.blend and adds what the video needs: two more servers so the
rack holds the six of the reference house, a level strip on the tank, an
electric backup heater on the tank, and per-object materials whose glow is set
from outside (servers on or off, pipe heat, heater power, tank level). It also
builds a second scene, "Flat", a small bathroom corner with a radiator and a
shower, rendered as an inset.

Nothing here is keyframed. apply_state() sets every value for one hour of the
scheduler's output and the caller renders a still.
"""

import math

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

U = 0.0445  # one rack unit in metres
TANK_CENTRE = Vector((3.0, 0.75))
TANK_RADIUS = 0.38
HOT_PIPES = ("Pipe_PrimaryReturn", "Pipe_SecondaryHot")
COLD_PIPES = (
    "Pipe_PrimarySupply",
    "Pipe_PrimarySupplyLow",
    "Pipe_SecondaryColdA",
    "Pipe_SecondaryColdB",
)
RED = (0.85, 0.07, 0.04)
BLUE = (0.05, 0.25, 0.9)
WARM = (1.0, 0.32, 0.08)


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple((int(h[i : i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4))


def principled(name, colour, rough=0.4, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*colour, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    return m


def box(name, size, loc, mat, coll, bevel=0.0):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if bevel:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=2, affect="EDGES")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    o.location = loc
    me.materials.append(mat)
    coll.objects.link(o)
    for p in me.polygons:
        p.use_smooth = bool(bevel)
    return o


def cylinder(name, r, depth, loc, mat, coll, rot=(0, 0, 0), verts=32):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, segments=verts, radius1=r, radius2=r, depth=depth
    )
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = len(p.vertices) == 4
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.rotation_euler = rot
    me.materials.append(mat)
    coll.objects.link(o)
    return o


def glow_material(base, name, colour, rough=None):
    """Copy a material and expose its emission so a state can set it."""
    m = base.copy()
    m.name = name
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Emission Color"].default_value = (*colour, 1)
    p.inputs["Emission Strength"].default_value = 0.0
    if rough is not None:
        p.inputs["Roughness"].default_value = rough
    return m


def instancer_gate(mat, prop="on"):
    """Multiply a material's emission by a custom property on the instancing empty."""
    nt = mat.node_tree
    p = nt.nodes["Principled BSDF"]
    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_type = "INSTANCER"
    attr.attribute_name = prop
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = p.inputs["Emission Strength"].default_value
    nt.links.new(attr.outputs["Fac"], mul.inputs[0])
    nt.links.new(mul.outputs[0], p.inputs["Emission Strength"])


def _servers(scene):
    """Add two servers above the four in the rack and gate their lights per instance."""
    objs = bpy.data.objects
    existing = sorted(
        (o for o in objs if o.name.startswith("Server_U")), key=lambda o: o.location.z
    )
    if len(existing) < 6:
        for b in [
            o for o in objs if o.name.startswith("Blank_U") and o.name != "Blank_U40"
        ]:
            b.hide_render = b.hide_viewport = True
        step = existing[1].location.z - existing[0].location.z
        last = existing[-1]
        for k in range(1, 7 - len(existing)):
            n = last.copy()
            u = int(last.name.split("_U")[1]) + 6 * k
            n.name = f"Server_U{u}"
            n.location.z = last.location.z + step * k
            for c in last.users_collection:
                c.objects.link(n)
        bpy.context.view_layer.update()
        existing = sorted(
            (o for o in objs if o.name.startswith("Server_U")),
            key=lambda o: o.location.z,
        )
    # Lights inside the server collection: give them their own gated copies.
    src = bpy.data.collections["ServerSource"]
    swapped = {}
    for o in src.all_objects:
        if o.type != "MESH":
            continue
        for slot in o.material_slots:
            m = slot.material
            if m is None or m.name not in ("LED_Green", "LED_Amber", "Anodised_Teal"):
                continue
            if m.name not in swapped:
                g = m.copy()
                g.name = "Srv_" + m.name
                p = g.node_tree.nodes["Principled BSDF"]
                if m.name == "Anodised_Teal":
                    p.inputs["Emission Color"].default_value = (0.1, 0.75, 0.85, 1)
                    p.inputs["Emission Strength"].default_value = 30.0
                instancer_gate(g)
                swapped[m.name] = g
            slot.material = swapped[m.name]
    for s in existing:
        s["on"] = 1.0
    return existing


def _tank_strip(coll):
    """A level strip on the tank front: dark glass channel with a warm fill."""
    ang = math.radians(-105)
    pos = TANK_CENTRE + Vector((math.cos(ang), math.sin(ang))) * (TANK_RADIUS + 0.012)
    z0, z1 = 0.32, 1.66
    frame = principled("Strip_Frame", hex_rgb("#3a3f46"), 0.35, 0.8)
    glass = principled("Strip_Glass", (0.02, 0.02, 0.025), 0.15)
    box(
        "Tank_Strip_Frame",
        (0.09, 0.012, z1 - z0 + 0.06),
        (pos.x, pos.y, (z0 + z1) / 2),
        frame,
        coll,
        0.004,
    )
    box(
        "Tank_Strip_Glass",
        (0.06, 0.006, z1 - z0),
        (pos.x, pos.y - 0.007, (z0 + z1) / 2),
        glass,
        coll,
    )
    fill = principled("Strip_Fill", (0.75, 0.12, 0.02), 0.3)
    p = fill.node_tree.nodes["Principled BSDF"]
    p.inputs["Emission Color"].default_value = (1.0, 0.16, 0.02, 1)
    p.inputs["Emission Strength"].default_value = 0.5
    f = box(
        "Tank_Strip_Fill", (0.05, 0.004, 1.0), (pos.x, pos.y - 0.011, z0), fill, coll
    )
    # Origin at the bottom so scale.z is the level.
    f.data.transform(Matrix.Translation((0, 0, 0.5)))
    f["z_span"] = z1 - z0
    # Tick marks every quarter.
    tick = principled("Strip_Tick", (0.85, 0.85, 0.85), 0.5)
    for i in range(5):
        z = z0 + (z1 - z0) * i / 4
        box(
            f"Tank_Strip_Tick{i}",
            (0.022, 0.004, 0.004),
            (pos.x + 0.058, pos.y - 0.004, z),
            tick,
            coll,
        )
    return f


def _backup_heater(coll):
    """Electric immersion heater on the tank front with a terminal head and lamp."""
    ang = math.radians(-160)
    d = Vector((math.cos(ang), math.sin(ang), 0))
    base = Vector((*TANK_CENTRE, 0.0)) + d * TANK_RADIUS
    z = 0.92
    rot = (math.radians(90), 0, ang + math.radians(90))
    steel = bpy.data.materials["BrushedSteel"]
    head = principled("Heater_Head", hex_rgb("#d9d9d6"), 0.45)
    lamp = principled("Heater_Lamp", (0.4, 0.1, 0.02), 0.25)
    lp = lamp.node_tree.nodes["Principled BSDF"]
    lp.inputs["Emission Color"].default_value = (1.0, 0.25, 0.03, 1)
    parts = [
        cylinder(
            "Heater_Boss",
            0.075,
            0.05,
            base + d * 0.02 + Vector((0, 0, z)),
            steel,
            coll,
            rot,
        ),
        cylinder(
            "Heater_Cap",
            0.065,
            0.11,
            base + d * 0.1 + Vector((0, 0, z)),
            head,
            coll,
            rot,
        ),
        cylinder(
            "Heater_Lamp",
            0.016,
            0.02,
            base + d * 0.16 + Vector((0, 0, z + 0.02)),
            lamp,
            coll,
            rot,
        ),
        cylinder(
            "Heater_Gland",
            0.012,
            0.05,
            base + d * 0.1 + Vector((0, 0, z - 0.08)),
            bpy.data.materials["Rubber_Black"],
            coll,
        ),
    ]
    ring = principled("Heater_Ring", (0.3, 0.08, 0.02), 0.3)
    rp = ring.node_tree.nodes["Principled BSDF"]
    rp.inputs["Emission Color"].default_value = (1.0, 0.35, 0.05, 1)
    parts.append(
        cylinder(
            "Heater_Ring",
            0.067,
            0.012,
            base + d * 0.052 + Vector((0, 0, z)),
            ring,
            coll,
            rot,
        )
    )
    return parts, base + d * 0.12 + Vector((0, 0, z))


def _pipe_materials():
    base = bpy.data.materials["Pipe_Cladding"]
    mats = {}
    for names, colour, key in ((HOT_PIPES, RED, "hot"), (COLD_PIPES, BLUE, "cold")):
        m = glow_material(base, f"Pipe_{key.title()}", colour)
        mats[key] = m
        for n in names:
            o = bpy.data.objects.get(n)
            if o is None:
                continue
            for slot in o.material_slots:
                if slot.material == base:
                    slot.material = m
    # The painted marker words on the primary loop say "return" on the hot pipe;
    # the video names the hot side the supply, so leave the bands without words.
    for o in bpy.data.objects:
        if o.name.startswith("Pipe_Primary") and o.name.endswith("_Text"):
            o.hide_render = o.hide_viewport = True
    return mats


def _flat_scene():
    """A bathroom corner of the flat upstairs: a panel radiator and a shower."""
    if "Flat" in bpy.data.scenes:
        return bpy.data.scenes["Flat"]
    sc = bpy.data.scenes.new("Flat")
    coll = sc.collection
    plaster = principled("Flat_Plaster", hex_rgb("#e9e4da"), 0.85)
    tile = principled("Flat_Tile", hex_rgb("#7f98a3"), 0.12)
    oak = principled("Flat_Oak", hex_rgb("#a77d55"), 0.5)
    chrome = principled("Flat_Chrome", (0.9, 0.9, 0.9), 0.08, 1.0)
    rad = principled("Flat_Radiator", hex_rgb("#f2f1ec"), 0.35)
    rp = rad.node_tree.nodes["Principled BSDF"]
    rp.inputs["Emission Color"].default_value = (*WARM, 1)
    water = principled("Flat_Water", (0.8, 0.9, 1.0), 0.02)
    wp = water.node_tree.nodes["Principled BSDF"]
    wp.inputs["Transmission Weight"].default_value = 1.0
    wp.inputs["IOR"].default_value = 1.33
    wp.inputs["Emission Color"].default_value = (0.75, 0.88, 1.0, 1)
    wp.inputs["Emission Strength"].default_value = 0.6
    box("Flat_Floor", (4, 4, 0.05), (0, 0, -0.025), oak, coll)
    box("Flat_WallBack", (4, 0.05, 2.6), (0, 1.0, 1.3), plaster, coll)
    box("Flat_WallSide", (0.05, 4, 2.6), (1.4, 0, 1.3), plaster, coll)
    box("Flat_Tiles", (0.012, 1.2, 2.1), (1.37, 0.4, 1.05), tile, coll)
    box("Flat_TilesBack", (0.9, 0.012, 2.1), (0.95, 0.97, 1.05), tile, coll)
    box(
        "Flat_Tray",
        (0.9, 1.0, 0.04),
        (0.95, 0.5, 0.02),
        principled("Flat_TrayMat", (0.92, 0.92, 0.92), 0.2),
        coll,
        0.01,
    )
    # Panel radiator on the back wall: body, flutes and top grille.
    rx, rz = -0.55, 0.45
    box("Flat_Rad_Body", (1.0, 0.09, 0.55), (rx, 0.91, rz), rad, coll, 0.008)
    for i in range(24):
        cylinder(
            f"Flat_Rad_Flute{i}",
            0.012,
            0.52,
            (rx - 0.48 + i * 0.0417, 0.866, rz),
            rad,
            coll,
            verts=12,
        )
    box(
        "Flat_Rad_Grille",
        (0.98, 0.07, 0.004),
        (rx, 0.91, rz + 0.277),
        principled("Flat_Grille", (0.25, 0.25, 0.25), 0.5),
        coll,
    )
    cylinder("Flat_Rad_Valve", 0.02, 0.12, (rx + 0.53, 0.9, rz - 0.3), chrome, coll)
    cylinder(
        "Flat_Rad_TRV",
        0.028,
        0.08,
        (rx + 0.53, 0.9, rz - 0.2),
        principled("Flat_TRV", (0.95, 0.95, 0.95), 0.4),
        coll,
    )
    # Shower: riser rail, arm and head on the tiled side wall.
    cylinder("Flat_Riser", 0.012, 1.1, (1.33, 0.45, 1.35), chrome, coll)
    cylinder(
        "Flat_Arm", 0.012, 0.3, (1.2, 0.45, 1.9), chrome, coll, (0, math.radians(90), 0)
    )
    cylinder("Flat_Head", 0.1, 0.025, (1.03, 0.45, 1.89), chrome, coll)
    box("Flat_Mixer", (0.05, 0.22, 0.07), (1.34, 0.45, 1.0), chrome, coll, 0.01)
    streams = []
    for i in range(14):
        a = i * 2.399
        r = 0.075 * math.sqrt((i + 0.5) / 14)
        x, y = 1.03 + r * math.cos(a), 0.45 + r * math.sin(a)
        s = cylinder(f"Flat_Water{i}", 0.0035, 1.82, (x, y, 0.95), water, coll, verts=8)
        s.rotation_euler = ((y - 0.45) * 0.25, -(x - 1.03) * 0.25, 0)
        streams.append(s)
    # A window above the radiator, lit from outside.
    sky = principled("Flat_Sky", (0.7, 0.8, 0.95), 0.5)
    sp = sky.node_tree.nodes["Principled BSDF"]
    sp.inputs["Emission Color"].default_value = (0.75, 0.85, 1.0, 1)
    sp.inputs["Emission Strength"].default_value = 2.5
    frame = principled("Flat_WindowFrame", (0.92, 0.92, 0.9), 0.4)
    box("Flat_Window", (0.8, 0.01, 0.75), (rx, 0.975, 1.45), sky, coll)
    for i, (sx, sz, lx, lz) in enumerate(
        (
            (0.86, 0.05, rx, 1.07),
            (0.86, 0.05, rx, 1.83),
            (0.05, 0.8, rx - 0.41, 1.45),
            (0.05, 0.8, rx + 0.41, 1.45),
            (0.03, 0.75, rx, 1.45),
        )
    ):
        box(f"Flat_WindowBar{i}", (sx, 0.04, sz), (lx, 0.96, lz), frame, coll)
    box("Flat_Sill", (0.95, 0.12, 0.03), (rx, 0.93, 1.04), frame, coll, 0.005)
    # Light and camera.
    ld = bpy.data.lights.new("Flat_Sun", "AREA")
    ld.energy = 120
    ld.size = 1.5
    lo = bpy.data.objects.new("Flat_Light", ld)
    lo.location = (0.2, -0.6, 2.4)
    coll.objects.link(lo)
    cd = bpy.data.cameras.new("Flat_Cam")
    cd.lens = 24
    co = bpy.data.objects.new("Flat_Cam", cd)
    co.location = (0.05, -1.75, 1.25)
    co.rotation_euler = (math.radians(86), 0, math.radians(-8))
    coll.objects.link(co)
    sc.camera = co
    w = bpy.data.worlds.new("Flat_World")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.6, 0.62, 0.65, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.5
    sc.world = w
    sc["streams"] = [s.name for s in streams]
    return sc


def prepare():
    """Add the video's parts to the open plant room. Safe to call once per session."""
    scene = bpy.data.scenes["Scene"]
    coll = bpy.data.collections.get("Video") or bpy.data.collections.new("Video")
    if coll.name not in scene.collection.children:
        scene.collection.children.link(coll)
    servers = _servers(scene)
    strip = bpy.data.objects.get("Tank_Strip_Fill") or _tank_strip(coll)
    if "Heater_Cap" in bpy.data.objects:
        heater = [
            bpy.data.objects[n]
            for n in (
                "Heater_Boss",
                "Heater_Cap",
                "Heater_Lamp",
                "Heater_Gland",
                "Heater_Ring",
            )
        ]
        heater_pt = heater[1].location.copy()
    else:
        heater, heater_pt = _backup_heater(coll)
    pipes = (
        {"hot": bpy.data.materials["Pipe_Hot"], "cold": bpy.data.materials["Pipe_Cold"]}
        if "Pipe_Hot" in bpy.data.materials
        else _pipe_materials()
    )
    flat = _flat_scene()
    return {
        "scene": scene,
        "servers": servers,
        "strip": strip,
        "heater": heater,
        "heater_pt": heater_pt,
        "pipes": pipes,
        "flat": flat,
        "streams": [bpy.data.objects[n] for n in flat["streams"]],
        "coll": coll,
    }


def _emit(mat, strength):
    mat.node_tree.nodes["Principled BSDF"].inputs[
        "Emission Strength"
    ].default_value = strength


def _tint(mat, colour, k):
    p = mat.node_tree.nodes["Principled BSDF"]
    grey = (0.78, 0.79, 0.8)
    mixed = tuple(
        g + (c - g) * min(1.0, 0.85 * k) for g, c in zip(grey, colour, strict=True)
    )
    p.inputs["Base Color"].default_value = (*mixed, 1)
    p.inputs["Emission Strength"].default_value = 0.9 * k
    p.inputs["Metallic"].default_value = 1.0 - 0.5 * k


def apply_state(
    h, *, servers_on, tank_frac, heat_frac, backup_frac, space_frac, draw_on
):
    """Set the plant room and the flat for one hour. All inputs are 0..1 except servers_on."""
    for i, s in enumerate(h["servers"]):
        s["on"] = 1.0 if i < servers_on else 0.0
        s.update_tag()
    f = h["strip"]
    f.scale.z = max(1e-4, f["z_span"] * min(1.0, max(0.0, tank_frac)))
    f.hide_render = tank_frac <= 0.0
    _tint(h["pipes"]["hot"], RED, heat_frac)
    _tint(h["pipes"]["cold"], BLUE, heat_frac)
    _emit(bpy.data.materials["Heater_Lamp"], 30.0 * backup_frac)
    _emit(bpy.data.materials["Heater_Ring"], 25.0 * backup_frac)
    _emit(bpy.data.materials["Flat_Radiator"], 0.9 * space_frac)
    for s in h["streams"]:
        s.hide_render = not draw_on


def project(scene, point):
    """Return the 0..1 image position of a world point (origin at top left)."""
    v = world_to_camera_view(scene, scene.camera, Vector(point))
    return [round(v.x, 4), round(1.0 - v.y, 4)]


def anchors(h):
    """World points the overlay labels point at."""
    rack = bpy.data.objects["Rack_Roof"]
    s = h["servers"]
    mid = (s[0].matrix_world.translation + s[-1].matrix_world.translation) / 2
    return {
        "servers": tuple(mid + Vector((0, -0.55, 0.0))),
        "rack_top": tuple(rack.matrix_world.translation),
        "tank": (3.0, 0.37, 1.45),
        "heater": tuple(h["heater_pt"]),
        "supply": (0.39, 1.28, 2.5),
        "return": (0.28, 1.42, 2.32),
        "hx": (1.52, 1.0, 0.9),
        "pump": (0.95, 1.2, 1.14),
        "sensor": (1.08, 1.16, 1.25),
    }


def setup_render(scene, width, height, samples):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "GPU"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == "OPTIX"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPTIX"
    scene.cycles.seed = 7
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
