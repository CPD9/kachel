"""Export FHNW Campus Dreispitz as a compact block model for the map: docs/models/fhnw-campus.glb.

    blender --background <copy of dreispitz_campus.blend> \
        --python scripts/video/export_campus_glb.py -- --out docs/models/fhnw-campus.glb

Run it on a copy: it deletes everything in the scene. It keeps the film model's building design,
read from the scene (storey levels, parapet, roof panels, facade colours), and drops everything
else: the basement, the plant room, the interior, the ground and the surrounding city blocks.

The film's block is 72 x 46 m, which does not fit the building site on the map. Here the block
takes the site's proportions instead: 134.2 m long and 27.83 m deep, 3,735 m² as in the GWR, its
long side along the outline mapped in OpenStreetMap. Shape and orientation stay our assumptions.

Units are metres. The origin is the middle of the footprint at ground level; +X runs along the
long side (east), +Y across it (north), +Z up in Blender (+Y up in the glTF). The map turns
and places it.
"""

import argparse
import random
import sys

import bmesh
import bpy
import mathutils
import numpy as np

LENGTH = 134.2
DEPTH = 27.83  # LENGTH x DEPTH = 3,735 m², the GWR footprint
STOREYS = 6
BAYS_LONG = 50  # 2.68 m bays
BAYS_SHORT = 10  # 2.78 m bays
PLINTH = 3.0  # metres below ground, so a sloping street never shows a gap
# The facade texture: TILE_BAYS bays by TILE_ROWS storeys, CELL_W x CELL_H pixels a cell.
TILE_BAYS, TILE_ROWS, CELL_W, CELL_H = 32, 8, 64, 128
LIT_SHARE = 0.55
WARM = np.array(
    [[1.0, 0.66, 0.34], [1.0, 0.88, 0.66]]
)  # linear, as in apps/map windows.ts


def levels():
    """Storey pitch, roof and parapet heights, read from the film model's slabs."""
    roof = top_of("Slab6")
    return roof / STOREYS, roof, top_of("Parapet_PS")


def top_of(name):
    return max(v.co.z for v in bpy.data.objects[name].data.vertices)


def thickness_of(name):
    zs = [v.co.z for v in bpy.data.objects[name].data.vertices]
    return max(zs) - min(zs)


def pv_panel():
    """One roof panel from the film model: its size, tilt and height."""
    o = bpy.data.objects["PV_0_0"]
    xs = [v.co.x for v in o.data.vertices]
    ys = [v.co.y for v in o.data.vertices]
    zs = [v.co.z for v in o.data.vertices]
    return (
        (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)),
        o.rotation_euler.x,
        o.location.z,
    )


def colour(name):
    return tuple(bpy.data.materials[name].diffuse_color)


def srgb(c):
    c = np.clip(np.asarray(c, dtype=float), 0, 1)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055)


def facade_images(pitch, slab):
    """Base colour and lit windows for TILE_BAYS x TILE_ROWS cells; pixels are sRGB."""
    w, h = TILE_BAYS * CELL_W, TILE_ROWS * CELL_H
    frame = srgb(colour("Concrete_Fair")[:3]) * 1.35
    glass = srgb(colour("Campus_Facade")[:3])
    base = np.zeros((h, w, 4))
    base[..., :3] = frame
    base[..., 3] = 1
    glow = np.zeros((h, w, 4))
    glow[..., 3] = 1
    band = round(CELL_H * slab / pitch)  # the slab edge at the top of each storey
    sill = round(CELL_H * 0.08)
    mullion = 3
    rng = random.Random(243058419)
    for row in range(TILE_ROWS):
        for bay in range(TILE_BAYS):
            x0, y0 = (
                bay * CELL_W + mullion,
                row * CELL_H + sill,
            )  # image rows run bottom-up
            x1, y1 = (bay + 1) * CELL_W - mullion, (row + 1) * CELL_H - band
            base[y0:y1, x0:x1, :3] = glass
            if rng.random() < LIT_SHARE:
                # Warm white, between the two colours the map's city windows use (windows.ts).
                t = rng.random()
                warm = (1 - t) * WARM[0] + t * WARM[1]
                glow[y0:y1, x0:x1, :3] = srgb(warm * (0.8 + 0.2 * rng.random()))
    return base, glow


def image(name, pixels):
    h, w = pixels.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.colorspace_settings.name = "sRGB"
    img.pixels.foreach_set(pixels.astype(np.float32).ravel())
    img.file_format = "PNG"
    img.pack()
    return img


def material(name, rgb, rough=0.8, metal=0.0, base_img=None, glow_img=None):
    m = bpy.data.materials.new(name)
    m.use_backface_culling = (
        True  # exported as single-sided: the map sees the block from outside
    )
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb[:3], 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if base_img is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = base_img
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if glow_img is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = glow_img
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 1.0
    return m


def quad(bm, uv, corners, uvs):
    f = bm.faces.new([bm.verts.new(c) for c in corners])
    for loop, t in zip(f.loops, uvs):
        loop[uv].uv = t
    return f


def mesh_object(name, build, mats):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    build(bm, uv)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)

    pitch, roof, parapet = levels()
    slab = thickness_of("Slab1")
    (pv_w, pv_d, pv_t), pv_tilt, pv_z = pv_panel()
    concrete = colour("Concrete_Fair")
    pv_glass = colour("PV_Glass")
    gravel = colour("Section_Cut")

    # Everything in the film scene goes: we build the block fresh from the values above.
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)

    base, glow = facade_images(pitch, slab)
    m_facade = material(
        "Facade",
        (1, 1, 1),
        rough=0.55,
        base_img=image("facade_base", base),
        glow_img=image("facade_lit", glow),
    )
    m_concrete = material("Concrete", [min(1, c * 1.35) for c in concrete], rough=0.85)
    m_roof = material("Roof", [c * 2.6 for c in gravel], rough=0.95)
    m_pv = material("PV", pv_glass, rough=0.15, metal=0.4)

    hx, hy = LENGTH / 2, DEPTH / 2
    # Walls counter-clockwise seen from above, each with its outward face, its bays and an offset
    # into the texture so no two walls light the same windows.
    walls = [
        ((-hx, -hy), (hx, -hy), BAYS_LONG, 0),
        ((hx, -hy), (hx, hy), BAYS_SHORT, 11),
        ((hx, hy), (-hx, hy), BAYS_LONG, 5),
        ((-hx, hy), (-hx, -hy), BAYS_SHORT, 23),
    ]
    v_top = STOREYS / TILE_ROWS

    def facade(bm, uv):
        for (x0, y0), (x1, y1), bays, off in walls:
            u0, u1 = off / TILE_BAYS, (off + bays) / TILE_BAYS
            quad(
                bm,
                uv,
                [(x0, y0, 0), (x1, y1, 0), (x1, y1, roof), (x0, y0, roof)],
                [(u0, 0), (u1, 0), (u1, v_top), (u0, v_top)],
            )

    def shell(bm, uv):
        t = 0.3  # parapet thickness, as in the film model
        ix, iy = hx - t, hy - t
        for (x0, y0), (x1, y1), _, _ in walls:
            # Plinth below ground, parapet outside and on top.
            quad(
                bm,
                uv,
                [(x0, y0, -PLINTH), (x1, y1, -PLINTH), (x1, y1, 0), (x0, y0, 0)],
                [(0, 0)] * 4,
            )
            quad(
                bm,
                uv,
                [(x0, y0, roof), (x1, y1, roof), (x1, y1, parapet), (x0, y0, parapet)],
                [(0, 0)] * 4,
            )
            # The parapet's inner corners: the outer ones pulled in by its thickness.
            a = (x0 / hx * ix, y0 / hy * iy)
            b = (x1 / hx * ix, y1 / hy * iy)
            quad(
                bm,
                uv,
                [
                    (x0, y0, parapet),
                    (x1, y1, parapet),
                    (b[0], b[1], parapet),
                    (a[0], a[1], parapet),
                ],
                [(0, 0)] * 4,
            )
            quad(
                bm,
                uv,
                [
                    (b[0], b[1], roof),
                    (a[0], a[1], roof),
                    (a[0], a[1], parapet),
                    (b[0], b[1], parapet),
                ],
                [(0, 0)] * 4,
            )

    def roof_face(bm, uv):
        quad(
            bm,
            uv,
            [(-hx, -hy, roof), (hx, -hy, roof), (hx, hy, roof), (-hx, hy, roof)],
            [(0, 0)] * 4,
        )

    def panels(bm, uv):
        # The film's panel and tilt, in rows along the long side, 2 m clear of the parapet.
        gap_x, gap_y, clear = 0.6, 1.4, 2.0
        cols = int((LENGTH - 2 * clear + gap_x) // (pv_w + gap_x))
        rows = int((DEPTH - 2 * clear + gap_y) // (pv_d + gap_y))
        x_start = -((cols * pv_w + (cols - 1) * gap_x) / 2)
        y_start = -((rows * pv_d + (rows - 1) * gap_y) / 2)
        # Tilted to face south: -Y, since +Y is the north side once the map places the block.
        rot = mathutils.Matrix.Rotation(abs(pv_tilt), 3, "X")
        for c in range(cols):
            for r in range(rows):
                cx = x_start + c * (pv_w + gap_x) + pv_w / 2
                cy = y_start + r * (pv_d + gap_y) + pv_d / 2
                cz = pv_z
                pts = []
                for dz in (0, pv_t):
                    for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                        p = rot @ mathutils.Vector((dx * pv_w / 2, dy * pv_d / 2, dz))
                        pts.append((cx + p.x, cy + p.y, cz + p.z))
                vs = [bm.verts.new(p) for p in pts]
                for idx in (
                    (3, 2, 1, 0),
                    (4, 5, 6, 7),
                    (0, 1, 5, 4),
                    (1, 2, 6, 5),
                    (2, 3, 7, 6),
                    (3, 0, 4, 7),
                ):
                    bm.faces.new([vs[i] for i in idx])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        print(f"panels: {cols} x {rows}")

    root = bpy.data.objects.new("FHNW_Campus_Dreispitz", None)
    bpy.context.scene.collection.objects.link(root)
    root["source"] = (
        "Kachel block model from the pitch film's campus scene (dreispitz_campus.blend)"
    )
    root["assumed"] = (
        "shape, size and orientation; footprint area and storeys from the GWR (EGID 243058419)"
    )
    for ob in (
        mesh_object("Facade", facade, [m_facade]),
        mesh_object("Shell", shell, [m_concrete]),
        mesh_object("Roof", roof_face, [m_roof]),
        mesh_object("RoofPanels", panels, [m_pv]),
    ):
        ob.parent = root
        ob.select_set(True)
    root.select_set(True)

    bpy.ops.export_scene.gltf(
        filepath=a.out,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_image_format="AUTO",
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )
    print(
        f"wrote {a.out}: {LENGTH} x {DEPTH} m, roof {roof:.2f} m, parapet {parapet:.2f} m"
    )


main()
