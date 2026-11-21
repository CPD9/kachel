"""Encode a rendered pitch shot: optional credit line, H.264 MP4 and a contact sheet.

    uv run --no-project --with pillow python scripts/video/encode_shot.py \\
        --frames DIR --mp4 OUT.mp4 --sheet OUT.png [--credit "..."]

Frames are taken in name order at 24 fps and scaled to 1920x1080. The contact sheet holds
the first, middle and last frame.
"""

import argparse
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import compose as c

SWISSTOPO = (
    "Buildings: swissBUILDINGS3D 3.0 (2024 ed.), \u00a9 swisstopo. "
    "Terrain and river outline approximated."
)


def credit(img, text):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f = c.F["small"].font_variant(size=17)
    tw = d.textlength(text, font=f)
    d.rounded_rectangle(
        (c.W - tw - 52, c.H - 52, c.W - 16, c.H - 14), 6, fill=(16, 19, 24, 190)
    )
    d.text((c.W - tw - 34, c.H - 44), text, font=f, fill=(190, 190, 186))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", required=True, nargs="+", help="one or more frame dirs")
    ap.add_argument(
        "--xfade", type=int, default=12, help="frames of cross-fade between dirs"
    )
    ap.add_argument("--mp4", required=True)
    ap.add_argument("--sheet", required=True)
    ap.add_argument("--credit", default="")
    a = ap.parse_args()
    parts = [sorted(Path(d).glob("*.png")) for d in a.frames]
    text = SWISSTOPO if a.credit == "swisstopo" else a.credit
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{c.W}x{c.H}", "-r", str(c.FPS), "-i", "-", "-c:v", "libx264",
         "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
         a.mp4],
        stdin=subprocess.PIPE,
    )  # fmt: skip
    total = sum(len(p) for p in parts) - a.xfade * (len(parts) - 1)
    picks = {0, total // 2, total - 1}
    sheet, n = [], 0

    def load(f):
        return Image.open(f).convert("RGB").resize((c.W, c.H), Image.LANCZOS)

    for k, files in enumerate(parts):
        for i, f in enumerate(files):
            if k and i < a.xfade:
                continue  # already blended into the tail of the part before
            img = load(f)
            if k + 1 < len(parts) and i >= len(files) - a.xfade:
                j = i - (len(files) - a.xfade)
                img = Image.blend(img, load(parts[k + 1][j]), (j + 1) / (a.xfade + 1))
            if text:
                img = credit(img, text)
            ff.stdin.write(img.tobytes())
            if n in picks:
                sheet.append(img.resize((640, 360), Image.LANCZOS))
            n += 1
    ff.stdin.close()
    ff.wait()
    s = Image.new("RGB", (640 * len(sheet), 360))
    for i, im in enumerate(sheet):
        s.paste(im, (640 * i, 0))
    s.save(a.sheet)
    print(f"{n} frames, {n / c.FPS:.1f} s -> {a.mp4}")


if __name__ == "__main__":
    main()
