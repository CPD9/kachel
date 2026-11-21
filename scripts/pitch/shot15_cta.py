"""15-cta (10 s): the ask, read from the "Ask:" line of docs/pitch/slides.md, then the end
card: the name, the line from the README and the team from its "## Team" section."""

import re

from style import *  # noqa: F403

SECONDS = 10.0
SLIDES = (REPO / "docs/pitch/slides.md").read_text()
README = (REPO / "README.md").read_text()
ASK = re.search(r"\*\*Ask:\*\*\s*(.+)", SLIDES).group(1).strip().rstrip(".")
ITEMS = [x.strip() for x in re.split(r",\s*(?:and\s+)?", ASK) if x.strip()]
NAME = re.search(r"^# (.+)$", README, re.M).group(1).strip()
TAGLINE = re.search(r"^# .+\n+(.+)$", README, re.M).group(1).strip()
TEAM = [
    re.sub(r"\s*\(.*\)$", "", m).strip()
    for m in re.findall(r"^- (.+)$", README.split("## Team", 1)[1].split("\n## ", 1)[0], re.M)
]
ICON = [EMBER, AMBER, MINT, GLACIER]


def frame(i):
    t = i / FPS + 0.3
    img = canvas()
    out = seg(t, 5.2, 5.6)
    if t < 5.6:
        rise_text(img, (140, 200), "Our ask", 80, seg(t, 0, 0.6), "black", PAPER, out=out)
        for k, item in enumerate(ITEMS):
            t0 = 0.6 + 0.9 * k
            y = 380 + 150 * k
            a = ease_back(seg(t, t0, t0 + 0.4)) * (1 - out)
            if a > 0:
                r = 26 * min(a, 1.1)
                rect(img, (170 - r, y - 22 - r, 170 + r, y - 22 + r), ICON[k % 4], min(a, 1), radius=r)
                draw_text(img, (170, y - 6), str(k + 1), 36, "black", INK, min(a, 1), "ms")
            rise_text(
                img,
                (230, y),
                item[0].upper() + item[1:],
                64,
                seg(t, t0 + 0.1, t0 + 0.7),
                "bold",
                PAPER,
                stagger=0.04,
                out=out,
            )
        source_line(img, 'From docs/pitch/slides.md, "Ask:"', alpha=ease_out(seg(t, 0.5, 1.0)) * (1 - out))
        return finish(zoom_frame(img, lerp(1.0, 1.03, t / 5.6), 140, 400))
    u = t - 5.6
    slot_text(img, (W / 2, 470), NAME.upper(), 220, seg(u, 0, 0.9), 0, tracking=26)
    bw = 520 * ease_io(seg(u, 0.4, 1.2))
    rect(img, (W / 2 - bw / 2, 512, W / 2 + bw / 2, 526), EMBER, 1.0)
    rise_text(img, (W / 2, 630), TAGLINE, 64, seg(u, 0.7, 1.5), "serif", PAPER, anchor="ms", stagger=0.06)
    rise_text(
        img,
        (W / 2, 780),
        "  ·  ".join(TEAM).replace("  ", "\u2002"),
        44,
        seg(u, 1.4, 2.4),
        "medium",
        SLATE,
        anchor="ms",
        stagger=0.04,
    )
    return finish(zoom_frame(img, lerp(1.0, 1.04, u / 4.4), W / 2, 520))


if __name__ == "__main__":
    print(ITEMS, NAME, TAGLINE, TEAM)
    render("15-cta", SECONDS, frame)
