"""06-title-bern (3 s): the kinetic title switch from BASEL to BERN, over Bern's heat demand
per hectare drifting in the background."""

import re

import mapkit as mk
from style import *  # noqa: F403

SECONDS = 3.0
BK = bern_kpis()
YEAR = re.search(r"(\d{4})", BK["profile_source"]).group(1)
CELLS = mk.bern_heat_cells()


def heat_colour(mwh):
    k = min(max((math.log10(max(mwh, 1)) - 2.0) / 2.3, 0), 1)
    return (*mix((90, 24, 8), EMBER, k), int(120 + 135 * k))


_all = [p for r, _ in CELLS for p in r]
BOX = (min(p[0] for p in _all), min(p[1] for p in _all), max(p[0] for p in _all), max(p[1] for p in _all))
BG = mk.rasterise([r for r, _ in CELLS], BOX, 8.0, [heat_colour(v) for _, v in CELLS])
C = ((BOX[0] + BOX[2]) / 2, (BOX[1] + BOX[3]) / 2)


def frame(i):
    t = i / FPS
    img = canvas()
    cam = mk.Cam(C[0] + lerp(-600, 600, t / SECONDS), C[1], lerp(9.0, 7.6, ease_io(t / SECONDS)))
    BG.draw(img, cam, alpha=lerp(0.10, 0.26, seg(t, 0.6, 1.8)))

    y = 640
    slot_text(img, (W / 2, y), "BASEL", 260, 9, seg(t, 0.35, 1.05), tracking=24, fill=PAPER)
    slot_text(img, (W / 2, y), "BERN", 260, seg(t, 0.85, 1.6), tracking=24, fill=PAPER)
    # the ember bar sweeps through as the words change, then sits under BERN
    sweep = ease_io(seg(t, 0.55, 1.35))
    bw = 560
    x_end = W / 2 - bw / 2
    x0 = lerp(-bw, x_end, sweep)
    rect(img, (x0, y + 46, x0 + bw * lerp(0.4, 1, sweep), y + 62), EMBER, 1.0)
    rise_text(
        img,
        (W / 2, y + 140),
        f"The same house on Bern weather, {YEAR}",
        48,
        seg(t, 1.4, 2.3),
        "medium",
        AMBER,
        anchor="ms",
        stagger=0.05,
    )
    source_line(
        img,
        f"Heat demand per hectare: Source: SFOE (2013 data). Weather: {BK['profile_source']}.",
        alpha=seg(t, 1.0, 1.6),
    )
    return finish(zoom_frame(img, lerp(1.0, 1.035, t / SECONDS)))


if __name__ == "__main__":
    render("06-title-bern", SECONDS, frame)
