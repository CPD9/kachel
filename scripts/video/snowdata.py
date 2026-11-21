"""Hourly snow for the day-night films, read from the scheduler's data/snow_<city>_<year>.csv.

Shared by daynight.py (inside Blender) and compose_daynight.py, so it uses the standard
library only.
"""

import csv
from pathlib import Path


def snow_hours(day_csv, city):
    """{hour: (snow_depth_m, snowfall_cm)} for the CSV's date, from data/snow_<city>_<year>.csv."""
    out = Path(day_csv).parent
    sched = next(
        d for d in (out.parent, out.parent.parent) if (d / "config.json").exists()
    )
    with open(day_csv, newline="") as f:
        date = next(csv.DictReader(f))["time"][:10]
    path = sched / "data" / f"snow_{city}_{date[:4]}.csv"
    hours = {}
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            if r["time"].startswith(date):
                hours[int(r["time"][11:13])] = (
                    float(r["snow_depth_m"]),
                    float(r["snowfall_cm"]),
                )
    return hours
