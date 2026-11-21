"""Charts and tables for the economics page (docs/economics/README.md).

  python economics.py      # downloads Open-Meteo Basel 2025, writes docs/economics/

Same model as run_year.py, real weather, six servers. Sources for every input are on the page.
"""
import copy, json, os
import numpy as np, pandas as pd
from heatsched import profile as P
from heatsched.sim import House, kpis, sweep
from heatsched.plots import plt, INK, PAPER, GRID, EMBER, AMBER, GLACIER, MINT, SLATE

OUT = "../../docs/economics"
N = 6                                       # servers per house, as in kpis.json
MUTED = "#5B616B"
ELCOM_2026, ELCOM_2027 = 0.277, 0.265       # ElCom H4 median, CHF/kWh
SWISS_MIN, SWISS_MAX = 0.106, 0.459         # cheapest and dearest municipality 2027, as reported by Blick (check against ElCom)


def save(fig, name, sub):
    ax = fig.axes[0]
    ax.text(0, 1.02, sub, transform=ax.transAxes, fontsize=11.5, color=MUTED, va="bottom")
    fig.text(0.995, -0.03, "Kachel · weather: Open-Meteo (ERA5), Basel 2025 · sources: docs/economics",
             ha="right", fontsize=8.5, color=MUTED)
    fig.savefig(f"{OUT}/{name}.png", dpi=200, bbox_inches="tight")
    fig.savefig(f"{OUT}/{name}.svg", bbox_inches="tight")
    plt.close(fig)


def net(k, cfg):
    """CHF per house and year before hardware: computing income minus electricity plus heat credit."""
    return k["computing_income_chf"] - k["electricity_cost_chf"] + k["value_of_heat_used_chf"]


def run(prof, cfg, n=N):
    df = House(prof, cfg, n).run()
    return df, kpis(df, cfg, n)


def with_(cfg, **changes):
    c = copy.deepcopy(cfg)
    for path, v in changes.items():
        node = c
        *keys, last = path.split("__")
        for key in keys:
            node = node[key]
        node[last] = v
    return c


def no_backlog(cfg):
    return with_(cfg, jobs__opportunistic__unlimited=False)


def chart_weather(prof):
    d = prof.groupby("date").agg(temp=("temp_c", "mean"), heat=("heat_kwh", "sum"), dhw=("dhw_kwh", "sum"))
    d.index = pd.to_datetime(d.index)
    fig, ax = plt.subplots(figsize=(11, 5.6))
    ax.bar(d.index, d["heat"], color=EMBER, width=1.0, label="Space heating")
    ax.bar(d.index, d["dhw"], bottom=d["heat"], color=AMBER, width=1.0, label="Hot water")
    ax2 = ax.twinx(); ax2.grid(False); ax2.spines["right"].set_visible(False)
    ax2.plot(d.index, d["temp"], color=GLACIER, lw=1.4, label="Daily mean temperature")
    ax2.axhline(12, color=GLACIER, lw=1, ls=":")
    ax2.text(pd.Timestamp("2025-07-01"), 10.8, "12 °C heating limit (daily mean)", ha="center", va="top", fontsize=10, color=GLACIER)
    ax2.set(ylabel="Temperature (°C)", ylim=(-10, 32)); ax2.yaxis.label.set_color(GLACIER); ax2.tick_params(colors=GLACIER)
    ax.set(ylabel="Heat demand (kWh per day)", ylim=(0, d[["heat", "dhw"]].sum(axis=1).max() * 1.25),
           title="The house needs heat on 206 days, and hot water every day")
    ax.xaxis.set_major_formatter(plt.matplotlib.dates.DateFormatter("%b"))
    h1, l1 = ax.get_legend_handles_labels(); h2, l2 = ax2.get_legend_handles_labels()
    ax.legend(h1 + h2, l1 + l2, frameon=False, loc="upper center", ncol=3)
    save(fig, "01_weather_and_demand", f"Reference house, Basel 2025: {d['heat'].sum():,.0f} kWh space heat + {d['dhw'].sum():,.0f} kWh hot water")
    return d


def chart_month(df, k):
    m = df.assign(month=pd.to_datetime(df["time"]).dt.month).groupby("month").agg(
        served=("served_kwh", "sum"), backup=("backup_kwh", "sum"), sh=("server_hours", "sum"), hours=("t", "size"))
    m["util_pct"] = 100 * m["sh"] / (N * m["hours"])
    names = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
    fig, ax = plt.subplots(figsize=(11, 5.6))
    ax.bar(names, m["served"], color=EMBER, label="Heat from servers", width=0.72)
    ax.bar(names, m["backup"], bottom=m["served"], color=SLATE, alpha=0.6, label="Backup heater", width=0.72)
    ax2 = ax.twinx(); ax2.grid(False); ax2.spines["right"].set_visible(False)
    ax2.plot(names, m["util_pct"], color=GLACIER, lw=2.5, marker="o", label="Server utilisation")
    ax2.set(ylim=(0, 105), ylabel="Utilisation (%)"); ax2.yaxis.label.set_color(GLACIER); ax2.tick_params(colors=GLACIER)
    ax.set(ylabel="Heat (kWh per month)", ylim=(0, (m["served"] + m["backup"]).max() * 1.05),
           title="Servers earn in winter and idle in summer")
    h1, l1 = ax.get_legend_handles_labels(); h2, l2 = ax2.get_legend_handles_labels()
    ax.legend(h1 + h2, l1 + l2, frameon=False, loc="upper center", bbox_to_anchor=(0.5, -0.07), ncol=3)
    save(fig, "02_month_by_month", f"{N} servers cover {k['share_of_heat_covered_pct']:.0f}% of the year's heat and run {k['utilisation_pct']:.0f}% of the hours")
    m.index = names
    return m.rename(columns={"served": "heat_from_servers_kwh", "backup": "backup_heat_kwh",
                             "sh": "server_hours", "hours": "hours_in_month", "util_pct": "utilisation_pct"})


def chart_servers(sw):
    sw = sw.copy()
    sw["coverage_gain_pts"] = sw["share_of_heat_covered_pct"].diff().fillna(sw["share_of_heat_covered_pct"])
    fig, ax = plt.subplots(figsize=(11, 5.6))
    x = sw["servers_per_house"]
    colors = [EMBER if n == N else (SLATE if u < 40 else AMBER) for n, u in zip(x, sw["marginal_server_utilisation_pct"])]
    ax.bar(x, sw["marginal_server_utilisation_pct"], color=colors, width=0.7, label="How often the added server runs (%)")
    ax.plot(x, sw["coverage_gain_pts"], color=INK, lw=2, marker="o", label="Extra share of heat it covers (points)")
    ax.axhline(40, color=MUTED, lw=1, ls=":"); ax.text(14.4, 41.5, "40% rule", ha="right", fontsize=10, color=MUTED)
    ax.annotate(f"server {N}: runs {sw.loc[sw.servers_per_house == N, 'marginal_server_utilisation_pct'].iloc[0]:.0f}% of the year",
                (N, sw.loc[sw.servers_per_house == N, "marginal_server_utilisation_pct"].iloc[0]),
                xytext=(40, 40), textcoords="offset points", fontsize=11.5, fontweight="bold",
                arrowprops=dict(arrowstyle="-", color=INK, lw=1))
    ax.set(xticks=list(x), xlabel="Server added to the house (1st, 2nd, ...)", ylabel="Percent / percentage points",
           ylim=(0, 100), title="Each extra server earns less: diminishing returns per house")
    ax.legend(frameon=False, loc="upper right")
    save(fig, "03_diminishing_returns", "Amber: servers kept. Grey: servers that would run under 40% of the year, so the scheduler leaves them out")
    return sw


def chart_break_even(cfg):
    p = np.linspace(0.08, 0.50, 200); r = cfg["server"]["heat_recovery"]
    fig, ax = plt.subplots(figsize=(11, 5.6))
    ax.axvspan(SWISS_MIN, SWISS_MAX, color=GRID, alpha=0.6, lw=0)
    ax.text((SWISS_MIN + SWISS_MAX) / 2, 0.535, "Range across Swiss municipalities, 2027, as reported by Blick", ha="center", fontsize=10, color=MUTED, va="top")
    ax.plot(p, p, color=SLATE, lw=2, ls="--", label="All heat wasted (data centre)")
    for cop, c, lab in ((4.9, MINT, "4.9 (best air/water pump in field test)"), (3.4, GLACIER, "3.4 (field-test average)"),
                        (2.5, EMBER, "2.5 (case brief)")):
        ax.plot(p, p * (1 - r / cop), color=c, lw=2.6, label=f"Heat used, heat pump COP {lab}")
    for x, lab in ((ELCOM_2026, "2026 median"), (ELCOM_2027, "2027 median")):
        ax.axvline(x, color=INK, lw=0.9, ls=":")
    ax.text(ELCOM_2027 - 0.003, 0.02, "2027 median", ha="right", fontsize=10); ax.text(ELCOM_2026 + 0.003, 0.02, "2026 median", fontsize=10)
    ax.axhline(cfg["prices"]["compute_chf_per_server_hour"], color=INK, lw=1)
    ax.text(0.085, cfg["prices"]["compute_chf_per_server_hour"] + 0.008, "our assumed price, 0.50", fontsize=10)
    be = ELCOM_2026 * (1 - r / cfg["prices"]["heat_pump_cop"])
    ax.scatter([ELCOM_2026], [be], s=90, color=EMBER, edgecolor=INK, zorder=4)
    ax.annotate(f"{be:.3f} CHF", (ELCOM_2026, be), xytext=(12, -22), textcoords="offset points", fontsize=11.5, fontweight="bold")
    ax.set(xlim=(0.08, 0.50), ylim=(0, 0.55), xlabel="Electricity price (CHF per kWh)",
           ylabel="Break-even (CHF per server-hour)", title="Using the heat lowers the price a server-hour must fetch")
    ax.legend(frameon=False, loc="upper left", bbox_to_anchor=(0.0, 0.85), fontsize=10.5)
    save(fig, "04_break_even", f"1 kW server, {r:.0%} of its power recovered as heat, heat valued at what a heat pump would have spent; hardware not included")


def chart_hardware_budget(k_base, k_none, cfg):
    c = np.linspace(0, 1.2, 200)
    fig, ax = plt.subplots(figsize=(11, 5.6))
    for k, col, lab in ((k_base, EMBER, f"Flexible backlog ({k_base['utilisation_pct']:.0f}% busy)"),
                        (k_none, SLATE, f"Deadline + evening jobs only ({k_none['utilisation_pct']:.0f}% busy)")):
        hours = k["server_hours_sold"] / N
        cost_per_h = (k["electricity_cost_chf"] - k["value_of_heat_used_chf"]) / k["server_hours_sold"]
        ax.plot(c, (c - cost_per_h) * hours, color=col, lw=2.6, label=lab)
    ax.axhline(0, color=INK, lw=1)
    ax.axvline(cfg["prices"]["compute_chf_per_server_hour"], color=INK, lw=0.9, ls=":")
    ax.text(cfg["prices"]["compute_chf_per_server_hour"] + 0.01, -800, "our assumed price, 0.50", fontsize=10)
    hours = k_base["server_hours_sold"] / N
    be = (k_base["electricity_cost_chf"] - k_base["value_of_heat_used_chf"]) / k_base["server_hours_sold"]
    v = (cfg["prices"]["compute_chf_per_server_hour"] - be) * hours
    ax.scatter([0.5], [v], s=90, color=EMBER, edgecolor=INK, zorder=4)
    ax.annotate(f"{v:,.0f} CHF per server and year", (0.5, v), xytext=(-230, 20), textcoords="offset points",
                fontsize=11.5, fontweight="bold")
    ax.set(xlim=(0, 1.2), xlabel="Price a server-hour fetches (CHF)", ylabel="CHF per server and year",
           title="What is left each year to pay for the server itself")
    ax.legend(frameon=False, loc="upper left", bbox_to_anchor=(0.0, 0.9))
    save(fig, "05_hardware_budget", "Income minus electricity plus heat credit, per 1 kW server. Compare with the hardware's yearly cost (price ÷ lifetime + upkeep)")


def tornado(prof, cfg, k_base):
    base = net(k_base, cfg)
    p = cfg["prices"]["electricity_chf_per_kwh"]
    cases = [
        ("Compute price, 0.25 to 0.75 CHF per server-hour\n(our assumption ±50%)",
         with_(cfg, prices__compute_chf_per_server_hour=0.25), with_(cfg, prices__compute_chf_per_server_hour=0.75), "0.25", "0.75"),
        ("Backlog of flexible jobs: none vs unlimited\n(our assumption)", no_backlog(cfg), cfg, "none", "unlimited"),
        ("Electricity price, 10.6 to 45.9 Rp per kWh\n(2027 municipal range as reported by Blick)",
         with_(cfg, prices__electricity_chf_per_kwh=SWISS_MAX), with_(cfg, prices__electricity_chf_per_kwh=SWISS_MIN), "45.9", "10.6"),
        ("Heat recovered, 60% to 95%\n(95% is a vendor's maximum)",
         with_(cfg, server__heat_recovery=0.6), with_(cfg, server__heat_recovery=0.95), "60%", "95%"),
        ("Heat pump COP, 4.9 to 2.5\n(field-test best to case brief)",
         with_(cfg, prices__heat_pump_cop=4.9), cfg, "4.9", "2.5"),
    ]
    rows = []
    for label, lo_cfg, hi_cfg, lo_lab, hi_lab in cases:
        lo = net(run(prof, lo_cfg)[1], lo_cfg); hi = net(run(prof, hi_cfg)[1], hi_cfg)
        rows.append(dict(input=label.split("\n")[0], low_case=lo_lab, low_chf=round(lo), high_case=hi_lab, high_chf=round(hi)))
    t = pd.DataFrame(rows)
    t["swing"] = (t["high_chf"] - t["low_chf"]).abs()
    order = t.sort_values("swing").index
    fig, ax = plt.subplots(figsize=(11, 6.2))
    labels = [cases[i][0] for i in order]
    for y, i in enumerate(order):
        pts = sorted([(t.loc[i, "low_chf"], t.loc[i, "low_case"]), (t.loc[i, "high_chf"], t.loc[i, "high_case"])])
        (a, la), (b, lb) = pts
        ax.plot([a, b], [y, y], color=GRID, lw=14, solid_capstyle="butt", zorder=1)
        ax.scatter([a], [y], s=90, color=SLATE, edgecolor=INK, zorder=3)
        ax.scatter([b], [y], s=90, color=EMBER, edgecolor=INK, zorder=3)
        ax.annotate(f"{la}: {a:,.0f}", (a, y), xytext=(-12, 0), textcoords="offset points", ha="right", va="center", fontsize=10.5)
        ax.annotate(f"{lb}: {b:,.0f}", (b, y), xytext=(12, 0), textcoords="offset points", ha="left", va="center", fontsize=10.5)
    ax.axvline(base, color=INK, lw=1.4)
    ax.set(yticks=range(len(order)), xlabel="CHF per house and year, before hardware")
    ax.set_yticklabels(labels, fontsize=10)
    ax.set_xlim(-2500, 22000); ax.set_ylim(-0.6, len(order) - 0.4); ax.grid(axis="y", visible=False)
    ax.text(base, -0.55, f"  as in config.json: {base:,.0f}", fontsize=10, color=MUTED, va="bottom")
    ax.set_title("The price of compute matters most, then whether there is work to run")
    save(fig, "06_what_moves_the_result", f"One input changed at a time, {N} servers. Orange dot: the better of the two cases. Hardware not included")
    return t.drop(columns="swing"), base


def main():
    cfg = json.load(open("config.json"))
    os.makedirs(f"{OUT}/data", exist_ok=True)
    prof = P.build_profile(P.download_weather(f"{OUT}/data/weather_basel_2025.csv"), cfg)
    df, k = run(prof, cfg)
    _, k_none = run(prof, no_backlog(cfg))
    sw = sweep(prof, cfg)
    chart_weather(prof).round(2).rename(columns={"temp": "mean_temp_c", "heat": "space_heat_kwh", "dhw": "hot_water_kwh"}).to_csv(
        f"{OUT}/data/daily.csv", index_label="date", date_format="%Y-%m-%d")
    chart_month(df, k).round(1).to_csv(f"{OUT}/data/monthly.csv", index_label="month")
    chart_servers(sw).to_csv(f"{OUT}/data/servers_per_house.csv", index=False)
    chart_break_even(cfg)
    chart_hardware_budget(k, k_none, cfg)
    t, base = tornado(prof, cfg, k)
    t.to_csv(f"{OUT}/data/sensitivity.csv", index=False)
    summary = {"base_case": k, "no_backlog_case": k_none, "net_chf_per_house_before_hardware": round(base)}
    json.dump(summary, open(f"{OUT}/data/summary.json", "w"), indent=2)
    print(json.dumps(summary, indent=2)); print(t.to_string(index=False))


if __name__ == "__main__":
    main()
