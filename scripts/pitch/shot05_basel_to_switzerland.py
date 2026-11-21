"""05-basel-to-switzerland (8 s): Basel's heat demand per hectare glows, then the camera pulls
out until Basel and Bern both fit, and the illustrative fleet lights up with jobs arcing
between houses (13 January 2025, make fleet).

The Swiss outline is a pluggable layer: --national PATH (GeoJSON in LV95, by default
docs/media/geo/switzerland_border_lv95.geojson). With it the pull-out goes on to the whole
country; without it the move ends where Basel and Bern both fit.
"""

import argparse
import math
import random

import numpy as np
from PIL import Image, ImageDraw

import mapkit as mk
from style import *  # noqa: F403

ap = argparse.ArgumentParser()
ap.add_argument("--national", default=str(mk.GEO / "switzerland_border_lv95.geojson"))
ARGS, _ = ap.parse_known_args()

SECONDS = 8.0
FLEET = "fleet_basel_bern"
FK = read_json(SCHED_OUT / f"{FLEET}_kpis.json")
DAY = FK["days"]["january"]["date"]

# ---- data, prepared once (forked workers share it)
BOUNDARY = mk.basel_boundary()
CELLS = mk.basel_heat_cells()
be = np.concatenate([np.asarray(r) for r in BOUNDARY])
BASEL_BOX = (be[:, 0].min(), be[:, 1].min(), be[:, 0].max(), be[:, 1].max())


def heat_colour(mwh):
    """Hectare heat demand to a colour: deep ember for low, amber, then near white at the top."""
    k = min(max((math.log10(max(mwh, 1)) - 2.0) / 2.3, 0), 1)
    if k < 0.6:
        c = mix((90, 24, 8), EMBER, k / 0.6)
    else:
        c = mix(EMBER, AMBER, (k - 0.6) / 0.3) if k < 0.9 else mix(AMBER, (255, 236, 200), (k - 0.9) / 0.1)
    return (*c, int(140 + 115 * k))


pad = 400
CELL_BOX = (BASEL_BOX[0] - pad, BASEL_BOX[1] - pad, BASEL_BOX[2] + pad, BASEL_BOX[3] + pad)
CELLS_R = mk.rasterise([r for r, _ in CELLS], CELL_BOX, 5.0, [heat_colour(v) for _, v in CELLS])
CELLS_GLOW = mk.blurred(CELLS_R, 120)

BERN_CELLS = mk.bern_heat_cells()
bc = np.concatenate([np.asarray(r) for r, _ in BERN_CELLS])
BERN_R = mk.rasterise(
    [r for r, _ in BERN_CELLS],
    (bc[:, 0].min(), bc[:, 1].min(), bc[:, 0].max(), bc[:, 1].max()),
    10.0,
    [heat_colour(v) for _, v in BERN_CELLS],
)
BERN_GLOW = mk.blurred(BERN_R, 300)
BERN_LINE = mk.geo_rings("bern_municipality_lv95.geojson")

sites = list(read_csv(SCHED_OUT / f"{FLEET}_sites.csv"))
E, N = mk.to_lv95([float(r["longitude"]) for r in sites], [float(r["latitude"]) for r in sites])
SITES = {
    r["id"]: dict(e=e, n=n, city=r["city"], servers=int(r["servers"])) for r, e, n in zip(sites, E, N, strict=True)
}
SITE_IDS = sorted(SITES)

jobs = [j for j in read_csv(SCHED_OUT / f"{FLEET}_jobs_january.csv") if j["ran_at"] and j["sent_to"] != j["ran_at"]]
random.Random(13).shuffle(jobs)
cross = [j for j in jobs if j["sent_to"].startswith("bern") != j["ran_at"].startswith("bern")][:70]
local = [j for j in jobs if j["sent_to"].startswith("bern") == j["ran_at"].startswith("bern")][:90]
ARC_T0, ARC_T1, ARC_DUR = 3.0, 8.8, 1.2
for group, start in (
    (sorted(cross, key=lambda j: j["arrival"]), ARC_T0 + 0.8),
    (sorted(local, key=lambda j: j["arrival"]), ARC_T0 - 1.6),
):
    for k, j in enumerate(group):
        j["t0"] = lerp(start, ARC_T1 - ARC_DUR * 0.4, k / max(len(group) - 1, 1)) + random.Random(k).uniform(
            -0.12, 0.12
        )
MOVES = cross + local
TAIL = 13

NATIONAL = mk.optional_geojson(ARGS.national)
NAT_RINGS = [r for f in NATIONAL["features"] for r in mk.rings(f["geometry"])] if NATIONAL else []

# ---- cameras
BASEL_C = ((BASEL_BOX[0] + BASEL_BOX[2]) / 2, (BASEL_BOX[1] + BASEL_BOX[3]) / 2)
A_MPP = (BASEL_BOX[3] - BASEL_BOX[1]) / 720
CAM_A = mk.Cam(BASEL_C[0] - 1900, BASEL_C[1] - 120 * A_MPP, A_MPP)
CAM_A2 = mk.Cam(CAM_A.e - 300, CAM_A.n + 200, CAM_A.mpp * 0.9)
if NAT_RINGS:
    ne = np.concatenate([np.asarray(r) for r in NAT_RINGS])
    CAM_B = mk.Cam(
        (ne[:, 0].min() + ne[:, 0].max()) / 2 - 280 * 310, (ne[:, 1].min() + ne[:, 1].max()) / 2 - 70 * 310, 310.0
    )
else:
    CAM_B = mk.Cam(np.mean([E.min(), E.max()]) - 22000, np.mean([N.min(), N.max()]) + 1500, (N.max() - N.min()) / 800)
CAM_B2 = mk.Cam(CAM_B.e - 5000, CAM_B.n + 5000, CAM_B.mpp * 0.95)


def camera(t):
    if t < 2.3:
        return mk.cam_between(CAM_A, CAM_A2, ease_out(seg(t, 0, 2.3)) * 0.35)
    a = mk.cam_between(CAM_A, CAM_A2, 0.35)
    if t < 5.6:
        return mk.cam_between(a, CAM_B, ease_io(seg(t, 2.3, 5.6)))
    return mk.cam_between(CAM_B, CAM_B2, ease_out(seg(t, 5.6, 8.0)))


def reveal_mask(img_size, cam, radius_m):
    """A soft disc round the Basel centre, growing as the cells light up."""
    w, h = img_size[0] // 8, img_size[1] // 8
    y, x = np.mgrid[0:h, 0:w]
    cx, cy = cam.px(*BASEL_C)
    d = np.hypot(x * 8 - cx, y * 8 - cy) * cam.mpp / SS
    m = np.clip((radius_m - d) / 900 + 0.5, 0, 1)
    return Image.fromarray((m * 255).astype(np.uint8)).resize(img_size, Image.BILINEAR)


def arc_points(a, b, n=28):
    (x0, y0), (x1, y1) = a, b
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1
    cx, cy = (x0 + x1) / 2 - dy / L * L * 0.22, (y0 + y1) / 2 + dx / L * L * 0.22
    t = np.linspace(0, 1, n)[:, None]
    return (1 - t) ** 2 * np.array([x0, y0]) + 2 * (1 - t) * t * np.array([cx, cy]) + t * t * np.array([x1, y1])


def frame(i):
    t = i / FPS
    cam = camera(t)
    img = canvas()

    # graticule, faint, so the pulled-out view still reads as geography
    gr = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(gr)
    ga = int(40 * seg(t, 2.6, 4.0))
    if ga:
        for lat in np.arange(45.75, 48.01, 0.25):
            lons = np.linspace(5.5, 11, 40)
            e, n = mk.to_lv95(lons, np.full_like(lons, lat))
            gd.line([tuple(p) for p in cam.pxa(np.stack([e, n], -1))], fill=(*SLATE, ga), width=2)
        for lon in np.arange(5.5, 11.01, 0.25):
            lats = np.linspace(45.5, 48.2, 40)
            e, n = mk.to_lv95(np.full_like(lats, lon), lats)
            gd.line([tuple(p) for p in cam.pxa(np.stack([e, n], -1))], fill=(*SLATE, ga), width=2)
        img.alpha_composite(gr)

    # national outline, when the layer is on disk
    if NAT_RINGS:
        na = seg(t, 3.8, 5.2)
        if na > 0:
            lay = Image.new("RGBA", img.size, (0, 0, 0, 0))
            ld = ImageDraw.Draw(lay)
            for r in NAT_RINGS:
                ld.polygon(
                    [tuple(p) for p in cam.pxa(r)],
                    fill=(*PAPER, int(14 * na)),
                    outline=(*SLATE, int(230 * na)),
                    width=int(s(2)),
                )
            img.alpha_composite(lay)

    # Bern buildings, warm and dim
    bern_a = seg(t, 3.6, 5.2)
    if bern_a > 0:
        BERN_R.draw(img, cam, alpha=bern_a)
        BERN_GLOW.add(img, cam, strength=0.9 * bern_a)

    # Basel heat cells: wave out from the centre, then glow
    lay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    CELLS_R.draw(lay, cam)
    rad = lerp(1800, 9000, ease_out(seg(t, 0.0, 1.8)))
    if rad < 9000:
        lay.putalpha(
            Image.fromarray(
                (
                    np.asarray(lay.getchannel("A"), np.float32)
                    * np.asarray(reveal_mask(img.size, cam, rad), np.float32)
                    / 255
                ).astype(np.uint8)
            )
        )
    img.alpha_composite(lay)
    CELLS_GLOW.add(img, cam, strength=0.9 * ease_out(seg(t, 0.4, 2.0)))

    # canton boundary
    ba = ease_out(seg(t, -0.3, 0.8))
    bl = Image.new("RGBA", img.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(bl)
    for r in BOUNDARY + (BERN_LINE if bern_a > 0 else []):
        bd.line(
            [tuple(p) for p in cam.pxa(r)] + [tuple(cam.pxa(r)[0])],
            fill=(*PAPER, int(200 * ba)),
            width=int(s(2.5)),
            joint="curve",
        )
    img.alpha_composite(bl)

    # fleet houses pop in: Basel first, Bern as it enters the frame
    def house_t(sid):
        k = SITE_IDS.index(sid)
        return (1.4 + (k % 50) * 0.018) if SITES[sid]["city"] == "Basel" else (4.0 + (k % 50) * 0.02)

    dots = []
    for sid in SITE_IDS:
        p = ease_back(seg(t, house_t(sid), house_t(sid) + 0.45))
        if p > 0:
            x, y = cam.px(SITES[sid]["e"], SITES[sid]["n"])
            dots.append((x, y, p, SITES[sid]["servers"]))

    # job arcs
    arcs = []
    for j in MOVES:
        u = seg(t, j["t0"], j["t0"] + ARC_DUR)
        if 0 < u < 1:
            a, b = SITES[j["sent_to"]], SITES[j["ran_at"]]
            arcs.append((arc_points(cam.px(a["e"], a["n"]), cam.px(b["e"], b["n"])), u))

    def glow_paint(d, k):
        for x, y, p, sv in dots:
            r = (7 + sv) * p * k * 1.6
            d.ellipse([x / SS * k - r, y / SS * k - r, x / SS * k + r, y / SS * k + r], fill=EMBER)
        for pts, u in arcs:
            m = len(pts) - 1
            head = int(ease_io(u) * m)
            tail = max(0, head - TAIL)
            fade = min(1, (1 - u) * 4)
            seg_pts = [(px / SS * k, py / SS * k) for px, py in pts[tail : head + 1]]
            if len(seg_pts) > 1:
                d.line(seg_pts, fill=mix((0, 0, 0), AMBER, fade), width=max(1, int(3 * k * 2)))

    if dots or arcs:
        glow(img, glow_paint, radius=10, strength=1.0)
    core = Image.new("RGBA", img.size, (0, 0, 0, 0))
    cd = ImageDraw.Draw(core)
    for pts, u in arcs:
        m = len(pts) - 1
        head = int(ease_io(u) * m)
        tail = max(0, head - TAIL)
        fade = min(1, (1 - u) * 4)
        for q in range(tail, head):
            w = (q - tail + 1) / (head - tail + 1)
            cd.line(
                [tuple(pts[q]), tuple(pts[q + 1])],
                fill=(*mix(AMBER, PAPER, w), int(255 * w * fade)),
                width=int(s(1 + 2.5 * w)),
            )
        hx, hy = pts[head]
        cd.ellipse([hx - s(5), hy - s(5), hx + s(5), hy + s(5)], fill=(*PAPER, int(255 * fade)))
    for x, y, p, sv in dots:
        r = s(4.5 + sv * 0.45) * p
        cd.ellipse([x - r, y - r, x + r, y + r], fill=(*AMBER, 255), outline=(*PAPER, 230), width=int(s(1.5)))
    img.alpha_composite(core)

    # labels
    la = ease_out(seg(t, 0.0, 0.8)) * (1 - seg(t, 3.0, 3.6))
    draw_text(img, (W - 80, SAFE_Y - 190), "BASEL", 72, "black", PAPER, la, "rs", tracking=12)
    lb = ease_out(seg(t, 4.2, 5.0))
    if lb > 0:
        x, y = cam.px(BASEL_C[0], BASEL_C[1])
        draw_text(img, (x / SS + 56, y / SS + 16), "Basel", 48, "bold", PAPER, lb, "ls")
        bc = (
            np.mean([SITES[k]["e"] for k in SITES if SITES[k]["city"] == "Bern"]),
            np.mean([SITES[k]["n"] for k in SITES if SITES[k]["city"] == "Bern"]),
        )
        x, y = cam.px(*bc)
        draw_text(img, (x / SS + 70, y / SS + 16), "Bern", 48, "bold", PAPER, lb, "ls")

    # captions: heat first, then the fleet
    ca = 1 - seg(t, 2.8, 3.3)
    if ca > 0:
        rise_text(
            img, (80, 132), "Heat demand per hectare", 52, seg(t, -0.3, 1.0), "black", PAPER, out=seg(t, 2.8, 3.3)
        )
        legend(img, ease_out(seg(t, 0.2, 1.0)) * ca)
    if t > 3.4:
        rise_text(img, (80, 132), "An illustrative fleet, simulated", 52, seg(t, 3.4, 4.6), "black", PAPER)
        sub = f"{FK['houses']} houses, {FK['servers']} servers, Basel and Bern"
        rise_text(img, (80, 196), sub, 40, seg(t, 3.8, 5.0), "medium", AMBER, stagger=0.05)
        rise_text(
            img,
            (80, 250),
            "Jobs go to the house that can use their heat",
            40,
            seg(t, 5.0, 6.2),
            "medium",
            PAPER,
            stagger=0.05,
        )

    scale_bar(img, cam, ease_out(seg(t, 0.4, 1.2)))
    src = "Heat demand per hectare: Source: SFOE (2013 data). Boundary © swisstopo."
    if t > 3.4:
        src += f" Fleet: simulated houses, {DAY} (services/scheduler/out/{FLEET}_*)."
    if t > 3.4:
        src = src.replace("Boundary", "Boundaries")
    if NAT_RINGS and t > 3.4:
        src = src.replace("Boundaries ©", "Boundaries and border ©")
    caption_shade(img)
    source_line(img, src)
    return finish(img)


def legend(img, a):
    if a <= 0:
        return
    x0, y0, w, h = 80, 168, 360, 18
    for k in range(60):
        v = 10 ** (2.0 + 2.3 * k / 59)
        rect(img, (x0 + k * w / 60, y0, x0 + (k + 1) * w / 60 + 1, y0 + h), heat_colour(v)[:3], a)
    draw_text(img, (x0, y0 + 58), "100", 40, "medium", SLATE, a)
    draw_text(img, (x0 + w, y0 + 58), "20,000 MWh/a", 40, "medium", SLATE, a, "ls")


def scale_bar(img, cam, a):
    if a <= 0:
        return
    target = cam.mpp * 220
    step = 10 ** math.floor(math.log10(target))
    for m in (5, 2, 1):
        if m * step <= target:
            length = m * step
            break
    px = length / cam.mpp
    x1, y = W - 80, SAFE_Y - 60
    rect(img, (x1 - px, y, x1, y + 6), PAPER, a)
    label = f"{length / 1000:g} km" if length >= 1000 else f"{length:g} m"
    draw_text(img, (x1, y - 14), label, 40, "medium", PAPER, a, "rs")


if __name__ == "__main__":
    render("05-basel-to-switzerland", SECONDS, frame)
