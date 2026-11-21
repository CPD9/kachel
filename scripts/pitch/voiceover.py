#!/usr/bin/env python3
"""Write docs/pitch/voiceover.md, the voice-over for the pitch film, with every model figure read
from the data files, so what is said always matches what is on screen.

  python3 scripts/pitch/voiceover.py           # write the script
  python3 scripts/pitch/voiceover.py --check   # fail if the script is stale
"""

import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/pitch/voiceover.md"


def load():
    k = json.loads((ROOT / "services/scheduler/out/kpis.json").read_text())
    bern = json.loads((ROOT / "services/scheduler/out/bern/kpis.json").read_text())
    s = json.loads((ROOT / "docs/economics/data/summary.json").read_text())
    cfg = json.loads((ROOT / "services/scheduler/config.json").read_text())
    with (ROOT / "docs/economics/data/sensitivity.csv").open() as f:
        backlog = next(r for r in csv.DictReader(f) if r["input"].startswith("Backlog"))
    ask = re.search(r"\*\*Ask:\*\*\s*(.+?)\n", (ROOT / "docs/pitch/slides.md").read_text()).group(1)
    pv = s["solar"]["0.2770"]["pv_battery"]
    fleet = json.loads((ROOT / "services/scheduler/out/fleet_basel_bern_kpis.json").read_text())
    with (ROOT / "docs/economics/data/solar_monthly.csv").open() as f:
        months = list(csv.DictReader(f))
    sun = {
        r["month"]: 100
        * (float(r["servers_from_pv_kwh"]) + float(r["servers_from_battery_kwh"]))
        / (float(r["servers_from_pv_kwh"]) + float(r["servers_from_battery_kwh"]) + float(r["servers_from_grid_kwh"]))
        for r in months
    }
    sunniest = max(sun, key=sun.get)
    mid = s["hardware"]["mid"]
    return {
        "servers": k["servers_per_house"],
        "share": f'{k["share_of_heat_covered_pct"]:.0f}',
        "days": k["heating_days"],
        "be": f'{k["break_even_chf_per_server_hour"]:.2f}',
        "be_hw": f'{mid["break_even_chf_per_server_hour_incl_hardware"]:.2f}',
        "price": f'{cfg["prices"]["compute_chf_per_server_hour"]:.2f}',
        "payback": f'{mid["payback_years"]:.1f}',
        "net_hw": f'{mid["net_chf_after_hardware"]:,}',
        "no_backlog": f'{abs(int(backlog["low_chf"])):,}',
        "no_backlog_verb": "loses" if int(backlog["low_chf"]) < 0 else "still makes",
        "dumped": f'{k["heat_dumped_kwh"]:.0f}',
        "b_servers": bern["servers_per_house"],
        "b_share": f'{bern["share_of_heat_covered_pct"]:.0f}',
        "b_days": bern["heating_days"],
        "pv_share": f'{pv["own_pv_share_of_server_power_pct"]:.0f}',
        "pv_saving": f'{pv["saving_chf_per_year"]:,}',
        "houses": fleet["houses"],
        "fleet_servers": fleet["servers"],
        "sun_share": f"{sun[sunniest]:.0f}",
        "sun_month": {"Jan": "January", "Feb": "February", "Mar": "March", "Apr": "April", "May": "May",
                      "Jun": "June", "Jul": "July", "Aug": "August", "Sep": "September", "Oct": "October",
                      "Nov": "November", "Dec": "December"}[sunniest],
        "ask": ask.rstrip("."),
        "src": f'{k["profile_source"]}; {bern["profile_source"]}',
    }


TEMPLATE = """# Pitch film voice-over

Written for Peter to record over the pitch film, about 3:35. Read it at a calm pace; each
block matches one shot, in the order of the film. Model figures are filled in by
`scripts/pitch/voiceover.py` from the scheduler and economics data, so they always match the
screen. Weather: {src}.

| Time | On screen | Say |
| --- | --- | --- |
| 0:00–0:06 | Basel at dusk, title | "This is Basel. And this is Kachel: your AI heats your home." |
| 0:06–0:22 | The app: a voice prompt, the globe dives to FHNW Campus Dreispitz | "You tell Kachel where you are. We're at FHNW Campus Dreispitz, so it finds this building." |
| 0:22–0:28 | Down into the basement | "Picture its basement with a rack of servers where the boiler used to be." |
| 0:28–0:45 | Split screen: setup, X-ray, winter to summer | "Every AI job turns electricity into heat. Data centres throw it away. We keep it: water runs through the servers, a heat exchanger and into the tank, then out to the radiators and the taps. On a snowy January day all {servers} servers run. By July the tank is full, so the scheduler pauses the work." |
| 0:45–0:58 | The neighbours who use the rack | "Who uses that compute? People nearby: someone gaming tonight, a student training a model. They pay for the rack; the building gets the heat." |
| 0:58–1:06 | Basel out to Switzerland, the fleet | "{houses} houses with {fleet_servers} servers are a small data centre, spread across Basel and Bern, running only where heat is wanted." |
| 1:06–1:22 | The operator view | "This is the operator's view: every house, every server, the heat and the money, month by month, and what happens when the winter is colder." |
| 1:22–1:47 | Bern: title, map, a house near ARTORG, Bern under snow | "Same model, another city. Bern is colder: {b_days} heating days, so a house takes {b_servers} servers and covers {b_share} percent of its heat. This is near ARTORG, where I work, with Bern's district heating and its heat demand." |
| 1:47–2:22 | Numbers and charts | "In Basel the reference house gets {share} percent of its heat from AI jobs, over a year of real 2025 weather. Compute breaks even at {be} francs per server-hour, or {be_hw} with the hardware paid for; we assume {price}. The mid case pays back in {payback} years and leaves {net_hw} francs a year. If the flexible backlog dries up, the house {no_backlog_verb} {no_backlog} francs a year. That's the number we watch." |
| 2:22–2:32 | Servers follow the heat; the sun fills the summer | "Servers follow the heat: busy all winter, nearly idle in summer. Add solar and a battery, and in {sun_month} {sun_share} percent of their power comes from the roof." |
| 2:32–2:40 | Server heat, a heat pump, the ORC turbine (concept) | "Next, for hotter sites: a heat pump lifts the temperature, and an ORC turbine turns heat back into electricity. That's a concept. It isn't in our numbers yet." |
| 2:40–2:54 | Solar figures, a farm near Bern in winter | "Farms have room and sun. With solar and a battery, a house saves {pv_saving} francs a year, and a farm has space for far more panels." |
| 2:54–3:02 | The tallest building in Switzerland | "And the tallest building in Switzerland? Its plant floors could hold racks like these." |
| 3:02–3:17 | The apps, the live pause, the paper | "Everything you've seen runs: the scheduler, an agent that pauses a real job, the apps, and a paper with every formula and source." |
| 3:17–3:23 | How it pays | "Buyers pay per server-hour, and the home gets the heat." |
| 3:23–3:33 | The ask | "Our ask: {ask}. Kachel. Your AI heats your home." |
"""


def main() -> None:
    text = TEMPLATE.format(**load())
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text() != text:
            sys.exit("docs/pitch/voiceover.md is stale: run python3 scripts/pitch/voiceover.py")
        print("docs/pitch/voiceover.md matches the data")
        return
    OUT.write_text(text)
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
