"""Stitch video clips into one 1920x1080, 24 fps MP4 with short cross-fades and no audio.

    python3 scripts/video/stitch.py --out ~/.cache/kachel/video/kachel-film.mp4 \
        --sheet ~/.cache/kachel/video/kachel-film-sheet.png a.mp4 b.mp4 ...

Clips are taken in the order given. A clip of another size is scaled to fit and
letterboxed on the paper colour, never stretched; every clip is brought to 24 fps.
The contact sheet holds 12 frames spread evenly over the film.
"""

import argparse
import json
import subprocess
import tempfile
from pathlib import Path

W, H, FPS = 1920, 1080, 24
XFADE = 0.5  # seconds
PAPER = "0xFAF8F5"


def duration(p):
    out = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(p),
        ],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return float(json.loads(out)["format"]["duration"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--sheet")
    ap.add_argument("clips", nargs="+")
    a = ap.parse_args()
    clips = [Path(p).expanduser() for p in a.clips]
    cmd = ["ffmpeg", "-y", "-loglevel", "error"]
    for p in clips:
        cmd += ["-i", str(p)]
    chain = []
    for i in range(len(clips)):
        chain.append(
            f"[{i}:v]scale={W}:{H}:force_original_aspect_ratio=decrease:flags=lanczos,"
            f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color={PAPER},setsar=1,fps={FPS},"
            f"format=yuv420p,settb=AVTB[v{i}]"
        )
    last, t = "[v0]", 0.0
    for i, p in enumerate(clips[:-1]):
        t += duration(p) - XFADE
        chain.append(
            f"{last}[v{i + 1}]xfade=transition=fade:duration={XFADE}:offset={t:.3f}[x{i}]"
        )
        last = f"[x{i}]"
    cmd += ["-filter_complex", ";".join(chain), "-map", last, "-an"]
    cmd += ["-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p"]
    cmd += ["-movflags", "+faststart", a.out]
    subprocess.run(cmd, check=True)
    total = duration(a.out)
    print(" + ".join(p.name for p in clips), f"-> {a.out} ({total:.1f} s)")
    if a.sheet:
        with tempfile.TemporaryDirectory() as tmp:
            for k in range(12):
                subprocess.run(
                    ["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{total * (k + 0.5) / 12:.2f}",
                     "-i", a.out, "-frames:v", "1", "-vf", "scale=480:270", f"{tmp}/{k:02d}.png"],
                    check=True,
                )  # fmt: skip
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", f"{tmp}/%02d.png",
                 "-vf", "tile=4x3", "-frames:v", "1", a.sheet],
                check=True,
            )  # fmt: skip
        print("sheet ->", a.sheet)


if __name__ == "__main__":
    main()
