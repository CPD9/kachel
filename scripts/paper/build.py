#!/usr/bin/env python3
"""Fills the model paper's template from the model's own output, so no figure is typed by hand.

  python3 scripts/paper/build.py           write docs/paper/kachel-model.md
  python3 scripts/paper/build.py --check   fail if docs/paper/kachel-model.md is stale

Every {placeholder} in docs/paper/kachel-model.template.md is filled from config.json, the
scheduler's kpis.json files, the fleet kpis and docs/economics/data. [@key] marks a citation:
econN is source N in docs/economics/README.md, sfoe the SFOE heat-demand layer in apps/map.
Standard library only.
"""

import ast
import csv
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = ROOT / "docs/paper/kachel-model.template.md"
OUT = ROOT / "docs/paper/kachel-model.md"
SCHED = ROOT / "services/scheduler"
ECON = ROOT / "docs/economics"
MINUS = "\u2212"
TIMES = "\u00d7"
PRIME = "\u2032"
RHO = "\u03c1"
DASH = "\u2013"


def load_json(path):
    return json.loads(Path(path).read_text())


def load_csv(path):
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def num(x, dp=0):
    """A number with thousands commas and a real minus sign."""
    s = f"{abs(float(x)):,.{dp}f}"
    return (MINUS + s) if float(x) < 0 and s.strip("0.,") else s


def pct(x, dp=1):
    return f"{num(x, dp)} %"


def chf(x, dp=0):
    return f"CHF {num(x, dp)}"


def years(x):
    return "never" if x in ("", None) or float(x) == float("inf") else f"{num(x, 1)} y"


def table(head, rows, align=None):
    align = align or ["l"] + ["r"] * (len(head) - 1)
    rule = ["---:" if a == "r" else "---" for a in align]
    lines = ["| " + " | ".join(head) + " |", "| " + " | ".join(rule) + " |"]
    lines += ["| " + " | ".join(str(c) for c in r) + " |" for r in rows]
    return "\n".join(lines)


# --- sources read from the code and the docs --------------------------------------------------


def default_arg(path, func, arg):
    """The default value of a function's keyword argument, read from the source."""
    tree = ast.parse(Path(path).read_text())
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == func:
            names = [a.arg for a in node.args.args]
            defaults = node.args.defaults
            return ast.literal_eval(defaults[names.index(arg) - (len(names) - len(defaults))])
    raise KeyError(f"{func}({arg}=...) not found in {path}")


def brief_check():
    """The case brief's yearly space heat and the tolerance the test holds the profile to."""
    src = (SCHED / "tests/test_sim.py").read_text()
    m = re.search(r'\["heat_kwh"\]\.sum\(\) == pytest\.approx\(([\d_]+), rel=([\d.]+)\)', src)
    if not m:
        raise ValueError("tests/test_sim.py: the check against the brief's heat total moved")
    return float(m.group(1).replace("_", "")), float(m.group(2))


def team():
    """The team as README.md lists it, names only."""
    text = (ROOT / "README.md").read_text()
    block = text.split("## Team", 1)[1].split("\n## ", 1)[0]
    return [
        re.sub(r"\s*\(.*\)\s*$", "", line[2:]).strip()
        for line in block.splitlines()
        if line.startswith("- ")
    ]


def plain(text, base="docs/economics"):
    """Markdown link syntax to plain text for the reference list; repo links become repo paths."""

    def link(m):
        target = m.group(2)
        if not target.startswith("http"):
            target = os.path.normpath(f"{base}/{target}")
        return f"{m.group(1)} ({target})"

    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link, text)
    return re.sub(r"<(https?://[^>]+)>", r"\1", text)


def sources():
    """The numbered sources of docs/economics/README.md, and the SFOE layer of apps/map."""
    text = (ECON / "README.md").read_text().split("## Sources", 1)[1]
    text = text.split("\nOur own assumptions", 1)[0]
    refs, cur = {}, None
    for line in text.splitlines():
        m = re.match(r"^(\d+)\. (.*)", line)
        if m:
            cur = f"econ{m.group(1)}"
            refs[cur] = m.group(2)
        elif cur and line.startswith("   ") and line.strip():
            refs[cur] += " " + line.strip()
    for line in (ROOT / "apps/map/README.md").read_text().splitlines():
        if "ch.bfe.fernwaerme-nachfrage" in line:
            cells = [c.replace("`", "").strip() for c in line.strip().strip("|").split("|")]
            refs["sfoe"] = (
                f"{cells[0]}: {cells[2]}. Layer {cells[1].split(' on ')[-1]} on api3.geo.admin.ch."
            )
    return {k: plain(v) for k, v in refs.items()}


def cite(text, refs):
    """[@a; @b] to [1, 2], numbered by first use. Returns the text and the reference list."""
    order = []

    def one(m):
        keys = [k.strip().lstrip("@") for k in m.group(1).split(";")]
        for k in keys:
            if k not in refs:
                raise KeyError(f"unknown citation {k}")
            if k not in order:
                order.append(k)
        return "[" + ", ".join(str(order.index(k) + 1) for k in keys) + "]"

    text = re.sub(r"\[(@[^\]]+)\]", one, text)
    listing = "\n".join(f"{i}. {refs[k]}" for i, k in enumerate(order, 1))
    return text, listing


# --- the values ---------------------------------------------------------------------------------


def values():
    cfg = load_json(SCHED / "config.json")
    basel = load_json(SCHED / "out/kpis.json")
    bern = load_json(SCHED / "out/bern/kpis.json")
    summary = load_json(ECON / "data/summary.json")
    fleet = load_json(SCHED / "out/fleet_basel_bern_kpis.json")
    sweep = load_csv(ECON / "data/servers_per_house.csv")
    monthly = load_csv(ECON / "data/monthly.csv")
    hardware = {r["case"]: r for r in load_csv(ECON / "data/hardware.csv")}
    sens = load_csv(ECON / "data/sensitivity.csv")
    solar = load_csv(ECON / "data/solar.csv")
    payback = load_csv(ECON / "data/payback.csv")
    daily = load_csv(ECON / "data/daily.csv")

    v = {}
    v["authors"] = ", ".join(team())
    pr, srv, house, jobs = cfg["prices"], cfg["server"], cfg["house"], cfg["jobs"]

    # inputs
    h = srv["power_kw"] * srv["heat_recovery"]
    v |= {
        "tank_kwh": num(house["tank_kwh"]),
        "dhw_kwh_day": num(house["hot_water_kwh_per_day"]),
        "server_kw": num(srv["power_kw"]),
        "heat_recovery": num(srv["heat_recovery"], 2),
        "heat_recovery_pct": pct(100 * srv["heat_recovery"], 0),
        "heat_per_server": num(h, 1),
        "idle_kw": num(srv["idle_power_kw"]),
        "cop": num(pr["heat_pump_cop"], 1),
        "elec_price": num(pr["electricity_chf_per_kwh"], 3),
        "compute_price": num(pr["compute_chf_per_server_hour"], 2),
        "forecast": cfg["forecast"],
        "horizon_h": num(default_arg(SCHED / "heatsched/sim.py", "__init__", "horizon")),
    }
    inter = sorted(int(k) for k in jobs["interactive"]["arrivals_server_h"])
    v["interactive_from"] = f"{inter[0]:02d}:00"
    v["interactive_to"] = f"{inter[-1] + 1:02d}:00"
    v["interactive_sh"] = num(sum(jobs["interactive"]["arrivals_server_h"].values()))
    ((bh, bsh),) = jobs["batch"]["arrivals_server_h"].items()
    v["batch_at"] = f"{int(bh):02d}:00"
    v["batch_sh"] = num(bsh)
    v["batch_deadline_h"] = num(jobs["batch"]["deadline_h"])
    ai = load_json(ROOT / "docs/measurements/ai-summary.json")
    v["chat_model"] = ai["inference"]["model"]
    v["chat_wh"] = num(ai["inference"]["wh_per_job"], 2)
    v["embed_wh"] = num(ai["embeddings"]["wh_per_job"], 1)
    v["embed_items"] = num(int(ai["embeddings"]["job"].split()[0]))

    # profile
    days = len(daily)
    space = sum(float(r["space_heat_kwh"]) for r in daily)
    dhw = sum(float(r["hot_water_kwh"]) for r in daily)
    brief_kwh, brief_rel = brief_check()
    v |= {
        "days": num(days),
        "basel_source": basel["profile_source"],
        "bern_source": bern["profile_source"],
        "basel_heating_days": num(basel["heating_days"]),
        "bern_heating_days": num(bern["heating_days"]),
        "basel_space_kwh": num(space),
        "basel_dhw_kwh": num(dhw),
        "basel_demand_kwh": num(basel["heat_demand_kwh"]),
        "bern_demand_kwh": num(bern["heat_demand_kwh"]),
        "bern_space_kwh": num(bern["heat_demand_kwh"] - house["hot_water_kwh_per_day"] * days),
        "brief_kwh": num(brief_kwh),
        "brief_tol_pct": pct(100 * brief_rel, 0),
        "brief_dev_pct": pct(100 * (space / brief_kwh - 1), 1),
        "coldest_day": min(daily, key=lambda r: float(r["mean_temp_c"]))["date"],
        "coldest_day_temp": num(min(float(r["mean_temp_c"]) for r in daily), 1),
    }

    # sizing
    theta = default_arg(SCHED / "heatsched/sim.py", "recommend", "min_marginal_util")
    n = basel["servers_per_house"]
    by_n = {int(r["servers_per_house"]): r for r in sweep}
    v |= {
        "sweep_min": num(min(by_n)),
        "sweep_max": num(max(by_n)),
        "theta": pct(theta, 0),
        "n_basel": num(n),
        "n_bern": num(bern["servers_per_house"]),
        "n_next": num(n + 1),
        "marg_n": pct(float(by_n[n]["marginal_server_utilisation_pct"])),
        "marg_next": pct(float(by_n[n + 1]["marginal_server_utilisation_pct"])),
    }
    v["table_sweep"] = table(
        [
            "Servers",
            "Heat covered",
            "Utilisation",
            "Last server runs",
            "Gain in cover",
            "Backup heat",
            "Dumped",
        ],
        [
            [
                r["servers_per_house"] + (" ◀" if int(r["servers_per_house"]) == n else ""),
                pct(float(r["share_of_heat_covered_pct"])),
                pct(float(r["utilisation_pct"])),
                pct(float(r["marginal_server_utilisation_pct"])),
                num(float(r["coverage_gain_pts"]), 1) + " pt",
                num(float(r["backup_heat_kwh"])) + " kWh",
                num(float(r["heat_dumped_kwh"]), 1) + " kWh",
            ]
            for r in sweep
        ],
    )

    # base results, Basel and Bern
    def kp_rows(*ks):
        spec = [
            ("Weather", lambda k: k["profile_source"]),
            ("Heating days", lambda k: num(k["heating_days"])),
            (
                "Heat demand (space + hot water)",
                lambda k: num(k["heat_demand_kwh"]) + " kWh",
            ),
            ("Servers (recommended)", lambda k: num(k["servers_per_house"])),
            ("Share of heat covered", lambda k: pct(k["share_of_heat_covered_pct"])),
            ("Backup heat", lambda k: num(k["backup_heat_kwh"]) + " kWh"),
            ("Heat dumped", lambda k: num(k["heat_dumped_kwh"], 1) + " kWh"),
            ("Utilisation", lambda k: pct(k["utilisation_pct"])),
            ("Server-hours sold", lambda k: num(k["server_hours_sold"])),
            ("Missed deadlines", lambda k: pct(k["missed_deadlines_pct_of_jobs"], 2)),
            (
                "Moved to a data centre",
                lambda k: pct(k["moved_offsite_pct_of_deadline_jobs"], 2),
            ),
            ("Electricity cost", lambda k: chf(k["electricity_cost_chf"])),
            ("Value of heat used", lambda k: chf(k["value_of_heat_used_chf"])),
            (
                "Compute income at assumed price",
                lambda k: chf(k["computing_income_chf"]),
            ),
            (
                "Break-even per server-hour",
                lambda k: chf(k["break_even_chf_per_server_hour"], 4),
            ),
        ]
        return [[label] + [f(k) for k in ks] for label, f in spec]

    v["table_kpis"] = table(["Indicator", "Basel", "Bern"], kp_rows(basel, bern))
    for key, k in (("basel", basel), ("bern", bern)):
        v[f"{key}_cover"] = pct(k["share_of_heat_covered_pct"])
        v[f"{key}_util"] = pct(k["utilisation_pct"])
        v[f"{key}_sh"] = num(k["server_hours_sold"])
        v[f"{key}_dumped"] = num(k["heat_dumped_kwh"], 1)
        v[f"{key}_be"] = chf(k["break_even_chf_per_server_hour"], 4)
        v[f"{key}_missed"] = pct(k["missed_deadlines_pct_of_jobs"], 2)
        v[f"{key}_moved"] = pct(k["moved_offsite_pct_of_deadline_jobs"], 2)
    v["be_rounded"] = chf(basel["break_even_chf_per_server_hour"], 2)
    v["be_identity"] = chf(pr["electricity_chf_per_kwh"] * (1 - h / pr["heat_pump_cop"]), 4)
    v["dumped_share"] = pct(100 * basel["heat_dumped_kwh"] / (basel["server_hours_sold"] * h), 2)

    # seasons
    v["table_monthly"] = table(
        ["Month", "Heat from servers", "Backup heat", "Server-hours", "Utilisation"],
        [
            [
                r["month"],
                num(float(r["heat_from_servers_kwh"])) + " kWh",
                num(float(r["backup_heat_kwh"])) + " kWh",
                num(float(r["server_hours"])),
                pct(float(r["utilisation_pct"])),
            ]
            for r in monthly
        ],
    )
    lo = min(monthly, key=lambda r: float(r["utilisation_pct"]))
    hi = max(monthly, key=lambda r: float(r["utilisation_pct"]))
    v |= {
        "util_min": pct(float(lo["utilisation_pct"])),
        "util_min_month": lo["month"],
        "util_max": pct(float(hi["utilisation_pct"])),
        "util_max_month": hi["month"],
        "months_with_backup": num(sum(float(r["backup_heat_kwh"]) > 0 for r in monthly)),
    }

    # no backlog
    nb = summary["no_backlog_case"]
    v |= {
        "nb_util": pct(nb["utilisation_pct"]),
        "nb_cover": pct(nb["share_of_heat_covered_pct"]),
        "nb_sh": num(nb["server_hours_sold"]),
    }

    # hardware
    hc = cfg["hardware"]
    cases = list(hc["cases"])
    v["hw_case"] = hc["case_for_results"]
    v["net_before"] = chf(summary["net_chf_per_house_before_hardware"])
    v["service_chf_h"] = chf(hc["service_chf_per_hour"])
    v["callout_chf"] = chf(hc["service_callout_chf"])
    hw_in = [
        ("Description", lambda c: c["label"]),
        ("Server", lambda c: chf(c["server_chf"])),
        ("Cooling kit", lambda c: chf(c["cooling_kit_chf"])),
        (
            f"Fitter hours {TIMES} rate",
            lambda c: f"{num(c['fitter_hours_per_house'])} {TIMES} {chf(c['fitter_chf_per_hour'])}",
        ),
        (
            f"Electrician hours {TIMES} rate",
            lambda c: (
                f"{num(c['electrician_hours_per_house'])} {TIMES} "
                f"{chf(c['electrician_chf_per_hour'])}"
            ),
        ),
        (
            f"Service visits {TIMES} hours a year",
            lambda c: (
                f"{num(c['service_visits_per_year'])} {TIMES} {num(c['service_hours_per_visit'])}"
            ),
        ),
        ("Lifetime L", lambda c: f"{num(c['lifetime_years'])} y"),
        (f"Resale share {RHO}", lambda c: pct(100 * c["resale_share"], 1)),
        ("Discount rate r", lambda c: pct(100 * c["discount_rate"], 2)),
    ]
    v["table_hw_inputs"] = table(
        ["Input (per server unless per house)", *cases],
        [[lab] + [f(hc["cases"][c]) for c in cases] for lab, f in hw_in],
    )
    hw_out = [
        ("Up front, C", lambda r: chf(r["capex_chf"])),
        ("Upkeep a year, U", lambda r: chf(r["upkeep_chf_per_year"])),
        ("Resale at the end, R", lambda r: chf(r["resale_chf"])),
        (f"Hardware a year, C{PRIME}·a + U", lambda r: chf(r["hardware_chf_per_year"])),
        ("Net before hardware, A", lambda r: chf(r["net_chf_before_hardware"])),
        (
            f"Net after hardware, A {MINUS} C{PRIME}·a {MINUS} U",
            lambda r: chf(r["net_chf_after_hardware"]),
        ),
        ("Discounted payback", lambda r: years(r["payback_years"])),
        ("Lifetime", lambda r: f"{num(r['lifetime_years'])} y"),
        ("Net present value", lambda r: chf(r["npv_chf"])),
        (
            "Break-even incl. hardware",
            lambda r: chf(r["break_even_chf_per_server_hour_incl_hardware"], 3),
        ),
    ]
    v["table_hw"] = table(
        ["Per house, per year unless stated", *cases],
        [[lab] + [f(hardware[c]) for c in cases] for lab, f in hw_out],
    )
    for c in cases:
        r = hardware[c]
        v[f"{c}_net_after"] = chf(r["net_chf_after_hardware"])
        v[f"{c}_npv"] = chf(r["npv_chf"])
        v[f"{c}_payback"] = years(r["payback_years"])
        v[f"{c}_life"] = f"{num(r['lifetime_years'])} y"
        v[f"{c}_be_hw"] = chf(r["break_even_chf_per_server_hour_incl_hardware"], 3)
        v[f"{c}_capex"] = chf(r["capex_chf"])
        rows = [p for p in payback if p["case"] == c and p["payback_years"] != ""]
        within = [p for p in rows if float(p["payback_years"]) <= float(r["lifetime_years"])]
        v[f"{c}_pb_price"] = (
            chf(float(within[0]["compute_chf_per_server_hour"]), 2)
            if within
            else "none in the range"
        )
    v["payback_grid_min"] = chf(min(float(p["compute_chf_per_server_hour"]) for p in payback), 2)
    v["payback_grid_max"] = chf(max(float(p["compute_chf_per_server_hour"]) for p in payback), 2)
    v["payback_grid_step"] = chf(
        float(payback[1]["compute_chf_per_server_hour"])
        - float(payback[0]["compute_chf_per_server_hour"]),
        2,
    )

    # sensitivity
    base_after = float(hardware[hc["case_for_results"]]["net_chf_after_hardware"])
    v["table_sens"] = table(
        [
            "Input changed (one at a time)",
            "Low setting",
            "Result",
            "High setting",
            "Result",
            "Swing",
        ],
        [
            [
                r["input"],
                r["low_case"],
                chf(r["low_chf"]),
                r["high_case"],
                chf(r["high_chf"]),
                chf(abs(float(r["high_chf"]) - float(r["low_chf"]))),
            ]
            for r in sorted(sens, key=lambda r: -abs(float(r["high_chf"]) - float(r["low_chf"])))
        ],
    )
    v["sens_n"] = num(len(sens))
    v["sens_base"] = chf(base_after)
    top = max(sens, key=lambda r: abs(float(r["high_chf"]) - float(r["low_chf"])))
    v["sens_top"] = top["input"].split(",")[0]
    v["sens_negative"] = num(sum(min(float(r["low_chf"]), float(r["high_chf"])) < 0 for r in sens))
    rec = next(r for r in sens if r["input"].startswith("Heat recovered"))
    v |= {
        "rec_lo": rec["low_case"],
        "rec_lo_chf": chf(rec["low_chf"]),
        "rec_hi": rec["high_case"],
        "rec_hi_chf": chf(rec["high_chf"]),
    }

    # solar
    s = cfg["solar"]
    v |= {
        "roof_kwp": num(s["roof_kwp"]),
        "tilt": num(s["tilt_deg"]),
        "battery_kwh": num(s["battery_kwh"]),
        "round_trip": pct(100 * s["battery_round_trip"], 0),
        "perf_ratio": num(s["performance_ratio"], 2),
        "feed_in": chf(s["feed_in_chf_per_kwh"], 2),
        "subsidy": chf(s["subsidy_chf_per_kwp"]),
        "solar_case": s["case_for_results"],
        "iwb_2027": chf(s["iwb_2027_chf_per_kwh"], 4),
        "pv_kwh": num(float(solar[1]["pv_kwh"])),
        "pv_yield": num(float(solar[1]["pv_kwh"]) / s["roof_kwp"]),
    }
    sol_rows = []
    for r in solar:
        sol_rows.append(
            [
                r["setup"],
                chf(float(r["electricity_chf_per_kwh"]), 4),
                pct(float(r["own_pv_share_of_server_power_pct"])),
                chf(r["electricity_cost_chf"]),
                chf(r["solar_capex_chf"]) if r["solar_capex_chf"] else DASH,
                years(r["payback_years_mid"]) if r["payback_years_mid"] else DASH,
                chf(r["net_chf_after_hardware_and_solar"]),
            ]
        )
    v["table_solar"] = table(
        [
            "Setup",
            "Electricity",
            "Own PV share",
            "Power bill",
            "Solar up front",
            "Payback (mid)",
            "Net after all",
        ],
        sol_rows,
    )
    pvb = next(r for r in solar if r["setup"].startswith("Roof PV + battery"))
    pvs = next(
        r for r in solar if r["setup"].endswith("prefers the sun") and "battery" not in r["setup"]
    )
    pvp = next(r for r in solar if r["setup"].endswith("ignores the sun"))
    v |= {
        "own_plain": pct(float(pvp["own_pv_share_of_server_power_pct"])),
        "own_pref": pct(float(pvs["own_pv_share_of_server_power_pct"])),
        "own_batt": pct(float(pvb["own_pv_share_of_server_power_pct"])),
        "batt_payback_high": years(pvb["payback_years_high"]),
        "batt_life_high": f"{num(s['cases']['high']['battery_lifetime_years'])} y",
    }

    # fleet
    fc = cfg["fleet"]

    def rng(a, unit="", dp=0):
        return f"{num(a[0], dp)}{DASH}{num(a[1], dp)}{unit}"

    v |= {
        "fleet_houses": num(fleet["houses"]),
        "fleet_per_city": num(fc["houses"]),
        "fleet_cities": " and ".join(fleet["cities"]),
        "fleet_servers": num(fleet["servers"]),
        "fleet_srv_range": rng(fc["servers_per_house"]),
        "fleet_tank_range": rng(fc["tank_kwh"], " kWh"),
        "fleet_scale_range": rng(fc["space_heating_scale"], dp=1),
        "fleet_dhw_range": rng(fc["hot_water_kwh_per_day"], " kWh"),
        "fleet_inter": num(fc["interactive_jobs_per_house_per_day"]),
        "fleet_batch": num(fc["batch_jobs_per_house_per_day"]),
        "fleet_batch_h": rng(fc["batch_hours"], " h"),
        "fleet_batch_dl": rng(fc["batch_deadline_h"], " h"),
        "fleet_backlog": num(fc["backlog_jobs_per_house_per_day"]),
        "fleet_backlog_h": rng(fc["backlog_hours"], " h"),
        "fleet_backlog_dl": num(fc["backlog_deadline_h"]) + " h",
        "fleet_warmup": num(fc["warmup_days"]),
    }
    frows = []
    for d in fleet["days"].values():
        for mode, label in (("fleet", "fleet routing"), ("home_only", "home only")):
            k = d[mode]
            frows.append(
                [
                    f"{d['date']}, {label}",
                    num(k["jobs"]),
                    num(k["server_hours_in_houses"]),
                    num(k["server_hours_in_datacentre"]),
                    pct(k["compute_heat_used_pct"]),
                    pct(k["house_heat_covered_pct"]),
                    pct(k["jobs_moved_offsite_pct"]),
                    num(k["deadline_misses"]),
                    num(k["job_moves_between_houses"]),
                ]
            )
    v["table_fleet"] = table(
        [
            "Day and routing",
            "Jobs",
            "Server-h in houses",
            "Server-h moved",
            "Compute heat used",
            "House heat covered",
            "Jobs moved",
            "Misses",
            "Moves between houses",
        ],
        frows,
    )
    jul = fleet["days"]["july"]
    v |= {
        "jul_date": jul["date"],
        "jan_date": fleet["days"]["january"]["date"],
        "jul_moved_fleet": pct(jul["fleet"]["jobs_moved_offsite_pct"]),
        "jul_moved_home": pct(jul["home_only"]["jobs_moved_offsite_pct"]),
        "jul_heat_fleet": pct(jul["fleet"]["compute_heat_used_pct"]),
        "jul_heat_home": pct(jul["home_only"]["compute_heat_used_pct"]),
    }

    # when it does not pay off
    sens_by = {r["input"].split(",")[0].split(":")[0]: r for r in sens}
    cp = sens_by["Compute price"]
    el = sens_by["Electricity price"]
    bl = sens_by["Backlog of flexible jobs"]
    v |= {
        "cp_lo": cp["low_case"],
        "cp_lo_chf": chf(cp["low_chf"]),
        "el_hi": el["low_case"],
        "el_hi_chf": chf(el["low_chf"]),
        "bl_none_chf": chf(bl["low_chf"]),
    }
    return v


def build():
    text = TEMPLATE.read_text()
    v = values()
    missing = sorted({m for m in re.findall(r"\{([a-z][a-z0-9_]*)\}", text) if m not in v})
    if missing:
        raise KeyError(f"no value for {', '.join(missing)}")
    text = re.sub(r"\{([a-z][a-z0-9_]*)\}", lambda m: str(v[m.group(1)]), text)
    text, listing = cite(text, sources())
    text = text.replace("<!-- references -->", listing)
    head = (
        "<!-- Generated by scripts/paper/build.py from kachel-model.template.md. Do not edit. -->"
    )
    head += "\n"
    return head + text


def main(argv):
    paper = build()
    if "--check" in argv:
        if not OUT.exists() or OUT.read_text() != paper:
            print(f"{OUT.relative_to(ROOT)} is stale: run make paper", file=sys.stderr)
            return 1
        print(f"{OUT.relative_to(ROOT)} matches its data")
        return 0
    OUT.write_text(paper)
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
