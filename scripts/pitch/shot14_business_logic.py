"""14-business-logic (6 s): the business in one frame. A compute buyer sends AI jobs through
the platform to a server in a home and pays per server-hour (config.json, our assumption);
the server's heat goes to the home (supply out in EMBER, return in GLACIER); the price sits
above the break-even per server-hour (kpis.json). No margin figure: the model has none."""

from PIL import Image, ImageDraw

from style import *  # noqa: F403

SECONDS = 6.0
PRICE = config()["prices"]["compute_chf_per_server_hour"]
BREAK_EVEN = kpis()["break_even_chf_per_server_hour"]

NODES = {"buyer": (250, 380), "server": (960, 380), "home": (1670, 380)}
BOX = (182, 120)


def node(img, key, label, sub, t):
    p = ease_back(seg(t, 0, 0.5))
    if p <= 0:
        return
    x, y = NODES[key]
    w, h = BOX[0] * min(p, 1.05), BOX[1] * min(p, 1.05)
    rect(img, (x - w, y - h, x + w, y + h), (0x22, 0x25, 0x2B), min(p, 1), radius=26, outline=SLATE, width=2)
    a = ease_out(seg(t, 0.25, 0.6))
    lay = Image.new("RGBA", (int(s(160)), int(s(110))), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    k = SS
    if key == "buyer":  # a terminal with a prompt
        d.rounded_rectangle([10 * k, 10 * k, 150 * k, 100 * k], radius=10 * k, outline=rgba(PAPER, a), width=4 * k)
        d.line([(30 * k, 40 * k), (50 * k, 55 * k), (30 * k, 70 * k)], fill=rgba(AMBER, a), width=5 * k)
        d.line([(62 * k, 72 * k), (100 * k, 72 * k)], fill=rgba(AMBER, a), width=5 * k)
    elif key == "server":  # a rack of three units
        for r in range(3):
            d.rounded_rectangle(
                [25 * k, (12 + r * 32) * k, 135 * k, (38 + r * 32) * k],
                radius=5 * k,
                outline=rgba(PAPER, a),
                width=4 * k,
            )
            d.ellipse([110 * k, (21 + r * 32) * k, 120 * k, (31 + r * 32) * k], fill=rgba(EMBER, a))
    else:  # a house
        d.polygon([(80 * k, 8 * k), (148 * k, 52 * k), (12 * k, 52 * k)], outline=rgba(PAPER, a), width=4 * k)
        d.rectangle([28 * k, 52 * k, 132 * k, 104 * k], outline=rgba(PAPER, a), width=4 * k)
        d.rectangle([68 * k, 70 * k, 92 * k, 104 * k], fill=rgba(EMBER, a))
    paste(img, lay, s(x - 80), s(y - 100))
    draw_text(img, (x, y + 50), label, 40, "bold", PAPER, a, "ms")
    draw_text(img, (x, y + 96), sub, 30, "regular", SLATE, a, "ms")


def flow(img, a, b, t, colour, start, label=None, label_y=0, width=5, speed=1.0, size=40, weight="bold", sub=None):
    """An arrow from a to b that draws itself, then carries moving dots."""
    p = ease_io(seg(t, start, start + 0.6))
    if p <= 0:
        return
    (x0, y0), (x1, y1) = a, b
    xe, ye = lerp(x0, x1, p), lerp(y0, y1, p)
    lay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.line([(s(x0), s(y0)), (s(xe), s(ye))], fill=rgba(colour, 0.55), width=int(s(width)))
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L
    if p >= 1:  # head
        hx, hy = x1, y1
        d.polygon(
            [
                (s(hx), s(hy)),
                (s(hx - 22 * ux - 12 * uy), s(hy - 22 * uy + 12 * ux)),
                (s(hx - 22 * ux + 12 * uy), s(hy - 22 * uy - 12 * ux)),
            ],
            fill=rgba(colour),
        )
        for k in range(int(L // 60)):
            q = ((k * 60 + (t - start) * 160 * speed) % L) / L
            px, py = lerp(x0, x1, q), lerp(y0, y1, q)
            r = s(6)
            d.ellipse([s(px) - r, s(py) - r, s(px) + r, s(py) + r], fill=rgba(colour))
    img.alpha_composite(lay)
    if label:
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 + label_y
        rise_text(
            img, (cx, cy), label, size, seg(t, start + 0.3, start + 0.9), weight, colour, anchor="ms", stagger=0.04
        )
        if sub:
            draw_text(
                img,
                (cx, cy + (36 if label_y > 0 else -50)),
                sub,
                30,
                "regular",
                PAPER,
                ease_out(seg(t, start + 0.5, start + 1.0)),
                "ms",
            )


def price_bar(img, t):
    """The price per server-hour against the break-even, on one scale."""
    a = ease_out(seg(t, 3.3, 3.8))
    if a <= 0:
        return
    x0, x1, y = 260, 1660, 720
    top = max(PRICE, BREAK_EVEN) * 1.2
    X = lambda v: x0 + (x1 - x0) * v / top  # noqa: E731
    rect(img, (x0, y - 4, x1, y + 4), SLATE, a * 0.6)
    pb = ease_io(seg(t, 3.5, 4.2))
    rect(img, (x0, y - 14, lerp(x0, X(BREAK_EVEN), pb), y + 14), GLACIER, a, radius=6)
    pp = ease_io(seg(t, 4.0, 4.7))
    if pp > 0:
        rect(img, (X(BREAK_EVEN), y - 14, lerp(X(BREAK_EVEN), X(PRICE), pp), y + 14), MINT, a, radius=6)
    for v, label, c, t0, dy in (
        (BREAK_EVEN, f"break-even CHF {BREAK_EVEN:.3f}", PAPER, 3.7, -40),
        (PRICE, f"assumed price CHF {PRICE:.2f}", MINT, 4.3, -40),
    ):
        la = ease_out(seg(t, t0, t0 + 0.4))
        rect(img, (X(v) - 2, y - 30, X(v) + 2, y + 30), c, la)
        draw_text(img, (X(v), y + dy), label, 40, "bold", c, la, "ms")
    draw_text(img, (x0, y + 62), "per server-hour, before hardware", 30, "regular", SLATE, a)


def frame(i):
    t = i / FPS + 0.35
    img = canvas()
    rise_text(img, (110, 112), "How it pays", 56, seg(t, 0, 0.6), "black", PAPER)
    node(img, "buyer", "Compute buyer", "sends AI jobs", t)
    node(img, "server", "Server in a home", "in the basement", t - 0.15)
    node(img, "home", "The home", "heat and hot water", t - 0.3)
    bx, sx, hx = NODES["buyer"][0], NODES["server"][0], NODES["home"][0]
    y = NODES["buyer"][1]
    flow(img, (bx + 194, y - 50), (sx - 194, y - 50), t, AMBER, 0.7, "AI jobs", -26, sub="via the Kachel platform")
    flow(img, (bx + 194, y + 50), (sx - 194, y + 50), t, MINT, 2.3, f"pays CHF {PRICE:.2f}", 64, sub="per server-hour")
    flow(img, (sx + 194, y - 50), (hx - 194, y - 50), t, EMBER, 1.4, "heat out", -26, sub="hot supply")
    flow(img, (hx - 194, y + 50), (sx + 194, y + 50), t, GLACIER, 1.6, "return", 64, sub="cooler water back")
    price_bar(img, t)
    source_line(
        img,
        "Sources: services/scheduler/config.json (compute price, our assumption); "
        "services/scheduler/out/kpis.json (break-even)",
        alpha=ease_out(seg(t, 3.4, 3.9)),
    )
    return finish(zoom_frame(img, lerp(1.0, 1.03, t / SECONDS)))


if __name__ == "__main__":
    render("14-business-logic", SECONDS, frame)
