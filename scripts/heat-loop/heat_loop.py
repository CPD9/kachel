"""Build the Kachel heat loop in Blender from nothing and render its frames.

Rebuild the animation from the repository root with

    make heat-loop

which runs

    TMPDIR=~/.cache/kachel/tmp blender --background --factory-startup \
        --python scripts/heat-loop/heat_loop.py -- --out ~/.cache/kachel/heat-loop/frames

and then encodes the frames with ffmpeg into packages/ui/src/heat-loop.webp
and packages/ui/src/heat-loop-still.png. It needs Blender 5.2 and an ffmpeg
built with libwebp.

The picture is a cutaway of a small house. Six server tiles in the basement
run jobs, their heat flows into an insulated hot-water tank, and from there to
a radiator and a shower upstairs. Every shape, material and light is made
here; nothing is loaded from disk. Each moving part is a periodic function of
the loop phase t in [0, 1), so the last frame runs straight back into the
first. The render seed is fixed, so two runs give the same frames (to within
the last bit or two of GPU rounding). The frames go onto the page colour,
#fbf8f3, when they are encoded.

Options after "--":
    --out DIR        where the PNG frames go (required)
    --frames N       frames in the loop (default 84: 3.5 s at 24 fps)
    --width W        render width in pixels (default 1080)
    --height H       render height in pixels (default 900)
    --samples N      Cycles samples per pixel (default 40)
    --only 1,43      render only these frames (numbered from 1)
    --blend FILE     also save the built scene to FILE
"""

import argparse
import itertools
import math
import sys
import time
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

FRONT = -1.2  # the house is cut open along y = FRONT
LEFT = -3.2  # and along x = LEFT, so the camera sees in at the corner
PITCH = math.radians(26)
RIDGE_Y = (FRONT + 2.2) / 2
RIDGE = 2.95 + math.tan(PITCH) * (2.2 - RIDGE_Y)

WALL = "#f4efe6"
CHARCOAL = "#2c3340"
HEAT = "#e0702a"
COLD = "#7aa7d8"

# Each entry is called with the loop phase t before a frame renders.
UPDATES = []
# "house" holds the solid shapes, which get charcoal outlines; "fx" holds the
# lights, camera, drops, wisps and anything else that should not.
COLLECTIONS = {}
WISP_MATERIAL = []


# Colour and material helpers


def lin(hex_colour, alpha=1.0):
    """Turn an sRGB hex colour into the linear RGBA that Blender works in."""
    h = hex_colour.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i : i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, alpha)


def mix(a, b, f):
    """Blend two linear RGBA colours."""
    return tuple(x + (y - x) * f for x, y in zip(a, b))


def new_material(name):
    mat = bpy.data.materials.new(name)
    if hasattr(mat, "use_nodes") and not mat.use_nodes:
        mat.use_nodes = True
    return mat


def principled(name, colour, rough=0.6, emit=None, strength=0.0, coat=0.0):
    """A plain matte or satin material; returns it with its BSDF node."""
    mat = new_material(name)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = lin(colour)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Coat Weight"].default_value = coat
    if emit:
        bsdf.inputs["Emission Color"].default_value = lin(emit)
        bsdf.inputs["Emission Strength"].default_value = strength
    mat.diffuse_color = lin(colour)
    return mat, bsdf


def math_node(tree, op, a, b=None, c=None):
    """Add a Math node; a, b and c are sockets or numbers."""
    node = tree.nodes.new("ShaderNodeMath")
    node.operation = op
    for i, value in enumerate((a, b, c)):
        if value is None:
            continue
        if isinstance(value, (int, float)):
            node.inputs[i].default_value = value
        else:
            tree.links.new(value, node.inputs[i])
    return node.outputs[0]


def pipe_material(name, colour, glow, wavelength, laps, strength):
    """A pipe whose glow travels along it, `laps` pulses per loop."""
    mat, bsdf = principled(name, colour, rough=0.35, emit=glow, coat=0.3)
    tree = mat.node_tree
    attr = tree.nodes.new("ShaderNodeAttribute")
    attr.attribute_type = "GEOMETRY"
    attr.attribute_name = "s"
    clock = tree.nodes.new("ShaderNodeValue")
    along = math_node(tree, "DIVIDE", attr.outputs["Fac"], wavelength)
    phase = math_node(
        tree, "FRACT", math_node(tree, "SUBTRACT", along, clock.outputs[0])
    )
    wave = math_node(tree, "COSINE", math_node(tree, "MULTIPLY", phase, 2 * math.pi))
    pulse = math_node(
        tree, "POWER", math_node(tree, "MULTIPLY_ADD", wave, -0.5, 0.5), 6
    )
    tree.links.new(
        math_node(tree, "MULTIPLY", pulse, strength), bsdf.inputs["Emission Strength"]
    )

    def update(t):
        clock.outputs[0].default_value = laps * t

    UPDATES.append(update)
    return mat


# Geometry helpers


def link(obj, collection):
    COLLECTIONS[collection].objects.link(obj)
    return obj


def mark_cut(bm, planes=(), index=1):
    """Give the faces lying on a cut plane the second material."""
    bm.normal_update()
    planes = (("y", FRONT), ("x", LEFT), *planes)
    for face in bm.faces:
        centre = face.calc_center_median()
        for axis, value in planes:
            i = "xyz".index(axis)
            if face.normal[i] < -0.99 and abs(centre[i] - value) < 1e-4:
                face.material_index = index


def finish(name, bm, mats, bevel=0.0, segments=3, angle=40, collection="house"):
    """Turn a bmesh into an object, with soft rounded edges if asked."""
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for mat in mats:
        mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    if bevel:
        mesh.shade_smooth()
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(angle)
        mod.harden_normals = True
    return link(obj, collection)


def box(name, lo, hi, mat, cut=None, bevel=0.03, collection="house", planes=()):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector(lo[i] + (v.co[i] + 0.5) * (hi[i] - lo[i]) for i in range(3))
    mats = [mat]
    if cut:
        mark_cut(bm, planes)
        mats.append(cut)
    return finish(name, bm, mats, bevel, collection=collection)


def prism(name, points, axis, lo, hi, mat, cut=None, bevel=0.03, collection="house"):
    """Extrude a 2D outline along an axis; points are in the other two axes."""
    bm = bmesh.new()

    def place(p, w):
        a, b = p
        return {"x": (w, a, b), "y": (a, w, b), "z": (a, b, w)}[axis]

    near = [bm.verts.new(place(p, lo)) for p in points]
    far = [bm.verts.new(place(p, hi)) for p in points]
    bm.faces.new(near)
    bm.faces.new(far)
    n = len(points)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((near[i], near[j], far[j], far[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mats = [mat]
    if cut:
        mark_cut(bm)
        mats.append(cut)
    return finish(name, bm, mats, bevel, collection=collection)


def cylinder(
    name, radius, depth, mat, matrix, bevel=0.0, segments=64, collection="house"
):
    """A capped cylinder along local z, centred, then moved by `matrix`."""
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=radius,
        radius2=radius,
        depth=depth,
    )
    for face in bm.faces:
        face.smooth = abs(face.normal.z) < 0.5
    bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    return finish(name, bm, [mat], bevel, segments=4, collection=collection)


def upright(x, y, z0, z1):
    """The matrix that stands a centred cylinder between heights z0 and z1."""
    return Matrix.Translation((x, y, (z0 + z1) / 2))


def fillet(points, radius, steps=10):
    """Round the corners of a polyline."""
    pts = [Vector(p) for p in points]
    out = [pts[0]]
    for a, p, b in zip(pts, pts[1:], pts[2:]):
        d1 = (p - a).normalized()
        d2 = (b - p).normalized()
        turn = math.acos(max(-1.0, min(1.0, d1.dot(d2))))
        if turn < 1e-3:
            out.append(p)
            continue
        reach = min(
            radius * math.tan(turn / 2), (p - a).length * 0.45, (b - p).length * 0.45
        )
        t1, t2 = p - d1 * reach, p + d2 * reach
        for k in range(steps + 1):
            u = k / steps
            out.append((1 - u) ** 2 * t1 + 2 * u * (1 - u) * p + u * u * t2)
    out.append(pts[-1])
    return out


def sweep(name, path, radius, mat, ring=20, taper=False, collection="house"):
    """A round tube along a path, carrying its length so far as attribute s."""
    lengths = [0.0]
    for a, b in itertools.pairwise(path):
        lengths.append(lengths[-1] + (b - a).length)
    total = lengths[-1]
    n = len(path)
    tangents = []
    for i in range(n):
        a, b = path[max(i - 1, 0)], path[min(i + 1, n - 1)]
        tangents.append((b - a).normalized())
    normal = tangents[0].orthogonal().normalized()
    bm = bmesh.new()
    rings = []
    for i in range(n):
        if i:
            normal = tangents[i - 1].rotation_difference(tangents[i]) @ normal
        side = tangents[i].cross(normal)
        r = radius
        if taper:
            r *= 0.35 + 0.65 * math.sin(math.pi * lengths[i] / total)
        verts = []
        for j in range(ring):
            angle = 2 * math.pi * j / ring
            offset = normal * math.cos(angle) + side * math.sin(angle)
            verts.append(bm.verts.new(path[i] + offset * r))
        rings.append(verts)
    for a, b in itertools.pairwise(rings):
        for j in range(ring):
            k = (j + 1) % ring
            bm.faces.new((a[j], a[k], b[k], b[j])).smooth = True
    bm.faces.new(rings[0])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = finish(name, bm, [mat], collection=collection)
    values = [lengths[i] for i in range(n) for _ in range(ring)]
    obj.data.attributes.new("s", "FLOAT", "POINT").data.foreach_set("value", values)
    unit = [v / total for v in values]
    obj.data.attributes.new("u", "FLOAT", "POINT").data.foreach_set("value", unit)
    return obj


def pipe(name, points, mat, radius=0.055):
    return sweep(name, fillet(points, 0.3), radius, mat)


# Loop timing


def wave(x):
    """A soft periodic pulse in [0, 1] with period 1."""
    return 0.5 - 0.5 * math.cos(2 * math.pi * x)


def ease(x):
    return 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, x)))


def warm_fraction(t):
    """How much of the tank is hot: it fills for most of the loop, then is drawn."""
    low, high, turn = 0.18, 0.86, 0.78
    if t < turn:
        return low + (high - low) * ease(t / turn)
    return high - (high - low) * ease((t - turn) / (1 - turn))


# The scene


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    for name in ("house", "fx"):
        coll = bpy.data.collections.new(name)
        scene.collection.children.link(coll)
        COLLECTIONS[name] = coll
    return scene


def build_shell(m):
    """The house: earth, basement, ground floor, ceiling and roof."""
    # Earth around the basement, cut along the front and the left.
    earth, earth_cut = m["earth"], m["earth_cut"]
    box("earth_right", (3.2, FRONT, -2.75), (4.6, 3.0, -0.38), earth, earth_cut)
    box("earth_back", (LEFT, 2.2, -2.75), (3.2, 3.0, -0.38), earth, earth_cut)
    box("earth_bed", (LEFT, FRONT, -3.2), (4.6, 3.0, -2.75), earth, earth_cut)
    for name, lo, hi in (
        ("grass_right", (3.2, FRONT, -0.38), (4.6, 3.0, -0.26)),
        ("grass_back", (LEFT, 2.2, -0.38), (4.6, 3.0, -0.26)),
    ):
        box(name, lo, hi, m["grass"], m["grass_cut"], bevel=0.04)

    # Basement.
    box("cellar_floor", (LEFT, FRONT, -2.75), (3.2, 2.2, -2.5), m["concrete"], m["cut"])
    box("cellar_right", (3.0, FRONT, -2.5), (3.2, 2.2, -0.25), m["cellar"], m["cut"])
    box("cellar_back", (LEFT, 2.0, -2.5), (3.0, 2.2, -0.25), m["cellar"], m["cut"])

    # Ground floor, with a short wall between the living room and the bathroom.
    box("floor", (LEFT, FRONT, -0.25), (3.2, 2.2, 0.0), m["floor"], m["cut"])
    wall("wall_right", (3.0, FRONT, 0.0), (3.2, 2.2, 2.7), m)
    wall(
        "wall_back", (LEFT, 2.0, 0.0), (3.0, 2.2, 2.7), m, hole=(-2.0, -0.85, 1.12, 2.0)
    )
    box(
        "partition",
        (0.7, 0.75, 0.0),
        (0.85, 2.0, 2.7),
        m["wall"],
        m["cut"],
        planes=(("y", 0.75),),
    )
    box("ceiling", (LEFT, FRONT, 2.7), (3.2, 2.2, 2.9), m["wall"], m["cut"])

    # Gable ends and a pitched roof.
    def roof_z(y):
        return RIDGE - math.tan(PITCH) * abs(y - RIDGE_Y)

    gable = [
        (FRONT, 2.9),
        (2.2, 2.9),
        (2.2, roof_z(2.2)),
        (RIDGE_Y, RIDGE),
        (FRONT, roof_z(FRONT)),
    ]
    prism("attic", gable, "x", LEFT, 3.2, m["wall"], m["cut"])
    thick = 0.22
    eave = 0.55
    front = [(FRONT - eave, roof_z(FRONT - eave)), (RIDGE_Y, RIDGE)]
    front += [(RIDGE_Y, RIDGE + thick), (FRONT - eave, roof_z(FRONT - eave) + thick)]
    back = [(RIDGE_Y, RIDGE), (2.2 + eave, roof_z(2.2 + eave))]
    back += [(2.2 + eave, roof_z(2.2 + eave) + thick), (RIDGE_Y, RIDGE + thick)]
    prism("roof_front", front, "x", LEFT, 3.5, m["roof"], bevel=0.04)
    prism("roof_back", back, "x", LEFT, 3.5, m["roof"], bevel=0.04)
    turn = Matrix.Rotation(math.pi / 2, 4, "Y")
    cylinder(
        "ridge",
        0.1,
        6.82,
        m["roof"],
        Matrix.Translation((0.09, RIDGE_Y, RIDGE + thick - 0.02)) @ turn,
    )

    # A patch of sky seen through the back window, which lights nothing.
    sky = box(
        "window_sky",
        (-2.2, 2.6, 1.0),
        (-0.65, 2.65, 2.3),
        m["sky"],
        bevel=0.0,
        collection="fx",
    )
    sky.visible_diffuse = False
    sky.visible_glossy = False
    sky.visible_shadow = False


def wall(name, lo, hi, m, hole=None):
    """A wall, with a framed window opening (u0, u1, z0, z1) if asked."""
    if not hole:
        box(name, lo, hi, m["wall"], m["cut"])
        return
    along_x = hi[0] - lo[0] > hi[1] - lo[1]
    ax = 0 if along_x else 1
    u0, u1, z0, z1 = hole

    def span(a0, a1, b0, b1):
        p, q = list(lo), list(hi)
        p[ax], q[ax], p[2], q[2] = a0, a1, b0, b1
        return p, q

    for i, (a0, a1, b0, b1) in enumerate(
        (
            (lo[ax], u0, lo[2], hi[2]),
            (u1, hi[ax], lo[2], hi[2]),
            (u0, u1, lo[2], z0),
            (u0, u1, z1, hi[2]),
        )
    ):
        box(f"{name}_{i}", *span(a0, a1, b0, b1), m["wall"], m["cut"])
    # Frame, cross bars and sill.
    other = 1 - ax
    mid = (lo[other] + hi[other]) / 2
    f = 0.05

    def bar(tag, a0, a1, b0, b1, depth=0.07, offset=0.0):
        p, q = [0, 0, 0], [0, 0, 0]
        p[ax], q[ax], p[2], q[2] = a0, a1, b0, b1
        p[other], q[other] = mid + offset - depth, mid + offset + depth
        box(f"{name}_{tag}", p, q, m["trim"], bevel=0.012)

    bar("frame_l", u0, u0 + f, z0, z1)
    bar("frame_r", u1 - f, u1, z0, z1)
    bar("frame_b", u0, u1, z0, z0 + f)
    bar("frame_t", u0, u1, z1 - f, z1)
    bar("mullion", (u0 + u1) / 2 - f / 2, (u0 + u1) / 2 + f / 2, z0, z1, depth=0.03)
    bar("transom", u0, u1, (z0 + z1) / 2 - f / 2, (z0 + z1) / 2 + f / 2, depth=0.03)
    outward = 1 if lo[other] > 0 else -1
    sill = [0, 0, 0], [0, 0, 0]
    sill[0][ax], sill[1][ax] = u0 - 0.08, u1 + 0.08
    sill[0][2], sill[1][2] = z0 - 0.06, z0 + 0.01
    edge = hi[other] if outward > 0 else lo[other]
    if outward > 0:
        sill[0][other], sill[1][other] = edge - 0.05, edge + 0.12
    else:
        sill[0][other], sill[1][other] = edge - 0.12, edge + 0.05
    box(f"{name}_sill", sill[0], sill[1], m["wall"], bevel=0.02)


def build_servers(m):
    """A small rack of six server tiles whose slots glow as they run."""
    box("rack", (-2.75, 1.0, -2.45), (-1.45, 1.95, -0.85), m["trim"], bevel=0.05)
    box("rack_foot", (-2.7, 1.05, -2.5), (-1.5, 1.9, -2.42), m["trim"], bevel=0.02)
    for i, (col, row) in enumerate((c, r) for r in range(3) for c in range(2)):
        x = -2.43 + 0.66 * col
        z = -2.13 + 0.5 * row
        box(
            f"tile_{i}",
            (x - 0.29, 0.93, z - 0.22),
            (x + 0.29, 1.02, z + 0.22),
            m["tile"],
            bevel=0.035,
        )
        glow, bsdf = principled(f"tile_glow_{i}", HEAT, rough=0.4, emit="#ff9a4d")
        box(
            f"slot_{i}",
            (x - 0.19, 0.905, z + 0.03),
            (x + 0.19, 0.94, z + 0.1),
            glow,
            bevel=0.012,
        )
        led, led_bsdf = principled(
            f"tile_led_{i}", "#ffd8a8", rough=0.4, emit="#ffd8a8"
        )
        cylinder(
            f"led_{i}",
            0.025,
            0.03,
            led,
            Matrix.Translation((x + 0.17, 0.915, z - 0.1))
            @ Matrix.Rotation(math.pi / 2, 4, "X"),
            segments=24,
        )
        for k in range(3):
            vx = x - 0.19 + 0.09 * k
            box(
                f"vent_{i}_{k}",
                (vx - 0.03, 0.915, z - 0.13),
                (vx + 0.03, 0.93, z - 0.07),
                m["vent"],
                bevel=0.008,
            )

        def update(t, bsdf=bsdf, led_bsdf=led_bsdf, i=i):
            beat = wave(2 * t - i / 6)
            bsdf.inputs["Emission Strength"].default_value = 1.5 + 5.5 * beat
            blink = wave(3 * t + 0.37 * i)
            led_bsdf.inputs["Emission Strength"].default_value = 0.5 + 3.0 * blink

        UPDATES.append(update)

    # A warm wash on the basement floor that breathes with the rack.
    data = bpy.data.lights.new("rack_glow", "POINT")
    data.color = lin("#ff8a3d")[:3]
    data.shadow_soft_size = 0.4
    lamp = link(bpy.data.objects.new("rack_glow", data), "fx")
    lamp.location = (-2.1, 0.35, -1.5)

    def breathe(t):
        data.energy = 35 + 45 * wave(2 * t)

    UPDATES.append(breathe)


def build_tank(m):
    """An insulated tank, cut open so the warm layer can be seen rising."""
    x, y = 0.6, 1.4
    jacket = cylinder(
        "tank", 0.62, 1.6, m["tank"], upright(x, y, -2.4, -0.8), segments=96
    )
    # Open a wedge facing the camera to show the water inside.
    facing = math.atan2(-math.cos(math.radians(28)), -math.sin(math.radians(28)))
    wedge = [(x, y)]
    for k in range(13):
        a = facing - math.radians(52) + math.radians(104) * k / 12
        wedge.append((x + 1.2 * math.cos(a), y + 1.2 * math.sin(a)))
    cutter = prism("tank_cutter", wedge, "z", -2.15, -1.05, m["insulation"], bevel=0.0)
    cutter.hide_render = True
    cutter.hide_viewport = True
    cut = jacket.modifiers.new("Open", "BOOLEAN")
    cut.operation = "DIFFERENCE"
    cut.object = cutter
    cut.solver = "EXACT"
    cut.material_mode = "TRANSFER"
    jacket.modifiers.move(len(jacket.modifiers) - 1, 0)
    bevel = jacket.modifiers.new("Bevel", "BEVEL")
    jacket.data.shade_smooth()
    bevel.width = 0.035
    bevel.segments = 4
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = math.radians(40)
    bevel.harden_normals = True
    top = cylinder(
        "tank_top", 0.6, 0.16, m["tank"], upright(x, y, -0.86, -0.7), bevel=0.07
    )
    top.modifiers["Bevel"].segments = 6
    for z in (-2.32, -0.92):
        cylinder(
            f"tank_band_{z}",
            0.635,
            0.05,
            m["trim"],
            upright(x, y, z - 0.025, z + 0.025),
            bevel=0.012,
        )
    cylinder("tank_foot", 0.5, 0.1, m["trim"], upright(x, y, -2.5, -2.4), bevel=0.02)

    # The water: cold blue below, hot orange above, with a soft boundary.
    mat = new_material("water")
    tree = mat.node_tree
    bsdf = tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.3
    coords = tree.nodes.new("ShaderNodeTexCoord")
    split = tree.nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(coords.outputs["Object"], split.inputs[0])
    band = tree.nodes.new("ShaderNodeMapRange")
    band.interpolation_type = "SMOOTHSTEP"
    tree.links.new(split.outputs["Z"], band.inputs["Value"])
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = lin(COLD)
    ramp.color_ramp.elements[1].color = lin(HEAT)
    tree.links.new(band.outputs["Result"], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Emission Color"].default_value = lin("#ff8a3d")
    tree.links.new(
        math_node(tree, "MULTIPLY", band.outputs["Result"], 0.9),
        bsdf.inputs["Emission Strength"],
    )
    height = 1.5
    cylinder("water", 0.5, height, mat, upright(x, y, -2.35, -0.85), segments=96)

    def fill(t):
        boundary = -2.35 + height * (1 - warm_fraction(t))
        band.inputs["From Min"].default_value = boundary - 0.07
        band.inputs["From Max"].default_value = boundary + 0.07

    UPDATES.append(fill)


def build_radiator(m):
    """A column radiator under the back window that warms and gives off wisps."""
    mat, bsdf = principled("radiator", WALL, rough=0.35, emit=HEAT, coat=0.4)
    for k in range(9):
        x0 = -2.08 + k * 0.15
        box(f"radiator_{k}", (x0, 1.72, 0.22), (x0 + 0.12, 1.9, 0.95), mat, bevel=0.05)
    box("radiator_rail", (-2.1, 1.76, 0.3), (-0.73, 1.86, 0.36), mat, bevel=0.03)
    cold, warm = lin(WALL), lin("#f2b385")

    def warm_up(t):
        w = 0.55 + 0.45 * wave(t - 0.1)
        bsdf.inputs["Base Color"].default_value = mix(cold, warm, w)
        bsdf.inputs["Emission Strength"].default_value = 0.12 * w

    UPDATES.append(warm_up)
    for i, x in enumerate((-1.85, -1.42, -0.98)):
        wisp(f"heat_wisp_{i}", (x, 1.62, 1.02), "#ef8a45", i / 3, 0.8, 0.62)


def wisp(name, base, colour, offset, peak, rise):
    """A rising, fading curl of warm air."""
    path = []
    for k in range(25):
        u = k / 24
        path.append(
            Vector((0.06 * math.sin(2 * math.pi * (u * 1.3 + offset)), 0, 0.42 * u))
        )
    obj = sweep(
        name, path, 0.036, WISP_MATERIAL[0], ring=10, taper=True, collection="fx"
    )
    obj.location = base
    r, g, b, _ = lin(colour)

    def drift(t):
        u = (t + offset) % 1.0
        obj.location = (base[0], base[1], base[2] + rise * u)
        obj.color = (r, g, b, peak * math.sin(math.pi * u) ** 1.5)

    UPDATES.append(drift)


def wisp_material():
    mat = new_material("wisp")
    tree = mat.node_tree
    tree.nodes.remove(tree.nodes["Principled BSDF"])
    out = tree.nodes["Material Output"]
    info = tree.nodes.new("ShaderNodeObjectInfo")
    attr = tree.nodes.new("ShaderNodeAttribute")
    attr.attribute_type = "GEOMETRY"
    attr.attribute_name = "u"
    fade = math_node(
        tree, "SINE", math_node(tree, "MULTIPLY", attr.outputs["Fac"], math.pi)
    )
    alpha = math_node(tree, "MULTIPLY", fade, info.outputs["Alpha"])
    glow = tree.nodes.new("ShaderNodeEmission")
    tree.links.new(info.outputs["Color"], glow.inputs["Color"])
    glow.inputs["Strength"].default_value = 1.2
    clear = tree.nodes.new("ShaderNodeBsdfTransparent")
    blend = tree.nodes.new("ShaderNodeMixShader")
    tree.links.new(alpha, blend.inputs[0])
    tree.links.new(clear.outputs[0], blend.inputs[1])
    tree.links.new(glow.outputs[0], blend.inputs[2])
    tree.links.new(blend.outputs[0], out.inputs["Surface"])
    WISP_MATERIAL.append(mat)


def build_shower(m):
    """A shower on the tiled bathroom wall, with drops falling to the tray."""
    # Tiles: the house is called Kachel after all.
    bm = bmesh.new()
    size, gap = 0.255, 0.018
    for col in range(8):
        for row in range(9):
            x0 = 0.87 + col * size
            z0 = 0.02 + row * size
            geom = bmesh.ops.create_cube(bm, size=1.0)["verts"]
            lo = (x0 + gap / 2, 1.965, z0 + gap / 2)
            hi = (x0 + size - gap / 2, 2.0, z0 + size - gap / 2)
            for v in geom:
                v.co = Vector(
                    lo[i] + (v.co[i] + 0.5) * (hi[i] - lo[i]) for i in range(3)
                )
    finish("bath_tiles", bm, [m["bath_tile"]], bevel=0.008, segments=2, collection="fx")
    box("tray", (1.85, 1.1, 0.0), (2.95, 1.96, 0.11), m["porcelain"], bevel=0.04)
    box("tray_well", (1.93, 1.18, 0.1), (2.87, 1.88, 0.115), m["tray_well"], bevel=0.0)

    head = Vector((2.4, 1.22, 1.74))
    tilt = Matrix.Translation(head) @ Matrix.Rotation(math.radians(-12), 4, "X")
    cylinder("shower_head", 0.14, 0.05, m["chrome"], tilt, bevel=0.015)

    drop_mat, _ = principled(
        "drop", COLD, rough=0.12, emit="#b5d2f2", strength=0.5, coat=1.0
    )
    spots = [
        (-0.06, -0.03),
        (0.05, 0.04),
        (0.0, 0.0),
        (0.08, -0.05),
        (-0.08, 0.05),
        (0.03, -0.07),
        (-0.03, 0.07),
    ]
    fall = head.z - 0.16
    for i, (dx, dy) in enumerate(spots):
        sphere = bmesh.new()
        bmesh.ops.create_uvsphere(sphere, u_segments=16, v_segments=10, radius=0.05)
        for v in sphere.verts:
            v.co.z *= 1.7
        for face in sphere.faces:
            face.smooth = True
        drop = finish(f"drop_{i}", sphere, [drop_mat], collection="fx")
        offset = i / len(spots)

        def drip(t, drop=drop, dx=dx, dy=dy, offset=offset):
            u = (3 * t + offset) % 1.0
            z = head.z - 0.05 - fall * u**1.6
            drop.location = (head.x + dx * (1 + u), head.y + 0.03 + dy * (1 + u), z)
            grow = min(1.0, u / 0.08) * min(1.0, (1 - u) / 0.06)
            drop.scale = (grow, grow, grow)

        UPDATES.append(drip)


def build_living_room(m):
    """Just enough furniture to read as a room."""
    box("rug", (-2.4, -0.85, 0.0), (-0.3, 1.2, 0.025), m["rug"], bevel=0.01)
    chair = m["chair"]
    box("chair_seat", (-2.85, -0.3, 0.05), (-2.05, 0.55, 0.45), chair, bevel=0.07)
    box("chair_back", (-2.92, -0.35, 0.05), (-2.62, 0.6, 1.0), chair, bevel=0.08)
    box("chair_arm_l", (-2.92, -0.42, 0.05), (-2.05, -0.22, 0.65), chair, bevel=0.07)
    box("chair_arm_r", (-2.92, 0.47, 0.05), (-2.05, 0.67, 0.65), chair, bevel=0.07)
    box("cushion", (-2.6, -0.2, 0.45), (-2.1, 0.45, 0.55), m["cushion"], bevel=0.05)
    cylinder(
        "lamp_base", 0.16, 0.04, m["trim"], upright(-2.55, 1.45, 0.0, 0.04), bevel=0.01
    )
    cylinder(
        "lamp_stem", 0.02, 1.4, m["trim"], upright(-2.55, 1.45, 0.04, 1.44), segments=16
    )
    shade = bmesh.new()
    bmesh.ops.create_cone(
        shade, cap_ends=True, segments=48, radius1=0.26, radius2=0.16, depth=0.3
    )
    for face in shade.faces:
        face.smooth = abs(face.normal.z) < 0.5
    bmesh.ops.translate(shade, vec=(-2.55, 1.45, 1.55), verts=shade.verts)
    finish("lamp_shade", shade, [m["shade"]])
    cylinder(
        "table_top", 0.32, 0.05, m["wood"], upright(-1.3, 0.15, 0.42, 0.47), bevel=0.02
    )
    cylinder(
        "table_leg", 0.035, 0.42, m["trim"], upright(-1.3, 0.15, 0.0, 0.42), segments=16
    )
    cylinder(
        "table_foot", 0.18, 0.03, m["trim"], upright(-1.3, 0.15, 0.0, 0.03), bevel=0.01
    )


def build_pipes(m):
    hot = pipe_material("pipe_hot", HEAT, "#ffc27a", 1.1, 2, 6.0)
    cool = pipe_material("pipe_cool", COLD, "#d9ecff", 1.3, 1, 1.6)
    pipe("feed_rack", [(-1.6, 1.4, -1.05), (0.1, 1.4, -1.05)], hot)
    pipe("return_rack", [(0.1, 1.4, -2.15), (-1.6, 1.4, -2.15)], cool)
    pipe("mains", [(3.1, 1.55, -1.95), (1.0, 1.55, -1.95)], cool)
    pipe(
        "to_radiator",
        [
            (0.6, 1.4, -1.2),
            (0.6, 1.4, -0.5),
            (0.6, 1.8, -0.5),
            (0.6, 1.8, 0.33),
            (-0.75, 1.8, 0.33),
        ],
        hot,
    )
    pipe(
        "to_shower",
        [
            (1.0, 1.4, -1.25),
            (2.4, 1.4, -1.25),
            (2.4, 1.8, -1.25),
            (2.4, 1.8, 1.78),
            (2.4, 1.22, 1.78),
        ],
        hot,
    )


def roof_material():
    """Slate with faint rows running along the roof."""
    mat, bsdf = principled("roof", "#39414f", rough=0.6)
    tree = mat.node_tree
    coords = tree.nodes.new("ShaderNodeTexCoord")
    rows = tree.nodes.new("ShaderNodeTexWave")
    rows.wave_type = "BANDS"
    rows.bands_direction = "Z"
    rows.wave_profile = "SAW"
    tree.links.new(coords.outputs["Object"], rows.inputs["Vector"])
    # Bands repeat every 2 pi / (20 * scale) in height: rows about 0.3 apart on the slope.
    rows.inputs["Scale"].default_value = 2 * math.pi / (20 * 0.3 * math.sin(PITCH))
    lines = tree.nodes.new("ShaderNodeValToRGB")
    lines.color_ramp.interpolation = "EASE"
    lines.color_ramp.elements[0].color = lin("#262c37")
    lines.color_ramp.elements[1].position = 0.12
    lines.color_ramp.elements[1].color = lin("#3d4554")
    tree.links.new(rows.outputs["Fac"], lines.inputs["Fac"])
    tree.links.new(lines.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def materials():
    m = {}
    m["wall"], _ = principled("wall", WALL, rough=0.85)
    m["cut"], _ = principled("cut", CHARCOAL, rough=0.7)
    m["trim"], _ = principled("trim", CHARCOAL, rough=0.45)
    m["roof"] = roof_material()
    m["cellar"], _ = principled("cellar", "#eee8de", rough=0.9)
    m["concrete"], _ = principled("concrete", "#e2dbcf", rough=0.9)
    m["floor"], _ = principled("floor", "#ead8bd", rough=0.6)
    m["earth"], _ = principled("earth", "#c7b7a2", rough=0.95)
    m["earth_cut"], _ = principled("earth_cut", "#b8a58c", rough=0.95)
    m["grass"], _ = principled("grass", "#b4c39a", rough=0.9)
    m["grass_cut"], _ = principled("grass_cut", "#98a983", rough=0.9)
    m["tank"], _ = principled("tank", "#f7f3ec", rough=0.4, coat=0.5)
    m["insulation"], _ = principled("insulation", "#f2cf9c", rough=0.95)
    m["tile"], _ = principled("tile", "#ece7df", rough=0.45, coat=0.3)
    m["vent"], _ = principled("vent", "#4a5263", rough=0.6)
    m["bath_tile"], _ = principled("bath_tile", "#eef1f4", rough=0.25, coat=0.6)
    m["porcelain"], _ = principled("porcelain", "#fbfaf7", rough=0.2, coat=0.8)
    m["tray_well"], _ = principled("tray_well", "#e6ecf2", rough=0.2)
    m["chrome"], _ = principled("chrome", "#59616e", rough=0.25, coat=1.0)
    m["rug"], _ = principled("rug", "#f0dcc4", rough=0.95)
    m["chair"], _ = principled("chair", "#56606f", rough=0.85)
    m["cushion"], _ = principled("cushion", "#e39a63", rough=0.9)
    m["shade"], _ = principled(
        "shade", "#f6efe2", rough=0.8, emit="#ffe1b8", strength=0.4
    )
    m["wood"], _ = principled("wood", "#c99b6d", rough=0.6)
    m["sky"], _ = principled("sky", "#d6e6f5", emit="#d6e6f5", strength=1.0)
    wisp_material()
    return m


def lights_and_world(scene):
    world = bpy.data.worlds.new("sky")
    scene.world = world
    if hasattr(world, "use_nodes") and not world.use_nodes:
        world.use_nodes = True
    tree = world.node_tree
    background = tree.nodes["Background"]
    coords = tree.nodes.new("ShaderNodeTexCoord")
    split = tree.nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(coords.outputs["Generated"], split.inputs[0])
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = lin("#efe4d6")
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = lin("#f4f7fb")
    tree.links.new(
        math_node(tree, "MULTIPLY_ADD", split.outputs["Z"], 0.5, 0.5),
        ramp.inputs["Fac"],
    )
    tree.links.new(ramp.outputs["Color"], background.inputs["Color"])
    background.inputs["Strength"].default_value = 0.9

    def aim(obj, direction):
        obj.rotation_euler = Vector(direction).to_track_quat("-Z", "Y").to_euler()

    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 2.6
    sun_data.angle = math.radians(14)
    sun_data.color = lin("#fff4e6")[:3]
    sun = link(bpy.data.objects.new("sun", sun_data), "fx")
    aim(sun, (0.55, 0.75, -0.9))

    fill_data = bpy.data.lights.new("fill", "AREA")
    fill_data.shape = "RECTANGLE"
    fill_data.size = 12
    fill_data.size_y = 6
    fill_data.energy = 750
    fill_data.color = lin("#fff8f0")[:3]
    fill = link(bpy.data.objects.new("fill", fill_data), "fx")
    fill.location = (-4.0, -12.0, 4.0)
    aim(fill, Vector((0.3, 0.5, 0.6)) - fill.location)


def camera(scene, width, height):
    data = bpy.data.cameras.new("camera")
    data.type = "ORTHO"
    data.ortho_scale = 11.2
    data.shift_y = 0.0
    cam = link(bpy.data.objects.new("camera", data), "fx")
    az, el = math.radians(28), math.radians(13)
    target = Vector((0.15, 0.3, 0.35))
    direction = Vector(
        (-math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))
    )
    cam.location = target + direction * 30
    cam.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
    data.clip_end = 100
    scene.camera = cam
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100


def render_settings(scene, samples, width):
    scene.render.engine = "CYCLES"
    cycles = scene.cycles
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "OPTIX"
        prefs.get_devices()
        found = False
        for device in prefs.devices:
            device.use = device.type == "OPTIX"
            found = found or device.use
        cycles.device = "GPU" if found else "CPU"
    except (KeyError, TypeError, AttributeError):
        cycles.device = "CPU"
    cycles.samples = samples
    cycles.use_adaptive_sampling = True
    cycles.adaptive_threshold = 0.02
    cycles.use_denoising = True
    cycles.denoiser = "OPENIMAGEDENOISE"
    cycles.seed = 7
    cycles.use_animated_seed = False
    cycles.max_bounces = 8
    cycles.transparent_max_bounces = 16
    scene.render.film_transparent = True
    scene.render.use_persistent_data = True
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"

    # Charcoal outlines around shapes, but not around drops, wisps or lights.
    scene.render.use_freestyle = True
    scene.render.line_thickness_mode = "ABSOLUTE"
    settings = scene.view_layers[0].freestyle_settings
    settings.crease_angle = math.radians(135)
    lineset = (
        settings.linesets[0] if settings.linesets else settings.linesets.new("outline")
    )
    lineset.select_by_visibility = True
    lineset.select_by_edge_types = True
    lineset.select_by_collection = True
    lineset.collection = COLLECTIONS["fx"]
    lineset.collection_negation = "EXCLUSIVE"
    lineset.select_silhouette = True
    lineset.select_border = True
    lineset.select_crease = True
    style = lineset.linestyle or bpy.data.linestyles.new("outline")
    lineset.linestyle = style
    style.color = lin(CHARCOAL)[:3]
    style.alpha = 0.85
    style.thickness = 2.2 * width / 1440
    style.caps = "ROUND"


def shadow_catcher():
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=30)
    bmesh.ops.translate(bm, vec=(0, 0, -3.2), verts=bm.verts)
    ground = finish("ground", bm, [], collection="fx")
    ground.is_shadow_catcher = True


def build(args):
    scene = reset()
    m = materials()
    build_shell(m)
    build_servers(m)
    build_tank(m)
    build_radiator(m)
    build_shower(m)
    build_living_room(m)
    build_pipes(m)
    shadow_catcher()
    lights_and_world(scene)
    camera(scene, args.width, args.height)
    render_settings(scene, args.samples, args.width)
    return scene


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(prog="heat_loop.py")
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--frames", type=int, default=84)
    parser.add_argument("--width", type=int, default=1080)
    parser.add_argument("--height", type=int, default=900)
    parser.add_argument("--samples", type=int, default=40)
    parser.add_argument("--only", default="")
    parser.add_argument("--blend", type=Path)
    args = parser.parse_args(argv)

    scene = build(args)
    if args.blend:
        bpy.ops.wm.save_as_mainfile(filepath=str(args.blend.resolve()))
    args.out.mkdir(parents=True, exist_ok=True)
    frames = range(1, args.frames + 1)
    if args.only:
        frames = [int(f) for f in args.only.split(",")]
    started = time.monotonic()
    for frame in frames:
        t = (frame - 1) / args.frames
        for update in UPDATES:
            update(t)
        scene.render.filepath = str((args.out / f"{frame:04d}.png").resolve())
        bpy.ops.render.render(write_still=True)
    elapsed = time.monotonic() - started
    print(f"heat-loop: rendered {len(frames)} frames in {elapsed:.0f} s")


if __name__ == "__main__":
    main()
