"""07-bern-map (12 s): Bern's heat demand per hectare, then the same house's Bern figures
(services/scheduler/out/bern/kpis.json), then the district heating networks and the power
lines above 36 kV with a magnifying loupe, and a zoom down to an illustrative house near
ARTORG, Murtenstrasse 50 (an approximate LV95 position).

Layers come from docs/media/geo (see its README) and the swissBUILDINGS3D tiles in the
heat-atlas cache (read-only). Each optional layer is skipped if its file is missing.
"""

import numpy as np
from PIL import Image, ImageDraw

import mapkit as mk
from style import *  # noqa: F403

SECONDS = 12.0
BK = bern_kpis()
HOUSE = (2599800.0, 1199300.0)  # approximate, near ARTORG (Murtenstrasse 50, Inselspital area)
HOUSE_LABEL = "a house near ARTORG, Bern (illustrative)"


def heat_colour(mwh):
    k = min(max((math.log10(max(mwh, 1)) - 2.0) / 2.3, 0), 1)
    if k < 0.6:
        c = mix((90, 24, 8), EMBER, k / 0.6)
    else:
        c = mix(EMBER, AMBER, (k - 0.6) / 0.3) if k < 0.9 else mix(AMBER, (255, 236, 200), (k - 0.9) / 0.1)
    return (*c, int(130 + 110 * k))


CELLS = mk.bern_heat_cells()
_c = np.concatenate([np.asarray(r) for r, _ in CELLS])
BOX = (_c[:, 0].min(), _c[:, 1].min(), _c[:, 0].max(), _c[:, 1].max())
CELLS_R = mk.rasterise([r for r, _ in CELLS], BOX, 5.0, [heat_colour(v) for _, v in CELLS])
CELLS_GLOW = mk.blurred(CELLS_R, 110)
BOUNDARY = mk.geo_rings("bern_municipality_lv95.geojson")

TRIS, HTS = mk.footprints(mk.BERN_TILES)
FOOT_WIDE = mk.footprint_raster(TRIS, HTS, BOX, 2.5, (62, 66, 74, 255), (160, 166, 176, 255))
DETAIL_BOX = (HOUSE[0] - 1500, HOUSE[1] - 1100, HOUSE[0] + 1700, HOUSE[1] + 1300)
FOOT_DETAIL = mk.footprint_raster(TRIS, HTS, DETAIL_BOX, 0.6, (58, 62, 70, 255), (150, 156, 166, 255))

NETS = mk.optional_geojson(mk.GEO / "thermische-netze_bern_lv95.geojson")
NETS = [(f["geometry"]["coordinates"][:2], f["properties"]) for f in (NETS or {"features": []})["features"]]
LINES_G = mk.optional_geojson(mk.GEO / "power-lines_bern_lv95.geojson")
LINES = []
for f in (LINES_G or {"features": []})["features"]:
    if f["geometry"]["type"] == "MultiLineString":
        LINES += [np.asarray(part)[:, :2] for part in f["geometry"]["coordinates"] if len(part) > 1]
    elif f["geometry"]["type"] == "LineString":
        LINES.append(np.asarray(f["geometry"]["coordinates"])[:, :2])
BIG = max(NETS, key=lambda n: n[1].get("power") or 0)[1] if NETS else None

sites = [r for r in read_csv(SCHED_OUT / "fleet_basel_bern_sites.csv") if r["city"] == "Bern"]
FE, FN = mk.to_lv95([float(r["longitude"]) for r in sites], [float(r["latitude"]) for r in sites])

C = ((BOX[0] + BOX[2]) / 2, (BOX[1] + BOX[3]) / 2)
CAM_WIDE = mk.Cam(C[0] - 330 * 11.0, C[1] - 70 * 11.0, 11.0)
CAM_WIDE2 = mk.Cam(CAM_WIDE.e + 400, CAM_WIDE.n + 300, 10.0)
CAM_NEAR = mk.Cam(HOUSE[0] - 40 * 1.5, HOUSE[1] - 80 * 1.5, 1.5)
CAM_NEAR2 = mk.Cam(CAM_NEAR.e + 60, CAM_NEAR.n + 30, 1.3)
LOUPE_PATH = [(2600900, 1199700), (2600300, 1199500), (HOUSE[0] + 150, HOUSE[1] + 80)]


def camera(t):
    if t < 7.2:
        return mk.cam_between(CAM_WIDE, CAM_WIDE2, ease_io(seg(t, 0, 7.2)))
    if t < 9.6:
        return mk.cam_between(CAM_WIDE2, CAM_NEAR, ease_io(seg(t, 7.2, 9.6)))
    return mk.cam_between(CAM_NEAR, CAM_NEAR2, ease_out(seg(t, 9.6, 12.0)))


def scene(img, cam, t, loupe=False):
    """Every map layer for time t, through cam (also used inside the loupe)."""
    near = clamp((6.0 - cam.mpp) / 4.0)  # 0 when wide, 1 when close
    detail = clamp((3.0 - cam.mpp) / 1.2)
    reveal = 1.0 if loupe else ease_out(seg(t, -0.5, 1.2))
    FOOT_WIDE.draw(img, cam, alpha=lerp(0.22, 0.8, near) * (1 - detail))
    if detail > 0:
        FOOT_DETAIL.draw(img, cam, alpha=detail * 0.85)
    CELLS_R.draw(img, cam, alpha=reveal * lerp(0.9, 0.22, near))
    CELLS_GLOW.add(img, cam, strength=0.8 * reveal * (1 - near))

    lay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    for r in BOUNDARY:
        d.line([tuple(p) for p in cam.pxa(r)], fill=(*PAPER, int(170 * reveal)), width=int(s(2)))
    la = ease_out(seg(t, 4.4, 5.4)) if not loupe else 1.0
    if la > 0:
        for k, line in enumerate(LINES):
            u = seg(t, 4.4 + (k % 40) * 0.012, 5.6 + (k % 40) * 0.012) if not loupe else 1.0
            pts = cam.pxa(line)
            m = max(2, int(len(pts) * u))
            d.line([tuple(p) for p in pts[:m]], fill=(*GLACIER, int(235 * la)), width=int(s(3 if not loupe else 4)))
    img.alpha_composite(lay)

    na = ease_back(seg(t, 4.0, 4.9)) if not loupe else 1.0
    if NETS and na > 0:
        lay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        for (e, n), p in NETS:
            x, y = cam.px(e, n)
            r = s(7 + 3.2 * math.sqrt(p.get("power") or 1)) * max(na, 0)
            ripple = (t * 0.8 + (e % 97) / 97) % 1
            rr = r * (1 + 1.4 * ripple)
            d.ellipse(
                [x - rr, y - rr, x + rr, y + rr],
                outline=(*AMBER, int(150 * (1 - ripple) * min(na, 1))),
                width=int(s(2)),
            )
            d.ellipse(
                [x - r, y - r, x + r, y + r],
                fill=(*AMBER, int(90 * min(na, 1))),
                outline=(*AMBER, int(255 * min(na, 1))),
                width=int(s(3)),
            )
        img.alpha_composite(lay)


def frame(i):
    t = i / FPS
    cam = camera(t)
    img = canvas()
    scene(img, cam, t)

    # fleet houses, small, while wide
    fa = ease_out(seg(t, 0.8, 1.8)) * (1 - seg(t, 7.2, 8.0))
    if fa > 0:
        lay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        for x, y in cam.pxa(np.stack([FE, FN], -1)):
            r = s(5)
            d.ellipse(
                [x - r, y - r, x + r, y + r],
                fill=(*PAPER, int(230 * fa)),
                outline=(*INK, int(255 * fa)),
                width=int(s(1.5)),
            )
        img.alpha_composite(lay)

    # loupe over the old town, moving towards the house, while the networks show
    lp = seg(t, 4.6, 7.4)
    if 0 < lp < 1:
        la = ease_out(seg(lp, 0, 0.15)) * (1 - ease_in(seg(lp, 0.85, 1)))
        k = ease_io(lp) * (len(LOUPE_PATH) - 1)
        j = min(int(k), len(LOUPE_PATH) - 2)
        f = k - j
        src = (lerp(LOUPE_PATH[j][0], LOUPE_PATH[j + 1][0], f), lerp(LOUPE_PATH[j][1], LOUPE_PATH[j + 1][1], f))
        R = 210
        sx, sy = cam.px(*src)
        lx, ly = sx / SS + 300, sy / SS - 250
        lx, ly = min(lx, W - R - 30), max(ly, R + 30)
        sub = mk.Cam(src[0], src[1], cam.mpp / 5, 2 * R, 2 * R)
        small = Image.new("RGBA", (int(s(2 * R)), int(s(2 * R))), (*INK, 255))
        scene(small, sub, t, loupe=True)
        mask = Image.new("L", small.size, 0)
        ImageDraw.Draw(mask).ellipse([0, 0, small.width - 1, small.height - 1], fill=int(255 * la))
        small.putalpha(mask)
        lay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        rs = s(R * 0.2)
        d.ellipse([sx - rs, sy - rs, sx + rs, sy + rs], outline=(*PAPER, int(255 * la)), width=int(s(2.5)))
        d.line([(sx, sy), (s(lx), s(ly))], fill=(*PAPER, int(200 * la)), width=int(s(2)))
        img.alpha_composite(lay)
        paste(img, small, s(lx - R), s(ly - R))
        ring = Image.new("RGBA", small.size, (0, 0, 0, 0))
        ImageDraw.Draw(ring).ellipse(
            [2, 2, small.width - 3, small.height - 3], outline=(*PAPER, int(255 * la)), width=int(s(4))
        )
        paste(img, ring, s(lx - R), s(ly - R))
        draw_text(img, (lx + R * 0.72, ly + R * 0.95), "×5", 40, "black", PAPER, la, "ms")

    # the house marker
    ma = ease_back(seg(t, 9.0, 9.7))
    if ma > 0:
        x, y = cam.px(*HOUSE)
        lay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        pulse = (t * 0.9) % 1
        for q in (pulse, (pulse + 0.5) % 1):
            rr = s(18 + 70 * q)
            d.ellipse(
                [x - rr, y - rr, x + rr, y + rr], outline=(*EMBER, int(220 * (1 - q) * min(ma, 1))), width=int(s(3))
            )
        r = s(16) * ma
        d.ellipse([x - r, y - r, x + r, y + r], fill=(*EMBER, 255), outline=(*PAPER, 255), width=int(s(3)))
        img.alpha_composite(lay)
        la = ease_out(seg(t, 9.3, 10.0))
        head, tail = HOUSE_LABEL.rsplit(" (", 1)
        rect(
            img,
            (x / SS + 30, y / SS - 92, x / SS + 60 + text_size(head, 44, "bold")[0], y / SS + 22),
            INK,
            0.78 * la,
            radius=12,
        )
        draw_text(img, (x / SS + 45, y / SS - 40), head, 44, "bold", PAPER, la, "ls")
        draw_text(img, (x / SS + 45, y / SS + 6), "(" + tail, 36, "serif", AMBER, la, "ls")

    caption_shade(img)
    panel(img, t)
    return finish(img)


def stat(img, x, y, context, value, unit, t, out):
    """One big EMBER figure with a small italic serif line above it."""
    a = ease_out(seg(t, 0, 0.4)) * (1 - ease_in(seg(out, 0, 1)))
    if a <= 0:
        return
    rise_text(img, (x, y), context, 40, seg(t, 0, 0.6), "serif", PAPER, stagger=0.04, out=out)
    rise_text(img, (x, y + 150), value, 150, seg(t, 0.1, 0.8), "black", EMBER, out=out)
    w = text_size(value, 150, "black")[0]
    draw_text(img, (x + w + 20, y + 150), unit, 48, "bold", EMBER, a)


def panel(img, t):
    # heading
    h1 = 1 - seg(t, 3.9, 4.3)
    if h1 > 0:
        rise_text(
            img, (80, 120), "Bern: heat demand per hectare", 52, seg(t, -0.2, 0.9), "black", PAPER, out=seg(t, 3.9, 4.3)
        )
    # three figures, one beat each, in the order of the voice-over
    beats = [
        ("colder: Bern, 2025 weather", fmt(BK["heating_days"]), "heating days"),
        ("so the house takes", fmt(BK["servers_per_house"]), "servers"),
        (
            "and covers",
            fmt(BK["share_of_heat_covered_pct"], decimals_of(BK["share_of_heat_covered_pct"])),
            "% of its heat",
        ),
    ]
    for k, (ctx, val, unit) in enumerate(beats):
        t0 = 0.6 + k * 1.15
        stat(img, 80, 300, ctx, val, unit, t - t0, seg(t, t0 + 1.0, t0 + 1.3) if k < 2 else seg(t, 4.0, 4.4))
    if t > 4.0:
        rise_text(
            img,
            (80, 120),
            "District heating and power lines",
            52,
            seg(t, 4.1, 5.0),
            "black",
            PAPER,
            out=seg(t, 7.0, 7.4),
        )
        a = ease_out(seg(t, 4.5, 5.2)) * (1 - seg(t, 7.0, 7.4))
        if NETS:
            rect(img, (84, 178, 116, 210), AMBER, a, radius=16)
            draw_text(img, (136, 208), f"{len(NETS)} district heating networks", 40, "medium", PAPER, a)
            if BIG:
                draw_text(
                    img, (136, 256), f"largest {BIG['netlength']:g} km, {BIG['power']:g} MW", 40, "regular", SLATE, a
                )
        if LINES:
            rect(img, (82, 302, 118, 310), GLACIER, a)
            draw_text(img, (136, 320), "power lines above 36 kV", 40, "medium", PAPER, a)
    if t > 7.2:
        rect(img, (50, 50, 560, 700), INK, 0.8 * ease_out(seg(t, 7.4, 8.0)), radius=18)
        rise_text(img, (80, 120), "Near ARTORG", 52, seg(t, 7.4, 8.3), "black", PAPER)
        row = [
            (fmt(BK["servers_per_house"]), "servers"),
            (fmt(BK["share_of_heat_covered_pct"], decimals_of(BK["share_of_heat_covered_pct"])) + " %", "heat covered"),
            (fmt(BK["heating_days"]), "heating days"),
        ]
        for k, (v, u) in enumerate(row):
            a = ease_out(seg(t, 8.0 + k * 0.25, 8.6 + k * 0.25))
            y = 250 + k * 160
            rise_text(img, (80, y), v, 80, seg(t, 8.0 + k * 0.25, 8.8 + k * 0.25), "black", EMBER)
            draw_text(img, (80, y + 52), u, 40, "medium", PAPER, a)

    src = "Heat demand per hectare: Source: SFOE (2013 data)"
    if t > 4.0:
        src += "; district heating, power lines: Source: SFOE"
    src += ". Boundary, buildings © swisstopo."
    source_line(img, src, size=20, y=SAFE_Y - 40)
    source_line(
        img, f"Figures: services/scheduler/out/bern/kpis.json, {BK['profile_source']}.", alpha=seg(t, 0.6, 1.0), size=20
    )


if __name__ == "__main__":
    render("07-bern-map", SECONDS, frame)
