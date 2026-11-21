"""Export the plant room as it appears in the video to docs/models/plantroom.glb.

    blender --background scripts/video/assets/plantroom.blend \
        --python scripts/video/export_glb.py -- --out docs/models/plantroom.glb

The server instances are made real so the file stands alone in three.js, the
hidden parts are left out, the meshes are Draco-compressed (load them in
three.js with GLTFLoader plus DRACOLoader), and dense meshes are decimated until the file is
under the size limit (5 MB by default).
"""

import argparse
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kachel_scene as ks


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--max-mb", type=float, default=5.0)
    a = ap.parse_args(argv)
    h = ks.prepare()
    ks.apply_state(
        h,
        servers_on=len(h["servers"]),
        tank_frac=0.6,
        heat_frac=1.0,
        backup_frac=0.0,
        space_frac=0.0,
        draw_on=False,
    )
    scene = h["scene"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in h["servers"]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = h["servers"][0]
    bpy.ops.object.duplicates_make_real(use_base_parent=True, use_hierarchy=True)
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    for ratio in (1.0, 0.5, 0.3, 0.2):
        if ratio < 1.0:
            for o in scene.objects:
                if o.type == "MESH" and len(o.data.polygons) > 150:
                    m = o.modifiers.get("Decimate") or o.modifiers.new(
                        "Decimate", "DECIMATE"
                    )
                    m.ratio = ratio
        bpy.ops.object.select_all(action="DESELECT")
        for o in scene.objects:
            if o.type == "MESH" and not o.hide_render and o.visible_get():
                o.select_set(True)
        bpy.ops.export_scene.gltf(
            filepath=str(out),
            export_format="GLB",
            use_selection=True,
            export_apply=True,
            export_cameras=False,
            export_lights=False,
            export_texcoords=False,  # the materials are procedural, no image maps
            use_active_scene=True,
            export_draco_mesh_compression_enable=True,  # load with three.js DRACOLoader
            export_draco_mesh_compression_level=6,
        )
        mb = out.stat().st_size / 1e6
        print(f"decimate {ratio}: {mb:.2f} MB", flush=True)
        if mb <= a.max_mb:
            break


main()
