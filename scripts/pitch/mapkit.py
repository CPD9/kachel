"""Map pieces for the pitch shots: an LV95 camera, raster layers with a mipmap pyramid, the
heat-atlas layers (read-only) and building footprints from the swissBUILDINGS3D tiles.

Pluggable layers: a shot passes a path for a layer that is not on disk yet (the Swiss
outline, Bern district heating, Bern heat demand). `optional_geojson` returns None when the
file is missing, and the shot then draws without it.
"""

import math
import pickle
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from style import HEAT_ATLAS_DATA, REPO, SS, WORK, H, W, lerp, read_json

GDB_CACHE = Path.home() / ".cache/heat-atlas/gdb"
FGDB_DIR = Path.home() / "Projects/heat-atlas/blender"
GEO = REPO / "docs/media/geo"


class Cam:
    """Centre (e, n) in LV95 metres and metres per output pixel."""

    def __init__(self, e, n, mpp, w=W, h=H):
        self.e, self.n, self.mpp, self.w, self.h = e, n, mpp, w, h

    def px(self, e, n):
        """LV95 to canvas pixels (SS times output)."""
        return ((e - self.e) / self.mpp + self.w / 2) * SS, ((self.n - n) / self.mpp + self.h / 2) * SS

    def pxa(self, en):
        en = np.asarray(en, float)
        x = ((en[..., 0] - self.e) / self.mpp + self.w / 2) * SS
        y = ((self.n - en[..., 1]) / self.mpp + self.h / 2) * SS
        return np.stack([x, y], -1)

    def sized(self, w, h, mpp=None):
        """The same centre on a smaller frame (for a loupe), optionally at another scale."""
        return Cam(self.e, self.n, mpp or self.mpp, w, h)

    def bounds(self, pad=0):
        hw, hh = (self.w / 2 + pad) * self.mpp, (self.h / 2 + pad) * self.mpp
        return self.e - hw, self.n - hh, self.e + hw, self.n + hh


def cam_between(a, b, t):
    """Smooth zoom-and-pan from camera a to b: scale moves in log space and the centre follows
    the scale, so the move reads as one continuous flight rather than a slide then a zoom."""
    t = min(max(t, 0.0), 1.0)
    mpp = math.exp(lerp(math.log(a.mpp), math.log(b.mpp), t))
    u = t if abs(b.mpp - a.mpp) < 1e-9 else (mpp - a.mpp) / (b.mpp - a.mpp)
    return Cam(lerp(a.e, b.e, u), lerp(a.n, b.n, u), mpp)


class Raster:
    """An RGBA image georeferenced in LV95 (top-left corner and metres per pixel), drawn
    through any camera with an affine transform from the closest pyramid level."""

    def __init__(self, img, e0, n1, mpp):
        self.levels = [(img, mpp)]
        while min(img.size) > 256:
            img = img.reduce(2)
            mpp *= 2
            self.levels.append((img, mpp))
        self.e0, self.n1 = e0, n1

    def draw(self, canvas, cam, alpha=1.0):
        if alpha <= 0:
            return
        target = cam.mpp / SS  # metres per canvas pixel
        img, mpp = self.levels[0]
        for im, m in self.levels:
            if m <= target * 1.5:
                img, mpp = im, m
        # canvas pixel (X, Y) -> world -> layer pixel
        k = target / mpp
        ox = (cam.e - cam.w / 2 * cam.mpp - self.e0) / mpp
        oy = (self.n1 - (cam.n + cam.h / 2 * cam.mpp)) / mpp
        layer = img.transform(canvas.size, Image.AFFINE, (k, 0, ox, 0, k, oy), Image.BILINEAR)
        if alpha < 1:
            a = layer.getchannel("A").point(lambda v: int(v * alpha))
            layer.putalpha(a)
        canvas.alpha_composite(layer)

    def add(self, canvas, cam, strength=1.0):
        """Additive draw (for glows): RGB scaled by alpha and strength, added to the canvas."""
        target = cam.mpp / SS
        img, mpp = self.levels[0]
        for im, m in self.levels:
            if m <= target * 1.5:
                img, mpp = im, m
        k = target / mpp
        ox = (cam.e - cam.w / 2 * cam.mpp - self.e0) / mpp
        oy = (self.n1 - (cam.n + cam.h / 2 * cam.mpp)) / mpp
        small = (canvas.width // 4, canvas.height // 4)
        layer = img.transform(small, Image.AFFINE, (k * 4, 0, ox, 0, k * 4, oy), Image.BILINEAR)
        a = np.asarray(layer, np.float32)
        rgb = a[..., :3] * (a[..., 3:4] / 255.0) * strength
        big = np.asarray(
            Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).resize(canvas.size, Image.BILINEAR), np.float32
        )
        base = np.asarray(canvas, np.float32)
        base[..., :3] = np.minimum(base[..., :3] + big, 255)
        canvas.paste(Image.fromarray(base.astype(np.uint8), "RGBA"))


def rasterise(polys, bbox, mpp, fills):
    """Polygons (lists of LV95 rings) filled with RGBA colours into a Raster."""
    e0, n0, e1, n1 = bbox
    w, h = int(math.ceil((e1 - e0) / mpp)), int(math.ceil((n1 - n0) / mpp))
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for ring, fill in zip(polys, fills, strict=True):
        pts = [((x - e0) / mpp, (n1 - y) / mpp) for x, y in ring]
        if len(pts) >= 3:
            d.polygon(pts, fill=fill)
    return Raster(img, e0, n1, mpp)


def blurred(raster, radius_m):
    """A soft copy of a raster for glow, blurred by a radius in metres."""
    img, mpp = raster.levels[0]
    while img.width > 2400:
        img, mpp = img.reduce(2), mpp * 2
    return Raster(img.filter(ImageFilter.GaussianBlur(radius_m / mpp)), raster.e0, raster.n1, mpp)


# ---------------------------------------------------------------- geodata


def to_lv95(lon, lat):
    """WGS84 to LV95 (EPSG:2056) with pyproj."""
    from pyproj import Transformer

    tr = Transformer.from_crs("EPSG:4326", "EPSG:2056", always_xy=True)
    return tr.transform(np.asarray(lon, float), np.asarray(lat, float))


def rings(geom):
    """Exterior rings of a GeoJSON Polygon or MultiPolygon."""
    if geom["type"] == "Polygon":
        return [geom["coordinates"][0]]
    if geom["type"] == "MultiPolygon":
        return [p[0] for p in geom["coordinates"]]
    return []


def basel_boundary():
    g = read_json(HEAT_ATLAS_DATA / "basel-stadt_boundary_lv95.geojson")
    return [r for f in g["features"] for r in rings(f["geometry"])]


def basel_heat_cells():
    """(ring, MWh per hectare and year) for each hectare cell in Basel-Stadt."""
    g = read_json(HEAT_ATLAS_DATA / "heat-demand-ha_basel-stadt_lv95.geojson")
    return [(r, f["properties"]["needtotal"]) for f in g["features"] for r in rings(f["geometry"])]


def geo_rings(name):
    """Exterior rings of every polygon in a layer under docs/media/geo."""
    g = read_json(GEO / name)
    return [r for f in g["features"] for r in rings(f["geometry"])]


def bern_heat_cells():
    """(ring, MWh per hectare and year) for each hectare cell round Bern."""
    g = read_json(GEO / "heat-demand-ha_bern_lv95.geojson")
    return [(r, f["properties"]["needtotal"]) for f in g["features"] for r in rings(f["geometry"])]


def optional_geojson(path):
    """A pluggable layer: the GeoJSON at path, or None when it is not on disk."""
    if not path:
        return None
    p = Path(path).expanduser()
    return read_json(p) if p.exists() else None


def footprints(tiles):
    """Building floor triangles (LV95, n x 3 x 2) and heights from swissBUILDINGS3D tiles,
    read from the heat-atlas tile cache with its read-only FileGDB reader. Only geometry and
    height are kept; the result is cached in the pitch work folder."""
    WORK.mkdir(parents=True, exist_ok=True)
    cache = WORK / ("footprints_" + "_".join(tiles) + ".pkl")
    if cache.exists():
        return pickle.loads(cache.read_bytes())
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(FGDB_DIR))
    import fgdb  # heat-atlas reader; imported without writing bytecode there

    sys.path.remove(str(FGDB_DIR))
    tris, heights = [], []
    for tile in tiles:
        gdb = GDB_CACHE / f"swissBUILDINGS3D_3-0_{tile}.gdb"
        if not gdb.exists():
            print(f"footprints: {gdb} missing, tile skipped", file=sys.stderr)
            continue
        table = fgdb.Table(fgdb.open_catalog(str(gdb))["Floor"])
        for row in table.rows():
            h = row.get("GESAMTHOEHE") or 8.0
            for _, ring in row["SHAPE"] or []:
                if len(ring) >= 3:
                    tris.append([(x, y) for x, y, _ in ring[:3]])
                    heights.append(h)
    out = (np.asarray(tris, np.float64), np.asarray(heights, np.float32))
    cache.write_bytes(pickle.dumps(out))
    return out


def footprint_raster(tris, heights, bbox, mpp, low, high, tall=40.0):
    """Footprints into a Raster, coloured from `low` to `high` by height (RGBA tuples)."""
    e0, n0, e1, n1 = bbox
    w, h = int(math.ceil((e1 - e0) / mpp)), int(math.ceil((n1 - n0) / mpp))
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    keep = (
        (tris[:, :, 0].max(1) > e0)
        & (tris[:, :, 0].min(1) < e1)
        & (tris[:, :, 1].max(1) > n0)
        & (tris[:, :, 1].min(1) < n1)
    )
    px = np.stack([(tris[keep, :, 0] - e0) / mpp, (n1 - tris[keep, :, 1]) / mpp], -1)
    t = np.clip(heights[keep] / tall, 0, 1)
    for tri, k in zip(px, t, strict=True):
        c = tuple(int(lerp(a, b, k)) for a, b in zip(low, high, strict=True))
        d.polygon([tuple(p) for p in tri], fill=c)
    return Raster(img, e0, n1, mpp)


BERN_TILES = ["1166-21", "1166-22", "1166-23", "1166-24", "1166-41", "1166-42", "1166-43", "1166-44",
              "1167-11", "1167-13", "1167-31", "1167-33"]  # fmt: skip
BASEL_TILES = ["1047-43", "1067-21"]
