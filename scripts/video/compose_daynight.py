"""Compose the day-night split film from the halves rendered by daynight.py.

    uv run --no-project --with pillow python scripts/video/compose_daynight.py \
        --frames ~/.cache/kachel/video/work/daynight --day services/scheduler/out/day_january.csv \
        --mp4 ~/.cache/kachel/video/daynight-january.mp4 --sheet ~/.cache/kachel/video/daynight-january-sheet.png

Left: Basel outside; right: the plant room; one clock across both. The clock,
the outdoor temperature and every figure are formatted from the CSV row (and
the scheduler's config.json and kpis.json); none is typed. With --hours, only a
contact sheet of those hours is made (for previews), no MP4.
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

HOUR = 36  # frames per hour: 24 h in 36 s
FADE = 12
HALF = c.W // 2
CREDIT = (
    "Buildings: swissBUILDINGS3D 3.0 (2024 ed.), © swisstopo. Terrain and river outline "
    "approximated. Heat demand: SFOE, hectare cells, data status 2013."
)


def overlay(r, ctx):
    layer = Image.new("RGBA", (c.W, c.H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rectangle((HALF - 2, 0, HALF + 1, c.H), fill=(10, 12, 16, 255))
    # One clock across both halves.
    t = f"{int(r['hour']):02d}:00"
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
    c.rounded(d, (x0, 28, c.W - 28, 300), c.PANEL)
    d.text((x0 + 22, 40), "Basement plant room", font=c.F["bodyb"], fill=c.INK)
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
    y = 88
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


def frame(fr, r, step=0):
    hh = int(r["hour"])
    left = sorted((fr / "outside").glob(f"{hh:02d}*.png"))
    lp = left[min(step, len(left) - 1)]
    lim = Image.open(lp).convert("RGB").resize((HALF, c.H), Image.LANCZOS)
    rim = (
        Image.open(fr / "inside" / f"{hh:02d}.png")
        .convert("RGB")
        .resize((HALF, c.H), Image.LANCZOS)
    )
    img = Image.new("RGB", (c.W, c.H))
    img.paste(lim, (0, 0))
    img.paste(rim, (HALF, 0))
    return img, len(left)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", required=True)
    ap.add_argument("--day", required=True)
    ap.add_argument("--mp4")
    ap.add_argument("--sheet", required=True)
    ap.add_argument("--hours", default="")
    a = ap.parse_args()
    fr = Path(a.frames)
    out = Path(a.day).parent
    cfg = json.loads((out.parent / "config.json").read_text())
    kpis = json.loads((out / "kpis.json").read_text())
    ctx = {
        "tank": float(cfg["house"]["tank_kwh"]),
        "servers": int(kpis["servers_per_house"]),
    }
    with open(a.day, newline="") as f:
        rows = sorted(csv.DictReader(f), key=lambda r: int(r["hour"]))
    if a.hours:
        want = {int(h) for h in a.hours.split(",")}
        shots = []
        for r in rows:
            if int(r["hour"]) in want:
                img, _ = frame(fr, r)
                img = Image.alpha_composite(
                    img.convert("RGBA"), overlay(r, ctx)
                ).convert("RGB")
                shots.append(img.resize((960, 540), Image.LANCZOS))
        s = Image.new("RGB", (960 * 3, 540 * ((len(shots) + 2) // 3)))
        for i, im in enumerate(shots):
            s.paste(im, (960 * (i % 3), 540 * (i // 3)))
        s.save(a.sheet)
        print("sheet ->", a.sheet)
        return
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{c.W}x{c.H}", "-r", str(c.FPS), "-i", "-", "-c:v", "libx264",
         "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
         a.mp4],
        stdin=subprocess.PIPE,
    )  # fmt: skip
    prev, n, sheet = None, 0, []
    for r in rows:
        layer = overlay(r, ctx)
        _, steps = frame(fr, r)
        per = HOUR // steps
        for s in range(steps):
            cur, _ = frame(fr, r, s)
            for j in range(per):
                img = cur
                if prev is not None and j < FADE:
                    img = Image.blend(prev, cur, (j + 1) / (FADE + 1))
                out_img = Image.alpha_composite(img.convert("RGBA"), layer).convert(
                    "RGB"
                )
                ff.stdin.write(out_img.tobytes())
                n += 1
            prev = cur
            if s == 0 and int(r["hour"]) in (0, 6, 9, 13, 18, 21):
                sheet.append(out_img.resize((960, 540), Image.LANCZOS))
    ff.stdin.close()
    ff.wait()
    sh = Image.new("RGB", (960 * 3, 540 * ((len(sheet) + 2) // 3)))
    for i, im in enumerate(sheet):
        sh.paste(im, (960 * (i % 3), 540 * (i // 3)))
    sh.save(a.sheet)
    print(f"{n} frames, {n / c.FPS:.1f} s -> {a.mp4}")


if __name__ == "__main__":
    main()
