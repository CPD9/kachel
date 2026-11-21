"""Hourly snowfall and snow depth for 2025 from the Open-Meteo archive, for the films.

  python fetch_snow.py basel     # writes data/snow_basel_2025.csv
  python fetch_snow.py bern

Open-Meteo historical weather API (https://open-meteo.com/en/docs/historical-weather-api),
CC BY 4.0, the same source as the temperatures. The scheduler does not use snow; only the
renders read it, to draw snow on the ground and falling flakes.
"""

import io
import sys
import urllib.request
from pathlib import Path

import pandas as pd

from heatsched.profile import PLACES


def url(place: str) -> str:
    lat, lon = PLACES[place]
    return (
        "https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={lat}&longitude={lon}&start_date=2025-01-01&end_date=2025-12-31"
        "&hourly=snowfall,snow_depth&timezone=Europe%2FZurich&format=csv"
    )


def main() -> None:
    place = sys.argv[1]
    raw = urllib.request.urlopen(url(place), timeout=60).read().decode()
    df = pd.read_csv(io.StringIO(raw[raw.index("time,") :]))
    df.columns = ["time", "snowfall_cm", "snow_depth_m"]
    out = Path("data") / f"snow_{place}_2025.csv"
    out.parent.mkdir(exist_ok=True)
    df.to_csv(out, index=False)
    print(f"{out}: {len(df)} hours, deepest {df.snow_depth_m.max()} m")


if __name__ == "__main__":
    main()
