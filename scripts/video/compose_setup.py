"""Compose segment 2 from its rendered frames: word labels, step caption, encode.

    uv run --no-project --with pillow python scripts/video/compose_setup.py \
        --frames ~/.cache/kachel/video/work/setup \
        --mp4 ~/.cache/kachel/video/02-setup.mp4 \
        --sheet ~/.cache/kachel/video/02-setup-sheet.png

Labels and captions come from labels.json, written by setup.py, so they stay
in step with the keyframes there.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import compose as c

COLOURS = {"ink": c.INK, "hot": c.HOT, "cold": c.COLD}
FADE = 8


def overlay(frame, data):
    layer = Image.new("RGBA", (c.W, c.H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for lb in data["labels"]:
        k = (frame - lb["frame"]) / FADE
        if k < 0:
            continue
        sub = Image.new("RGBA", (c.W, c.H), (0, 0, 0, 0))
        c.label(ImageDraw.Draw(sub), lb["at"], lb["text"], None, COLOURS[lb["colour"]])
        if k < 1:
            sub.putalpha(sub.getchannel("A").point(lambda v, k=k: int(v * k)))
        layer = Image.alpha_composite(layer, sub)
    d = ImageDraw.Draw(layer)
    caption = None
    for _g, f0, _f1, text in data["steps"]:
        if frame >= f0:
            caption = text
    if caption:
        w = d.textlength(caption, font=c.F["date"])
        c.rounded(d, (40, 36, 100 + w, 116), c.PANEL)
        d.text((70, 52), caption, font=c.F["date"], fill=c.INK)
    return layer


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", required=True)
    ap.add_argument("--mp4", required=True)
    ap.add_argument("--sheet", required=True)
    a = ap.parse_args()
    fr = Path(a.frames)
    data = json.loads((fr / "labels.json").read_text())
    files = sorted((fr / "frames").glob("*.png"))
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{c.W}x{c.H}", "-r", str(data["fps"]), "-i", "-", "-c:v", "libx264",
         "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
         a.mp4],
        stdin=subprocess.PIPE,
    )  # fmt: skip
    picks = {len(files) // 5, len(files) // 2, len(files) - 1}
    sheet = []
    for i, f in enumerate(files):
        n = int(f.stem)
        img = Image.open(f).convert("RGB").resize((c.W, c.H), Image.LANCZOS)
        img = Image.alpha_composite(img.convert("RGBA"), overlay(n, data)).convert(
            "RGB"
        )
        ff.stdin.write(img.tobytes())
        if i in picks:
            sheet.append(img.resize((640, 360), Image.LANCZOS))
    ff.stdin.close()
    ff.wait()
    s = Image.new("RGB", (640 * len(sheet), 360))
    for i, im in enumerate(sheet):
        s.paste(im, (640 * i, 0))
    s.save(a.sheet)
    print(f"{len(files)} frames, {len(files) / data['fps']:.1f} s -> {a.mp4}")


if __name__ == "__main__":
    main()
