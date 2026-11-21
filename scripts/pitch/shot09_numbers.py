"""09-numbers (35 s): one idea per beat, in the order of the voice-over: the Basel house's
year (kpis.json), break-even and payback (kpis.json, summary.json, config.json), when it
does not pay off (kpis.json, sensitivity.csv), with the economics chart clips cut in, then
the two research beats from the talk track (docs/pitch.md) with their sources.
"""

from style import *  # noqa: F403

K = kpis()
S = summary()
CFG = config()
MID = S["hardware"]["mid"]
SENS = {r["input"].split(",")[0].split(":")[0]: r for r in read_csv(ECON / "sensitivity.csv")}
NO_BACKLOG = float(next(r for k, r in SENS.items() if k.startswith("Backlog"))["low_chf"])
NETZERO = pitch_fact(r"(Basel-Stadt) voted to reach net zero by (\d{4})")
DC = pitch_fact(r"Data centres used (\d+) terawatt-hours in (\d{4}), about ([^ ]+ and a half|[\d.]+) percent")
CHARTS = Path.home() / ".cache/kachel/video/charts"
WEATHER = K["profile_source"]
SRC_K = f"services/scheduler/out/kpis.json, {WEATHER}"


def num(v):
    return v, decimals_of(v)


# (start, length, kind, payload)
BEATS = [
    (
        0.0,
        3.0,
        "stat",
        dict(
            ctx="a Basel home, all year",
            val=num(K["share_of_heat_covered_pct"]),
            unit="%",
            line="of its heat from AI jobs",
            src=SRC_K,
        ),
    ),
    (
        3.0,
        2.5,
        "stat",
        dict(
            ctx="over",
            val=num(K["heating_days"]),
            unit="heating days",
            line=f"{fmt(K['heat_demand_kwh'])} kWh of heat demand",
            src=SRC_K,
        ),
    ),
    (5.5, 2.5, "clip", dict(name="month")),
    (
        8.0,
        2.5,
        "stat",
        dict(
            ctx="and heat dumped all year, only",
            val=num(K["heat_dumped_kwh"]),
            unit="kWh",
            line="the scheduler runs jobs when the heat is useful",
            src=SRC_K,
        ),
    ),
    (
        10.5,
        2.5,
        "stat",
        dict(
            ctx="servers busy",
            val=num(K["utilisation_pct"]),
            unit="%",
            line=f"{fmt(K['server_hours_sold'])} server-hours sold",
            src=SRC_K,
        ),
    ),
    (
        13.0,
        3.0,
        "stat",
        dict(
            ctx="compute breaks even at",
            val=num(round(K["break_even_chf_per_server_hour"], 3)),
            unit="CHF",
            line=f"per server-hour; {MID['break_even_chf_per_server_hour_incl_hardware']:.2f} "
            "with the hardware paid for. "
            f"We assume {CFG['prices']['compute_chf_per_server_hour']:.2f}.",
            src=f"{SRC_K}; docs/economics/data/summary.json (mid case); config.json (our assumed price)",
        ),
    ),
    (16.0, 3.0, "clip", dict(name="breakeven")),
    (
        19.0,
        2.5,
        "stat",
        dict(
            ctx="hardware pays back in",
            val=num(MID["payback_years"]),
            unit="years",
            line=f"mid case, then CHF {fmt(MID['net_chf_after_hardware'])} a year left",
            src="docs/economics/data/summary.json, hardware, mid case",
        ),
    ),
    (21.5, 2.5, "clip", dict(name="payback")),
    (24.0, 3.5, "risk", dict(src="services/scheduler/out/kpis.json; docs/economics/data/sensitivity.csv")),
    (27.5, 2.5, "clip", dict(name="sensitivity")),
    (
        30.0,
        2.5,
        "fact",
        dict(
            ctx=f"{NETZERO.group(1)} voted to reach",
            val=("net zero", None),
            unit=f"by {NETZERO.group(2)}",
            cite=8,
            src=slide_source(8),
        ),
    ),
    (
        32.5,
        2.5,
        "fact",
        dict(
            ctx=f"data centres used, in {DC.group(2)}",
            val=(float(DC.group(1)), 0),
            unit="TWh",
            cite=7,
            src=slide_source(7),
        ),
    ),
]
SECONDS = BEATS[-1][0] + BEATS[-1][1]
CLIPS = {b[3]["name"]: clip_frames(CHARTS / f"{b[3]['name']}.mp4", b[1]) for b in BEATS if b[2] == "clip"}


def big_number(img, x, y, val, t, size=250, colour=EMBER):
    """A count-up to the exact value read from data; returns its width."""
    v, dec = val
    if dec is None:
        text = v
    else:
        p = ease_out_expo(seg(t, 0.05, 0.9))
        text = fmt(v * p if p < 1 else v, dec)
        final = fmt(v, dec)
        text = text.rjust(len(final))
    rise_text(img, (x, y), text, size, seg(t, 0, 0.5), "black", colour)
    return text_size(fmt(v, dec) if dec is not None else v, size, "black")[0]


def stat_beat(img, t, d, length):
    out = seg(t, length - 0.25, length)
    x = 140
    rise_text(img, (x, 330), d["ctx"], 54, seg(t, 0, 0.5), "serif", PAPER, stagger=0.04, out=out)
    w = big_number(img, x, 600, d["val"], t)
    a = ease_out(seg(t, 0.35, 0.8)) * (1 - out)
    draw_text(img, (x + w + 28, 600), d["unit"], 72, "bold", EMBER, a)
    if d.get("line"):
        for k, ln in enumerate(wrap(d["line"], 44, "medium", 1500)):
            rise_text(
                img,
                (x, 700 + k * 58),
                ln,
                44,
                seg(t, 0.5 + k * 0.1, 1.1 + k * 0.1),
                "medium",
                SLATE,
                stagger=0.03,
                out=out,
            )
    rect(img, (x, 380, x + 140 * ease_out(seg(t, 0.2, 0.9)), 386), EMBER, 1 - out)
    source_line(img, "Source: " + d["src"], alpha=ease_out(seg(t, 0.4, 0.8)) * (1 - out))


def risk_beat(img, t, d, length):
    out = seg(t, length - 0.25, length)
    x = 140
    rise_text(img, (x, 250), "When it doesn't pay off", 96, seg(t, 0, 0.6), "black", PAPER, out=out)
    lines = wrap(K["does_not_pay_off_when"][0].upper() + K["does_not_pay_off_when"][1:] + ".", 60, "medium", 1550)
    for k, ln in enumerate(lines):
        rise_text(
            img, (x, 380 + 76 * k), ln, 60, seg(t, 0.4 + 0.1 * k, 1.0 + 0.1 * k), "medium", AMBER, stagger=0.03, out=out
        )
    y = 380 + 76 * len(lines) + 120
    rise_text(
        img,
        (x, y),
        "and if the backlog of flexible jobs dries up, the house loses",
        48,
        seg(t, 1.1, 1.7),
        "serif",
        PAPER,
        stagger=0.03,
        out=out,
    )
    loss = f"CHF {fmt(-NO_BACKLOG)}" if NO_BACKLOG < 0 else f"CHF {fmt(NO_BACKLOG)} (gain)"
    rise_text(img, (x, y + 150), loss, 150, seg(t, 1.3, 1.9), "black", EMBER, out=out)
    w = text_size(loss, 150, "black")[0]
    draw_text(img, (x + w + 28, y + 150), "a year", 64, "bold", EMBER, ease_out(seg(t, 1.6, 2.0)) * (1 - out))
    source_line(img, "Source: " + d["src"], alpha=ease_out(seg(t, 0.4, 0.8)) * (1 - out))


def fact_beat(img, t, d, length):
    out = seg(t, length - 0.25, length)
    x = 140
    rise_text(img, (x, 300), d["ctx"], 54, seg(t, 0, 0.5), "serif", PAPER, stagger=0.04, out=out)
    w = big_number(img, x, 540, d["val"], t, size=220)
    draw_text(img, (x + w + 28, 540), d["unit"], 72, "bold", EMBER, ease_out(seg(t, 0.35, 0.8)) * (1 - out))
    citation_card(img, (x, 610), d["cite"], seg(t, 0.6, 0.6 + 1.5))
    source_line(
        img,
        "Source: " + d["src"] + " (docs/pitch.md, docs/economics/README.md)",
        alpha=ease_out(seg(t, 0.4, 0.8)) * (1 - out),
    )


def frame(i):
    t = i / FPS
    start, length, kind, d = next(b for b in BEATS if b[0] <= t < b[0] + b[1]) if t < SECONDS else BEATS[-1]
    u = t - start
    if start == 0:
        u += 0.4  # the first beat opens already moving, never on an empty frame
    if (start, length) == BEATS[-1][:2]:
        length += 10  # the last beat does not leave; the next shot cuts in
    img = canvas()
    if kind == "clip":
        card_clip(img, CLIPS[d["name"]], u, length)
        source_line(img, "Chart: docs/economics/data (make video-charts)", alpha=ease_out(seg(u, 0.3, 0.7)))
        return finish(img)
    {"stat": stat_beat, "risk": risk_beat, "fact": fact_beat}[kind](img, u, d, length)
    return finish(zoom_frame(img, lerp(1.0, 1.04, u / length), 140, 500))


if __name__ == "__main__":
    render("09-numbers", SECONDS, frame)
