"""Deck-ready plots. One palette, shared with the pitch and the UI."""
import numpy as np, pandas as pd
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt

INK, PAPER, GRID = "#14161A", "#FAF8F5", "#E4DFD8"
EMBER, AMBER, GLACIER, MINT, SLATE = "#FF5A1F", "#FFB020", "#1F6FEB", "#19B38A", "#9AA0A8"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 12, "text.color": INK, "axes.labelcolor": INK,
    "xtick.color": INK, "ytick.color": INK, "axes.edgecolor": GRID, "axes.spines.top": False,
    "axes.spines.right": False, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8,
    "axes.axisbelow": True, "figure.facecolor": PAPER, "axes.facecolor": PAPER, "savefig.facecolor": PAPER,
    "axes.titlesize": 17, "axes.titleweight": "bold", "axes.titlelocation": "left", "axes.titlepad": 26})

def _save(fig, name, synthetic, sub=None):
    ax = fig.axes[0]
    if sub: ax.text(0, 1.02, sub, transform=ax.transAxes, fontsize=11.5, color="#5B616B", va="bottom")
    if synthetic:
        fig.text(0.995, 0.01, "PREVIEW: synthetic weather. Re-run on the case CSV.", ha="right", fontsize=9, color=EMBER)
    fig.savefig(f"out/{name}.png", dpi=200, bbox_inches="tight"); fig.savefig(f"out/{name}.svg", bbox_inches="tight")
    plt.close(fig)

def load_duration(prof, k, cfg, syn):
    n, h = k["servers_per_house"], cfg["server"]["power_kw"] * cfg["server"]["heat_recovery"]
    d = np.sort(prof["demand_kwh"].values)[::-1]; x = np.arange(len(d)); cap = n * h
    fig, ax = plt.subplots(figsize=(11, 5.6))
    ax.fill_between(x, 0, np.minimum(d, cap), color=EMBER, alpha=0.9, lw=0, label="Server heat (direct)")
    ax.fill_between(x, cap, np.maximum(d, cap), color=SLATE, alpha=0.55, lw=0, label="Above server capacity (tank, then backup)")
    ax.axhline(cap, color=INK, lw=1.4, ls="--"); ax.text(len(d) * 0.99, cap + 0.15, f"{n} servers = {cap:.1f} kW", ha="right", fontsize=11)
    ax.axhline(12.5 * h, color=SLATE, lw=1, ls=":"); ax.text(len(d) * 0.99, 12.5 * h + 0.15, "12.5 servers: coldest hour", ha="right", fontsize=10, color="#5B616B")
    ax.set(xlim=(0, len(d)), ylim=(0, 11.5), xlabel="Hours of the year, sorted from coldest to mildest", ylabel="Heat demand (kW)",
           title=f"{n} servers cover {k['share_of_heat_covered_pct']:.0f}% of the heat. The last few would sit idle.")
    ax.legend(frameon=False, loc="center right")
    _save(fig, "01_load_duration", syn, "Reference house, space heating + hot water, every hour of 2025")

def frontier(sw, k, syn):
    n = k["servers_per_house"]
    fig, ax = plt.subplots(figsize=(11, 5.6))
    ax.plot(sw["utilisation_pct"], sw["share_of_heat_covered_pct"], color=SLATE, lw=2, zorder=1)
    ax.scatter(sw["utilisation_pct"], sw["share_of_heat_covered_pct"], s=70, color=PAPER, edgecolor=INK, lw=1.4, zorder=2)
    for _, r in sw.iterrows():
        if r.servers_per_house in (1, 2, 4, 8, 10, 13) and r.servers_per_house != n:
            ax.annotate(f"{int(r.servers_per_house)}", (r.utilisation_pct, r.share_of_heat_covered_pct), xytext=(8, -4), textcoords="offset points", fontsize=10.5, color="#5B616B")
    r = sw[sw.servers_per_house == n].iloc[0]
    ax.scatter([r.utilisation_pct], [r.share_of_heat_covered_pct], s=260, color=EMBER, edgecolor=INK, lw=1.6, zorder=3)
    ax.annotate(f"{n} servers\n{r.share_of_heat_covered_pct:.0f}% of heat, {r.utilisation_pct:.0f}% utilised",
                (r.utilisation_pct, r.share_of_heat_covered_pct), xytext=(-150, -66), textcoords="offset points",
                fontsize=12.5, fontweight="bold", arrowprops=dict(arrowstyle="-", color=INK, lw=1))
    ax.set(xlabel="Server utilisation (% of the year running)", ylabel="Share of heat demand covered (%)", ylim=(0, 106),
           title="More servers heat more of the house, and work less of the year")
    _save(fig, "02_frontier", syn, "Each dot is a number of servers per house. Heat dumped is near zero on every one of them.")

def year(df, k, syn):
    m = df.assign(month=pd.to_datetime(df["time"]).dt.month).groupby("month")[["served_kwh", "backup_kwh", "server_hours"]].sum()
    names = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
    fig, ax = plt.subplots(figsize=(11, 5.6))
    ax.bar(names, m["served_kwh"], color=EMBER, label="Heat from servers", width=0.72)
    ax.bar(names, m["backup_kwh"], bottom=m["served_kwh"], color=SLATE, alpha=0.6, label="Backup heater", width=0.72)
    ax2 = ax.twinx(); ax2.grid(False); ax2.spines["right"].set_visible(False)
    util = 100 * m["server_hours"] / (k["servers_per_house"] * df.assign(month=pd.to_datetime(df["time"]).dt.month).groupby("month").size())
    ax2.plot(names, util, color=GLACIER, lw=2.5, marker="o", label="Server utilisation"); ax2.set(ylim=(0, 105), ylabel="Utilisation (%)")
    ax2.yaxis.label.set_color(GLACIER); ax2.tick_params(colors=GLACIER)
    ax.set(ylabel="Heat (kWh per month)", ylim=(0, (m["served_kwh"] + m["backup_kwh"]).max() * 1.2), title="Winter is full throttle. Summer is hot water only.")
    h1, l1 = ax.get_legend_handles_labels(); h2, l2 = ax2.get_legend_handles_labels()
    ax.legend(h1 + h2, l1 + l2, frameon=False, loc="upper center", ncol=3)
    _save(fig, "03_year", syn, f"{k['servers_per_house']} servers, reference house, 2025")

def day(df, date, name, title, k, cfg, syn):
    h = cfg["server"]["power_kw"] * cfg["server"]["heat_recovery"]
    d = df[df["time"].str.startswith(date)]; x = np.arange(len(d))
    fig, (ax, bx) = plt.subplots(2, 1, figsize=(11, 6.6), height_ratios=[3, 1.15], sharex=True, gridspec_kw={"hspace": 0.12})
    b = np.zeros(len(d))
    for col, c, lab in (("interactive", GLACIER, "Interactive sessions"), ("batch", AMBER, "Deadline batch"), ("opportunistic", EMBER, "Opportunistic backlog")):
        ax.bar(x, d[col] * h, bottom=b, color=c, width=0.82, label=lab); b += d[col].values * h
    ax.step(x, d["demand_kwh"], where="mid", color=INK, lw=2.2, label="Heat demand")
    ax.set(ylabel="Heat (kWh per hour)", title=title, ylim=(0, max(b.max(), d["demand_kwh"].max()) * 1.3 + 0.3)); ax.legend(frameon=False, ncol=4, loc="upper center", fontsize=10.5)
    bx.fill_between(x, 0, d["soc_kwh"], color=MINT, alpha=0.85, step="mid"); bx.set(ylim=(0, cfg["house"]["tank_kwh"] * 1.05), ylabel="Tank (kWh)", xlabel="Hour of day", xticks=x[::2])
    sub = f"{date} · {d['temp_c'].min():.0f} to {d['temp_c'].max():.0f} °C · {int(d['server_hours'].sum())} server-hours · {d['dumped_kwh'].sum():.1f} kWh dumped · {d['backup_kwh'].sum():.0f} kWh backup"
    _save(fig, name, syn, sub)

def money(k, cfg, syn):
    p = cfg["prices"]; e, hv, inc = k["electricity_cost_chf"], k["value_of_heat_used_chf"], k["computing_income_chf"]
    fig, ax = plt.subplots(figsize=(11, 5.6))
    ax.bar(["Electricity", "Heat credit", "Net cost\nof running", "Computing income\n(assumed price)"], [e, hv, e - hv, inc],
           bottom=[0, e - hv, 0, 0], color=[INK, MINT, EMBER, GLACIER], width=0.6)
    for i, (v, y) in enumerate(((e, e), (-hv, e), (e - hv, e - hv), (inc, inc))):
        ax.text(i, y + max(e, inc) * 0.015, f"{v:+,.0f} CHF".replace("+", "") if i != 1 else f"{v:,.0f} CHF", ha="center", fontweight="bold")
    ax.set(ylabel="CHF per house and year", ylim=(0, max(e, inc) * 1.14),
           title=f"Break-even: {k['break_even_chf_per_server_hour']:.2f} CHF per server-hour")
    _save(fig, "06_money", syn, f"Electricity {p['electricity_chf_per_kwh']:.3f} CHF/kWh · heat valued at price ÷ {p['heat_pump_cop']} · income at an assumed {p['compute_chf_per_server_hour']:.2f} CHF per server-hour · hardware cost not included")

def make_all(prof, sw, df, k, cfg, synthetic=False):
    load_duration(prof, k, cfg, synthetic); frontier(sw, k, synthetic); year(df, k, synthetic)
    daily = prof.groupby("date")["temp_c"].mean()
    jan = str(min((d for d in daily.index if d.month == 1), key=lambda d: daily[d]))
    day(df, jan, "04_day_january", "A cold January day: every server runs all day, the backup tops up", k, cfg, synthetic)
    day(df, "2025-07-15", "05_day_july", "A July day: sessions heat the shower, the backlog waits for room in the tank", k, cfg, synthetic)
    money(k, cfg, synthetic)
