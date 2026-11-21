"""16-u-curve (10 s): why the servers idle in summer, and what flattens it.

Beat 1: the U. Server utilisation by month (docs/economics/data/monthly.csv): busy in winter,
nearly idle in summer, because the house wants little heat.
Beat 2: the sun fills the summer. Where the servers' electricity comes from each month with
roof PV and a battery (docs/economics/data/solar_monthly.csv): in summer it is nearly all sun.
Beat 3: the concept. Server heat, a heat pump lifting it, an ORC turbine, electricity. It is
labelled a concept and carries no figures, because the model has none."""

from style import *  # noqa: F403

SECONDS = 10.0
MONTHS = read_csv(ECON / "monthly.csv")
SOLAR = read_csv(ECON / "solar_monthly.csv")
UTIL = [float(r["utilisation_pct"]) for r in MONTHS]
NAMES = [r["month"] for r in MONTHS]
SUN = [float(r["servers_from_pv_kwh"]) + float(r["servers_from_battery_kwh"]) for r in SOLAR]
GRID = [float(r["servers_from_grid_kwh"]) for r in SOLAR]
SUN_SHARE = [100 * a / (a + b) if a + b else 0 for a, b in zip(SUN, GRID)]
LOW = min(range(12), key=lambda i: UTIL[i])
HIGH = max(range(12), key=lambda i: UTIL[i])
SUMMER = max(range(12), key=lambda i: SUN_SHARE[i])

X0, X1, Y0, Y1 = 180, 1740, 300, 800  # chart box, output pixels
BW = (X1 - X0) / 12


def bars(img, t):
    grow = ease_out(seg(t, 0.3, 2.0))
    split = ease_io(seg(t, 3.6, 4.6))
    for i, u in enumerate(UTIL):
        x = X0 + i * BW + BW * 0.18
        w = BW * 0.64
        h = (Y1 - Y0) * u / 100 * ease_out(clamp(grow * 1.4 - i * 0.03))
        top = Y1 - h
        rect(img, (x, top, x + w, Y1), EMBER, 1 - 0.75 * split)
        if split > 0:  # the same bar, split by where its electricity came from
            sun_h = h * SUN_SHARE[i] / 100 * split
            rect(img, (x, Y1 - sun_h, x + w, Y1), AMBER, split)
            rect(img, (x, top, x + w, Y1 - sun_h), SLATE, 0.55 * split)
        draw_text(img, (x + w / 2, Y1 + 44), NAMES[i], 30, "regular", PAPER, 0.9, "ms")
    rect(img, (X0, Y1, X1, Y1 + 3), PAPER, 0.6)


def frame(i):
    t = i / FPS
    img = canvas()
    a1 = ease_out(seg(t, 0.0, 0.6)) * (1 - ease_io(seg(t, 3.4, 3.9)))
    draw_text(img, (X0, 150), "servers follow the heat", 44, "serif", PAPER, a1, "ls")
    draw_text(img, (X0, 230), f"{fmt(UTIL[HIGH])} % busy in {NAMES[HIGH]}, {fmt(UTIL[LOW], 1)} % in {NAMES[LOW]}",
              58, "black", EMBER, ease_out(seg(t, 1.2, 1.8)) * (1 - ease_io(seg(t, 3.4, 3.9))), "ls")
    a2 = ease_out(seg(t, 3.9, 4.5)) * (1 - ease_io(seg(t, 6.9, 7.3)))
    draw_text(img, (X0, 150), "add the sun: summer runs on the roof", 44, "serif", PAPER, a2, "ls")
    draw_text(img, (X0, 230), f"{fmt(SUN_SHARE[SUMMER])} % of the servers' power in {NAMES[SUMMER]}", 58, "black",
              AMBER, a2, "ls")
    if t < 7.4:
        bars(img, t)
    a3 = ease_out(seg(t, 7.3, 7.9))
    if a3 > 0:
        steps = ["server heat", "heat pump lifts it", "ORC turbine", "electricity"]
        cols = [EMBER, (0xB0, 0x7C, 0xF0), AMBER, MINT]
        for k, (label, c) in enumerate(zip(steps, cols)):
            p = ease_back(seg(t, 7.5 + 0.35 * k, 8.0 + 0.35 * k))
            x = 120 + k * 440
            rect(img, (x, 430, x + 370, 560), (0x22, 0x25, 0x2B), min(p, 1) * a3, radius=22, outline=c, width=3)
            draw_text(img, (x + 185, 508), label, 36, "bold", PAPER, min(p, 1) * a3, "ms")
            if k < 3:  # a drawn arrow: the font has no arrow glyph
                rect(img, (x + 378, 492, x + 424, 498), c, min(p, 1) * a3)
                draw_text(img, (x + 420, 513), ">", 44, "black", c, min(p, 1) * a3, "ms")
        draw_text(img, (120, 330), "Concept: we're designing this", 52, "black", AMBER, a3, "ls")
        draw_text(img, (120, 660), "No figures yet: it is not in our model.", 34, "regular", SLATE, a3, "ls")
    source_line(img, "Sources: docs/economics/data/monthly.csv; solar_monthly.csv (roof PV + battery, "
                "the scheduler prefers the sun); Basel 2025, Open-Meteo archive", alpha=ease_out(seg(t, 0.6, 1.2)) * (1 - a3))
    return finish(zoom_frame(img, lerp(1.0, 1.03, t / SECONDS)))


if __name__ == "__main__":
    render("16-u-curve", SECONDS, frame)
