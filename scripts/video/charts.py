"""Render the economics charts for the pitch video in Blender.

They play behind the figures part of the pitch (docs/pitch.md). Rebuild them
from the repository root with

    make video-charts

which runs, once for each chart,

    TMPDIR=~/.cache/kachel/tmp blender --background --factory-startup \
        --python scripts/video/charts.py -- \
        --chart month --out ~/.cache/kachel/video/charts/frames/month \
        --mp4 ~/.cache/kachel/video/charts/month.mp4 \
        --still ~/.cache/kachel/video/charts/month.png

It renders the PNG frames, encodes them with ffmpeg into an H.264 MP4
(1920x1080, 24 fps) and copies the last frame as the still. It needs
Blender 5.2 and an ffmpeg built with libx264.

Every bar, line, tick and figure is read from docs/economics/data when the
script runs, so the charts follow the model when it is rebuilt. The charts are
flat: an orthographic camera looks down on shapes and text laid out in pixels,
and the Workbench engine paints each one in a single palette colour. Things
fade in by blending their colour from the page colour, which is exact on a
plain background.

Charts:
    month        heat from the servers and backup heat per month, stacked,
                 with the server utilisation drawn along
    breakeven    cost and price per server-hour, with the break-even point
    sensitivity  what moves the yearly result after hardware, as a tornado chart
    payback      cumulative cash per house over the years, for three hardware cases

Options after "--":
    --chart NAME   one of the charts above (required)
    --out DIR      where the PNG frames go (required)
    --data DIR     the model's tables (default docs/economics/data)
    --only LIST    render only these frames, numbered from 1, or "last"
    --mp4 FILE     encode the frames into this video
    --still FILE   copy the last frame here
"""

import argparse
import csv
import itertools
import json
import math
import shutil
import subprocess
import sys
import time
from pathlib import Path
from types import SimpleNamespace

import bmesh
import bpy
from mathutils import Vector

# Palette
INK = "#14161A"  # text and axes
PAPER = "#FAF8F5"  # background
EMBER = "#FF5A1F"  # heat from the servers
AMBER = "#FFB020"  # highlights
GLACIER = "#1F6FEB"  # backup heat and the grid
MINT = "#19B38A"  # income, a better result
SLATE = "#9AA0A8"  # gridlines and secondary text

WIDTH, HEIGHT, FPS = 1920, 1080, 24
# Text sizes are em sizes in pixels. Noto Sans capitals are 0.714 em high, so
# labels come out about 36 px high and titles about 60 px.
LABEL = 50
TITLE = 84
CAP = 0.714
MARGIN = 120
PX = 0.01  # Blender units per pixel
FONT_FILES = {
    "regular": "/usr/share/fonts/noto/NotoSans-Regular.ttf",
    "bold": "/usr/share/fonts/noto/NotoSans-Bold.ttf",
}
DATA = Path(__file__).resolve().parents[2] / "docs" / "economics" / "data"

# Each entry is called with the time in seconds before a frame renders.
UPDATES = []
FONTS = {}
TEXTS = []
PAPER_MAT = []
# When each fading material starts to show; text stays hidden until then, so
# page-coloured letters do not cut gaps in the gridlines.
STARTS = {}


# Colours, easing and number formatting


def lin(hex_colour, alpha=1.0):
    """Turn an sRGB hex colour into the linear RGBA that Blender works in."""
    h = hex_colour.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i : i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, alpha)


def mix(a, b, f):
    return tuple(x + (y - x) * f for x, y in zip(a, b))


def clamp01(x):
    return min(1.0, max(0.0, x))


def ease(x):
    x = clamp01(x)
    return x * x * (3 - 2 * x)


def ease_out(x):
    x = clamp01(x)
    return 1 - (1 - x) ** 3


def ticks(top, count):
    """Round tick values from 0 to at least top, in count equal steps."""
    raw = top / count
    mag = 10 ** math.floor(math.log10(raw))
    for m in (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10):
        if m * mag * count >= top * (1 - 1e-9):
            step = m * mag
            break
    return [step * i for i in range(count + 1)], step


def decimals(step):
    for d in range(6):
        if abs(round(step * 10**d) - step * 10**d) < 1e-6:
            return d
    return 6


def number(value, places=0):
    """Thousands with commas, and a true minus sign for negatives."""
    return f"{value:,.{places}f}".replace("-", "\u2212")


def span_ticks(low, high, count):
    """Round tick values covering low to high (either may be negative), about count steps."""
    raw = (high - low) / count
    mag = 10 ** math.floor(math.log10(raw))
    step = next(m * mag for m in (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10) if m * mag >= raw)
    first = math.floor(low / step + 1e-9)
    last = math.ceil(high / step - 1e-9)
    return [step * i for i in range(first, last + 1)], step


def tick_text(value, step, suffix=""):
    return ("0" if value == 0 else number(value, decimals(step))) + suffix


# Scene building blocks, all placed in pixels from the bottom left


def paint(name, colour, start=None, length=0.4, ground=PAPER):
    """A flat material; with start, it fades in from ground at that second."""
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = lin(colour)
    if start is not None:
        STARTS[mat.name] = start

        def update(t):
            f = ease((t - start) / length)
            mat.diffuse_color = mix(lin(ground), lin(colour), f)

        update(0.0)
        UPDATES.append(update)
    return mat


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def rect(name, x0, y0, x1, y1, mat, z=0.01):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)], [], [(0, 1, 2, 3)])
    mesh.materials.append(mat)
    obj = link(bpy.data.objects.new(name, mesh))
    obj.location.z = z
    place(obj, x0, y0, x1, y1)
    return obj


def place(obj, x0, y0, x1, y1):
    """Stretch a unit rectangle over the box; hide it while it is thinner than a pixel."""
    x0, x1 = sorted((x0, x1))
    y0, y1 = sorted((y0, y1))
    obj.hide_render = x1 - x0 < 0.5 or y1 - y0 < 0.5
    obj.location.x, obj.location.y = x0 * PX, y0 * PX
    obj.scale = (max(x1 - x0, 0.01) * PX, max(y1 - y0, 0.01) * PX, 1)


def disc(name, x, y, radius, mat, z=0.04):
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=48, radius=1.0)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    obj = link(bpy.data.objects.new(name, mesh))
    obj.location = (x * PX, y * PX, z)
    obj.scale = (radius * PX, radius * PX, 1)
    return obj


def stroke(name, mat, width, z=0.03):
    """A polyline with round joins; draw(points) replaces its shape."""
    mesh = bpy.data.meshes.new(name)
    mesh.materials.append(mat)
    obj = link(bpy.data.objects.new(name, mesh))
    obj.location.z = z
    r = width / 2 * PX

    def draw(points):
        mesh.clear_geometry()
        pts = [(x * PX, y * PX) for x, y in points]
        obj.hide_render = len(pts) < 2
        if len(pts) < 2:
            return
        bm = bmesh.new()
        for (ax, ay), (bx, by) in itertools.pairwise(pts):
            dx, dy = bx - ax, by - ay
            length = math.hypot(dx, dy)
            if length == 0:
                continue
            nx, ny = -dy / length * r, dx / length * r
            corners = [
                (ax + nx, ay + ny),
                (bx + nx, by + ny),
                (bx - nx, by - ny),
                (ax - nx, ay - ny),
            ]
            bm.faces.new([bm.verts.new((x, y, 0)) for x, y in corners])
        for x, y in pts:
            ring = [
                (x + r * math.cos(a), y + r * math.sin(a))
                for a in (2 * math.pi * i / 24 for i in range(24))
            ]
            bm.faces.new([bm.verts.new((px, py, 0)) for px, py in ring])
        bm.to_mesh(mesh)
        bm.free()

    return draw


def partial(points, u):
    """The polyline up to position u, where 1 is the second point."""
    u = max(0.0, min(u, len(points) - 1))
    whole = int(u)
    out = list(points[: whole + 1])
    if whole < len(points) - 1 and u > whole:
        (ax, ay), (bx, by) = points[whole], points[whole + 1]
        f = u - whole
        out.append((ax + (bx - ax) * f, ay + (by - ay) * f))
    return out


def text(body, x, y, mat, size=LABEL, align="LEFT", bold=False, z=0.05):
    """Text with its baseline at y; align is LEFT, CENTER or RIGHT about x."""
    curve = bpy.data.curves.new(body[:40], "FONT")
    curve.body = body
    font = FONTS.get("bold" if bold else "regular")
    if font:
        curve.font = font
    curve.size = size * PX
    curve.align_x = align
    curve.align_y = "BOTTOM_BASELINE"
    curve.resolution_u = 10
    curve.materials.append(mat)
    obj = link(bpy.data.objects.new(body[:40], curve))
    obj.location = (x * PX, y * PX, z)
    TEXTS.append(obj)
    if mat.name in STARTS:
        start = STARTS[mat.name]

        def update(t):
            obj.hide_render = t < start

        update(0.0)
        UPDATES.append(update)
    return obj


def extent(obj):
    """The box an object covers, in pixels: (x0, y0, x1, y1)."""
    bpy.context.view_layer.update()
    ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    corners = [obj.matrix_world @ Vector(c) for c in ev.bound_box]
    xs = [c.x / PX for c in corners]
    ys = [c.y / PX for c in corners]
    return min(xs), min(ys), max(xs), max(ys)


def backing(objs, start, pad=10):
    """A page-coloured patch behind text from start on, so gridlines stop short of it."""
    boxes = [extent(obj) for obj in objs]
    patch = rect(
        f"behind {objs[0].name}",
        min(b[0] for b in boxes) - pad,
        min(b[1] for b in boxes) - pad,
        max(b[2] for b in boxes) + pad,
        max(b[3] for b in boxes) + pad,
        PAPER_MAT[0],
        z=0.006,
    )

    def update(t):
        patch.hide_render = t < start

    update(0.0)
    UPDATES.append(update)
    return patch


def header(title, subtitle):
    mat = paint("header", INK, start=0.0, length=0.5)
    text(title, MARGIN, 975, mat, size=TITLE, bold=True)
    text(subtitle, MARGIN, 895, mat)


def legend(items, x, y, start):
    """A row of swatches and names; items are (name, colour, shape)."""
    mat = paint("legend", INK, start=start)
    for name, colour, shape in items:
        swatch = paint(f"legend {name}", colour, start=start)
        cap = LABEL * CAP
        if shape == "line":
            rect(f"key {name}", x, y + cap / 2 - 4, x + 44, y + cap / 2 + 4, swatch)
        else:
            rect(f"key {name}", x + 4, y, x + 40, y + cap, swatch)
        label = text(name, x + 58, y, mat)
        x = extent(label)[2] + 56


# Data


def load(data_dir):
    def rows(name):
        with open(data_dir / name, newline="", encoding="utf-8") as f:
            return list(csv.DictReader(f))

    summary = json.loads((data_dir / "summary.json").read_text(encoding="utf-8"))
    return SimpleNamespace(
        monthly=rows("monthly.csv"),
        sensitivity=rows("sensitivity.csv"),
        per_house=rows("servers_per_house.csv"),
        hardware=rows("hardware.csv"),
        daily=rows("daily.csv"),
        summary=summary,
    )


# Chart 1: month by month


def chart_month(data):
    base = data.summary["base_case"]
    months = data.monthly
    year = data.daily[0]["date"][:4]
    header(
        "Month by month",
        f"One house in Basel with {base['servers_per_house']} servers, {year} weather",
    )
    legend(
        [
            ("Heat from servers", EMBER, "box"),
            ("Backup heat", GLACIER, "box"),
            ("Server utilisation", INK, "line"),
        ],
        MARGIN,
        800,
        start=0.3,
    )

    x0, x1, y0, y1 = 230, 1700, 150, 690
    server = [float(m["heat_from_servers_kwh"]) for m in months]
    backup = [float(m["backup_heat_kwh"]) for m in months]
    util = [float(m["utilisation_pct"]) for m in months]
    kwh_ticks, kwh_step = ticks(max(s + b for s, b in zip(server, backup)), 4)
    pct_ticks, pct_step = ticks(max(util), 4)
    kwh_top, pct_top = kwh_ticks[-1], pct_ticks[-1]

    def ky(v):
        return y0 + v / kwh_top * (y1 - y0)

    def py(v):
        return y0 + v / pct_top * (y1 - y0)

    axis = paint("axis", INK, start=0.2)
    grid = paint("grid", SLATE, start=0.2)
    secondary = paint("captions", INK, start=0.2)
    for i, (kv, pv) in enumerate(zip(kwh_ticks, pct_ticks)):
        yy = ky(kv)
        if i:
            rect(f"grid {i}", x0, yy - 1, x1, yy + 1, grid, z=0.005)
        mid = yy - LABEL * CAP / 2
        text(tick_text(kv, kwh_step), x0 - 22, mid, axis, align="RIGHT")
        text(tick_text(pv, pct_step, "%"), x1 + 22, mid, axis)
    rect("baseline", x0, y0 - 1.5, x1, y0 + 1.5, axis, z=0.02)
    text("kWh", x0 - 22, y1 + 42, secondary, align="RIGHT")
    text("Utilisation", WIDTH - 80, y1 + 42, secondary, align="RIGHT")

    slot = (x1 - x0) / len(months)
    centres = [x0 + slot * (i + 0.5) for i in range(len(months))]
    for i, m in enumerate(months):
        text(m["month"], centres[i], y0 - 62, axis, align="CENTER")

    heat_mat = paint("server heat", EMBER)
    backup_mat = paint("backup heat", GLACIER)
    first, gap, grow = 1.0, 0.35, 0.6
    for i, (s, b) in enumerate(zip(server, backup)):
        half = slot * 0.31
        lo = rect(f"server {i}", 0, 0, 0, 0, heat_mat)
        hi = rect(f"backup {i}", 0, 0, 0, 0, backup_mat)

        def update(t, i=i, s=s, b=b, lo=lo, hi=hi, half=half):
            h = ease_out((t - first - gap * i) / grow) * (s + b)
            c = centres[i]
            place(lo, c - half, ky(0), c + half, ky(min(h, s)))
            place(hi, c - half, ky(s), c + half, ky(max(h, s)))

        update(0.0)
        UPDATES.append(update)

    points = [(c, py(u)) for c, u in zip(centres, util)]
    line_mat = paint("utilisation", INK)
    draw = stroke("utilisation", line_mat, 6)
    dots = [disc(f"dot {i}", x, y, 10, line_mat) for i, (x, y) in enumerate(points)]

    def line(t):
        u = (t - first - grow) / gap
        draw(partial(points, u) if u >= 0 else [])
        for i, dot in enumerate(dots):
            dot.hide_render = u < i

    line(0.0)
    UPDATES.append(line)

    done = first + grow + gap * (len(months) - 1)
    callout = paint("callout", INK, start=done + 0.4, length=0.5)
    cx = (centres[4] + centres[7]) / 2
    lines = [
        text(
            f"Servers cover {base['share_of_heat_covered_pct']}%",
            cx,
            590,
            callout,
            align="CENTER",
            bold=True,
        ),
        text("of the heat the house needs", cx, 522, callout, align="CENTER"),
    ]
    backing(lines, done + 0.4, pad=16)


# Chart 2: break-even price


def chart_breakeven(data):
    base = data.summary["base_case"]
    n = base["servers_per_house"]
    row = next(r for r in data.per_house if int(r["servers_per_house"]) == n)
    hours = float(row["server_hours_sold"])
    electricity = float(row["electricity_cost_chf"]) / hours
    credit = float(row["value_of_heat_used_chf"]) / hours
    price = float(row["computing_income_chf"]) / hours
    even = float(row["break_even_chf_per_server_hour"])
    if (
        abs(electricity - credit - even) > 0.0006
        or even != base["break_even_chf_per_server_hour"]
    ):
        sys.exit("charts.py: break-even does not match electricity less heat credit")
    compute = next(
        r for r in data.sensitivity if r["input"].startswith("Compute price")
    )
    values, step = ticks(max(float(compute["high_case"]), price), 3)
    top = values[-1]

    header("Break-even price", f"CHF per server-hour, one house with {n} servers")
    x0, x1, y0, y1 = 230, 1760, 170, 700

    def X(v):
        return x0 + v / top * (x1 - x0)

    def Y(v):
        return y0 + v / top * (y1 - y0)

    axis = paint("axis", INK, start=0.2)
    grid = paint("grid", SLATE, start=0.2)
    for i, v in enumerate(values):
        label = tick_text(v, step)
        if i:
            rect(f"grid {i}", x0, Y(v) - 1, x1, Y(v) + 1, grid, z=0.005)
        text(label, x0 - 22, Y(v) - LABEL * CAP / 2, axis, align="RIGHT")
        text(label, X(v), y0 - 62, axis, align="CENTER")
        rect(f"tick {i}", X(v) - 1.5, y0 - 14, X(v) + 1.5, y0, axis, z=0.02)
    rect("baseline", x0, y0 - 1.5, x1, y0 + 1.5, axis, z=0.02)
    caption = paint("caption", INK, start=0.2)
    text(
        "Compute price, CHF per server-hour", (x0 + x1) / 2, 32, caption, align="CENTER"
    )

    # Electricity per server-hour, drawn left to right.
    power = stroke("electricity", paint("electricity", GLACIER), 6, z=0.031)
    UPDATES.append(
        lambda t: power(
            [
                (x0, Y(electricity)),
                (x0 + (x1 - x0) * ease((t - 0.8) / 1.0), Y(electricity)),
            ]
            if t > 0.8
            else []
        )
    )
    power_label = paint("electricity label", INK, start=1.4)
    text(
        f"Electricity {electricity:.3f} CHF", x0 + 20, Y(electricity) + 20, power_label
    )

    # The heat credit pulls the cost down to the break-even line.
    band = rect("credit", 0, 0, 0, 0, paint("credit", EMBER), z=0.02)
    cost = stroke("cost", paint("cost", INK), 6, z=0.032)

    def lower(t):
        bottom = electricity - credit * ease_out((t - 2.2) / 0.8)
        place(band, x0, Y(electricity), x1, Y(bottom))
        cost([(x0, Y(bottom)), (x1, Y(bottom))] if t > 2.2 else [])

    lower(0.0)
    UPDATES.append(lower)
    on_band = paint("credit label", PAPER, start=2.7, ground=EMBER)
    mid = (Y(electricity) + Y(even)) / 2 - LABEL * CAP / 2
    text(f"Heat credit {credit:.3f} CHF", X(electricity) + 36, mid, on_band, z=0.06)

    # Compute price: what a server-hour sells for, on the same scale.
    sell = stroke("price", paint("price", MINT), 6, z=0.033)
    start, length = 3.4, 1.6
    UPDATES.append(
        lambda t: sell(
            [
                (x0, Y(0)),
                (
                    X(top * ease((t - start) / length)),
                    Y(top * ease((t - start) / length)),
                ),
            ]
            if t > start
            else []
        )
    )
    price_label = paint("price label", INK, start=start + length - 0.2)
    price_text = text("Compute price", x1 - 90, y1 - 10, price_label, align="RIGHT")
    backing([price_text], start + length - 0.2)

    # Break-even, where price meets cost.
    reach = start + length * 0.5  # rough time the price line reaches the dot
    for u in range(200):
        if ease(u / 200) >= even / top:
            reach = start + length * u / 200
            break
    dot = disc("break-even", X(even), Y(even), 18, paint("dot", AMBER), z=0.05)
    ring = disc("break-even ring", X(even), Y(even), 24, paint("ring", INK), z=0.045)

    def pop(t):
        f = clamp01((t - reach) / 0.35)
        s = 1 + 0.35 * math.sin(math.pi * f) if f < 1 else 1
        for obj, r in ((dot, 18), (ring, 24)):
            obj.hide_render = t < reach
            obj.scale = (r * s * PX, r * s * PX, 1)

    pop(0.0)
    UPDATES.append(pop)
    even_label = paint("break-even label", INK, start=reach + 0.2)
    text(
        f"Break-even {even:.3f} CHF", X(even) + 44, Y(even) - 78, even_label, bold=True
    )

    # Margin at the assumed price.
    margin = rect("margin", 0, 0, 0, 0, paint("margin", MINT), z=0.04)
    grow_at = start + length + 0.5

    def rise(t):
        h = ease_out((t - grow_at) / 0.6) * (price - even)
        place(margin, X(price) - 5, Y(even), X(price) + 5, Y(even + h))

    rise(0.0)
    UPDATES.append(rise)
    margin_label = paint("margin label", INK, start=grow_at + 0.4)
    gap_mid = (Y(electricity) + Y(price)) / 2 - LABEL * CAP / 2
    text(
        f"Margin {price - even:.2f} CHF",
        X(price) + 30,
        gap_mid,
        margin_label,
        bold=True,
    )


# Chart 3: what moves the result


def chart_sensitivity(data):
    base = data.summary["hardware"]["mid"]["net_chf_after_hardware"]
    rows = sorted(
        data.sensitivity,
        key=lambda r: abs(float(r["high_chf"]) - float(r["low_chf"])),
        reverse=True,
    )
    header(
        "What moves the result",
        f"Yearly result per house after hardware, CHF. Mid case {number(base)}",
    )
    every = [float(r[k]) for r in rows for k in ("low_chf", "high_chf")]
    values, step = span_ticks(min(every + [0.0]), max(every + [0.0]), 4)
    x0, x1, axis_y = 300, 1700, 140

    def X(v):
        return x0 + (v - values[0]) / (values[-1] - values[0]) * (x1 - x0)

    axis = paint("axis", INK, start=0.2)
    for i, v in enumerate(values):
        text(
            tick_text(v, step),
            X(v),
            axis_y - 62,
            axis,
            align="CENTER",
        )
        rect(f"tick {i}", X(v) - 1.5, axis_y - 14, X(v) + 1.5, axis_y, axis, z=0.02)
    rect("axis", x0, axis_y - 1.5, x1, axis_y + 1.5, axis, z=0.02)

    worse = paint("lower", GLACIER)
    better = paint("higher", MINT)
    zero = paint("zero", SLATE, start=0.2)
    # One line of text over each bar; seven rows fit between the subtitle and the axis.
    pitch, first_baseline, half = 104, 830, 15
    for i, r in enumerate(rows):
        start = 0.8 + 0.4 * i
        baseline = first_baseline - pitch * i
        mid = baseline - 36
        bar0, bar1 = mid - half, mid + half
        words = paint(f"row {i}", INK, start=start)
        name = text(r["input"], MARGIN, baseline, words)
        if r["input"].startswith("Electricity price"):
            # The range of municipal tariffs comes from a newspaper, not ElCom.
            text("(range as reported by Blick)", extent(name)[2] + 22, baseline, words)
        rect(f"zero {i}", X(0) - 1.5, bar0 - 8, X(0) + 1.5, bar1 + 8, zero, z=0.025)
        rect(f"base {i}", X(base) - 2, bar0 - 8, X(base) + 2, bar1 + 8, words, z=0.03)
        lo = min(float(r["low_chf"]), float(r["high_chf"]))
        hi = max(float(r["low_chf"]), float(r["high_chf"]))
        left = rect(f"lower {i}", 0, 0, 0, 0, worse)
        right = rect(f"higher {i}", 0, 0, 0, 0, better)

        def update(
            t, start=start, lo=lo, hi=hi, left=left, right=right, b=(bar0, bar1)
        ):
            f = ease_out((t - start - 0.2) / 0.8)
            place(left, X(base + (min(lo, base) - base) * f), b[0], X(base), b[1])
            place(right, X(base), b[0], X(base + (max(hi, base) - base) * f), b[1])

        update(0.0)
        UPDATES.append(update)
        figures = paint(f"figures {i}", INK, start=start + 0.9)
        middle = mid - LABEL * CAP / 2
        for label in (
            text(number(lo), X(min(lo, base)) - 16, middle, figures, align="RIGHT"),
            text(number(hi), X(max(hi, base)) + 16, middle, figures),
        ):
            box = extent(label)
            if box[0] - 6 < X(0) < box[2] + 6:
                # Keep the zero mark out of a figure that sits across it.
                backing([label], start + 0.9, pad=6).location.z = 0.027


# Chart 4: paying back the hardware


def chart_payback(data):
    n = data.summary["base_case"]["servers_per_house"]
    cases = {r["case"]: r for r in data.hardware}
    colours = {"low": MINT, "mid": EMBER, "high": GLACIER}
    curves = {}
    for name, r in cases.items():
        capex, upkeep = float(r["capex_chf"]), float(r["upkeep_chf_per_year"])
        rate, life = float(r["discount_rate"]), float(r["lifetime_years"])
        cash = float(r["net_chf_before_hardware"]) - upkeep

        def cumulative(y, capex=capex, cash=cash, rate=rate):
            """Discounted cash after y years, less what was paid up front."""
            return -capex + cash * (1 - (1 + rate) ** -y) / rate

        if abs(cumulative(life) - float(r["npv_chf"])) > 2:
            sys.exit(f"charts.py: the {name} curve does not end at its NPV")
        payback = float(r["payback_years"]) if r["payback_years"] else None
        if payback and payback <= life and abs(cumulative(payback)) > cash * 0.06:
            sys.exit(f"charts.py: the {name} curve does not cross zero at payback")
        curves[name] = (cumulative, life, r)

    header(
        "Paying back the hardware",
        f"Discounted cash per house with {n} servers, CHF, over each case's lifetime",
    )
    longest = max(life for _, life, _ in curves.values())
    lows = [-float(r["capex_chf"]) for r in cases.values()]
    highs = [float(r["npv_chf"]) for r in cases.values()]
    yv, _ = span_ticks(min(lows), max(highs + [0.0]), 4)
    years = list(range(math.ceil(longest) + 1))
    x0, x1, y0, y1 = 300, 1260, 170, 770

    def X(v):
        return x0 + v / years[-1] * (x1 - x0)

    def Y(v):
        return y0 + (v - yv[0]) / (yv[-1] - yv[0]) * (y1 - y0)

    axis = paint("axis", INK, start=0.2)
    grid = paint("grid", SLATE, start=0.2)
    for i, v in enumerate(yv):
        if v != 0:
            rect(f"grid {i}", x0, Y(v) - 1, x1, Y(v) + 1, grid, z=0.005)
        text(number(v), x0 - 22, Y(v) - LABEL * CAP / 2, axis, align="RIGHT")
    for i, v in enumerate(years):
        text(str(v), X(v), y0 - 62, axis, align="CENTER")
        rect(f"tick {i}", X(v) - 1.5, y0 - 14, X(v) + 1.5, y0, axis, z=0.02)
    rect("bottom", x0, y0 - 1.5, x1, y0 + 1.5, axis, z=0.02)
    rect("zero", x0, Y(0) - 2, x1, Y(0) + 2, axis, z=0.02)
    text("Years", (x0 + x1) / 2, 40, axis, align="CENTER")

    first, length = 1.0, 4.0

    def year_at(t):
        return years[-1] * ease((t - first) / length)

    def time_of(year):
        for u in range(401):
            if year_at(first + length * u / 400) >= year:
                return first + length * u / 400
        return first + length

    for name, (cumulative, life, r) in curves.items():
        mat = paint(f"line {name}", colours[name])
        draw = stroke(f"line {name}", mat, 8 if name == "mid" else 6)
        points = [
            (X(life * k / 120), Y(cumulative(life * k / 120))) for k in range(121)
        ]

        def update(t, draw=draw, points=points, life=life):
            reach = year_at(t)
            draw(partial(points, min(reach, life) / life * 120) if reach > 0 else [])

        update(0.0)
        UPDATES.append(update)
        done = time_of(life)
        end = disc(f"end {name}", *points[-1], 9, mat)
        UPDATES.append(
            lambda t, end=end, done=done: setattr(end, "hide_render", t < done)
        )
        end.hide_render = True
        label = paint(f"label {name}", INK, start=done)
        years_text = f"{r['lifetime_years']} years"
        end_text = text(
            f"{name.capitalize()}, {years_text}: {number(float(r['npv_chf']))}",
            points[-1][0] + 24,
            points[-1][1] - LABEL * CAP / 2,
            label,
        )
        backing([end_text], done, pad=6)

    cumulative, life, r = curves["mid"]
    payback = float(r["payback_years"])
    when = time_of(payback)
    dot = disc("payback", X(payback), Y(0), 18, paint("dot", AMBER), z=0.05)
    ring = disc("payback ring", X(payback), Y(0), 24, paint("ring", INK), z=0.045)

    def pop(t):
        f = clamp01((t - when) / 0.35)
        grow = 1 + 0.35 * math.sin(math.pi * f) if f < 1 else 1
        for obj, radius in ((dot, 18), (ring, 24)):
            obj.hide_render = t < when
            obj.scale = (radius * grow * PX, radius * grow * PX, 1)

    pop(0.0)
    UPDATES.append(pop)
    note = paint("payback label", INK, start=when + 0.2)
    top = Y(yv[-1]) - 90
    key = [
        disc(
            "key ring",
            x0 + 54,
            top + LABEL * CAP / 2,
            16,
            paint("key ring", INK, start=when + 0.2),
        ),
        disc(
            "key dot",
            x0 + 54,
            top + LABEL * CAP / 2,
            11,
            paint("key dot", AMBER, start=when + 0.2),
        ),
    ]
    key[1].location.z = 0.05
    text("Mid case pays back", x0 + 88, top, note, bold=True)
    text(f"in {r['payback_years']} years", x0 + 88, top - 66, note, bold=True)


CHARTS = {
    "month": (chart_month, 9.0),
    "breakeven": (chart_breakeven, 8.0),
    "sensitivity": (chart_sensitivity, 8.0),
    "payback": (chart_payback, 8.0),
}


# Scene, camera and render settings


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    UPDATES.clear()
    TEXTS.clear()
    PAPER_MAT.clear()
    STARTS.clear()
    for weight, path in FONT_FILES.items():
        if Path(path).exists():
            FONTS[weight] = bpy.data.fonts.load(path)
    scene = bpy.context.scene

    cam_data = bpy.data.cameras.new("camera")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = WIDTH * PX
    cam = link(bpy.data.objects.new("camera", cam_data))
    cam.location = (WIDTH / 2 * PX, HEIGHT / 2 * PX, 10)
    scene.camera = cam

    PAPER_MAT[:] = [paint("paper", PAPER)]
    rect("paper", -20, -20, WIDTH + 20, HEIGHT + 20, PAPER_MAT[0], z=0.0)
    world = bpy.data.worlds.new("paper")
    world.color = lin(PAPER)[:3]
    scene.world = world

    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "FLAT"
    shading.color_type = "MATERIAL"
    shading.show_shadows = False
    shading.show_cavity = False
    shading.show_object_outline = False
    shading.show_specular_highlight = False
    scene.display.render_aa = "16"
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.fps = FPS
    scene.render.film_transparent = False
    scene.render.dither_intensity = 0.0
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    return scene


def check_layout(name):
    """Warn about text that overlaps other text or leaves the frame."""
    boxes = [(obj.data.body, extent(obj)) for obj in TEXTS if not obj.hide_render]
    for i, (body, (ax0, ay0, ax1, ay1)) in enumerate(boxes):
        if ax0 < 0 or ay0 < 0 or ax1 > WIDTH or ay1 > HEIGHT:
            print(f"{name}: '{body}' leaves the frame")
        for other, (bx0, by0, bx1, by1) in boxes[i + 1 :]:
            if ax0 < bx1 + 4 and bx0 < ax1 + 4 and ay0 < by1 + 4 and by0 < ay1 + 4:
                print(f"{name}: '{body}' overlaps '{other}'")


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(prog="charts.py")
    parser.add_argument("--chart", required=True, choices=sorted(CHARTS))
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--data", type=Path, default=DATA)
    parser.add_argument("--only", default="")
    parser.add_argument("--mp4", type=Path)
    parser.add_argument("--still", type=Path)
    args = parser.parse_args(argv)

    build, seconds = CHARTS[args.chart]
    scene = reset()
    build(load(args.data))
    count = round(seconds * FPS)
    frames = range(1, count + 1)
    if args.only == "last":
        frames = [count]
    elif args.only:
        frames = [int(f) for f in args.only.split(",")]

    args.out.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    for frame in frames:
        t = (frame - 1) / FPS
        for update in UPDATES:
            update(t)
        if frame == count:
            check_layout(args.chart)
        scene.render.filepath = str((args.out / f"{frame:04d}.png").resolve())
        bpy.ops.render.render(write_still=True)
    elapsed = time.monotonic() - started
    print(f"charts: rendered {len(frames)} frames of {args.chart} in {elapsed:.0f} s")
    if args.still:
        shutil.copyfile(args.out / f"{count:04d}.png", args.still)
    if args.mp4:
        encode(args.out, count, args.mp4)


def encode(frames, count, video):
    """H.264 at CRF 20, tagged BT.709 so players show the palette as rendered."""
    options = [
        "-vf",
        "scale=out_color_matrix=bt709:out_range=tv",
        "-c:v",
        "libx264",
        "-crf",
        "20",
        "-preset",
        "slow",
        "-pix_fmt",
        "yuv420p",
        "-colorspace",
        "bt709",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-movflags",
        "+faststart",
    ]
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS)]
        + ["-i", str(frames / "%04d.png"), "-frames:v", str(count)]
        + options
        + [str(video)],
        check=True,
    )


if __name__ == "__main__":
    main()
