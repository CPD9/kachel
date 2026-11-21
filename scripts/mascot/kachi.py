"""Build Kachi, the Kachel mascot, in Blender from nothing and render its stills.

Rebuild the stills from the repository root with

    make mascot-stills

which runs

    TMPDIR=~/.cache/kachel/tmp blender --background --factory-startup \
        --python scripts/mascot/kachi.py -- \
        --out ~/.cache/kachel/mascot --blend scripts/mascot/kachi.blend

Kachi is a small tiled stove that is also a home server. Its body is a
Kachelofen: glazed green tiles with bevelled edges, cream corner beads, a
crown and a plinth. Its face is a dark glass visor with LED-strip eyes and
mouth; its belly is a firebox grille with an ember glow. It wears the supply
pipe (red) and return pipe (blue) as a scarf, and has short corrugated arms
with oven-mitt hands. Every shape, material and light is made here; nothing is
loaded from disk.

The rig is kept small for the idle loop and the GLB that come later:
    Kachi_Rig       armature: root, body, upper_arm.L/R, forearm.L/R;
                    custom property "glow" (0 to 1) drives the ember, the
                    eyes and the glow light through drivers
    Kachi_Face      eyes and mouth; shape keys Blink, Squint, Happy,
                    Determined, Sleepy, Grin, Flat and Smirk
    Kachi_Body      tiles, trim, visor, grille and arms, one mesh
    Kachi_Scarf     the two pipes, weighted to the body bone
Every mesh is plain (no live modifiers but the armature) and every material
is a Principled BSDF, with emission for the glow, so it survives glTF.

Six stills come out at --size pixels on the warm paper colour #FAF8F5: front,
three-quarter and side in the neutral pose, and happy, determined and sleepy
in three-quarter view, plus a contact sheet of all six.

Options after "--":
    --out DIR        where the PNG stills go (required)
    --size N         square render size in pixels (default 1600)
    --samples N      Cycles samples per pixel (default 128)
    --device NAME    GPU or CPU (default GPU, with OptiX)
    --only a,b       render only these stills (front, three-quarter, side,
                     happy, determined, sleepy)
    --blend FILE     also save the built scene, in the neutral pose, to FILE
"""

import argparse
import itertools
import math
import random
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

PAPER = "#FAF8F5"
EMBER = "#FF5A1F"
AMBER = "#FFB020"

# Body dimensions in metres-ish units; the character faces -y, its left is +x.
CORE_X = 0.48  # half width of the grout core
CORE_Y = 0.37  # half depth
CORE_Z0 = 0.20  # top of the plinth
CORE_Z1 = 1.28  # bottom of the crown
TILE = 0.035  # how far tiles stand proud of the core
CORNER_R = 0.15  # radius of the rounded corner tiles
FRONT = -(CORE_Y + TILE)  # the tiled front surface
SHOULDER_Z = 0.61
# Centres of the rounded corners, in plan.
CORNER_X = CORE_X + TILE - CORNER_R
CORNER_Y = CORE_Y + TILE - CORNER_R
SHARP = math.radians(40)  # edges sharper than this stay hard-shaded


def bulge(z):
    """Barrel the body a little: wider at the belly than at crown and plinth."""
    t = min(1.0, max(0.0, (z - 0.1) / 1.3))
    return 1 + 0.12 * math.sin(math.pi * t) ** 1.5


def barrel(bm):
    for v in bm.verts:
        f = bulge(v.co.z)
        v.co.x *= f
        v.co.y *= f


STILLS = {
    # name: (camera angle in degrees around z, expression)
    "front": (0, "neutral"),
    "three-quarter": (35, "neutral"),
    "side": (90, "neutral"),
    "happy": (35, "happy"),
    "determined": (35, "determined"),
    "sleepy": (35, "sleepy"),
}


def lin(hex_colour, alpha=1.0):
    """sRGB hex to linear RGBA."""
    h = hex_colour.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i : i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, alpha)


# ---------------------------------------------------------------- materials


def principled(name, colour, rough=0.5, metal=0.0, coat=0.0, emit=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = lin(colour)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Coat Weight"].default_value = coat
    bsdf.inputs["Coat Roughness"].default_value = 0.08
    if emit:
        bsdf.inputs["Emission Color"].default_value = lin(emit)
        bsdf.inputs["Emission Strength"].default_value = strength
    mat.diffuse_color = lin(colour)
    return mat


def materials():
    return {
        "tile_a": principled("Glaze green", "#2C6B50", rough=0.22, coat=0.6),
        "tile_b": principled("Glaze green dark", "#245C44", rough=0.22, coat=0.6),
        "tile_c": principled("Glaze green light", "#34775A", rough=0.22, coat=0.6),
        "trim": principled("Glaze terracotta", "#A8532E", rough=0.22, coat=0.6),
        "honey": principled("Glaze honey", "#B9802F", rough=0.22, coat=0.6),
        "grout": principled("Grout", "#1D2622", rough=0.8),
        "iron": principled("Iron", "#2B2D30", rough=0.45, metal=0.6),
        "hose": principled("Arm hose", "#33373C", rough=0.4, coat=0.2),
        "mitt": principled("Mitt orange", "#D8582A", rough=0.45, coat=0.25),
        "rubber": principled("Cuff rubber", "#26282B", rough=0.6),
        "feet": principled("Feet terracotta", "#7E3A20", rough=0.3, coat=0.5),
        "glass": principled("Visor glass", "#101416", rough=0.12, coat=1.0),
        "led": principled("LED amber", "#3A2408", rough=0.4, emit=AMBER, strength=6.0),
        "ember": principled("Ember", "#4A1A08", rough=0.6, emit=EMBER, strength=8.0),
        "coal": principled("Coal glow", "#5A2A08", rough=0.6, emit=AMBER, strength=1.0),
        "status": principled(
            "Status green", "#5BE38A", rough=0.4, emit="#5BE38A", strength=1.5
        ),
        "supply": principled("Supply red", "#D2372A", rough=0.28, coat=0.5),
        "return": principled("Return blue", "#2D6BD2", rough=0.28, coat=0.5),
        "brass": principled("Brass", "#C9A24A", rough=0.3, metal=1.0),
    }


# ---------------------------------------------------------------- mesh parts


class Group:
    """Parts that end up as one mesh object, with one material list."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []
        self.weights = {}  # vertex index -> {group: weight}

    def add(self, part, mat, weights=None, sharp=SHARP):
        """Append a bmesh part; weights maps a group name to a weight per vertex."""
        if mat not in self.mats:
            self.mats.append(mat)
        index = self.mats.index(mat)
        for face in part.faces:
            face.material_index = index
            face.smooth = True
        for edge in part.edges:
            if len(edge.link_faces) == 2 and edge.calc_face_angle(0) > sharp:
                edge.smooth = False
        mesh = bpy.data.meshes.new("part")
        part.to_mesh(mesh)
        part.free()
        start = len(self.bm.verts)
        self.bm.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)
        if weights:
            for name, values in weights.items():
                for i, w in enumerate(values):
                    self.weights.setdefault(start + i, {})[name] = w

    def build(self, default_group="body"):
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for mat in self.mats:
            mesh.materials.append(mat)
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        groups = {}
        for i in range(len(mesh.vertices)):
            for name, w in self.weights.get(i, {default_group: 1.0}).items():
                if name not in groups:
                    groups[name] = obj.vertex_groups.new(name=name)
                if w > 0:
                    groups[name].add([i], w, "REPLACE")
        return obj


def box(size, centre, bevel=0.0, segments=2, matrix=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if bevel:
        bmesh.ops.bevel(
            bm,
            geom=list(bm.edges),
            offset=bevel,
            segments=segments,
            profile=0.5,
            affect="EDGES",
            clamp_overlap=True,
        )
    m = Matrix.Translation(Vector(centre))
    if matrix is not None:
        m = m @ matrix
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return bm


def sphere(radius, centre, scale=(1, 1, 1), segments=20, rings=12):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(centre), verts=bm.verts)
    return bm


def cylinder(radius, depth, centre, segments=24, matrix=None, radius2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        segments=segments,
        radius1=radius,
        radius2=radius if radius2 is None else radius2,
        depth=depth,
    )
    m = Matrix.Translation(Vector(centre))
    if matrix is not None:
        m = m @ matrix
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return bm


def curve_mesh(points, radius, cyclic=False, resolution=4, caps=True):
    """A tube along a dense polyline, converted to a bmesh."""
    data = bpy.data.curves.new("tube", "CURVE")
    data.dimensions = "3D"
    data.bevel_depth = radius
    data.bevel_resolution = resolution
    data.use_fill_caps = caps
    spline = data.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for p, co in zip(spline.points, points):
        p.co = (*co, 1.0)
    spline.use_cyclic_u = cyclic
    return _curve_to_bmesh(data)


def slab_mesh(outline, depth, bevel, matrix):
    """A filled 2D outline extruded to a rounded slab."""
    data = bpy.data.curves.new("slab", "CURVE")
    data.dimensions = "2D"
    data.fill_mode = "BOTH"
    data.extrude = depth
    data.bevel_depth = bevel
    data.bevel_resolution = 3
    spline = data.splines.new("POLY")
    spline.points.add(len(outline) - 1)
    for p, (x, y) in zip(spline.points, outline):
        p.co = (x, y, 0.0, 1.0)
    spline.use_cyclic_u = True
    bm = _curve_to_bmesh(data)
    bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    return bm


def _curve_to_bmesh(data):
    obj = bpy.data.objects.new("tmp", data)
    bpy.context.scene.collection.objects.link(obj)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    bpy.data.objects.remove(obj)
    bpy.data.curves.remove(data)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bpy.data.meshes.remove(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    return bm


def rounded_rect(hx, hy, r, n=8):
    """Outline of a rounded rectangle centred on the origin, counter-clockwise."""
    pts = []
    for cx, cy, a0 in (
        (hx - r, hy - r, 0),
        (-hx + r, hy - r, 90),
        (-hx + r, -hy + r, 180),
        (hx - r, -hy + r, 270),
    ):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


# XZ plane facing -y: outline (x, z) and depth along -y.
TO_FRONT = Matrix.Rotation(math.radians(90), 4, "X")


# ---------------------------------------------------------------- the body


def tiles(group, mats, rng):
    """Glazed tiles on the front, sides and back, rounded tiles on the corners."""
    gap = 0.008
    rows = 5
    row_h = (CORE_Z1 - CORE_Z0) / rows
    shades = [mats["tile_a"], mats["tile_b"], mats["tile_c"]]

    def tile(centre, size):
        group.add(box(size, centre, bevel=0.03, segments=2), rng.choice(shades))

    for r in range(rows):
        z0 = CORE_Z0 + r * row_h
        zc = z0 + row_h / 2
        # Corner tiles: rounded columns, one per row, bevelled top and bottom.
        for sx in (-1, 1):
            for sy in (-1, 1):
                col = cylinder(
                    CORNER_R,
                    row_h - gap,
                    (sx * CORNER_X, sy * CORNER_Y, zc),
                    segments=24,
                )
                edges = [
                    e
                    for e in col.edges
                    if len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.5
                ]
                bmesh.ops.bevel(
                    col,
                    geom=edges,
                    offset=0.025,
                    segments=2,
                    profile=0.5,
                    affect="EDGES",
                )
                group.add(col, rng.choice(shades))
        # Front: the visor takes the top, the firebox the middle of the bottom two rows.
        if z0 + row_h <= 0.84:
            if r < 2:
                spans = [(-CORNER_X, -0.235), (0.235, CORNER_X)]
            else:
                spans = [
                    (
                        -CORNER_X + i * 2 * CORNER_X / 3,
                        -CORNER_X + (i + 1) * 2 * CORNER_X / 3,
                    )
                    for i in range(3)
                ]
            for x0, x1 in spans:
                tile(
                    ((x0 + x1) / 2, -CORE_Y - TILE / 2, zc),
                    (x1 - x0 - gap, TILE, row_h - gap),
                )
        # Back: three tiles a row.
        for i in range(3):
            x0 = -CORNER_X + i * 2 * CORNER_X / 3
            x1 = x0 + 2 * CORNER_X / 3
            tile(
                ((x0 + x1) / 2, CORE_Y + TILE / 2, zc),
                (x1 - x0 - gap, TILE, row_h - gap),
            )
        # Sides: two tiles a row.
        for sx in (-1, 1):
            for y0, y1 in ((-CORNER_Y, 0.0), (0.0, CORNER_Y)):
                tile(
                    (sx * (CORE_X + TILE / 2), (y0 + y1) / 2, zc),
                    (TILE, y1 - y0 - gap, row_h - gap),
                )


def plan_slab(hx, hy, radius, z0, z1, bevel):
    """A rounded-rectangle slab in plan, from z0 to z1."""
    depth = (z1 - z0) / 2 - bevel
    return slab_mesh(
        rounded_rect(hx, hy, radius, n=10),
        depth,
        bevel,
        Matrix.Translation((0, 0, (z0 + z1) / 2)),
    )


def body(group, mats, rng):
    # Grout core, rounded to sit inside the corner tiles.
    group.add(
        plan_slab(CORE_X, CORE_Y, CORNER_R - TILE + 0.005, CORE_Z0, CORE_Z1, 0.0),
        mats["grout"],
    )
    tiles(group, mats, rng)
    # Plinth, and a crown that steps in as it rises, like a stove's.
    ox, oy = CORE_X + TILE, CORE_Y + TILE
    group.add(
        plan_slab(ox + 0.04, oy + 0.04, CORNER_R + 0.04, 0.10, CORE_Z0 + 0.01, 0.03),
        mats["trim"],
    )
    for i, (out, h) in enumerate(
        ((0.05, 0.07), (0.02, 0.06), (-0.04, 0.05), (-0.11, 0.05))
    ):
        z0 = (
            CORE_Z1
            - 0.005
            + sum(
                hh
                for _, hh in ((0.05, 0.07), (0.02, 0.06), (-0.04, 0.05), (-0.11, 0.05))[
                    :i
                ]
            )
        )
        group.add(
            plan_slab(ox + out, oy + out, CORNER_R + out, z0, z0 + h + 0.005, 0.022),
            mats["trim" if i % 2 == 0 else "honey"],
        )
    top = CORE_Z1 + 0.225
    # Two stubby feet, toes peeking out in front.
    for sx in (-1, 1):
        group.add(
            sphere(
                0.13,
                (sx * 0.26, -0.3, 0.075),
                scale=(1.0, 1.6, 0.66),
                segments=24,
                rings=14,
            ),
            mats["feet"],
        )
    # A small flue on top, worn like a jaunty hat.
    tilt = Matrix.Rotation(math.radians(-9), 4, "Y")
    base = Vector((0.16, 0.05, top - 0.02))
    group.add(
        cylinder(0.07, 0.16, base + tilt @ Vector((0, 0, 0.08)), matrix=tilt),
        mats["iron"],
    )
    group.add(
        cylinder(0.092, 0.03, base + tilt @ Vector((0, 0, 0.17)), matrix=tilt),
        mats["iron"],
    )
    # Status LEDs on the crown, the server giving itself away.
    for i, x in enumerate((0.22, 0.28, 0.34)):
        group.add(
            sphere(0.013, (x, -(oy + 0.05), CORE_Z1 + 0.035), segments=10, rings=6),
            mats["status" if i < 2 else "led"],
        )


def visor(group, mats):
    """Dark glass face screen with a cream bead frame."""
    hx, z0, z1 = 0.35, 0.84, 1.255
    zc = (z0 + z1) / 2
    hz = (z1 - z0) / 2
    m = Matrix.Translation((0, FRONT + 0.012, zc)) @ TO_FRONT
    group.add(slab_mesh(rounded_rect(hx, hz, 0.07), 0.012, 0.012, m), mats["glass"])
    frame = [
        (x, FRONT - 0.002, zc + z)
        for x, z in rounded_rect(hx + 0.012, hz + 0.012, 0.08)
    ]
    group.add(curve_mesh(frame, 0.018, cyclic=True), mats["trim"])


def firebox(group, mats):
    """The belly: an ember-lit window behind iron bars, framed in cream."""
    hx, z0, z1 = 0.18, 0.25, 0.60
    zc = (z0 + z1) / 2
    hz = (z1 - z0) / 2
    m = Matrix.Translation((0, -CORE_Y + 0.004, zc)) @ TO_FRONT
    group.add(
        slab_mesh(rounded_rect(hx + 0.01, hz + 0.01, 0.06), 0.004, 0.0, m),
        mats["ember"],
    )
    # Soot-dark inner walls so the glow sits in a recess.
    depth = FRONT + CORE_Y
    for x in (-hx - 0.004, hx + 0.004):
        group.add(
            box((0.008, -depth, 2 * hz), (x, (FRONT - CORE_Y) / 2, zc)), mats["iron"]
        )
    for z in (z0 - 0.004, z1 + 0.004):
        group.add(
            box((2 * hx, -depth, 0.008), (0, (FRONT - CORE_Y) / 2, z)), mats["iron"]
        )
    # A bed of glowing coals along the bottom, hotter than the back wall.
    rng = random.Random(3)
    for i in range(9):
        x = -hx + 0.02 + i * (2 * hx - 0.04) / 8
        r = rng.uniform(0.028, 0.04)
        group.add(
            sphere(
                r,
                (x, -CORE_Y - 0.018, z0 + r * 0.7),
                scale=(1.2, 0.8, 0.8),
                segments=10,
                rings=6,
            ),
            mats["coal"],
        )
    bar_m = Matrix.Rotation(math.radians(90), 4, "Y")
    for i in range(5):
        z = z0 + (i + 1) * (z1 - z0) / 6
        group.add(
            cylinder(
                0.013, 2 * hx + 0.02, (0, FRONT + 0.008, z), segments=12, matrix=bar_m
            ),
            mats["iron"],
        )
    frame = [
        (x, FRONT - 0.004, zc + z) for x, z in rounded_rect(hx + 0.02, hz + 0.02, 0.07)
    ]
    group.add(curve_mesh(frame, 0.02, cyclic=True), mats["trim"])


# ---------------------------------------------------------------- arms


def arm_chain(side):
    """Shoulder, elbow and wrist of an arm in the rest pose."""
    f = bulge(SHOULDER_Z)
    a = math.radians(-28)
    shoulder = Vector(
        (
            side * (CORNER_X * f + (CORNER_R * f + 0.02) * math.cos(a)),
            -CORNER_Y * f + (CORNER_R * f + 0.02) * math.sin(a),
            SHOULDER_Z,
        )
    )
    elbow = shoulder + Vector((side * 0.09, 0, -0.19))
    wrist = elbow + Vector((side * 0.06, -0.01, -0.15))
    return shoulder, elbow, wrist


def arm(group, mats, side):
    shoulder, elbow, wrist = arm_chain(side)
    name = "L" if side > 0 else "R"
    upper, lower = f"upper_arm.{name}", f"forearm.{name}"
    # Corrugated hose from shoulder to wrist: rings along the two segments.
    path = []
    for a, b, n in ((shoulder, elbow, 14), (elbow, wrist, 12)):
        for i in range(n):
            path.append(a.lerp(b, i / n))
    path.append(wrist)
    total = sum((path[i + 1] - path[i]).length for i in range(len(path) - 1))
    seg = 16
    bm = bmesh.new()
    rings = []
    run = 0.0
    weights_u, weights_l = [], []
    up_len = (elbow - shoulder).length
    for i, p in enumerate(path):
        if i:
            run += (p - path[i - 1]).length
        d = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        a = d.orthogonal().normalized()
        b = d.cross(a)
        r = 0.072 - 0.01 * run / total + 0.006 * math.cos(run * 2 * math.pi / 0.04)
        ring = [
            bm.verts.new(
                p
                + r
                * (
                    math.cos(2 * math.pi * k / seg) * a
                    + math.sin(2 * math.pi * k / seg) * b
                )
            )
            for k in range(seg)
        ]
        rings.append(ring)
        t = max(0.0, min(1.0, (run - up_len + 0.04) / 0.08))
        weights_u += [1 - t] * seg
        weights_l += [t] * seg
    for r0, r1 in itertools.pairwise(rings):
        for k in range(seg):
            bm.faces.new((r0[k], r0[(k + 1) % seg], r1[(k + 1) % seg], r1[k]))
    group.add(
        bm, mats["hose"], {upper: weights_u, lower: weights_l}, sharp=math.radians(80)
    )
    # Shoulder cap on the body.
    group.add(sphere(0.095, shoulder, scale=(0.8, 1, 1)), mats["trim"])
    # Oven-mitt hand with a thumb, pointing along the forearm.
    d = (wrist - elbow).normalized()
    hand_c = wrist + d * 0.09
    rot = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
    mitt = sphere(0.11, (0, 0, 0), scale=(1.0, 0.62, 1.2))
    bmesh.ops.transform(mitt, matrix=Matrix.Translation(hand_c) @ rot, verts=mitt.verts)
    group.add(mitt, mats["mitt"], {lower: [1.0] * len(mitt.verts)})
    thumb = sphere(0.048, (0, 0, 0), scale=(0.9, 0.9, 1.3), segments=12, rings=8)
    thumb_c = hand_c + Vector((-side * 0.065, -0.05, 0.0)) + d * -0.015
    tilt = Matrix.Rotation(math.radians(side * 35), 4, "Y")
    bmesh.ops.transform(
        thumb, matrix=Matrix.Translation(thumb_c) @ tilt, verts=thumb.verts
    )
    group.add(thumb, mats["mitt"], {lower: [1.0] * len(thumb.verts)})
    cuff = cylinder(0.085, 0.044, (0, 0, 0), segments=20)
    bmesh.ops.transform(
        cuff, matrix=Matrix.Translation(wrist + d * 0.005) @ rot, verts=cuff.verts
    )
    group.add(cuff, mats["rubber"], {lower: [1.0] * len(cuff.verts)})


# ---------------------------------------------------------------- scarf


def scarf(group, mats):
    """Supply and return pipes twisted round the neck, knotted at a brass
    union on the left shoulder, with the two ends flaring out from there."""
    z_neck = 0.795
    f = bulge(z_neck)
    radius = CORNER_R * f + 0.074
    pipe_r = 0.042
    twist_r = 0.04
    # The neck line, a rounded rectangle round the corner tiles, sagging a
    # little at the front like a scarf.
    outline = rounded_rect(CORNER_X * f + radius, CORNER_Y * f + radius, radius, n=12)
    dense = []
    for i in range(len(outline)):
        a, b = Vector(outline[i]), Vector(outline[(i + 1) % len(outline)])
        steps = max(1, int((b - a).length / 0.02))
        dense += [a.lerp(b, k / steps) for k in range(steps)]
    hy = CORNER_Y * f + radius
    centre = [
        Vector((p.x, p.y, z_neck - 0.045 * max(0.0, -p.y / hy) ** 3)) for p in dense
    ]
    # Start the loop at the knot: on the front right corner, over the shoulder.
    start = min(
        range(len(centre)),
        key=lambda i: (centre[i] - Vector((-0.62, -0.5, z_neck))).length,
    )
    centre = centre[start:] + centre[:start]
    n = len(centre)
    turns = 2
    for colour, phase in (("supply", 0.0), ("return", math.pi)):
        pts = []
        for i, c in enumerate(centre):
            t = (centre[(i + 1) % n] - centre[i - 1]).normalized()
            out = Vector((t.y, -t.x, 0)).normalized()
            ang = 2 * math.pi * turns * i / n + phase
            pts.append(
                c + twist_r * (math.cos(ang) * out + math.sin(ang) * Vector((0, 0, 1)))
            )
        group.add(curve_mesh(pts, pipe_r, cyclic=True, resolution=3), mats[colour])
    knot = centre[0] + Vector((-0.01, -0.01, 0.0))

    def tail(points):
        """Catmull-Rom through a few control points."""
        ctrl = [Vector(p) for p in points]
        ctrl = [ctrl[0], *ctrl, ctrl[-1]]
        out = []
        for i in range(1, len(ctrl) - 2):
            p0, p1, p2, p3 = ctrl[i - 1 : i + 3]
            for s in range(12):
                t = s / 12
                out.append(
                    0.5
                    * (
                        2 * p1
                        + (-p0 + p2) * t
                        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                        + (-p0 + 3 * p1 - 3 * p2 + p3) * t**3
                    )
                )
        out.append(ctrl[-2])
        return out

    # The ends flare out and back over the shoulder, as if caught by a draught.
    # The ends go back over the shoulder and flare apart down the side.
    red = tail(
        [
            knot,
            knot + Vector((-0.07, 0.06, 0.05)),
            knot + Vector((-0.12, 0.22, 0.02)),
            knot + Vector((-0.24, 0.36, -0.08)),
            knot + Vector((-0.32, 0.46, -0.22)),
        ]
    )
    blue = tail(
        [
            knot,
            knot + Vector((-0.06, 0.08, -0.02)),
            knot + Vector((-0.12, 0.2, -0.1)),
            knot + Vector((-0.2, 0.26, -0.25)),
            knot + Vector((-0.24, 0.27, -0.4)),
        ]
    )
    group.add(curve_mesh(red, pipe_r, resolution=3), mats["supply"])
    group.add(curve_mesh(blue, pipe_r, resolution=3), mats["return"])
    # Brass union over the knot and hex nuts on the pipe ends.
    group.add(sphere(0.072, knot, scale=(1.1, 0.9, 1.0)), mats["brass"])
    for pts in (red, blue):
        end, before = pts[-1], pts[-3]
        d = (end - before).normalized()
        rot = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
        group.add(
            cylinder(
                0.05, 0.045, (0, 0, 0), segments=6, matrix=Matrix.Translation(end) @ rot
            ),
            mats["brass"],
            sharp=math.radians(30),
        )


# ---------------------------------------------------------------- face


EYE_X = 0.165
EYE_Z = 1.085
EYE_W = 0.095  # half width
EYE_H = 0.062  # half height
EYE_SEGS = 6
MOUTH_Z = 0.925
MOUTH_W = 0.1
MOUTH_SEGS = 8
FACE_Y = FRONT - 0.019


def eye_edges(shape, s):
    """Top and bottom of an eye at s in [-1, 1] across it (s = +1 is outward)."""
    rim = max(0.0, 1 - abs(s) ** 4) ** 0.25
    if shape == "open":
        return EYE_H * rim, -EYE_H * rim
    if shape == "Blink":
        return 0.006 * rim + 0.002, -0.006 * rim - 0.002
    if shape == "Squint":
        return 0.024 * rim - 0.01, -0.03 * rim - 0.01
    if shape == "Happy":
        arc = 0.045 * (1 - s * s) - 0.01
        return arc + 0.02 * rim + 0.004, arc - 0.012 * rim - 0.004
    if shape == "Determined":
        top = EYE_H * 0.7 * rim - 0.035 * (1 - s) / 2 + 0.01 * (1 + s) / 2
        return top, -EYE_H * 0.75 * rim
    if shape == "Sleepy":
        return -0.012 + 0.006 * rim, -EYE_H * 0.85 * rim
    raise ValueError(shape)


def mouth_edges(shape, s):
    """Top and bottom of the mouth at s in [-1, 1] from the character's right."""
    rim = max(0.0, 1 - abs(s) ** 6) ** (1 / 6)
    if shape == "open":
        mid = 0.02 * s * s
        return mid + 0.011 * rim, mid - 0.011 * rim
    if shape == "Grin":
        mid = 0.035 * s * s - 0.008
        return mid + 0.008 * rim + 0.004, mid - 0.03 * rim * (1 - 0.4 * s * s)
    if shape == "Flat":
        return 0.008 * rim, -0.008 * rim
    if shape == "Smirk":
        mid = 0.028 * max(0.0, s) ** 2 - 0.004 * (1 - s)
        return mid + 0.009 * rim, mid - 0.009 * rim
    raise ValueError(shape)


def face_vertices(eye_shape, mouth_shape):
    """LED segments as quads: each eye and the mouth, in a fixed order."""
    verts = []

    def strip(cx, cz, half_w, n, edges, flip):
        pitch = 2 * half_w / n
        for k in range(n):
            for s0 in (k * pitch + 0.12 * pitch, (k + 1) * pitch - 0.12 * pitch):
                u = -half_w + s0
                s = u / half_w * flip
                top, bot = edges(s)
                verts.append(
                    tuple(
                        (x * bulge(z), y * bulge(z), z)
                        for x, y, z in (
                            (cx + u, FACE_Y, cz + bot),
                            (cx + u, FACE_Y, cz + top),
                        )
                    )
                )

    for side in (-1, 1):
        strip(
            side * EYE_X,
            EYE_Z,
            EYE_W,
            EYE_SEGS,
            lambda s: eye_edges(eye_shape, s),
            side,
        )
    strip(0, MOUTH_Z, MOUTH_W, MOUTH_SEGS, lambda s: mouth_edges(mouth_shape, s), 1)
    flat = []
    for bot, top in verts:
        flat += [bot, top]
    return flat


def face(mats):
    base = face_vertices("open", "open")
    faces = [(i, i + 2, i + 3, i + 1) for i in range(0, len(base), 4)]
    mesh = bpy.data.meshes.new("Kachi_Face")
    mesh.from_pydata(base, [], faces)
    mesh.materials.append(mats["led"])
    obj = bpy.data.objects.new("Kachi_Face", mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.shape_key_add(name="Basis")
    for eye in ("Blink", "Squint", "Happy", "Determined", "Sleepy"):
        key = obj.shape_key_add(name=eye, from_mix=False)
        co = face_vertices(eye, "open")
        n_eye = 2 * EYE_SEGS * 4
        for i in range(n_eye):
            key.data[i].co = co[i]
    for mouth in ("Grin", "Flat", "Smirk"):
        key = obj.shape_key_add(name=mouth, from_mix=False)
        co = face_vertices("open", mouth)
        n_eye = 2 * EYE_SEGS * 4
        for i in range(n_eye, len(co)):
            key.data[i].co = co[i]
    obj.vertex_groups.new(name="body").add(list(range(len(base))), 1.0, "REPLACE")
    return obj


# ---------------------------------------------------------------- rig


def rig():
    arm_data = bpy.data.armatures.new("Kachi_Rig")
    obj = bpy.data.objects.new("Kachi_Rig", arm_data)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    root = arm_data.edit_bones.new("root")
    root.head, root.tail = (0, 0, 0), (0, 0.3, 0)
    body = arm_data.edit_bones.new("body")
    body.head, body.tail, body.parent = (0, 0, 0.1), (0, 0, 0.9), root
    for side, name in ((1, "L"), (-1, "R")):
        shoulder, elbow, wrist = arm_chain(side)
        up = arm_data.edit_bones.new(f"upper_arm.{name}")
        up.head, up.tail, up.parent = shoulder, elbow, body
        lo = arm_data.edit_bones.new(f"forearm.{name}")
        lo.head, lo.tail, lo.parent = elbow, wrist, up
        lo.use_connect = True
    bpy.ops.object.mode_set(mode="OBJECT")
    obj["glow"] = 0.6
    obj.id_properties_ui("glow").update(
        min=0.0, max=1.0, description="Heat output: ember and eye glow"
    )
    for pb in obj.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return obj


def bind(obj, rig_obj):
    obj.parent = rig_obj
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = rig_obj


def glow_driver(target, path, rig_obj, expression):
    fc = target.driver_add(path)
    drv = fc.driver
    drv.type = "SCRIPTED"
    var = drv.variables.new()
    var.name = "glow"
    var.type = "SINGLE_PROP"
    var.targets[0].id_type = "OBJECT"
    var.targets[0].id = rig_obj
    var.targets[0].data_path = '["glow"]'
    drv.expression = expression


def pose_arm(rig_obj, side, out=0.0, fwd=0.0, bend=0.0, lift=0.0):
    """Swing an arm out (sideways) and forward; bend the elbow forward and lift
    the forearm sideways, all in degrees."""
    name = "L" if side > 0 else "R"
    for bone, q in (
        (
            f"upper_arm.{name}",
            Quaternion((0, 1, 0), math.radians(-side * out))
            @ Quaternion((1, 0, 0), math.radians(-fwd)),
        ),
        (
            f"forearm.{name}",
            Quaternion((0, 1, 0), math.radians(-side * lift))
            @ Quaternion((1, 0, 0), math.radians(-bend)),
        ),
    ):
        pb = rig_obj.pose.bones[bone]
        rest = pb.bone.matrix_local.to_quaternion()
        pb.rotation_quaternion = rest.inverted() @ q @ rest


EXPRESSIONS = {
    # shape keys, glow, arms (out, fwd, bend, lift) for left then right
    "neutral": ({"Smirk": 0.35}, 0.5, (12, 15, 35, 0), (10, 35, 45, 0)),
    "happy": ({"Happy": 1.0, "Grin": 1.0}, 0.85, (58, 10, 0, 88), (15, 35, 40, 0)),
    "determined": (
        {"Determined": 1.0, "Flat": 0.6, "Smirk": 0.5},
        1.0,
        (58, 10, 30, 78),
        (10, 55, 50, 0),
    ),
    "sleepy": ({"Sleepy": 1.0, "Flat": 1.0}, 0.06, (8, 10, 15, 0), (8, 25, 25, 0)),
}


def set_expression(face_obj, rig_obj, name):
    keys, glow, left, right = EXPRESSIONS[name]
    for kb in face_obj.data.shape_keys.key_blocks[1:]:
        kb.value = keys.get(kb.name, 0.0)
    rig_obj["glow"] = glow
    pose_arm(rig_obj, 1, *left)
    pose_arm(rig_obj, -1, *right)
    rig_obj.update_tag()
    bpy.context.scene.frame_set(1)


# ---------------------------------------------------------------- scene


def scene_setup(size, samples, device):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    cycles = scene.cycles
    cycles.device = "CPU"
    if device == "GPU":
        try:
            prefs = bpy.context.preferences.addons["cycles"].preferences
            prefs.compute_device_type = "OPTIX"
            prefs.get_devices()
            found = False
            for dev in prefs.devices:
                dev.use = dev.type == "OPTIX"
                found = found or dev.use
            cycles.device = "GPU" if found else "CPU"
        except (KeyError, TypeError, AttributeError):
            pass
    cycles.samples = samples
    cycles.use_adaptive_sampling = True
    cycles.adaptive_threshold = 0.015
    cycles.use_denoising = True
    cycles.denoiser = "OPENIMAGEDENOISE"
    cycles.seed = 7
    cycles.max_bounces = 8
    scene.render.film_transparent = True
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"

    world = bpy.data.worlds.new("Paper")
    scene.world = world
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = lin("#F3EDE4")
    bg.inputs["Strength"].default_value = 0.3

    ground = bpy.data.objects.new("Ground", bpy.data.meshes.new("Ground"))
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6)
    bm.to_mesh(ground.data)
    bm.free()
    ground.is_shadow_catcher = True
    scene.collection.objects.link(ground)

    def area(name, loc, energy, colour, size_, shadow=True):
        data = bpy.data.lights.new(name, "AREA")
        data.use_shadow = shadow
        data.energy = energy
        data.size = size_
        data.color = lin(colour)[:3]
        obj = bpy.data.objects.new(name, data)
        obj.location = loc
        obj.rotation_euler = (
            (Vector((0, 0, 0.75)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        )
        scene.collection.objects.link(obj)
        return obj

    area("Key", (-2.4, -3.0, 3.2), 230, "#FFF1DE", 2.2)
    area("Fill", (3.2, -2.2, 1.4), 90, "#E8EEF5", 3.0)
    area("Rim", (1.8, 3.2, 2.8), 300, "#FFE3C4", 1.4, shadow=False)
    area("Top", (0.0, 0.0, 4.0), 50, "#FFFFFF", 3.0, shadow=False)

    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 70
    cam = bpy.data.objects.new("Camera", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return scene


def aim_camera(cam, angle):
    dist, target = 4.8, Vector((0, 0, 0.74))
    a = math.radians(angle)
    cam.location = target + Vector((dist * math.sin(a), -dist * math.cos(a), 0.55))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()


def build(seed=11):
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj)
    rng = random.Random(seed)
    mats = materials()
    rig_obj = rig()

    body_g = Group("Kachi_Body")
    body(body_g, mats, rng)
    visor(body_g, mats)
    firebox(body_g, mats)
    barrel(body_g.bm)
    for side in (1, -1):
        arm(body_g, mats, side)
    body_obj = body_g.build()

    scarf_g = Group("Kachi_Scarf")
    scarf(scarf_g, mats)
    scarf_obj = scarf_g.build()

    face_obj = face(mats)
    for obj in (body_obj, scarf_obj, face_obj):
        bind(obj, rig_obj)

    # The glow: ember and eyes brighten with heat output, and a warm light
    # in front of the firebox spills onto the floor.
    ember = mats["ember"].node_tree.nodes["Principled BSDF"].inputs["Emission Strength"]
    glow_driver(ember, "default_value", rig_obj, "0.1 + 2.6 * glow")
    coal = mats["coal"].node_tree.nodes["Principled BSDF"].inputs["Emission Strength"]
    glow_driver(coal, "default_value", rig_obj, "0.08 + 2.6 * glow")
    eyes = mats["led"].node_tree.nodes["Principled BSDF"].inputs["Emission Strength"]
    glow_driver(eyes, "default_value", rig_obj, "0.7 + 0.4 * glow")
    light = bpy.data.lights.new("Ember glow", "POINT")
    light.color = lin(EMBER)[:3]
    light.shadow_soft_size = 0.15
    glow_driver(light, "energy", rig_obj, "1 + 160 * glow ** 2")
    light_obj = bpy.data.objects.new("Ember glow", light)
    light_obj.location = (0, -0.8, 0.42)
    light_obj.parent = rig_obj
    bpy.context.scene.collection.objects.link(light_obj)

    tris = sum(
        len(p.vertices) - 2
        for o in (body_obj, scarf_obj, face_obj)
        for p in o.data.polygons
    )
    print(f"kachi: {tris} triangles")
    return face_obj, rig_obj


def blur(img, radius):
    """Three box blurs, close to a Gaussian, along both image axes."""
    for axis in (0, 1):
        for _ in range(3):
            pad = [(0, 0)] * img.ndim
            pad[axis] = (radius + 1, radius)
            c = np.cumsum(np.pad(img, pad, mode="edge"), axis=axis)
            hi = np.take(c, range(2 * radius + 1, c.shape[axis]), axis=axis)
            lo = np.take(c, range(c.shape[axis] - 2 * radius - 1), axis=axis)
            img = (hi - lo) / (2 * radius + 1)
    return img


def composite(src, dst, glow=0.5, paper=PAPER):
    """Lay a transparent render over the paper colour, add a warm bloom round
    the ember and the LEDs that grows with the glow, and save it."""
    img = bpy.data.images.load(str(src))
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    bg = np.array(
        [int(paper[i : i + 2], 16) / 255 for i in (1, 3, 5)], dtype=np.float32
    )
    a = px[..., 3:4]
    px[..., :3] = px[..., :3] * a + bg * (1 - a)
    px[..., 3] = 1.0
    rgb = px[..., :3]
    hot = np.clip((rgb[..., 0] - 0.8) * 5, 0, 1) * np.clip(
        (0.45 - rgb[..., 2]) * 4, 0, 1
    )
    hot *= np.clip((rgb[..., 0] - rgb[..., 2] - 0.5) * 3, 0, 1)
    ember = np.array([1.0, 0.42, 0.14], dtype=np.float32)
    halo = blur(hot[..., None] * ember, max(2, w // 60)) * (0.3 + 2.2 * glow**2)
    px[..., :3] = 1 - (1 - rgb) * (1 - np.clip(halo, 0, 1))
    save_pixels(px, dst)
    bpy.data.images.remove(img)
    return px


def save_pixels(px, dst):
    h, w = px.shape[:2]
    out = bpy.data.images.new("out", w, h, alpha=False)
    out.pixels.foreach_set(px.astype(np.float32).ravel())
    out.filepath_raw = str(dst)
    out.file_format = "PNG"
    out.save()
    bpy.data.images.remove(out)


def contact_sheet(stills, dst, cell=532, gap=2):
    """Three across: the turnaround on top, the expressions below."""
    cols, rows = 3, 2
    w = cols * cell + (cols - 1) * gap
    h = rows * cell + (rows - 1) * gap
    sheet = np.ones((h, w, 4), dtype=np.float32)
    sheet[..., :3] = 0.85
    for i, px in enumerate(stills):
        n = px.shape[0]
        idx = (np.arange(cell) * n / cell).astype(int)
        # Box-filter down by averaging a small neighbourhood.
        step = max(1, n // cell)
        acc = np.zeros((cell, cell, 4), dtype=np.float32)
        for dy in range(step):
            for dx in range(step):
                acc += px[np.minimum(idx + dy, n - 1)][:, np.minimum(idx + dx, n - 1)]
        acc /= step * step
        r, c = 1 - i // cols, i % cols  # image rows run bottom-up
        y0, x0 = r * (cell + gap), c * (cell + gap)
        sheet[y0 : y0 + cell, x0 : x0 + cell] = acc
    save_pixels(sheet, dst)


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--size", type=int, default=1600)
    ap.add_argument("--samples", type=int, default=128)
    ap.add_argument("--device", default="GPU", choices=["GPU", "CPU"])
    ap.add_argument("--only", default="")
    ap.add_argument("--blend", default="")
    args = ap.parse_args(argv)

    out = Path(args.out).expanduser()
    out.mkdir(parents=True, exist_ok=True)
    face_obj, rig_obj = build()
    scene = scene_setup(args.size, args.samples, args.device)
    if args.blend:
        set_expression(face_obj, rig_obj, "neutral")
        aim_camera(scene.camera, 35)
        bpy.ops.wm.save_as_mainfile(
            filepath=str(Path(args.blend).resolve()), compress=True
        )

    names = [n for n in STILLS if not args.only or n in args.only.split(",")]
    rendered = {}
    for name in names:
        angle, expression = STILLS[name]
        set_expression(face_obj, rig_obj, expression)
        aim_camera(scene.camera, angle)
        raw = out / f".raw-{name}.png"
        scene.render.filepath = str(raw)
        bpy.ops.render.render(write_still=True)
        rendered[name] = composite(
            raw, out / f"kachi-{name}.png", glow=EXPRESSIONS[expression][1]
        )
        raw.unlink()
        print(f"kachi: wrote {out / f'kachi-{name}.png'}")
    if len(rendered) == len(STILLS):
        contact_sheet([rendered[n] for n in STILLS], out / "kachi-sheet.png")
        print(f"kachi: wrote {out / 'kachi-sheet.png'}")


if __name__ == "__main__":
    main()
