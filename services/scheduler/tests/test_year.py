import json
from pathlib import Path

import pandas as pd

from heatsched import profile

HERE = Path(__file__).parent
CFG = json.loads((HERE.parent / "config.json").read_text())


def test_showcase_days_are_the_coldest_january_day_and_15_july() -> None:
    basel = profile.build_profile(profile.load_weather(HERE / "data" / "weather_basel_2025.csv"), CFG)
    days = profile.showcase_days(basel)
    assert days == {"january": "2025-01-13", "july": "2025-07-15"}
    daily = basel.groupby("date")["temp_c"].mean()
    january = daily[[d.month == 1 for d in daily.index]]
    assert str(january.idxmin()) == days["january"]
    for date in days.values():
        assert (basel["date"] == pd.Timestamp(date).date()).sum() == 24
