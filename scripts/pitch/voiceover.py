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
        "houses": cfg["fleet"]["houses"],
        "ask": ask.rstrip("."),
        "src": f'{k["profile_source"]}; {bern["profile_source"]}',
    }


TEMPLATE = """# Pitch film voice-over

Written for Peter to record over the film, about 3:00. Read it at a calm pace; each block
matches one shot. Model figures are filled in by `scripts/pitch/voiceover.py` from the
scheduler and economics data, so they always match the screen. Weather: {src}.

| Time | On screen | Say |
| --- | --- | --- |
| 0:00–0:06 | Basel at dusk, title | "This is Basel. And this is Kachel: your AI heats your home." |
| 0:06–0:15 | Flight to FHNW Campus Dreispitz, down into the basement | "Tonight we're at FHNW Campus Dreispitz. Picture its basement with a rack of servers where the boiler used to be." |
| 0:15–0:24 | Split screen: setup, then the X-ray | "Every AI job turns electricity into heat. Data centres throw that heat away. We keep it: water runs through the servers, through a heat exchanger and into the tank, then out to the radiators and the taps." |
| 0:24–0:32 | Split screen: winter to summer | "On a snowy January day all {servers} servers run. By July the tank is full, so the scheduler pauses the work until the house wants heat again." |
| 0:32–0:40 | Basel out to Switzerland, the fleet | "One house is a heater. {houses} houses are a small data centre, spread across the city, running only where heat is wanted. The rest of the work moves." |
| 0:40–0:43 | Title: Bern | "Same model, another city." |
| 0:43–1:05 | Bern map, a house near ARTORG, district heating and demand | "Bern is colder: {b_days} heating days. So a Bern house takes {b_servers} servers and covers {b_share} percent of its heat. This is near ARTORG, where I work, with Bern's district heating and its heat demand, hectare by hectare." |
| 1:05–1:20 | Numbers | "Back in Basel, on a full year of real 2025 weather, the reference house gets {share} percent of its heat from AI jobs, over {days} heating days, and dumps only {dumped} kilowatt-hours." |
| 1:20–1:35 | Break-even and payback charts | "Compute breaks even at {be} francs per server-hour, or {be_hw} with the hardware paid for. We assume {price}. In the mid case the hardware pays back in {payback} years and leaves {net_hw} francs a year." |
| 1:35–1:50 | What moves the result, the paper | "And here's when it doesn't pay off: if the backlog of flexible work dries up, the house {no_backlog_verb} {no_backlog} francs a year. That's the number we watch. Every formula and source is in our paper." |
| 1:50–2:10 | The farm: servers in the barn, solar on the field, winter | "Add the sun. With roof solar and a battery, {pv_share} percent of the servers' power comes from the panels and the house saves {pv_saving} francs a year. A farm has room for far more panels." |
| 2:10–2:22 | X-ray: server heat, a heat pump lifting it, then the ORC turbine (concept) | "Next, for hotter sites: turning heat back into electricity, with a heat pump lifting the temperature first and an ORC turbine after it. That's a concept. It isn't in our numbers yet." |
| 2:22–2:35 | The tallest building in Switzerland | "And the tallest building in Switzerland? Its plant floors could hold racks like these." |
| 2:35–2:50 | The app, the live pause, the paper | "Everything you've seen runs today: the scheduler, an agent that pauses a real job, the apps, and the model behind the numbers. Buyers pay per server-hour and the home gets the heat." |
| 2:50–3:00 | The ask | "Our ask: {ask}. Kachel. Your AI heats your home." |
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
