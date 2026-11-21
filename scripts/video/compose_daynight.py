"""Compose the day-night split film from the halves rendered by daynight.py.

    uv run --no-project --with pillow python scripts/video/compose_daynight.py \
        --frames ~/.cache/kachel/video/work/daynight --day services/scheduler/out/day_january.csv \
        --mp4 ~/.cache/kachel/video/daynight-january.mp4 --sheet ~/.cache/kachel/video/daynight-january-sheet.png

Left: Basel outside; right: the plant room; one clock across both. The clock,
the outdoor temperature and every figure are formatted from the CSV row (and
the scheduler's config.json and kpis.json); none is typed. With --preview, only a
contact sheet is made (for previews), no MP4. The right half pushes in slowly over
the day, and dots run along the pipes at a speed set by the hour's heat_produced.
"""

import argparse
import csv
import itertools
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
import compose as c

HOUR = 36  # frames per hour: 24 h in 36 s
FADE = 12
HALF = c.W // 2
CREDIT = (
    "Buildings: swissBUILDINGS3D 3.0 (2024 ed.), © swisstopo. Terrain and river outline "
    "approximated. Heat demand: SFOE, hectare cells, data status 2013."
)


def overlay(r, ctx, minute=0):
    layer = Image.new("RGBA", (c.W, c.H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rectangle((HALF - 2, 0, HALF + 1, c.H), fill=(10, 12, 16, 255))
    # One clock across both halves.
    t = f"{int(r['hour']):02d}:{minute:02d}"
    date = c.long_date(r["time"])
    w = (
        max(d.textlength(t, font=c.F["hour"]), d.textlength(date, font=c.F["body"]))
        + 60
    )
    c.rounded(d, (HALF - w / 2, 28, HALF + w / 2, 196), c.PANEL)
    d.text(
        (HALF - d.textlength(t, font=c.F["hour"]) / 2, 34),
        t,
        font=c.F["hour"],
        fill=c.INK,
    )
    d.text(
        (HALF - d.textlength(date, font=c.F["body"]) / 2, 142),
        date,
        font=c.F["body"],
        fill=c.DIM,
    )
    # Left: outside.
    temp = float(r["temp_c"])
    demand = float(r["demand_kwh"])
    c.rounded(d, (28, 28, 400, 160), c.PANEL)
    d.text((50, 40), "Basel, outside", font=c.F["bodyb"], fill=c.INK)
    d.text((50, 78), f"{c.num(temp)} °C", font=c.F["date"], fill=c.INK)
    d.text(
        (50, 126),
        f"House needs {c.num(demand)} kWh this hour",
        font=c.F["small"],
        fill=c.HOT,
    )
    # Right: the plant room.
    on = round(float(r["server_hours"]))
    soc = float(r["soc_kwh"])
    heat = float(r["heat_used"])
    backup = float(r["backup_kwh"])
    x0 = c.W - 420
    # Bottom right, over the floor, clear of the pipes and ceiling.
    top = c.H - 28 - 272 - (50 if "paused" in r["reason"] else 0)
    c.rounded(d, (x0, top, c.W - 28, c.H - 28), c.PANEL)
    d.text((x0 + 22, top + 12), "Basement plant room", font=c.F["bodyb"], fill=c.INK)
    items = [
        (
            "Servers running",
            f"{on} of {ctx['servers']}",
            (90, 220, 230) if on else c.DIM,
        ),
        ("Heat to the house", f"{c.num(heat)} kWh", c.HOT if heat else c.DIM),
        (
            "Tank",
            f"{c.num(soc)} of {c.num(ctx['tank'], 0)} kWh",
            c.AMBER if soc else c.DIM,
        ),
        ("Backup heater", f"{c.num(backup)} kWh", c.AMBER if backup else c.DIM),
    ]
    if "paused" in r["reason"]:
        items.append(("Backlog", "paused: tank full", c.AMBER))
    y = top + 60
    for k, v, col in items:
        d.text((x0 + 22, y), k, font=c.F["small"], fill=c.DIM)
        d.text(
            (c.W - 50 - d.textlength(v, font=c.F["label"]), y),
            v,
            font=c.F["label"],
            fill=col,
        )
        y += 50
    # Attribution, as on the dusk still.
    f = c.F["small"].font_variant(size=15)
    lines = CREDIT.split(". ", 1)
    lines = [lines[0] + ".", lines[1]]
    tw = max(d.textlength(t, font=f) for t in lines)
    c.rounded(
        d, (HALF - 16 - tw - 24, c.H - 66, HALF - 16, c.H - 14), (16, 19, 24, 200), 6
    )
    for i, t in enumerate(lines):
        d.text(
            (HALF - 16 - tw - 12, c.H - 60 + 22 * i), t, font=f, fill=(184, 184, 180)
        )
    return layer


def push_half(img, t):
    """Slow push into the plant room over the day: scale about a point, return the mapping."""
    k = 1.0 + 0.1 * t / 24
    cx, cy = 0.5 * HALF, 0.52 * c.H
    cw, ch = HALF / k, c.H / k
    x0 = min(max(0.0, cx - cw / 2), HALF - cw)
    y0 = min(max(0.0, cy - ch / 2), c.H - ch)
    out = img.resize((HALF, c.H), Image.LANCZOS, box=(x0, y0, x0 + cw, y0 + ch))
    return out, lambda p: ((p[0] * HALF - x0) * k, (p[1] * c.H - y0) * k)


def flow_dots(img, flow, to_px, phase, speed):
    """Water moving along the pipes: dots travel at a speed set by heat_produced."""
    if speed <= 0:
        return img
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    gap = 34.0
    for kind, col in (("hot", (255, 96, 60)), ("cold", (90, 150, 255))):
        for path in flow[kind]:
            pts = [to_px(p) for p in path]
            off = (phase * speed) % gap
            for (ax, ay), (bx, by) in itertools.pairwise(pts):
                seg = ((bx - ax) ** 2 + (by - ay) ** 2) ** 0.5
                u = off
                while u < seg:
                    x, y = ax + (bx - ax) * u / seg, ay + (by - ay) * u / seg
                    d.ellipse((x - 9, y - 9, x + 9, y + 9), fill=(*col, 70))
                    d.ellipse((x - 4, y - 4, x + 4, y + 4), fill=(*col, 255))
                    u += gap
                off = u - seg
    layer = layer.filter(ImageFilter.GaussianBlur(1.2))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def halves(fr, r, minute=0, step=None):
    hh = int(r["hour"])
    left = sorted((fr / "outside").glob(f"{hh:02d}*.png"))
    if step is None:
        lp = fr / "outside" / f"{hh:02d}{minute:02d}.png"
    else:
        lp = left[min(step, len(left) - 1)]
    lim = Image.open(lp).convert("RGB").resize((HALF, c.H), Image.LANCZOS)
    rim = (
        Image.open(fr / "inside" / f"{hh:02d}.png")
        .convert("RGB")
        .resize((HALF, c.H), Image.LANCZOS)
    )
    return lim, rim, len(left)


def assemble(lim, rim, r, ctx, t, phase, minute=0):
    right, to_px = push_half(rim, t)
    hk = float(r["heat_produced"]) / ctx["heat_full"]
    right = flow_dots(right, ctx["flow"], to_px, phase, 0.6 + 3.4 * hk if hk > 0 else 0)
    img = Image.new("RGB", (c.W, c.H))
    img.paste(lim, (0, 0))
    img.paste(right, (HALF, 0))
    return Image.alpha_composite(img.convert("RGBA"), overlay(r, ctx, minute)).convert(
        "RGB"
    )


def context(fr, day):
    out = Path(day).parent
    cfg = json.loads((out.parent / "config.json").read_text())
    kpis = json.loads((out / "kpis.json").read_text())
    n = int(kpis["servers_per_house"])
    return {
        "tank": float(cfg["house"]["tank_kwh"]),
        "servers": n,
        "heat_full": n
        * float(cfg["server"]["power_kw"])
        * float(cfg["server"]["heat_recovery"]),
        "flow": json.loads((fr / "flow.json").read_text()),
    }


def rows_of(day):
    with open(day, newline="") as f:
        return sorted(csv.DictReader(f), key=lambda r: int(r["hour"]))


def sheet_of(shots, path):
    s = Image.new("RGB", (960 * 4, 540 * ((len(shots) + 3) // 4)))
    for i, im in enumerate(shots):
        s.paste(im.resize((960, 540), Image.LANCZOS), (960 * (i % 4), 540 * (i // 4)))
    s.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", help="work dir of one day")
    ap.add_argument("--day", help="that day's CSV")
    ap.add_argument("--mp4")
    ap.add_argument("--sheet", required=True)
    ap.add_argument(
        "--preview",
        nargs="+",
        default=[],
        help="DIR,CSV,HH:MM;HH:MM ... : a contact sheet of those times only, no MP4",
    )
    a = ap.parse_args()
    if a.preview:
        shots = []
        for spec in a.preview:
            d, day, times = spec.split(",")
            fr = Path(d)
            ctx, by_hour = context(fr, day), {int(r["hour"]): r for r in rows_of(day)}
            for tm in times.split(";"):
                r = by_hour[int(tm[:2])]
                lim, rim, _ = halves(fr, r, int(tm[3:5]))
                shots.append(
                    assemble(
                        lim,
                        rim,
                        r,
                        ctx,
                        int(tm[:2]) + int(tm[3:5]) / 60,
                        0,
                        int(tm[3:5]),
                    )
                )
        sheet_of(shots, a.sheet)
        print("sheet ->", a.sheet)
        return
    fr = Path(a.frames)
    ctx, rows = context(fr, a.day), rows_of(a.day)
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{c.W}x{c.H}", "-r", str(c.FPS), "-i", "-", "-c:v", "libx264",
         "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
         a.mp4],
        stdin=subprocess.PIPE,
    )  # fmt: skip
    prev, n, sheet = None, 0, []
    for r in rows:
        *_, steps = halves(fr, r, step=0)
        per = HOUR // steps
        for s in range(steps):
            lim, rim, _ = halves(fr, r, step=s)
            for j in range(per):
                cl, cr = lim, rim
                fade = min(FADE, per - 1)
                if prev is not None and j < fade:
                    t = (j + 1) / (fade + 1)
                    cl, cr = Image.blend(prev[0], lim, t), Image.blend(prev[1], rim, t)
                hour_t = int(r["hour"]) + (s * per + j) / HOUR
                img = assemble(cl, cr, r, ctx, hour_t, n, 60 * s // steps)
                ff.stdin.write(img.tobytes())
                n += 1
                if s == 0 and j == per - 1 and int(r["hour"]) in (0, 7, 9, 13, 17, 21):
                    sheet.append(img)
            prev = (lim, rim)
    ff.stdin.close()
    ff.wait()
    sheet_of(sheet, a.sheet)
    print(f"{n} frames, {n / c.FPS:.1f} s -> {a.mp4}")


if __name__ == "__main__":
    main()
