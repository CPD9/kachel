"""Compose shot 4 of the pitch film: the seasons split, 17 s.

    uv run --no-project --with pillow python scripts/video/compose_split.py \
        --work ~/.cache/kachel/pitch/work --sched-out services/scheduler/out \
        --mp4 ~/.cache/kachel/pitch/shots/04-split-seasons.mp4 \
        --sheet ~/.cache/kachel/pitch/shots/04-split-seasons-sheet.png

Left: Basel running from the snow day to midsummer (pitch_shots.py "seasons"). Right: the
setup at speed (setup.py --camera diag), the X-ray pass (pitch_shots.py "xray"), then the
plant room's figures zoom in. At the end both halves give way to the pull-back to the campus
building (shot 3 run backwards), and the split closes. Date, time, temperature and figures
are read from the scheduler's rows for each frame.
"""

import argparse
import csv
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import compose as c

HALF = c.W // 2
SETUP, XRAY, STATS, CLOSE = 72, 264, 36, 36  # frames in each part
TOTAL = SETUP + XRAY + STATS + CLOSE
LABELS = {
    "rack": "Servers: water through the cold plates",
    "hx": "Heat exchanger",
    "pump": "Pump",
    "tank": "Tank: warm water rises to the top",
    "heater": "Backup heater",
}
STOPS = {
    "rack": (0, 48),
    "hx": (48, 96),
    "pump": (96, 132),
    "tank": (132, 204),
    "heater": (204, 240),
}
CREDIT = "Buildings: swissBUILDINGS3D 3.0 (2024 ed.), © swisstopo. Snow: Open-Meteo."


def rows_by_day(sched_out, names):
    out = {}
    for n in names:
        with open(Path(sched_out) / f"day_{n}.csv", newline="") as f:
            out[n] = {int(r["hour"]): r for r in csv.DictReader(f)}
    return out


def fit(path, size):
    return Image.open(path).convert("RGB").resize(size, Image.LANCZOS)


def left_overlay(d, r, hour):
    h, m = int(hour), round((hour % 1) * 60) % 60
    c.rounded(d, (24, 24, 460, 200), c.PANEL)
    d.text((44, 34), "Basel", font=c.F["bodyb"], fill=c.INK)
    d.text((44, 70), c.long_date(r["time"]), font=c.F["date"], fill=c.INK)
    d.text((44, 118), f"{h:02d}:{m:02d}", font=c.F["date"], fill=c.DIM)
    t = f"{c.num(float(r['temp_c']))} °C"
    d.text(
        (440 - d.textlength(t, font=c.F["date"]), 118), t, font=c.F["date"], fill=c.INK
    )
    f = c.F["small"].font_variant(size=14)
    tw = d.textlength(CREDIT, font=f)
    c.rounded(d, (HALF - tw - 40, c.H - 42, HALF - 14, c.H - 12), (16, 19, 24, 190), 6)
    d.text((HALF - tw - 28, c.H - 36), CREDIT, font=f, fill=(184, 184, 180))


def stats_panel(r, ctx, k):
    """The plant room's figures for the row, zooming in with k from 0 to 1."""
    w, h = 820, 520
    p = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(p)
    d.rounded_rectangle((0, 0, w, h), 26, fill=(14, 17, 22, 225))
    d.text(
        (40, 30),
        "Basement plant room",
        font=c.F["title"].font_variant(size=52),
        fill=c.INK,
    )
    d.text((40, 96), c.long_date(r["time"]), font=c.F["sub"], fill=c.DIM)
    on = round(float(r["server_hours"]))
    items = [
        ("Servers running", f"{on} of {ctx['servers']}", (90, 220, 230)),
        ("Heat to the house", f"{c.num(float(r['heat_used']))} kWh", c.HOT),
        (
            "Tank",
            f"{c.num(float(r['soc_kwh']))} of {c.num(ctx['tank'], 0)} kWh",
            c.AMBER,
        ),
        ("Backup heater", f"{c.num(float(r['backup_kwh']))} kWh", c.AMBER),
    ]
    y = 170
    big = c.F["title"].font_variant(size=46)
    for name, v, col in items:
        d.text((40, y + 8), name, font=c.F["sub"], fill=c.DIM)
        d.text((w - 40 - d.textlength(v, font=big), y), v, font=big, fill=col)
        y += 84
    s = 0.55 + 0.45 * (k * k * (3 - 2 * k))
    p = p.resize((int(w * s), int(h * s)), Image.LANCZOS)
    a = p.getchannel("A").point(lambda v: int(v * min(1.0, k * 1.6)))
    p.putalpha(a)
    return p


BIG = c.F["label"].font_variant(size=36)  # 1.6x the day-night labels, to read in a hall


def label(d, at, text):
    """A device label with a leader dot, sized to read from the back of a hall."""
    x, y = at[0] * HALF + HALF, at[1] * c.H
    tw = d.textlength(text, font=BIG)
    bx = min(max(x + 40, HALF + 20), c.W - tw - 40)
    by = max(30, y - 110)
    c.rounded(d, (bx - 16, by - 10, bx + tw + 16, by + 50), (16, 19, 24, 200), 10)
    d.line((x, y, bx - 16, by + 40), fill=(*c.INK, 220), width=3)
    d.ellipse(
        (x - 9, y - 9, x + 9, y + 9), fill=c.INK, outline=(16, 19, 24, 255), width=3
    )
    d.text((bx, by - 2), text, font=BIG, fill=c.INK)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True)
    ap.add_argument("--sched-out", required=True)
    ap.add_argument("--mp4", required=True)
    ap.add_argument("--sheet", required=True)
    a = ap.parse_args()
    w = Path(a.work)
    sched = Path(a.sched_out)
    cfg = json.loads((sched.parent / "config.json").read_text())
    kpis = json.loads((sched / "kpis.json").read_text())
    ctx = {
        "servers": int(kpis["servers_per_house"]),
        "tank": float(cfg["house"]["tank_kwh"]),
    }
    lplan = json.loads((w / "seasons" / "plan.json").read_text())
    xplan = json.loads((w / "xray" / "plan.json").read_text())
    rows = rows_by_day(sched, {p["day"] for p in lplan})
    setup = sorted((w / "setup-diag" / "frames").glob("*.png"))
    back = sorted((w / "basement").glob("*.png"))[::-1]
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{c.W}x{c.H}", "-r", str(c.FPS), "-i", "-", "-c:v", "libx264",
         "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
         a.mp4],
        stdin=subprocess.PIPE,
    )  # fmt: skip
    sheet = []
    picks = {20, SETUP + 30, SETUP + 160, SETUP + XRAY + 20, TOTAL - 10}
    last = None
    for f in range(TOTAL):
        lf = min(f, len(lplan) - 1)
        lp = lplan[lf]
        r = rows[lp["day"]][int(lp["hour"])]
        img = Image.new("RGB", (c.W, c.H))
        img.paste(fit(w / "seasons" / f"{lp['frame']:04d}.png", (HALF, c.H)), (0, 0))
        if f < SETUP:
            right = fit(
                setup[min(len(setup) - 1, f * len(setup) // SETUP)], (HALF, c.H)
            )
        else:
            xi = min(XRAY - 1, f - SETUP)
            right = fit(w / "xray" / f"{xi + 1:04d}.png", (HALF, c.H))
        img.paste(right, (HALF, 0))
        layer = Image.new("RGBA", (c.W, c.H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        d.rectangle((HALF - 2, 0, HALF + 1, c.H), fill=(10, 12, 16, 255))
        left_overlay(d, r, lp["hour"])
        if f < SETUP:
            c.rounded(d, (HALF + 24, 24, HALF + 330, 84), c.PANEL)
            d.text((HALF + 44, 36), "Setup, at speed", font=c.F["bodyb"], fill=c.INK)
        elif f < SETUP + XRAY:
            xi = f - SETUP
            for dev, (f0, f1) in STOPS.items():
                if f0 + 8 <= xi < f1 and dev in xplan[xi]["anchors"]:
                    label(d, xplan[xi]["anchors"][dev], LABELS[dev])
        img = Image.alpha_composite(img.convert("RGBA"), layer)
        if SETUP + XRAY <= f < SETUP + XRAY + STATS:
            k = min(1.0, (f - SETUP - XRAY) / 12)
            p = stats_panel(r, ctx, k)
            img.alpha_composite(
                p, (HALF + (HALF - p.width) // 2, (c.H - p.height) // 2)
            )
            last = img
        if f >= SETUP + XRAY + STATS:
            j = f - (SETUP + XRAY + STATS)
            full = fit(
                back[min(len(back) - 1, j * len(back) // CLOSE)], (c.W, c.H)
            ).convert("RGBA")
            t = min(1.0, j / 14)
            img = Image.blend(last, full, t * t * (3 - 2 * t))
        out = img.convert("RGB")
        ff.stdin.write(out.tobytes())
        if f in picks:
            sheet.append(out.resize((640, 360), Image.LANCZOS))
    ff.stdin.close()
    ff.wait()
    s = Image.new("RGB", (640 * len(sheet), 360))
    for i, im in enumerate(sheet):
        s.paste(im, (640 * i, 0))
    s.save(a.sheet)
    print(f"{TOTAL} frames, {TOTAL / c.FPS:.1f} s -> {a.mp4}")


if __name__ == "__main__":
    main()
