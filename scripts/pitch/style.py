"""Shared look, data loaders and the frame-to-MP4 pipeline for the 2D pitch shots.

Every shot script draws one frame at a time with Pillow at twice the output size (so lines
and circles come out smooth), and `render` pipes the frames to ffmpeg (H.264, CRF 18,
yuv420p) and writes a six-frame contact sheet next to the shots. Every number a shot shows
comes from the loaders below, read at render time.
"""

import argparse
import csv
import json
import math
import re
import subprocess
import sys
from functools import lru_cache
from multiprocessing import get_context
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

REPO = Path(__file__).resolve().parents[2]
SCHED_OUT = REPO / "services/scheduler/out"
ECON = REPO / "docs/economics/data"
HEAT_ATLAS_DATA = Path.home() / "Projects/heat-atlas/research/data"
OUT = Path.home() / ".cache/kachel/pitch"
WORK = OUT / "work/graphics"

W, H, FPS = 1920, 1080, 24
SAFE_Y = int(H * 0.82)  # the bottom 18 % stays clear for burnt-in captions
SS = 2  # frames are drawn at SS times the output size, then reduced

INK = (0x14, 0x16, 0x1A)
PAPER = (0xFA, 0xF8, 0xF5)
EMBER = (0xFF, 0x5A, 0x1F)
AMBER = (0xFF, 0xB0, 0x20)
GLACIER = (0x1F, 0x6F, 0xEB)
MINT = (0x19, 0xB3, 0x8A)
SLATE = (0x9A, 0xA0, 0xA8)

FONT_DIR = Path("/usr/share/fonts/noto")
WEIGHTS = {
    "black": "NotoSans-Black.ttf",
    "bold": "NotoSans-Bold.ttf",
    "medium": "NotoSans-Medium.ttf",
    "regular": "NotoSans-Regular.ttf",
    "light": "NotoSans-Light.ttf",
    "mono": "NotoSansMono-Bold.ttf",
    "serif": "NotoSerifDisplay-Italic.ttf",
    "serif-light": "NotoSerifDisplay-LightItalic.ttf",
}


# ---------------------------------------------------------------- data


def read_csv(path):
    """Rows of a CSV file as dicts."""
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def read_json(path):
    return json.loads(Path(path).read_text())


def kpis():
    """The Basel reference house over 2025 (make year)."""
    return read_json(SCHED_OUT / "kpis.json")


def bern_kpis():
    """The same house on Bern 2025 weather (make bern-days)."""
    return read_json(SCHED_OUT / "bern/kpis.json")


def summary():
    return read_json(ECON / "summary.json")


def config():
    return read_json(REPO / "services/scheduler/config.json")


def fmt(value, decimals=0):
    """A number with thousands separators and a fixed number of decimals."""
    return f"{value:,.{decimals}f}"


def decimals_of(value):
    """How many decimals a value read from JSON carries (79.6 -> 1, 31075 -> 0)."""
    text = repr(value)
    return len(text.split(".")[1]) if "." in text and "e" not in text else 0


def pitch_fact(pattern):
    """The first match of a regex in the talk track (docs/pitch.md)."""
    text = re.sub(r"\s+", " ", (REPO / "docs/pitch.md").read_text())
    match = re.search(pattern, text)
    if not match:
        sys.exit(f"docs/pitch.md: no match for {pattern!r}")
    return match


def slide_source(number):
    """The reference text for [number] as the slides cite it (docs/pitch/slides.md)."""
    text = (REPO / "docs/pitch/slides.md").read_text()
    match = re.search(rf"\[{number}\] ([^\[<]+)", text)
    if not match:
        sys.exit(f"docs/pitch/slides.md: no source [{number}]")
    return match.group(1).strip().split(". ")[0].rstrip(".")


# ---------------------------------------------------------------- timing


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def lerp(a, b, t):
    return a + (b - a) * t


def seg(t, a, b):
    """Progress of time t through the window [a, b], clamped to 0..1."""
    return clamp((t - a) / (b - a)) if b > a else float(t >= b)


def ease_io(t):
    t = clamp(t)
    return 4 * t * t * t if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def ease_out(t):
    t = clamp(t)
    return 1 - (1 - t) ** 3


def ease_out_expo(t):
    t = clamp(t)
    return 1.0 if t >= 1 else 1 - 2 ** (-10 * t)


def ease_in(t):
    t = clamp(t)
    return t * t * t


def ease_back(t, s=1.6):
    t = clamp(t) - 1
    return t * t * ((s + 1) * t + s) + 1


def mix(c1, c2, t):
    return tuple(int(round(lerp(a, b, clamp(t)))) for a, b in zip(c1, c2, strict=False))


def rgba(c, a=1.0):
    return (*c[:3], int(round(255 * clamp(a))))


# ---------------------------------------------------------------- drawing


@lru_cache(maxsize=256)
def font(size, weight="bold"):
    """A font at `size` output pixels (drawn at SS times that)."""
    return ImageFont.truetype(str(FONT_DIR / WEIGHTS[weight]), int(round(size * SS)))


def s(v):
    """Output pixels to canvas pixels."""
    return v * SS


@lru_cache(maxsize=4)
def background(kind="ink"):
    """INK with a soft lift in the middle, so a flat frame never looks dead."""
    w, h = W // 4, H // 4
    y, x = np.mgrid[0:h, 0:w]
    r = np.hypot((x - w / 2) / (w / 2), (y - h / 2) / (h / 1.6))
    lift = np.clip(1 - r, 0, 1) ** 1.6
    base = np.array(INK, float)
    top = base + np.array([14, 15, 18], float)
    img = base[None, None, :] * (1 - lift[..., None]) + top[None, None, :] * lift[..., None]
    im = Image.fromarray(img.astype(np.uint8), "RGB").resize((W * SS, H * SS), Image.BICUBIC)
    return im.convert("RGBA")


def canvas(kind="ink"):
    """A fresh frame: 'ink' has a soft lift in the middle, 'flat' is plain INK (for overlays)."""
    if kind == "flat":
        return Image.new("RGBA", (W * SS, H * SS), rgba(INK))
    return background(kind).copy()


def finish(img):
    """Canvas to the output frame: reduce SS times, drop alpha."""
    return img.reduce(SS).convert("RGB")


def text_size(text, size, weight="bold", tracking=0.0):
    f = font(size, weight)
    if not tracking:
        box = f.getbbox(text)
        return (box[2] - box[0]) / SS, (box[3] - box[1]) / SS
    w = sum(f.getlength(ch) for ch in text) + s(tracking) * (len(text) - 1)
    box = f.getbbox(text)
    return w / SS, (box[3] - box[1]) / SS


def paste(img, layer, x, y):
    """Alpha-composite a small RGBA layer onto img at canvas pixel (x, y), clipped to img."""
    x, y = int(round(x)), int(round(y))
    x0, y0 = max(0, -x), max(0, -y)
    x1, y1 = min(layer.width, img.width - x), min(layer.height, img.height - y)
    if x1 <= x0 or y1 <= y0:
        return
    img.alpha_composite(layer, (x + x0, y + y0), (x0, y0, x1, y1))


def _glyphs(img, x, y, text, f, fill, anchor):
    x0, y0, x1, y1 = f.getbbox(text, anchor=anchor)
    layer = Image.new("RGBA", (int(x1 - x0) + 4, int(y1 - y0) + 4), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((2 - x0, 2 - y0), text, font=f, fill=fill, anchor=anchor)
    paste(img, layer, x + x0 - 2, y + y0 - 2)


def draw_text(img, xy, text, size, weight="bold", fill=PAPER, alpha=1.0, anchor="ls", tracking=0.0):
    """Text at output coordinates xy. anchor as in Pillow ('ls' left-baseline, 'ms', 'rs', 'mm')."""
    if alpha <= 0 or not text:
        return
    f = font(size, weight)
    x, y = s(xy[0]), s(xy[1])
    if tracking:
        total = sum(f.getlength(ch) for ch in text) + s(tracking) * (len(text) - 1)
        if anchor[0] == "m":
            x -= total / 2
        elif anchor[0] == "r":
            x -= total
        for ch in text:
            if ch != " ":
                _glyphs(img, x, y, ch, f, rgba(fill, alpha), "l" + anchor[1])
            x += f.getlength(ch) + s(tracking)
    else:
        _glyphs(img, x, y, text, f, rgba(fill, alpha), anchor)


def rise_text(img, xy, text, size, t, weight="black", fill=PAPER, anchor="ls", tracking=0.0, stagger=0.08, out=0.0):
    """Kinetic words: each word rises and fades in, staggered; `out` (0..1) lifts them away."""
    words = text.split(" ")
    f = font(size, weight)
    space = f.getlength(" ") / SS
    widths = [text_size(w, size, weight, tracking)[0] if tracking else f.getlength(w) / SS for w in words]
    total = sum(widths) + space * (len(words) - 1)
    x = xy[0] - (total / 2 if anchor[0] == "m" else total if anchor[0] == "r" else 0)
    n = len(words)
    for i, (word, w) in enumerate(zip(words, widths, strict=True)):
        start = i * stagger
        p = ease_out_expo(seg(t, start, start + 0.55)) if n else 1
        q = ease_in(seg(out, i * stagger * 0.5, i * stagger * 0.5 + 0.6))
        dy = (1 - p) * size * 0.55 - q * size * 0.5
        draw_text(
            img, (x, xy[1] + dy), word, size, weight, fill, alpha=p * (1 - q), anchor="l" + anchor[1], tracking=tracking
        )
        x += w + space


def wrap(text, size, weight, max_w):
    """Greedy word wrap to a pixel width."""
    f = font(size, weight)
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if f.getlength(trial) / SS <= max_w or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def rect(img, box, fill, alpha=1.0, radius=0, outline=None, width=0):
    """A (rounded) rectangle in output coordinates, composited with alpha."""
    if alpha <= 0:
        return
    x0, y0, x1, y1 = [s(v) for v in box]
    pad = s(width) + 2
    layer = Image.new("RGBA", (int(x1 - x0 + 2 * pad), int(y1 - y0 + 2 * pad)), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    b = [pad, pad, pad + x1 - x0, pad + y1 - y0]
    kw = dict(
        fill=rgba(fill, alpha) if fill else None, outline=rgba(outline, alpha) if outline else None, width=int(s(width))
    )
    if radius:
        d.rounded_rectangle(b, radius=s(radius), **kw)
    else:
        d.rectangle(b, **kw)
    paste(img, layer, x0 - pad, y0 - pad)


def glow(img, draw_fn, radius=18, strength=1.0, scale=4):
    """Additive glow: draw_fn(draw, k) paints on a black layer at 1/scale of the canvas, with k
    the factor from output pixels to that layer; the layer is blurred and added to img."""
    small = Image.new("RGB", (img.width // scale, img.height // scale), (0, 0, 0))
    d = ImageDraw.Draw(small)
    draw_fn(d, SS / scale)
    small = small.filter(ImageFilter.GaussianBlur(radius * SS / scale))
    big = np.asarray(small.resize(img.size, Image.BILINEAR), dtype=np.float32) * strength
    base = np.asarray(img, dtype=np.float32)
    base[..., :3] = np.minimum(base[..., :3] + big, 255)
    img.paste(Image.fromarray(base.astype(np.uint8), "RGBA"))


def source_line(img, text, alpha=1.0, y=SAFE_Y - 14, x=60, size=22, fill=SLATE):
    """The small source line every numbers shot carries, on a dark backing so it reads over maps."""
    w, _ = text_size(text, size, "regular")
    rect(img, (x - 10, y - size - 4, x + w + 10, y + size * 0.38), INK, 0.72 * alpha, radius=6)
    draw_text(img, (x, y), text, size, "regular", fill, alpha)


def caption_shade(img, strength=0.92):
    """Darken the caption band (bottom 18 %) towards INK, so captions read over a map."""
    h0 = s(SAFE_Y - 40)
    band = np.linspace(0, 1, img.height - int(h0))[:, None] ** 0.5 * strength
    a = np.repeat(band, img.width, 1)
    layer = Image.new("RGBA", (img.width, img.height - int(h0)), rgba(INK))
    layer.putalpha(Image.fromarray((a * 255).astype(np.uint8)))
    img.alpha_composite(layer, (0, int(h0)))


def economics_source(number):
    """(label, text) for item `number` of '## Sources' in docs/economics/README.md: the label
    is the site's domain or the author and year, the text the item without links."""
    text = (REPO / "docs/economics/README.md").read_text().split("## Sources", 1)[1]
    m = re.search(rf"^{number}\. (.+?)(?=^\d+\. |\Z)", text, re.S | re.M)
    if not m:
        sys.exit(f"docs/economics/README.md: no source {number}")
    item = re.sub(r"\s+", " ", m.group(1)).strip()
    urls = re.findall(r"<(https?://[^>]+)>", item)
    body = re.sub(r":?\s*<https?://[^>]+>", "", item).strip().rstrip(".")
    body = re.sub(r"^Context: ", "", body)
    domain = re.sub(r"^www\.", "", urls[0].split("/")[2]) if urls else ""
    return domain, body


def citation_card(img, xy, number, t, width=760):
    """A small paper-snippet card for a research source, flashed for 1-1.5 s (t: 0..1 over
    its life). Text from docs/economics/README.md '## Sources'."""
    if t <= 0 or t >= 1:
        return
    a = ease_out(seg(t, 0, 0.18)) * (1 - ease_in(seg(t, 0.82, 1)))
    domain, body = economics_source(number)
    lines = wrap(body, 30, "serif", width - 60)[:4]
    h = 92 + 42 * len(lines)
    x, y = xy[0], xy[1] + (1 - ease_out(seg(t, 0, 0.25))) * 30
    rect(img, (x + 8, y + 10, x + width + 8, y + h + 10), (0, 0, 0), 0.35 * a, radius=10)
    rect(img, (x, y, x + width, y + h), PAPER, a, radius=10)
    rect(img, (x, y, x + 10, y + h), EMBER, a)
    draw_text(img, (x + 34, y + 50), f"[{number}]  {domain}".upper(), 24, "bold", EMBER, a, tracking=2)
    for k, line in enumerate(lines):
        draw_text(img, (x + 34, y + 96 + 42 * k), line, 30, "serif", INK, a)


def zoom_frame(img, scale, cx=W / 2, cy=H / 2):
    """A slow push-in on the whole frame (scale >= 1), about (cx, cy) in output pixels."""
    if abs(scale - 1) < 1e-4:
        return img
    w, h = img.size
    cxs, cys = s(cx), s(cy)
    a = 1 / scale
    return img.transform((w, h), Image.AFFINE, (a, 0, cxs - a * cxs, 0, a, cys - a * cys), Image.BICUBIC)


# ---------------------------------------------------------------- output


def _frame(args):
    fn, i = args
    return np.asarray(fn(i), dtype=np.uint8).tobytes()


def render(name, seconds, frame_fn, procs=4):
    """Render seconds * FPS frames of frame_fn(i) -> RGB Image, write shots/<name>.mp4 and
    sheets/<name>-sheet.png (six frames, 3 x 2) plus a 480 px wide copy of the sheet."""
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", type=int, default=None, help="render only the first N frames")
    ap.add_argument("--still", type=float, default=None, help="write one frame at this second")
    args, _ = ap.parse_known_args()
    n = int(round(seconds * FPS))
    (OUT / "shots").mkdir(parents=True, exist_ok=True)
    (OUT / "sheets").mkdir(parents=True, exist_ok=True)
    if args.still is not None:
        path = OUT / "sheets" / f"{name}-still.png"
        frame_fn(int(args.still * FPS)).save(path)
        print(path)
        return
    if args.frames:
        n = min(n, args.frames)
    mp4 = OUT / "shots" / f"{name}.mp4"
    cmd = [
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
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(mp4),
    ]
    pick = {int(round(k * (n - 1) / 5)) for k in range(6)}
    stills = {}
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    with get_context("fork").Pool(procs) as pool:
        for i, buf in enumerate(pool.imap(_frame, ((frame_fn, i) for i in range(n)), chunksize=2)):
            ff.stdin.write(buf)
            if i in pick:
                stills[i] = Image.frombytes("RGB", (W, H), buf)
            if i % 48 == 0:
                print(f"{name}: frame {i}/{n}", flush=True)
    ff.stdin.close()
    if ff.wait():
        sys.exit(f"ffmpeg failed for {name}")
    contact_sheet(name, stills)
    print(mp4)


def contact_sheet(name, stills):
    tw, th = 640, 360
    sheet = Image.new("RGB", (tw * 3, (th + 34) * 2), PAPER)
    d = ImageDraw.Draw(sheet)
    f = ImageFont.truetype(str(FONT_DIR / WEIGHTS["medium"]), 22)
    for k, i in enumerate(sorted(stills)):
        x, y = (k % 3) * tw, (k // 3) * (th + 34)
        sheet.paste(stills[i].resize((tw, th), Image.LANCZOS), (x, y))
        d.text((x + 8, y + th + 4), f"{name}  {i / FPS:5.2f} s", font=f, fill=INK)
    path = OUT / "sheets" / f"{name}-sheet.png"
    sheet.save(path)
    # the phone and back-of-the-hall check: each frame at 480 px wide
    small = Image.new("RGB", (480 * 3, 270 * 2), PAPER)
    for k, i in enumerate(sorted(stills)):
        small.paste(stills[i].resize((480, 270), Image.LANCZOS), ((k % 3) * 480, (k // 3) * 270))
    small.save(OUT / "sheets" / f"{name}-sheet-480.png")
    print(path)


def ease_hold(t, keys):
    """Piecewise eased interpolation of a value through keyframes [(time, value), ...]."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys[:-1], keys[1:], strict=False):
        if t <= t1:
            return lerp(v0, v1, ease_io(seg(t, t0, t1)))
    return keys[-1][1]


def slot_text(img, xy, text, size, t_in, t_out=0.0, weight="black", fill=PAPER, tracking=0.0, stagger=0.07, anchor="m"):
    """Letters that rise into a slot and leave upwards through it, clipped to the slot, so
    the word appears from nowhere. xy is the baseline point; anchor 'l', 'm' or 'r'."""
    f = font(size, weight)
    asc, desc = f.getmetrics()
    widths = [f.getlength(ch) for ch in text]
    total = sum(widths) + s(tracking) * (len(text) - 1)
    x0 = s(xy[0]) - (total / 2 if anchor == "m" else total if anchor == "r" else 0)
    top, bot = s(xy[1]) - asc, s(xy[1]) + desc
    slot = Image.new("RGBA", (int(total) + 8, int(bot - top) + 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(slot)
    x = 4
    n = max(len(text) - 1, 1)
    for k, ch in enumerate(text):
        p = ease_out_expo(seg(t_in, k / n * stagger * n, k / n * stagger * n + 0.55)) if t_in < 9 else 1
        q = ease_in(seg(t_out, k / n * stagger * n * 0.6, k / n * stagger * n * 0.6 + 0.4))
        dy = (1 - p) * (bot - top) - q * (bot - top)
        d.text((x, 4 + asc + dy), ch, font=f, fill=rgba(fill), anchor="ls")
        x += widths[k] + s(tracking)
    paste(img, slot, x0 - 4, top - 4)
    return total / SS


def clip_frames(src, seconds, width=1536):
    """Frames of an existing MP4, retimed to play in 65 % of `seconds` (the card then holds
    the last frame) and scaled to `width`, extracted once into the work folder."""
    src = Path(src)
    out = WORK / f"clip_{src.stem}_{seconds:g}s_{width}_v2"
    frames = sorted(out.glob("*.png"))
    if frames:
        return frames
    out.mkdir(parents=True, exist_ok=True)
    dur = float(
        subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(src)],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    )
    k = dur / (seconds * 0.65)
    subprocess.run(
        [
            "ffmpeg",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(src),
            "-vf",
            f"setpts=PTS/{k},fps={FPS},scale={width}:-2:flags=lanczos",
            str(out / "%04d.png"),
        ],
        check=True,
    )
    return sorted(out.glob("*.png"))


def card_clip(img, frames, t, seconds, top=30):
    """A chart clip as a rounded card in the upper 82 % of the frame, pushing in slowly."""
    k = min(int(t * FPS), len(frames) - 1)
    f = Image.open(frames[k]).convert("RGBA")
    scale = lerp(1.0, 1.03, t / seconds) * (SAFE_Y - top - 90) / f.height
    f = f.resize((int(f.width * scale * SS), int(f.height * scale * SS)), Image.BICUBIC)
    mask = Image.new("L", f.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, f.width - 1, f.height - 1], radius=s(18), fill=255)
    a = ease_out(seg(t, 0, 0.25))
    f.putalpha(mask.point(lambda v: int(v * a)))
    x = (img.width - f.width) / 2
    y = s(top) + (1 - ease_out(seg(t, 0, 0.3))) * s(40)
    paste(img, f, x, y)


__all__ = [n for n in dir() if not n.startswith("_")] + ["math"]
