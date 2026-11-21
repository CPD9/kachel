"""10-farm-solar-numbers (6 s): the solar figures for the farm act, from summary.json
"solar" at the assumed electricity price (config.json), roof PV with a battery. Plain INK,
no gradients or transparency, so it can be cut or screened over the farm shot."""

from style import *  # noqa: F403

SECONDS = 6.0
PRICE = config()["prices"]["electricity_chf_per_kwh"]
SOLAR = summary()["solar"][f"{PRICE:.4f}"]["pv_battery"]


def num(v):
    return fmt(v, decimals_of(v))


STATS = [
    ("the panels make", num(SOLAR["pv_kwh"]), "kWh a year"),
    ("of the servers' power from the sun", num(SOLAR["own_pv_share_of_server_power_pct"]), "%"),
    ("the house saves", "CHF " + num(SOLAR["saving_chf_per_year"]), "a year"),
    ("solar pays back in", num(SOLAR["payback_years_mid"]), "years, mid case"),
]


def frame(i):
    t = i / FPS + 0.3
    img = canvas("flat")
    rise_text(img, (140, 150), "Add the sun", 72, seg(t, 0, 0.7), "black", PAPER)
    draw_text(img, (140, 210), SOLAR["setup"], 40, "medium", AMBER, ease_out(seg(t, 0.3, 0.9)))
    for k, (ctx, val, unit) in enumerate(STATS):
        x, y = 140 + (k % 2) * 900, 440 + (k // 2) * 280
        t0 = 0.6 + k * 0.45
        rise_text(img, (x, y - 125), ctx, 40, seg(t, t0, t0 + 0.6), "serif", PAPER, stagger=0.03)
        rise_text(img, (x, y), val, 120, seg(t, t0 + 0.1, t0 + 0.8), "black", EMBER)
        w = text_size(val, 120, "black")[0]
        draw_text(img, (x + w + 22, y), unit, 44, "bold", EMBER, ease_out(seg(t, t0 + 0.15, t0 + 0.5)))
    source_line(
        img,
        f'Source: docs/economics/data/summary.json, solar at {PRICE:.3f} CHF per kWh, "{SOLAR["setup"]}"',
        alpha=ease_out(seg(t, 1.0, 1.6)),
    )
    return finish(zoom_frame(img, lerp(1.0, 1.03, t / SECONDS), 140, 500))


if __name__ == "__main__":
    render("10-farm-solar-numbers", SECONDS, frame)
