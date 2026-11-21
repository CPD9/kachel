"""Compose segment 3 from the hourly stills and encode it.

    uv run --with pillow python scripts/video/compose.py \
        --frames ~/.cache/kachel/video/work/scheduler \
        --days services/scheduler/out/day_january.csv services/scheduler/out/day_july.csv \
        --mp4 ~/.cache/kachel/video/03-scheduler.mp4 \
        --sheet ~/.cache/kachel/video/03-scheduler-sheet.png

Each hour of the two days is one block of frames. The block shows the still
rendered for that hour, cross-faded in from the hour before, with the date, the
hour and the figures of that CSV row written over it. Every figure on screen is
formatted here from the row (or from the scheduler's config.json and
kpis.json for the tank size and the number of servers); none is typed.
"""

import argparse
import csv
import json
import subprocess
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1920, 1080, 24
CARD = 36  # frames of the day title card
HOUR = 11  # frames per hour
FADE = 5  # frames of cross-fade into each hour
TAIL = 12
SHEET = ((0, 12), (0, 19), (1, 12))  # contact-sheet (day, hour)
INK = (245, 244, 240)
DIM = (165, 170, 178)
PANEL = (16, 19, 24, 190)
HOT = (226, 70, 45)
COLD = (70, 130, 235)
AMBER = (240, 160, 60)


def font(name, size):
    path = subprocess.run(
        ["fc-match", "-f", "%{file}", name], capture_output=True, text=True, check=False
    ).stdout
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default(size)


F = {
    "date": font("Nimbus Sans:bold", 40),
    "hour": font("Nimbus Sans:bold", 84),
    "body": font("Nimbus Sans", 27),
    "bodyb": font("Nimbus Sans:bold", 27),
    "small": font("Nimbus Sans", 22),
    "label": font("Nimbus Sans:bold", 22),
    "title": font("Nimbus Sans:bold", 76),
    "sub": font("Nimbus Sans", 36),
}


def num(x, nd=1):
    s = f"{x:.{nd}f}"
    return s.replace("-", "−")


def long_date(t):
    d = datetime.strptime(t[:10], "%Y-%m-%d")
    return f"{d.day} {d:%B %Y}"


def rounded(draw, box, fill, r=14):
    draw.rounded_rectangle(box, radius=r, fill=fill)


def label(draw, xy, text, value=None, colour=INK, at=(18, -34)):
    """A word label, with an optional figure under it, and a leader to a 0..1 image point."""
    x, y = xy[0] * W, xy[1] * H
    tw = draw.textlength(text, font=F["label"])
    if value:
        tw = max(tw, draw.textlength(value, font=F["bodyb"]))
    bx, by = x + at[0], y + at[1]
    bh = 64 if value else 28
    rounded(draw, (bx - 12, by - 8, bx + tw + 12, by + bh), (16, 19, 24, 185), 8)
    ex = bx - 12 if at[0] > 0 else bx + tw + 12
    draw.line((x, y, ex, by + bh / 2), fill=(*INK, 210), width=2)
    draw.ellipse(
        (x - 6, y - 6, x + 6, y + 6), fill=colour, outline=(16, 19, 24, 255), width=2
    )
    draw.text((bx, by - 2), text, font=F["label"], fill=INK if value else colour)
    if value:
        draw.text((bx, by + 26), value, font=F["bodyb"], fill=colour)


def hud(r, ctx):
    """The overlay for one row, as an RGBA layer."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    temp = float(r["temp_c"])
    on = round(float(r["server_hours"]))
    soc = float(r["soc_kwh"])
    heat = float(r["heat_used"])
    backup = float(r["backup_kwh"])
    demand = float(r["demand_kwh"])
    space = max(0.0, demand - ctx["hot_water"])
    # Top left: date, hour and the weather.
    rounded(d, (40, 36, 560, 196), PANEL)
    d.text((70, 52), long_date(r["time"]), font=F["date"], fill=INK)
    d.text((66, 96), f"{int(r['hour']):02d}:00", font=F["hour"], fill=INK)
    d.text((300, 132), f"Outdoors {num(temp)} \u00b0C", font=F["body"], fill=DIM)
    # Bottom: the three kinds of job.
    paused = "paused" in r["reason"]
    tiles = [
        ("Interactive session", int(r["interactive"]), None),
        (f"Batch job, due in {ctx['batch_due_h']} h", int(r["batch"]), None),
        (
            "Backlog: embeddings",
            int(r["opportunistic"]),
            "Paused: tank full" if paused else None,
        ),
    ]
    x = 600
    for name, n, stop in tiles:
        w = 380
        alpha = 110 if (stop or n == 0) else 215
        rounded(d, (x, 930, x + w, 1040), (16, 19, 24, alpha))
        bar = (
            (90, 200, 120)
            if n and not stop
            else ((200, 120, 60) if stop else (90, 95, 105))
        )
        d.rectangle((x, 945, x + 6, 1025), fill=bar)
        tc = INK if (n and not stop) else DIM
        d.text((x + 24, 946), name, font=F["bodyb"], fill=tc)
        if stop:
            status = stop
        elif n:
            status = f"Running on {n} server{'s' if n != 1 else ''}"
        else:
            status = "Nothing queued"
        d.text((x + 24, 990), status, font=F["body"], fill=AMBER if stop else tc)
        x += w + 20
    # Word labels on the plant, each with its figure from the row.
    a = ctx["anchors"]
    label(
        d,
        a["servers"],
        "Servers running",
        f"{on} of {ctx['servers']}",
        (90, 220, 230) if on else DIM,
        (360, -40),
    )
    label(
        d,
        a["supply"],
        "Supply to the building",
        f"{num(heat)} kWh",
        HOT if heat > 0 else DIM,
        (60, -60),
    )
    label(d, a["return"], "Return", None, COLD, (60, 6))
    label(
        d,
        a["tank"],
        "Tank",
        f"{num(soc)} of {num(ctx['tank'], 0)} kWh",
        AMBER if soc > 0 else DIM,
        (40, -10),
    )
    label(
        d,
        a["heater"],
        "Backup heater",
        f"{num(backup)} kWh",
        AMBER if backup > 0 else DIM,
        (-250, 40),
    )
    # Inset frame text: the flat upstairs.
    ix, iy, iw, ih = ctx["inset"]
    d.rectangle(
        (ix - 3, iy - 3, ix + iw + 3, iy + ih + 3), outline=(*INK, 230), width=3
    )
    rounded(d, (ix, iy + ih + 8, ix + iw, iy + ih + 92), PANEL, 10)
    d.text((ix + 14, iy + ih + 14), "Flat upstairs", font=F["label"], fill=INK)
    rad = f"Radiators {num(space)} kWh" if space > 0 else "Radiators off"
    d.text(
        (ix + 14, iy + ih + 50), rad, font=F["small"], fill=HOT if space > 0 else DIM
    )
    hw = f"Shower {num(min(demand, ctx['hot_water']))} kWh"
    d.text(
        (ix + iw - 14 - d.textlength(hw, font=F["small"]), iy + ih + 50),
        hw,
        font=F["small"],
        fill=COLD,
    )
    return layer


def card(base, r):
    img = Image.blend(base, Image.new("RGB", base.size, (10, 12, 16)), 0.62)
    d = ImageDraw.Draw(img)
    t = long_date(r["time"])
    d.text(
        ((W - d.textlength(t, font=F["title"])) / 2, 430), t, font=F["title"], fill=INK
    )
    s = f"Outdoors at midnight {num(float(r['temp_c']))} °C"
    d.text(((W - d.textlength(s, font=F["sub"])) / 2, 540), s, font=F["sub"], fill=DIM)
    return img


def push(img, k):
    """A slow push-in: crop by up to 4 % around the centre."""
    s = 1 + 0.04 * k
    cw, ch = W / s, H / s
    x0, y0 = (W - cw) / 2, (H - ch) / 2
    return img.resize((W, H), Image.LANCZOS, box=(x0, y0, x0 + cw, y0 + ch))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", required=True)
    ap.add_argument("--days", nargs="+", required=True)
    ap.add_argument("--mp4", required=True)
    ap.add_argument("--sheet", required=True)
    a = ap.parse_args()
    fr = Path(a.frames)
    out = Path(a.days[0]).parent
    cfg = json.loads((out.parent / "config.json").read_text())
    kpis = json.loads((out / "kpis.json").read_text())
    days = []
    for p in a.days:
        with open(p, newline="") as f:
            days.append(sorted(csv.DictReader(f), key=lambda r: int(r["hour"])))
    iw = W // 4
    ctx = {
        "tank": float(cfg["house"]["tank_kwh"]),
        "servers": int(kpis["servers_per_house"]),
        "hot_water": float(cfg["house"]["hot_water_kwh_per_day"]) / 24,
        "batch_due_h": cfg["jobs"]["batch"]["deadline_h"],
        "anchors": json.loads((fr / "anchors.json").read_text()),
        "inset": (W - iw - 40, 36, iw, iw * 9 // 16),
    }

    def still(r):
        key = f"{r['time'][:10]}_{int(r['hour']):02d}"
        p = (
            Image.open(fr / "plant" / f"{key}.png")
            .convert("RGB")
            .resize((W, H), Image.LANCZOS)
        )
        q = (
            Image.open(fr / "flat" / f"{key}.png")
            .convert("RGB")
            .resize(ctx["inset"][2:], Image.LANCZOS)
        )
        return p, q

    ff = subprocess.Popen(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-s",
            f"{W}x{H}",
            "-r",
            str(FPS),
            "-i",
            "-",
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            a.mp4,
        ],
        stdin=subprocess.PIPE,
    )
    sheet = []
    n = 0
    for day, dr in enumerate(days):
        total = len(dr) * HOUR
        prev = None
        p0, _ = still(dr[0])
        for _ in range(CARD):
            ff.stdin.write(card(push(p0, 0), dr[0]).tobytes())
            n += 1
        for i, r in enumerate(dr):
            p, q = still(r)
            layer = hud(r, ctx)
            for j in range(HOUR):
                k = (i * HOUR + j) / total
                if prev is not None and j < FADE:
                    t = (j + 1) / (FADE + 1)
                    pp, qq = Image.blend(prev[0], p, t), Image.blend(prev[1], q, t)
                else:
                    pp, qq = p, q
                img = push(pp, k)
                ix, iy = ctx["inset"][:2]
                img.paste(qq, (ix, iy))
                img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")
                ff.stdin.write(img.tobytes())
                if j == HOUR - 1 and (day, int(r["hour"])) in SHEET:
                    sheet.append(img.resize((640, 360), Image.LANCZOS))
                n += 1
            prev = (p, q)
    last = img
    for _ in range(TAIL):
        ff.stdin.write(last.tobytes())
        n += 1
    ff.stdin.close()
    ff.wait()
    s = Image.new("RGB", (640 * len(sheet), 360))
    for i, im in enumerate(sheet):
        s.paste(im, (640 * i, 0))
    s.save(a.sheet)
    print(f"{n} frames, {n / FPS:.1f} s -> {a.mp4}")


if __name__ == "__main__":
    main()
