"""13-product (15 s): the product as it runs today. The host app and the console in a browser
frame, the live pause (a real job paused by the agent), the economics report and the
assumptions scrolling as pages, then the model paper's pages.

Pluggable: --landing PATH (an MP4 of the landing page) opens the shot in the browser frame,
and --paper DIR (page PNGs) feeds the last segment; without them the shot is built from the
screenshots in docs/media and the docs pages only.
"""

import argparse
from pathlib import Path

from PIL import Image

import md_page
from style import *  # noqa: F403

ap = argparse.ArgumentParser()
ap.add_argument("--landing", default=None)
ap.add_argument("--paper", default=str(OUT / "paper-pages"))
ARGS, _ = ap.parse_known_args()

MEDIA = REPO / "docs/media"
HOST = Image.open(MEDIA / "app-host.png").convert("RGB")
CONSOLE = Image.open(MEDIA / "app-console.png").convert("RGB")
LIVE = [Image.open(MEDIA / f"live-{k}.webp").convert("RGB") for k in ("running", "paused")]
# the live view down to the server list (the panel below names a model, which stays off screen)
LIVE = [im.crop((0, 0, im.width, int(im.height * 0.78))) for im in LIVE]
ECON = md_page.render(REPO / "docs/economics/README.md")
ASSUME = md_page.render(REPO / "docs/assumptions.md")
PAPER_PAGES = sorted(Path(ARGS.paper).expanduser().glob("*.png")) if ARGS.paper else []
LANDING = clip_frames(ARGS.landing, 4.0 / 0.65, width=1600) if ARGS.landing and Path(ARGS.landing).exists() else []

SEGMENTS = (
    ([("landing", 4.0)] if LANDING else [])
    + [("host", 2.6), ("console", 2.2), ("live", 2.6), ("report", 3.6)]
    + ([("paper", 4.0)] if PAPER_PAGES else [("assume", 4.0)])
)
SECONDS = sum(d for _, d in SEGMENTS)
TITLES = {
    "landing": "The landing page",
    "host": "The host app: the house, its heat, its servers",
    "console": "The console: buyers submit jobs",
    "live": "Live: the agent pauses a real job",
    "report": "Every number, with its source",
    "assume": "Every assumption, with its unit",
    "paper": "The model, written up",
}
WIN = (110, 150, 1810, 840)  # browser window, output pixels, above the caption band


def window(img, shot, scroll, a=1.0, box=WIN, url="localhost"):
    """A plain browser window with `shot` (PIL RGB) filling its width, scrolled by `scroll`
    (0..1 of the overflow)."""
    x0, y0, x1, y1 = box
    rect(img, (x0 + 10, y0 + 14, x1 + 10, y1 + 14), (0, 0, 0), 0.4 * a, radius=18)
    rect(img, (x0, y0, x1, y1), (0x24, 0x27, 0x2D), a, radius=18)
    for k, c in enumerate((EMBER, AMBER, MINT)):
        rect(img, (x0 + 24 + 30 * k, y0 + 18, x0 + 40 + 30 * k, y0 + 34), c, a, radius=8)
    rect(img, (x0 + 140, y0 + 12, x0 + 640, y0 + 40), (0x33, 0x37, 0x3E), a, radius=14)
    draw_text(img, (x0 + 160, y0 + 34), url, 20, "regular", SLATE, a)
    sw, sh = int(s(x1 - x0 - 16)), int(s(y1 - y0 - 60))
    k = sw / shot.width
    view_h = sh / k
    top = max(0.0, (shot.height - view_h) * clamp(scroll))
    crop = shot.crop((0, int(top), shot.width, int(top + min(view_h, shot.height))))
    crop = crop.resize((sw, int(crop.height * k)), Image.BILINEAR).convert("RGBA")
    if a < 1:
        crop.putalpha(int(255 * a))
    paste(img, crop, s(x0 + 8), s(y0 + 52))


def title(img, key, u, d):
    out = seg(u, d - 0.2, d) if key != SEGMENTS[-1][0] else 0
    rise_text(img, (110, 112), TITLES[key], 52, seg(u, 0, 0.5), "black", PAPER, out=out, stagger=0.04)


def frame(i):
    t = i / FPS
    acc = 0.0
    for key, d in SEGMENTS:
        if t < acc + d or key == SEGMENTS[-1][0]:
            break
        acc += d
    u = t - acc + (0.35 if acc == 0 else 0)  # open already in motion
    img = canvas()
    a = ease_out(seg(u, 0, 0.3))
    if key == "landing":
        f = Image.open(LANDING[min(int(u * FPS), len(LANDING) - 1)]).convert("RGB")
        window(img, f, 0, a, url="localhost:5175")
    elif key == "host":
        window(img, HOST, ease_io(seg(u, 0.2, d)) * 0.55, a, url="localhost:5173")
    elif key == "console":
        window(img, CONSOLE, ease_io(seg(u, 0.2, d)), a, url="localhost:5174")
    elif key == "live":
        p = ease_io(seg(u, 1.1, 1.5))
        box = (360, 150, 1560, 990 - 150)
        window(img, LIVE[0], 0.35, a, box=box, url="localhost:5173")
        if p > 0:
            window(img, LIVE[1], 0.35, p, box=box, url="localhost:5173")
        pa = ease_out(seg(u, 1.3, 1.7))
        if pa > 0:  # ring the row that changed
            rect(img, (385, 514, 1535, 570), None, pa, radius=12, outline=EMBER, width=4)
    elif key in ("report", "assume"):
        page = ECON if key == "report" else ASSUME
        window(
            img,
            page,
            ease_io(seg(u, 0.1, d)) * 0.45,
            a,
            url="docs/economics/README.md" if key == "report" else "docs/assumptions.md",
        )
    elif key == "paper":
        paper(img, u, d)
    title(img, key, u, d)
    src = {
        "host": "Screenshot: docs/media/app-host.png, local stack with synthetic seed data",
        "console": "Screenshot: docs/media/app-console.png, local stack with synthetic seed data",
        "live": "Stills: docs/media/live-running.webp, live-paused.webp (agent run on a real embedding job)",
        "report": "docs/economics/README.md, rendered from the repo",
        "assume": "docs/assumptions.md, rendered from the repo",
        "paper": f"Model paper, {len(PAPER_PAGES)} pages",
        "landing": "Landing page",
    }[key]
    source_line(img, src, alpha=a)
    return finish(zoom_frame(img, lerp(1.0, 1.025, u / d)))


def paper(img, u, d):
    """The paper's pages as a row of sheets gliding left, the first ones larger."""
    n = len(PAPER_PAGES)
    ph = 640
    pw = int(ph * 1600 / 2265)
    gap = 40
    shift = ease_io(seg(u, 0.2, d)) * (n * (pw + gap) - (W - 220))
    for k, p in enumerate(PAPER_PAGES):
        x = 110 + k * (pw + gap) - shift
        if x > W or x + pw < 0:
            continue
        y = 190 + (1 - ease_out(seg(u, k * 0.06, k * 0.06 + 0.5))) * 120
        im = _page(p, pw, ph)
        rect(img, (x + 8, y + 12, x + pw + 8, y + ph + 12), (0, 0, 0), 0.4)
        paste(img, im, s(x), s(y))


_cache = {}


def _page(p, pw, ph):
    if p not in _cache:
        _cache[p] = Image.open(p).convert("RGB").resize((int(s(pw)), int(s(ph))), Image.LANCZOS).convert("RGBA")
    return _cache[p]


if __name__ == "__main__":
    render("13-product", SECONDS, frame)
