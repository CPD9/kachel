"""Charts and tables for the economics page (docs/economics/README.md).

  python economics.py      # downloads Open-Meteo Basel 2025, writes docs/economics/

Same model as run_year.py, real weather, six servers. Sources for every input are on the page.
"""
import copy, json, os
import numpy as np, pandas as pd
from heatsched import profile as P
from heatsched import solar
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


CASE_COLORS = {"low": GLACIER, "mid": EMBER, "high": SLATE}


def hardware(cfg, case=None, n=N):
    """Hardware costs per house for one case in config.json: what is paid up front, upkeep, and the yearly annuity."""
    hw = cfg["hardware"]; h = hw["cases"][case or hw["case_for_results"]]
    capex = (n * (h["server_chf"] + h["cooling_kit_chf"]) + h["fitter_hours_per_house"] * h["fitter_chf_per_hour"]
             + h["electrician_hours_per_house"] * h["electrician_chf_per_hour"])
    upkeep = h["service_visits_per_year"] * (h["service_hours_per_visit"] * hw["service_chf_per_hour"] + hw["service_callout_chf"])
    r, life = h["discount_rate"], h["lifetime_years"]
    annuity = r / (1 - (1 + r) ** -life)
    return dict(capex=capex, upkeep=upkeep, r=r, life=life, annuity=annuity, per_year=capex * annuity + upkeep)


def payback_years(capex, cash, r):
    """Discounted payback: years until the yearly cash, discounted at r, has repaid capex. inf if never."""
    if cash <= 0 or r * capex >= cash:
        return float("inf")
    return -np.log(1 - r * capex / cash) / np.log(1 + r)


def after_hardware(k, cfg, case=None):
    """The yearly result once the servers, their fitting and upkeep are paid for, for one hardware case."""
    h = hardware(cfg, case)
    before = net(k, cfg); cash = before - h["upkeep"]
    return dict(capex_chf=round(h["capex"]), upkeep_chf_per_year=round(h["upkeep"]),
                hardware_chf_per_year=round(h["per_year"]), net_chf_before_hardware=round(before),
                net_chf_after_hardware=round(before - h["per_year"]),
                payback_years=round(payback_years(h["capex"], cash, h["r"]), 1),
                lifetime_years=h["life"], discount_rate=h["r"],
                npv_chf=round(-h["capex"] + cash * (1 - (1 + h["r"]) ** -h["life"]) / h["r"]),
                break_even_chf_per_server_hour_incl_hardware=round(
                    (k["electricity_cost_chf"] - k["value_of_heat_used_chf"] + h["per_year"]) / k["server_hours_sold"], 3))


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
    for case in ("low", "mid", "high"):
        y = hardware(cfg, case)["per_year"] / N
        ax.axhline(y, color=CASE_COLORS[case], lw=1.2, ls="--")
        ax.text(0.98 if case == "low" else 1.19, y + 60, f"hardware, {case} case: {y:,.0f} per year", ha="right", fontsize=10, color=CASE_COLORS[case])
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
    save(fig, "05_hardware_budget", "Income minus electricity plus heat credit, per 1 kW server. Dashed: hardware's yearly cost (annuity + upkeep), three cases")


def chart_payback(k, cfg):
    c = np.linspace(0.2, 1.2, 501); top = 10
    own = cfg["prices"]["compute_chf_per_server_hour"]
    fig, ax = plt.subplots(figsize=(11, 5.6))
    rows = []
    for case in ("low", "mid", "high"):
        h = hardware(cfg, case); col = CASE_COLORS[case]
        cash = c * k["server_hours_sold"] - k["electricity_cost_chf"] + k["value_of_heat_used_chf"] - h["upkeep"]
        pb = np.array([payback_years(h["capex"], x, h["r"]) for x in cash])
        ax.plot(c, np.where(pb <= top, pb, np.nan), color=col, lw=2.6,
                label=f"{case.capitalize()}: {cfg['hardware']['cases'][case]['label']} ({h['capex']:,.0f} CHF up front)")
        ax.plot([0.2, 1.2], [h["life"], h["life"]], color=col, lw=1, ls=":")
        a = after_hardware(k, cfg, case)
        be = a["break_even_chf_per_server_hour_incl_hardware"]
        ax.scatter([be], [h["life"]], s=60, color=col, edgecolor=INK, zorder=4)
        ax.annotate(f"{be:.2f}", (be, h["life"]), xytext=(8, 4), textcoords="offset points", fontsize=10, color=col)
        y = a["payback_years"]
        if y <= top:
            ax.scatter([own], [y], s=90, color=col, edgecolor=INK, zorder=5)
            ax.annotate(f"{y:.1f} years", (own, y), xytext=(10, -4), textcoords="offset points", fontsize=11.5, fontweight="bold")
        rows += [dict(case=case, compute_chf_per_server_hour=round(x, 3), payback_years=round(p, 2) if p <= 50 else None)
                 for x, p in zip(c[::20], pb[::20])]
    ax.axvline(own, color=INK, lw=0.9, ls=":")
    ax.text(own + 0.01, 0.2, f"our assumed price, {own:.2f}", fontsize=10)
    ax.set(xlim=(0.2, 1.2), ylim=(0, top), xlabel="Price a server-hour fetches (CHF)",
           ylabel="Years to pay back the hardware", title="At 0.50 CHF the dearest hardware does not pay back within its life")
    ax.legend(frameon=False, loc="upper right", fontsize=10.5)
    save(fig, "07_payback", "Discounted payback per house, six servers. Dotted: each case's lifetime; the dot on it is the break-even price incl. hardware")
    return pd.DataFrame(rows)


def tornado(prof, cfg, k_base):
    """Yearly result after hardware (the case in config.json) as one input moves at a time."""
    def result(c, k=None):
        return after_hardware(k or run(prof, c)[1], c)["net_chf_after_hardware"]
    base = result(cfg, k_base)
    hw = cfg["hardware"]["cases"]; mid = cfg["hardware"]["case_for_results"]
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
        (f"Server price, {hw['high']['server_chf']:,} to {hw['low']['server_chf']:,} CHF each\n(refurbished GPU host, dear to cheap)",
         with_(cfg, **{f"hardware__cases__{mid}__server_chf": hw["high"]["server_chf"]}),
         with_(cfg, **{f"hardware__cases__{mid}__server_chf": hw["low"]["server_chf"]}),
         f"{hw['high']['server_chf']:,}", f"{hw['low']['server_chf']:,}"),
        (f"Server lifetime, {hw['high']['lifetime_years']} to {hw['low']['lifetime_years']} years\n(cloud providers' write-off periods)",
         with_(cfg, **{f"hardware__cases__{mid}__lifetime_years": hw["high"]["lifetime_years"]}),
         with_(cfg, **{f"hardware__cases__{mid}__lifetime_years": hw["low"]["lifetime_years"]}),
         f"{hw['high']['lifetime_years']} years", f"{hw['low']['lifetime_years']} years"),
    ]
    rows = []
    for label, lo_cfg, hi_cfg, lo_lab, hi_lab in cases:
        hardware_only = label.startswith("Server")      # the weather run does not change, so reuse it
        lo = result(lo_cfg, k_base if hardware_only else None); hi = result(hi_cfg, k_base if hardware_only else None)
        rows.append(dict(input=label.split("\n")[0], low_case=lo_lab, low_chf=round(lo), high_case=hi_lab, high_chf=round(hi)))
    t = pd.DataFrame(rows)
    t["swing"] = (t["high_chf"] - t["low_chf"]).abs()
    order = t.sort_values("swing").index
    fig, ax = plt.subplots(figsize=(11, 7.4))
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
    ax.axvline(0, color=MUTED, lw=0.8, ls=":")
    ax.set(yticks=range(len(order)), xlabel=f"CHF per house and year, after hardware ({mid} case)")
    ax.set_yticklabels(labels, fontsize=10)
    lo_x, hi_x = t[["low_chf", "high_chf"]].min().min(), t[["low_chf", "high_chf"]].max().max()
    ax.set_xlim(lo_x - 5000, hi_x + 5000); ax.set_ylim(-0.6, len(order) - 0.4); ax.grid(axis="y", visible=False)
    ax.text(base, -0.55, f"  as in config.json: {base:,.0f}", fontsize=10, color=MUTED, va="bottom")
    ax.set_title("The price of compute matters most, then whether there is work to run")
    save(fig, "06_what_moves_the_result", f"One input changed at a time, {N} servers, {mid} hardware case. Orange dot: the better of the two cases")
    return t.drop(columns="swing"), base


SETUPS = (("none", "No solar", False, False), ("pv_plain", "Roof PV, scheduler ignores the sun", False, False),
          ("pv", "Roof PV, scheduler prefers the sun", True, False), ("pv_battery", "Roof PV + battery, prefers the sun", True, True))


def solar_costs(cfg, case=None):
    """What the roof PV and the battery cost for one case in config.json: up front (after the federal payment) and upkeep."""
    s = cfg["solar"]; c = s["cases"][case or s["case_for_results"]]
    pv = s["roof_kwp"] * (c["pv_chf_per_kwp"] - s["subsidy_chf_per_kwp"])
    return dict(pv_capex=pv, battery_capex=c["battery_chf"], upkeep=s["roof_kwp"] * c["pv_chf_per_kwp"] * c["pv_upkeep_share_per_year"],
                r=c["discount_rate"], pv_life=c["pv_lifetime_years"], battery_life=c["battery_lifetime_years"])


def annuity(capex, r, life):
    return capex * r / (1 - (1 + r) ** -life)


def run_pv(prof, cfg, pv, n=N):
    df = House(prof, cfg, n, pv=pv).run()
    return df, kpis(df, cfg, n)


def solar_setups(prof, weather, cfg, price):
    """One house, one year, at one electricity price: each solar setup's flows and money."""
    c = with_(cfg, prices__electricity_chf_per_kwh=price); s = cfg["solar"]
    pv = solar.pv_kwh(weather, s)
    out, runs = {}, {}
    for key, label, prefer, battery in SETUPS:
        df, k = run_pv(prof, c, pv if prefer else None)
        load = df["server_hours"].to_numpy() * c["server"]["power_kw"]
        f = solar.own_power(load, pv if key != "none" else np.zeros(len(pv)), s["battery_kwh"] if battery else 0.0,
                            s["battery_round_trip"])
        grid, exported = f["from_grid"].sum(), f["exported"].sum()
        cost = grid * price - exported * s["feed_in_chf_per_kwh"]
        out[key] = dict(setup=label, electricity_chf_per_kwh=price, server_kwh=round(load.sum()),
                        pv_kwh=round(pv.sum()) if key != "none" else 0,
                        own_pv_share_of_server_power_pct=round(100 * (1 - grid / load.sum()), 1),
                        from_battery_kwh=round(f["from_battery"].sum()), from_grid_kwh=round(grid),
                        exported_kwh=round(exported), electricity_cost_chf=round(cost),
                        share_of_heat_covered_pct=k["share_of_heat_covered_pct"], server_hours_sold=k["server_hours_sold"],
                        net_chf_before_hardware=round(k["computing_income_chf"] - cost + k["value_of_heat_used_chf"]))
        runs[key] = (df, f)
    for key in ("pv_plain", "pv", "pv_battery"):
        for case in s["cases"]:
            sc = solar_costs(cfg, case)
            capex = sc["pv_capex"] + (sc["battery_capex"] if key == "pv_battery" else 0)
            saving = out["none"]["electricity_cost_chf"] - out[key]["electricity_cost_chf"] - sc["upkeep"]
            out[key][f"payback_years_{case}"] = round(payback_years(capex, saving, sc["r"]), 1)
            if case == s["case_for_results"]:
                per_year = annuity(sc["pv_capex"], sc["r"], sc["pv_life"]) + sc["upkeep"] + (
                    annuity(sc["battery_capex"], sc["r"], sc["battery_life"]) if key == "pv_battery" else 0)
                out[key]["solar_capex_chf"] = round(capex)
                out[key]["solar_chf_per_year"] = round(per_year)
                out[key]["saving_chf_per_year"] = round(out["none"]["electricity_cost_chf"] - out[key]["electricity_cost_chf"])
    hw = hardware(cfg)["per_year"]
    for key in out:
        out[key]["net_chf_after_hardware_and_solar"] = round(out[key]["net_chf_before_hardware"] - hw - out[key].get("solar_chf_per_year", 0))
    return out, runs, pv


def chart_solar_day(runs, pv, cfg, date="2025-07-15"):
    h = cfg["server"]["power_kw"]
    fig, ax = plt.subplots(figsize=(11, 5.6))
    plain, pref = runs["pv_plain"][0], runs["pv"][0]
    m = plain["time"].str.startswith(date).to_numpy(); x = np.arange(m.sum())
    ax.fill_between(x, 0, pv[m], step="mid", color=AMBER, alpha=0.45, lw=0, label="Roof PV (kWh per hour)")
    ax.step(x, plain.loc[m, "server_hours"] * h, where="mid", color=SLATE, lw=2.2, ls="--", label="Servers, scheduler ignores the sun")
    ax.step(x, pref.loc[m, "server_hours"] * h, where="mid", color=EMBER, lw=2.6, label="Servers, scheduler prefers the sun")

    def on_sun(df):
        load = df.loc[m, "server_hours"].to_numpy() * h
        return 100 * np.minimum(load, pv[m]).sum() / max(1e-9, load.sum())
    ax.set(xticks=x[::2], xlim=(-0.5, 23.5), xlabel="Hour of day", ylabel="kWh per hour",
           ylim=(0, max(pv[m].max(), cfg["solar"]["roof_kwp"] * 0.75) * 1.25),
           title=f"On a July day the servers now run at midday: {on_sun(pref):.0f}% on sunshine, was {on_sun(plain):.0f}%")
    ax.legend(frameon=False, loc="upper left", fontsize=10.5)
    save(fig, "08_solar_day", f"{date}, {N} servers, {cfg['solar']['roof_kwp']:.0f} kWp roof. The tank stores the midday heat for the evening shower")


def chart_solar_month(runs, pv, res):
    df, f = runs["pv_battery"]
    m = f.assign(month=pd.to_datetime(df["time"]).dt.month.to_numpy(), pv=pv).groupby("month").sum()
    names = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
    fig, ax = plt.subplots(figsize=(11, 5.6))
    ax.bar(names, m["pv_direct"], color=AMBER, width=0.72, label="From the roof, directly")
    ax.bar(names, m["from_battery"], bottom=m["pv_direct"], color=MINT, width=0.72, label="From the battery")
    ax.bar(names, m["from_grid"], bottom=m["pv_direct"] + m["from_battery"], color=SLATE, alpha=0.6, width=0.72, label="Bought from the grid")
    ax.plot(names, m["pv"], color=INK, lw=2, marker="o", label="Roof PV made")
    top = max((m["pv_direct"] + m["from_battery"] + m["from_grid"]).max(), m["pv"].max())
    ax.set(ylabel="kWh per month", ylim=(0, top * 1.18),
           title=f"Own solar gives the servers {res['own_pv_share_of_server_power_pct']:.0f}% of their power: winter still runs on the grid")
    ax.legend(frameon=False, loc="upper center", ncol=4, fontsize=10.5)
    save(fig, "09_solar_month", f"Servers' electricity by source, {N} servers, 10 kWp roof + 10 kWh battery. Sun the servers cannot use is sold at the feed-in price")


def chart_solar_bill(by_price, cfg):
    keys = [k for k, *_ in SETUPS]
    fig, ax = plt.subplots(figsize=(11, 5.6))
    w = 0.38; x = np.arange(len(keys)); case = cfg["solar"]["case_for_results"]
    for i, res in enumerate(by_price.values()):
        lab = "IWB Basel 2027, 33.42 Rp" if i else "Swiss median 2026, 27.7 Rp"
        bars = ax.bar(x + (i - 0.5) * w, [res[k]["electricity_cost_chf"] for k in keys], width=w, color=(EMBER if i else GLACIER), label=lab)
        for b, k in zip(bars, keys, strict=True):
            r = res[k]; pb = r.get(f"payback_years_{case}")
            txt = f"{r['electricity_cost_chf']:,.0f}" + (f"\npays back\nin {pb:.0f} y" if pb is not None and pb < 50 else "")
            ax.text(b.get_x() + w / 2, b.get_height() + 120, txt, ha="center", va="bottom", fontsize=9.5)
    base = next(iter(by_price.values()))
    ax.set_xticks(x, [f"{lab.replace(', ', chr(10))}\n({base[k]['own_pv_share_of_server_power_pct']:.0f}% own power)"
                      for k, lab, *_ in SETUPS], fontsize=10)
    top = max(r["electricity_cost_chf"] for res in by_price.values() for r in res.values())
    ax.set(ylabel="Servers' electricity, CHF per year", ylim=(0, top * 1.3), title="Solar cuts the servers' power bill")
    ax.legend(frameon=False, loc="upper right")
    save(fig, "10_solar_bill", "Grid power bought minus PV sold at 14 Rp. Payback: mid prices, after the federal one-off payment, discounted at 3.75%")


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
    chart_payback(k, cfg).to_csv(f"{OUT}/data/payback.csv", index=False)
    hw = {case: after_hardware(k, cfg, case) for case in cfg["hardware"]["cases"]}
    pd.DataFrame.from_dict(hw, orient="index").to_csv(f"{OUT}/data/hardware.csv", index_label="case")
    t, base = tornado(prof, cfg, k)
    t.to_csv(f"{OUT}/data/sensitivity.csv", index=False)
    weather = P.load_weather(f"{OUT}/data/weather_basel_2025.csv")
    by_price, runs, pv = {}, None, None
    for price in (cfg["prices"]["electricity_chf_per_kwh"], cfg["solar"]["iwb_2027_chf_per_kwh"]):
        by_price[price], r, p = solar_setups(prof, weather, cfg, price)
        runs, pv = runs or r, p
    sol = by_price[cfg["prices"]["electricity_chf_per_kwh"]]
    chart_solar_day(runs, pv, cfg)
    chart_solar_month(runs, pv, sol["pv_battery"])
    chart_solar_bill(by_price, cfg)
    pd.DataFrame([r for res in by_price.values() for r in res.values()]).to_csv(f"{OUT}/data/solar.csv", index=False)
    summary = {"base_case": k, "no_backlog_case": k_none, "net_chf_per_house_before_hardware": round(net(k, cfg)),
               "hardware": hw, "solar": {f"{p:.4f}": res for p, res in by_price.items()}}
    open(f"{OUT}/data/summary.json", "w").write(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2)); print(t.to_string(index=False))


if __name__ == "__main__":
    main()
